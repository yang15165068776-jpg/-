/**
 * Agent Coordinator — v3 per-turn orchestration loop.
 *
 * Each turn:
 *   1. Receive user input
 *   2. Create USER_ACTION event → push to Event Bus
 *   3. Run all active NPC agents in parallel → NPC_ACTION events
 *   4. World Engine consumes events → update world state
 *   5. Rule-based affection scoring (most turns, no LLM)
 *   6. CPS advance + conflict detection from v3 events
 *   7. Build Narrator prompt (world snapshot + events + CPS + graph context)
 *   8. Single Narrator LLM call → generate story output
 *   9. State commit → save to localStorage (graph + CPS + world)
 *
 * Feature-flagged: USE_V3 = false preserves v2 behavior exactly.
 */

import { createWorldState, advanceWorld, applyEvent, snapshotForNarrator } from '../world/worldEngine'
import { createEventBus, publish, processEventQueue } from '../world/eventBus'
import { runAllNPCAgents } from './npcAgent'
import { buildNarratorPrompt } from '../prompt/v3/narratorPrompt'
import { scoreAllAffections } from '../runtime/affectionRules'
import { formatEventLogForPrompt } from '../memory/eventMemory'
import { judgeAffectionDelta, getCurrentAffectionStage, streamCompletion, findForbiddenWord } from '../utils/deepseek'
import { getModel } from '../utils/storage'
import { CORE_SYSTEM_PREFIX } from '../prompt/cachePrefix'
import { buildCPSInjection, loadConflictState, saveConflictState, ConflictStateEngine } from '../runtime/conflictPersistence'
import { loadGraph, initGraphFromCharacter, saveGraph } from '../memory/memoryGraph'
import { buildContext } from '../memory/contextBuilder'
import { createPowerGraph, applyPowerShift, buildPowerStateContext, savePowerGraph, loadPowerGraph } from '../runtime/powerDynamics'
import { buildASLReinforcement, validateASL } from '../runtime/alignmentSuppression'

// Global state (persists across turns within a session)
let _worldState = null
let _eventBus = null
let _isFirstTurn = true
let _cpsState = null       // CPS: Conflict Persistence System state
let _memoryGraph = null    // Event-Native Memory Graph
let _powerGraph = null     // v3.5: Power Dynamics Engine state
let _characterId = null    // Current character ID for storage keys

/**
 * Initialize or reset the agent system for a new session.
 */
export function initAgentSystem(character, affections, messages) {
  _worldState = createWorldState(character, affections, messages, null)
  _eventBus = createEventBus()
  _isFirstTurn = true

  // ── Load Event-Native Memory Graph ──
  _characterId = character.id || character.name || 'default'
  _memoryGraph = loadGraph(_characterId)
  if (!_memoryGraph && character.romanceCharacters?.length) {
    _memoryGraph = initGraphFromCharacter(character, affections)
    console.log('[Coordinator] Memory Graph initialized from character data')
  } else if (_memoryGraph) {
    console.log('[Coordinator] Memory Graph loaded:',
      Object.keys(_memoryGraph.edges || {}).length, 'edges,',
      (_memoryGraph.event_log || []).length, 'events')
  }

  // ── Load CPS (Conflict Persistence System) state ──
  _cpsState = loadConflictState(_characterId)
  if (!_cpsState || !_cpsState.activeConflicts) {
    _cpsState = ConflictStateEngine.create()
    console.log('[Coordinator] CPS state initialized')
  } else {
    console.log('[Coordinator] CPS loaded:',
      _cpsState.activeConflicts.length, 'active conflicts,',
      'tension:', Math.round(_cpsState.tensionLevel * 100) + '%')
  }

  // ── Load Power Dynamics Graph (v3.5) ──
  _powerGraph = loadPowerGraph(_characterId)
  if (!_powerGraph) {
    _powerGraph = createPowerGraph(character, affections)
    console.log('[Coordinator] Power Graph initialized:',
      Object.keys(_powerGraph.edges).length, 'edges')
  } else {
    console.log('[Coordinator] Power Graph loaded:',
      Object.keys(_powerGraph.edges).length, 'edges,',
      'tilt:', Math.round(_powerGraph.globalTilt * 100) + '%')
  }

  console.log('[Coordinator] Agent system initialized',
    Object.keys(_worldState.characters).length, 'agents registered')
  return { world: _worldState, bus: _eventBus, graph: _memoryGraph, cps: _cpsState }
}

/**
 * Reset first-turn flag (e.g., after clearing chat).
 */
export function resetAgentTurn() {
  _isFirstTurn = true
  _worldState = null
  _eventBus = null
  _cpsState = null
  _memoryGraph = null
  _powerGraph = null
  _characterId = null
}

/**
 * Run one complete agent-coordinated turn.
 *
 * @param {string} userInput — current user message
 * @param {object} character — full character object
 * @param {object} affections — current affection map
 * @param {Array} messages — current message array
 * @param {string} apiKey — DeepSeek API key
 * @param {function} onToken — streaming token callback
 * @returns {{ reply, reasoningContent, usage, error, worldState, turnReport }}
 */
export async function runAgentTurn(userInput, character, affections, messages, apiKey, onToken) {
  // Initialize if first turn of session
  if (!_worldState || !_eventBus) {
    initAgentSystem(character, affections, messages)
  }

  const world = _worldState
  const bus = _eventBus

  // ── Phase 1: Advance world + create user action event ──
  const { world: advancedWorld, events: timeEvents } = advanceWorld(world, userInput)
  _worldState = advancedWorld

  publish(bus, 'USER_ACTION', { content: userInput })
  for (const evt of timeEvents) {
    publish(bus, evt.type, evt.data)
  }

  // ── Phase 2: Run all NPC agents ──
  const npcResults = await runAllNPCAgents(_worldState, bus, userInput, _powerGraph)
  if (npcResults.length > 0) {
    console.log('[Coordinator] NPC agents:', npcResults.map(r => `${r.agent}:${r.intent}`).join(', '))
  }

  // ── Phase 3: Process event queue ──
  const { narrativeHints } = processEventQueue(bus, _worldState)

  // Apply NPC action events to world state
  const drainedEvents = bus.events  // processEventQueue drained them, but we kept reference
  // Actually processEventQueue drains, so we need to re-read...
  // Let's just apply events from npcResults
  for (const result of npcResults) {
    if (result.intent !== 'absent') {
      _worldState = applyEvent(_worldState, {
        type: 'NPC_ACTION',
        data: {
          agent: result.agent,
          intent: result.intent,
          emotion: result.emotion,
          action: result.action,
        },
      })
    }
  }

  // ── Phase 4: Affection scoring ──
  // First pass: rule-based (handles ~85% of turns)
  const affectionResult = scoreAllAffections(_worldState, userInput, '', _worldState.roundIndex)

  // Apply rule-based deltas
  for (const [name, delta] of Object.entries(affectionResult.deltas)) {
    _worldState = applyEvent(_worldState, {
      type: 'RELATIONSHIP_CHANGE',
      data: { source: name, target: 'player', delta, trigger: '规则判定' },
    })
  }

  // Second pass: LLM judge for ambiguous cases
  if (affectionResult.needsLLM.length > 0 && apiKey) {
    console.log('[Coordinator] LLM裁判需求:', affectionResult.needsLLM.join(', '))
    try {
      const { changes, error } = await judgeAffectionDelta(
        character, affections, userInput, '', apiKey
      )
      if (!error && changes) {
        for (const { name, delta } of changes) {
          if (delta !== 0) {
            _worldState = applyEvent(_worldState, {
              type: 'RELATIONSHIP_CHANGE',
              data: { source: name, target: 'player', delta, trigger: 'LLM裁判' },
            })
          }
        }
      }
    } catch (e) {
      console.error('[Coordinator] LLM裁判失败:', e)
    }
  }

  // ── Phase 5: CPS Advance + Conflict Detection ──
  // Advance CPS state (decrement conflict lifespans, enforce tension floor)
  if (_cpsState) {
    const cpsResult = ConflictStateEngine.advance(_cpsState)
    if (cpsResult.changed) {
      console.log('[Coordinator] CPS advance:',
        cpsResult.resolved.length, 'resolved,',
        cpsResult.escalated.length, 'escalated')
    }
  }

  // Auto-detect conflicts from v3 NPC actions and relationship changes
  detectAndRegisterConflicts(npcResults, affectionResult, userInput)

  // ── Phase 5a: Power Dynamics update (v3.5) ──
  if (_powerGraph) {
    // Apply power shifts from NPC actions
    for (const result of npcResults) {
      if (result.intent === 'absent') continue
      const eventType = mapIntentToPowerEvent(result.intent)
      if (eventType) {
        applyPowerShift(_powerGraph, eventType, {
          actor: result.agent,
          target: 'user',
          intensity: result.intent === 'escalate' ? 0.8 : result.intent === 'confront' ? 0.7 : 0.5,
          roundIndex: _worldState.roundIndex,
        })
      }
    }

    // Apply power shifts from affection changes
    for (const [name, delta] of Object.entries(affectionResult.deltas || {})) {
      if (delta < 0) {
        applyPowerShift(_powerGraph, 'AFFECTION_DOWN', {
          actor: name,
          target: 'user',
          intensity: Math.min(Math.abs(delta) / 10, 0.8),
          roundIndex: _worldState.roundIndex,
        })
      } else if (delta > 0) {
        applyPowerShift(_powerGraph, 'AFFECTION_UP', {
          actor: name,
          target: 'user',
          intensity: Math.min(delta / 10, 0.8),
          roundIndex: _worldState.roundIndex,
        })
      }
    }
  }

  // ── Phase 6: Build Narrator prompt + CPS injection ──
  const systemPrompt = buildNarratorPrompt(
    _worldState, character, narrativeHints, userInput, _isFirstTurn
  )

  if (_isFirstTurn) {
    console.log('[Coordinator] First turn — identity blocks included, subsequent turns cached')
  }

  // ── Phase 7: Assemble message array with all context layers ──
  const narratorMessages = [
    { role: 'system', content: systemPrompt },
  ]

  // Layer 1: Event-Native Memory Graph context (structured relationship state + events)
  if (_memoryGraph) {
    const graphContext = buildContext(_memoryGraph, { maxEvents: 12, includeScene: true })
    if (graphContext) {
      narratorMessages.push({ role: 'system', content: graphContext })
    }
  }

  // Layer 2: Power Dynamics state (v3.5 — current power structure + shifts)
  if (_powerGraph) {
    const powerContext = buildPowerStateContext(_powerGraph, _worldState)
    if (powerContext) {
      narratorMessages.push({ role: 'system', content: powerContext })
    }
  }

  // Layer 3: CPS injection (conflict persistence lock, tension floor, behavior override)
  if (_cpsState) {
    const cpsText = buildCPSInjection(_cpsState)
    if (cpsText) {
      narratorMessages.push({ role: 'system', content: cpsText })
    }
  }

  // Layer 4: Event memory (compact structured event log)
  const eventMemoryText = formatEventLogForPrompt(_worldState.eventLog || [], 10)
  if (eventMemoryText) {
    narratorMessages.push({ role: 'system', content: eventMemoryText })
  }

  // Layer 5: Working memory (last few user/assistant turns for continuity)
  const conversationMsgs = (messages || []).filter(m => m.role !== 'system').slice(-6)
  for (const msg of conversationMsgs) {
    narratorMessages.push({ role: msg.role, content: msg.content || '' })
  }

  // Layer 6: ASL v1 Reinforcement — per-turn alignment suppression (recency bias)
  narratorMessages.push({ role: 'system', content: buildASLReinforcement() })

  // Add current user input
  narratorMessages.push({ role: 'user', content: userInput })

  // ── Phase 8: Narrator LLM call (v3 prompt — direct API) ──
  const model = getModel()
  const temperature = character.temperature
  const topP = character.topP
  const thinkingEnabled = character.thinkingEnabled

  // Collect forbidden words from all characters
  const allForbiddenWords = []
  if (character.forbiddenWords?.length) {
    allForbiddenWords.push(...character.forbiddenWords.filter(w => w.trim()))
  }
  for (const rc of (character.romanceCharacters || [])) {
    if (rc.forbiddenWords?.length) {
      allForbiddenWords.push(...rc.forbiddenWords.filter(w => w.trim()))
    }
  }

  let reply = ''
  let reasoningContent = ''
  let usage = null
  let error = null
  let lastViolation = null

  for (let attempt = 0; attempt <= 3; attempt++) {
    let currentMessages = narratorMessages

    if (attempt > 0 && lastViolation) {
      // Rebuild messages with violation hint before the user input
      currentMessages = [
        ...narratorMessages.slice(0, -1),
        { role: 'system', content: '你刚才的回复包含了违禁内容：' + lastViolation + '，这完全不符合角色设定，请重新生成。' },
        narratorMessages[narratorMessages.length - 1],
      ]
    }

    try {
      let fullReply = ''
      let fullReasoning = ''
      let streamUsage = null

      try {
        for await (const chunk of streamCompletion(currentMessages, apiKey, model, temperature, topP, thinkingEnabled)) {
          if (chunk.content) {
            fullReply += chunk.content
            onToken(chunk.content, fullReply)
          }
          if (chunk.reasoningContent) {
            fullReasoning += chunk.reasoningContent
          }
          if (chunk.usage) {
            streamUsage = chunk.usage
            if (streamUsage.prompt_cache_hit_tokens != null) {
              const denom = streamUsage.prompt_cache_hit_tokens + (streamUsage.prompt_cache_miss_tokens || 0)
              const hitRate = denom > 0 ? streamUsage.prompt_cache_hit_tokens / denom : 0
              console.log('[Coordinator] Cache hit:', streamUsage.prompt_cache_hit_tokens,
                '| miss:', streamUsage.prompt_cache_miss_tokens || 0,
                '| rate:', (hitRate * 100).toFixed(1) + '%')
            }
          }
        }
      } catch (streamErr) {
        // Stream broke mid-flow — preserve partial content
        if (fullReply) {
          reply = fullReply
          reasoningContent = fullReasoning
          usage = streamUsage
          error = { message: streamErr.message, partial: true }
          break
        }
        throw streamErr
      }

      // Check forbidden words
      if (allForbiddenWords.length > 0) {
        const hit = findForbiddenWord(fullReply, allForbiddenWords)
        if (hit) {
          console.warn('[Coordinator] Forbidden word hit:', hit, '— retrying (attempt', attempt + 1, '/ 3)')
          lastViolation = hit
          onToken('', '', true) // Signal reset for streaming UI
          continue
        }
      }

      // Success
      reply = fullReply
      reasoningContent = fullReasoning
      usage = streamUsage
      break
    } catch (err) {
      error = err
      console.error('[Coordinator] LLM call failed:', err.message)
      break // Don't retry on network/timeout errors
    }
  }

  // ASL validation — post-generation alignment leak detection
  let aslValidation = null
  if (reply && !error) {
    aslValidation = validateASL(reply)
    if (!aslValidation.passed) {
      console.warn('[ASL] Alignment leak detected!',
        aslValidation.violations.length, 'violations:',
        aslValidation.violations.map(v => v.pattern).join(', '))
    }
  }

  // Mark first turn done only after successful LLM call
  if (reply && !error && _isFirstTurn) {
    _isFirstTurn = false
  }

  // ── Phase 9: Post-narrative updates ──
  // Apply affection deltas to the affections map for UI
  const updatedAffections = { ...affections }
  for (const [name, delta] of Object.entries(affectionResult.deltas)) {
    const curVal = updatedAffections[name] ?? character?.romanceCharacters?.find(rc => rc.name === name)?.affectionInitial ?? 50
    updatedAffections[name] = Math.max(-100, Math.min(100, curVal + delta))
  }

  // ── Phase 9a: Persist Memory Graph + CPS state ──
  if (_memoryGraph && _characterId && reply) {
    try {
      // Update graph edges with current affection values
      for (const [name, val] of Object.entries(updatedAffections)) {
        const edgeKey = 'user_' + name
        if (_memoryGraph.edges[edgeKey]) {
          _memoryGraph.edges[edgeKey].affection = val
        } else {
          _memoryGraph.edges[edgeKey] = {
            affection: val,
            tension: 50,
            trust: 50,
            dominance: 50,
          }
        }
      }

      // Append turn events to graph event_log
      const turnEvents = (_worldState.eventLog || []).slice(-5)
      for (const evt of turnEvents) {
        _memoryGraph.event_log.push({
          type: evt.type,
          summary: summarizeEventForGraph(evt),
          timestamp: evt.timestamp || Date.now(),
        })
      }
      // Keep last 50 events
      if (_memoryGraph.event_log.length > 50) {
        _memoryGraph.event_log = _memoryGraph.event_log.slice(-50)
      }

      _memoryGraph.updatedAt = Date.now()
      saveGraph(_characterId, _memoryGraph)
    } catch (e) {
      console.warn('[Coordinator] Graph persist failed:', e)
    }
  }

  if (_cpsState && _characterId) {
    try {
      saveConflictState(_characterId, _cpsState)
    } catch (e) {
      console.warn('[Coordinator] CPS persist failed:', e)
    }
  }

  if (_powerGraph && _characterId) {
    try {
      savePowerGraph(_characterId, _powerGraph)
    } catch (e) {
      console.warn('[Coordinator] PowerGraph persist failed:', e)
    }
  }

  // ── Phase 10: Build turn report ──
  const turnReport = {
    round: _worldState.roundIndex,
    npcActions: npcResults.map(r => ({ agent: r.agent, intent: r.intent, emotion: r.emotion })),
    affectionDeltas: affectionResult.deltas,
    affectionLLMNeeded: affectionResult.needsLLM,
    narrativeHints: narrativeHints.map(h => h.text),
    eventCount: (_worldState.eventLog || []).length,
    graphEdgeCount: _memoryGraph ? Object.keys(_memoryGraph.edges || {}).length : 0,
    cpsActiveConflicts: _cpsState ? _cpsState.activeConflicts.length : 0,
    cpsTension: _cpsState ? Math.round(_cpsState.tensionLevel * 100) : 0,
    powerTilt: _powerGraph ? Math.round(_powerGraph.globalTilt * 100) : 0,
    powerShiftCount: _powerGraph ? (_powerGraph.shiftLog || []).length : 0,
    aslViolations: aslValidation ? aslValidation.violations.length : 0,
    aslPassed: aslValidation ? aslValidation.passed : true,
    isFirstTurn: _isFirstTurn,
    promptTokens: Math.ceil(systemPrompt.length / 2.5),
  }

  console.log('[Coordinator] Turn report:', JSON.stringify({
    round: turnReport.round,
    npcs: turnReport.npcActions.length,
    deltas: turnReport.affectionDeltas,
    llmNeeded: turnReport.affectionLLMNeeded,
    events: turnReport.eventCount,
    graphEdges: turnReport.graphEdgeCount,
    cpsConflicts: turnReport.cpsActiveConflicts,
    cpsTension: turnReport.cpsTension + '%',
    powerTilt: turnReport.powerTilt + '%',
    powerShifts: turnReport.powerShiftCount,
    aslViolations: turnReport.aslViolations,
  }))

  return {
    reply,
    reasoningContent,
    usage,
    error,
    worldState: _worldState,
    updatedAffections,
    turnReport,
    aslValidation,
  }
}

/**
 * Get current world state (for debugging / UI inspection).
 */
export function getWorldState() {
  return _worldState
}

/**
 * Get current event bus (for debugging).
 */
export function getEventBus() {
  return _eventBus
}

/**
 * Get current CPS state (for debugging).
 */
export function getCPSState() {
  return _cpsState
}

/**
 * Get current Memory Graph (for debugging).
 */
export function getMemoryGraph() {
  return _memoryGraph
}

// ─── CPS Conflict Detection (v3 → CPS bridge) ────────────

/**
 * Auto-detect conflicts from v3 NPC actions and relationship changes,
 * and register them with the CPS engine.
 *
 * In v2, this required LLM extraction. In v3, the rule engine tells us
 * directly when conflicts happen — so CPS registration is deterministic.
 */
function detectAndRegisterConflicts(npcResults, affectionResult, userInput) {
  if (!_cpsState) return

  // 1. Detect conflicts from NPC actions
  const conflictIntents = ['confront', 'escalate', 'intervene', 'jealous']
  for (const result of npcResults) {
    if (conflictIntents.includes(result.intent)) {
      const conflictType = result.intent === 'confront' ? 'CONFRONTATION'
        : result.intent === 'escalate' ? 'CONTROL_CLASH'
        : result.intent === 'jealous' ? 'JEALOUSY_TRIGGER'
        : 'CONFRONTATION'

      const intensity = result.intent === 'escalate' ? 0.8
        : result.intent === 'jealous' ? 0.7
        : 0.65

      ConflictStateEngine.register(_cpsState, {
        type: conflictType,
        summary: result.agent + ': ' + result.intent + ' — ' + (result.action || '对抗行为'),
        actor: result.agent,
        target: 'player',
        emotion: result.emotion || 'anger',
      }, { intensity, minLifespan: result.intent === 'escalate' ? 4 : 3 })

      console.log('[Coordinator] CPS conflict registered from NPC action:',
        result.agent, conflictType, 'intensity:', Math.round(intensity * 100) + '%')
    }
  }

  // 2. Detect conflicts from negative relationship changes
  for (const [name, delta] of Object.entries(affectionResult.deltas || {})) {
    if (delta <= -2) {
      // Significant negative affection change → potential conflict
      const alreadyRegistered = _cpsState.activeConflicts.some(c =>
        c.actor === name &&
        (c.type === 'RELATIONSHIP_DETERIORATION' || c.sourceEvent.includes('好感度下跌'))
      )
      if (!alreadyRegistered) {
        ConflictStateEngine.register(_cpsState, {
          type: 'RELATIONSHIP_DETERIORATION',
          summary: name + '好感度下跌' + Math.abs(delta),
          actor: name,
          target: 'player',
          emotion: 'cold',
        }, { intensity: 0.55, minLifespan: 2 })
      }
    }
  }

  // 3. Detect high-tension keywords in user input that may create new conflicts
  const highTensionKeywords = ['分手', '绝交', '恨你', '不再', '结束', '背叛', '骗我', '滚']
  const hasHighTension = highTensionKeywords.some(kw => (userInput || '').includes(kw))
  if (hasHighTension) {
    const alreadyRegistered = _cpsState.activeConflicts.some(c =>
      c.sourceEvent.includes('玩家高张力输入')
    )
    if (!alreadyRegistered) {
      ConflictStateEngine.register(_cpsState, {
        type: 'EMOTIONAL_EXPLOSION',
        summary: '玩家高张力输入: ' + (userInput || '').slice(0, 30),
        actor: 'player',
        target: 'system',
        emotion: 'anger',
      }, { intensity: 0.85, minLifespan: 4 })
      console.log('[Coordinator] CPS conflict registered from high-tension user input')
    }
  }
}

/**
 * Map NPC agent intent to Power Dynamics event type.
 */
function mapIntentToPowerEvent(intent) {
  const map = {
    confront: 'CONFRONT',
    escalate: 'ESCALATE',
    intervene: 'INTERVENE',
    withdraw: 'WITHDRAW',
    protect: 'COMPLIANCE',     // Protecting = compliance to relationship
    jealous: 'JEALOUS',
    approach: null,            // No significant power shift
    observe: null,
    ignore: 'WITHDRAW',        // Ignoring = withdrawal of attention/power
  }
  return map[intent] || null
}

/**
 * Summarize a world event for the Memory Graph's event_log.
 */
function summarizeEventForGraph(event) {
  switch (event.type) {
    case 'NPC_ACTION': {
      const d = event.data || {}
      return d.agent + ': ' + d.intent + ' — ' + (d.action || '')
    }
    case 'RELATIONSHIP_CHANGE': {
      const d = event.data || {}
      return d.source + '好感度' + (d.delta > 0 ? '+' : '') + d.delta + ' (' + (d.trigger || '') + ')'
    }
    case 'USER_ACTION': {
      const d = event.data || {}
      return '玩家: ' + ((d.content || '').slice(0, 80))
    }
    case 'CONFLICT_EVENT': {
      const d = event.data || {}
      return '冲突: ' + (d.participants || []).join(' vs ') + ' (强度' + (d.intensity || '?') + '/10)'
    }
    default:
      return event.type + ': ' + JSON.stringify(event.data || {}).slice(0, 60)
  }
}
