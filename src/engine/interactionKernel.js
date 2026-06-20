/**
 * Interaction Kernel v1 — 剧情交互内核
 *
 * 统一管理：
 *   1. 剧情状态 — messages[], opening scene, branching context
 *   2. 好感系统 — 自动变化 + 手动 ±2 + AI 反馈写入 USK
 *   3. 消息系统 — add / edit / delete / rollback / compress
 *   4. 行为系统 — token usage, event triggers, AI decision hooks
 *
 * 设计原则：
 *   - Singleton object（与 NavigationEngine / HydrationEngine 一致）
 *   - 不依赖 React，返回 state snapshot
 *   - 通过 stateBridge 操作 USK（不绕过桥接层）
 *   - 通过 folderStore 持久化消息
 *   - 通过 HydrationEngine 缓存导航恢复
 */

import {
  initBridgeForFolder,
  getFolderUIState,
  getRawFolderUSK,
  dramaTurnEnd,
  dailyTurnEnd,
} from '../state/stateBridge'
import {
  getFolder,
  getOrCreateDefaultSave,
  getSaveMessages,
  saveSaveMessages,
} from '../state/folderStore'
import { HydrationEngine } from './hydrationEngine'
import { AgentDecisionLayer } from './agentDecisionLayer'
import { AntiSmoothingV2 } from '../runtime/antiSmoothingV2'
import { runAgentTurn, resetAgentTurn } from '../agents/coordinator'
import { StabilityCompiler } from '../runtime/stabilityCompiler'
import { MemoryInterpreter, DualViewMemory } from '../memory/memoryInterpreter'
import { CausalEngine } from '../runtime/causalEngine'
import { DramaOrchestrator } from '../runtime/dramaOrchestrator'

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function generateMsgId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

// ═══════════════════════════════════════════════════════════
// Interaction Kernel
// ═══════════════════════════════════════════════════════════

export const InteractionKernel = {

  // ── State ──────────────────────────────────────────

  state: {
    folderId: null,
    mode: null,
    saveId: null,
    messages: [],
    affection: 50,
    affections: {},
    affectionFlash: null,
    tension: 30,
    compiledPersona: null,
    scene: null,           // DramaOrchestrator scene state
    lifecycle: {
      turnCount: 0,
      passiveTurns: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalCacheHitTokens: 0,
      totalCacheMissTokens: 0,
    },
    _initialized: false,
  },

  // ═══════════════════════════════════════════════════
  // 1. Lifecycle
  // ═══════════════════════════════════════════════════

  /**
   * Initialize the kernel for a folder session.
   *
   * Priority:
   *   1. HydrationEngine cache (back-navigation recovery)
   *   2. folderStore save (localStorage persistence)
   *   3. Opening scene injection (fresh start)
   *
   * @param {string} folderId
   * @param {object[]} characters — folderChars for this session
   * @param {'drama'|'daily'} mode
   * @param {object|null} hydrateData — cached { messages, usk } from HydrationEngine
   * @returns {object} state snapshot { messages, affection, tension, saveId, affections }
   */
  init(folderId, characters, mode, hydrateData) {
    this.reset()
    // Reset coordinator world state so old folder's affection doesn't leak in
    resetAgentTurn()
    this.state.folderId = folderId
    this.state.mode = mode

    // ── Load messages ──
    const cached = hydrateData || HydrationEngine.get(folderId, mode)
    let messages = []

    if (cached && cached.messages && cached.messages.length > 0) {
      messages = cached.messages
      // Ensure saveId is set even when loading from cache
      const save = getOrCreateDefaultSave(folderId)
      if (save) this.state.saveId = save.id
    } else {
      const save = getOrCreateDefaultSave(folderId)
      if (save) {
        this.state.saveId = save.id
        messages = getSaveMessages(save.id, folderId, mode === 'drama' ? 'drama' : 'daily')
      }
    }

    // Inject opening scene for drama mode if missing (handles both fresh + cache w/o opening)
    if (mode === 'drama') {
      const hasOpening = messages.some(m => m.isOpening)
      if (!hasOpening) {
        const mainChar = characters[0]
        const folder = getFolder(folderId)
        const openingText = mainChar?.openingScenario || folder?.story_intro || ''
        if (openingText) {
          messages = [{
            id: 'opening-' + generateMsgId(),
            role: 'assistant',
            content: openingText,
            timestamp: Date.now(),
            isOpening: true,
            immutable: true,
          }, ...messages]
          // Persist immediately
          if (this.state.saveId) {
            saveSaveMessages(this.state.saveId, folderId, 'drama', messages)
          }
        }
      }
    }

    this.state.messages = messages

    // ── Init USK ──
    const charsForUSK = (characters || []).map(c => ({
      id: c.name || c.id,
      name: c.name || '',
      affectionInitial: c.affectionInitial ?? 50,
    }))
    initBridgeForFolder(folderId, charsForUSK, mode, this.state.saveId)

    // ── Fresh session: override USK with character's affectionInitial ──
    // If no messages exist (beyond opening), the user's character settings
    // should take priority over stale USK values from previous sessions.
    const hasOnlyOpening = messages.every(m => m.isOpening)
    if (messages.length === 0 || hasOnlyOpening) {
      for (const c of characters) {
        const name = c.name || c.id
        if (name && c.affectionInitial != null) {
          const charState = getFolderUIState(name)
          if (charState && charState.relationship) {
            // Write the character's configured initial affection into USK
            const currentUSK = getRawFolderUSK()
            if (currentUSK?.characters?.[name]) {
              currentUSK.characters[name].relationship.affection = c.affectionInitial
            }
          }
        }
      }
    }

    // ── Sync affection / tension from USK ──
    const mainChar = characters[0]
    if (mainChar) {
      const uiState = getFolderUIState(mainChar.name || mainChar.id)
      if (uiState) {
        this.state.affection = uiState.relationship?.affection ?? 50
        this.state.tension = uiState.tension?.unresolved_conflicts ?? 30
      }
    }

    // ── Build initial affections map ──
    const affMap = {}
    for (const c of characters) {
      const name = c.name || c.id
      if (name) {
        const charState = getFolderUIState(name)
        affMap[name] = charState?.relationship?.affection ?? c.affectionInitial ?? 50
      }
    }
    this.state.affections = affMap

    // ── Compile character personality ──
    if (mainChar) {
      this.state.compiledPersona = StabilityCompiler.compile(mainChar)
    }

    // ── Drama Orchestrator v1: init scene state ──
    if (mode === 'drama' && mainChar) {
      this.state.scene = DramaOrchestrator.initScene(mainChar, folder)
    }

    this.state._initialized = true
    return this.getState()
  },

  /**
   * Reset all kernel state to defaults.
   */
  reset() {
    this.state.folderId = null
    this.state.mode = null
    this.state.saveId = null
    this.state.messages = []
    this.state.affection = 50
    this.state.affections = {}
    this.state.affectionFlash = null
    this.state.tension = 30
    this.state.compiledPersona = null
    this.state.lifecycle = {
      turnCount: 0,
      passiveTurns: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalCacheHitTokens: 0,
      totalCacheMissTokens: 0,
    }
    this.state._initialized = false
  },

  // ═══════════════════════════════════════════════════
  // 2. Message System
  // ═══════════════════════════════════════════════════

  /**
   * Append a user message and auto-save.
   * @returns {object[]} updated messages array
   */
  addUserMessage(content) {
    const msg = {
      id: generateMsgId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    this.state.messages.push(msg)
    this._autoSave()
    return this.state.messages
  },

  /**
   * Append an assistant message, track token usage, auto-save.
   * @returns {object[]} updated messages array
   */
  addAssistantMessage(reply, reasoningContent, usage) {
    const msg = {
      id: generateMsgId(),
      role: 'assistant',
      content: reply,
      reasoningContent: reasoningContent || null,
      usage: usage || null,
      timestamp: Date.now(),
    }
    this.state.messages.push(msg)
    if (usage) this._trackUsage(usage)
    this._autoSave()
    return this.state.messages
  },

  /**
   * Find the index of the last user message.
   * @returns {number} index or -1
   */
  _lastUserIndex() {
    for (let i = this.state.messages.length - 1; i >= 0; i--) {
      if (this.state.messages[i].role === 'user') return i
    }
    return -1
  },

  /**
   * Get the last user message with its index (for edit flow).
   * @returns {{ content: string, _index: number } | null}
   */
  getLastUserMessage() {
    const idx = this._lastUserIndex()
    if (idx === -1) return null
    return {
      content: this.state.messages[idx].content,
      _index: idx,
    }
  },

  /**
   * Truncate messages to remove everything from the last user message onward.
   * Used before edit: truncates the last user msg + assistant response,
   * then caller prompts for new text and re-sends.
   * @returns {object[]} truncated messages (before the last user message)
   */
  truncateBeforeLastUser() {
    const idx = this._lastUserIndex()
    if (idx === -1) return this.state.messages
    this.state.messages = this.state.messages.slice(0, idx)
    this._autoSave()
    return this.state.messages
  },

  /**
   * Delete the last user+assistant pair.
   * @returns {object[]} updated messages
   */
  deleteLastPair() {
    const idx = this._lastUserIndex()
    if (idx === -1) return this.state.messages
    this.state.messages = this.state.messages.slice(0, idx)
    this._autoSave()
    return this.state.messages
  },

  /**
   * Rollback messages to a specific index (inclusive).
   * @param {number} index — truncate at this position (keep messages before it)
   * @returns {object[]} updated messages
   */
  rollbackTo(index) {
    if (index < 0) {
      this.state.messages = []
    } else {
      this.state.messages = this.state.messages.slice(0, index + 1)
    }
    this._autoSave()
    return this.state.messages
  },

  /**
   * Edit a specific message by ID.
   * Immutable messages (opening scene) cannot be edited.
   * @param {string} id
   * @param {string} newContent
   * @returns {boolean} success
   */
  editMessage(id, newContent) {
    const msg = this.state.messages.find(m => m.id === id)
    if (!msg || msg.immutable) return false
    msg.content = newContent
    this._autoSave()
    return true
  },

  /**
   * Delete a specific message by ID.
   * Immutable messages cannot be deleted.
   * @param {string} id
   * @returns {boolean} success
   */
  deleteMessage(id) {
    const msg = this.state.messages.find(m => m.id === id)
    if (msg && msg.immutable) return false
    this.state.messages = this.state.messages.filter(m => m.id !== id)
    this._autoSave()
    return true
  },

  /**
   * Edit a message at a specific array index.
   * @param {number} idx
   * @param {string} newContent
   * @returns {boolean} success
   */
  editMessageAtIndex(idx, newContent) {
    if (idx < 0 || idx >= this.state.messages.length) return false
    const msg = this.state.messages[idx]
    if (msg.immutable) return false
    msg.content = newContent
    this._autoSave()
    return true
  },

  /**
   * Delete a message at a specific array index.
   * @param {number} idx
   * @returns {object[]} updated messages
   */
  deleteMessageAtIndex(idx) {
    if (idx < 0 || idx >= this.state.messages.length) return this.state.messages
    const msg = this.state.messages[idx]
    if (msg.immutable) return false
    this.state.messages.splice(idx, 1)
    this._autoSave()
    return this.state.messages
  },

  /**
   * Find the user message that precedes an assistant message at the given index.
   * Used for "regenerate" — find what the user said to re-trigger the AI.
   * @param {number} assistantIdx
   * @returns {{ content: string, _index: number } | null}
   */
  getUserMsgBefore(assistantIdx) {
    for (let i = assistantIdx - 1; i >= 0; i--) {
      if (this.state.messages[i].role === 'user') {
        return { content: this.state.messages[i].content, _index: i }
      }
    }
    return null
  },

  /**
   * Rollback the last message only.
   */
  rollbackLast() {
    this.state.messages.pop()
    this._autoSave()
    return this.state.messages
  },

  // ═══════════════════════════════════════════════════
  // 3. Compress System (v1 placeholder)
  // ═══════════════════════════════════════════════════

  /**
   * Compress messages into a summary.
   * v1: simple truncation summary. v1.1+: full summarization.
   * @returns {{ summary: string }}
   */
  compressMessages() {
    const allText = this.state.messages
      .map(m => (m.role === 'user' ? '主角' : '角色') + '：' + (m.content || '').slice(0, 100))
      .join('\n')

    return {
      summary: allText.slice(0, 500),
    }
  },

  // ═══════════════════════════════════════════════════
  // 4. Affection System
  // ═══════════════════════════════════════════════════

  /**
   * Apply affection delta (AI-driven, auto-clamped).
   * @param {number} delta
   * @param {object} usk — raw USK reference
   * @returns {number} new affection value
   */
  updateAffection(delta, usk) {
    this.state.affection += delta
    this.state.affection = clamp(this.state.affection, -100, 100)
    return this.state.affection
  },

  /**
   * Manual affection adjust (±2 per user action).
   * Writes through stateBridge to USK for persistence.
   * @param {string} charName
   * @param {number} delta — typically +2 or -2
   * @returns {number} new affection value for this character
   */
  manualAffectionAdjust(charName, delta) {
    const current = this.state.affections[charName] ?? 50
    const newVal = clamp(current + delta, -100, 100)
    this.state.affections[charName] = newVal

    // Write to USK via the existing dramaTurnEnd path
    dramaTurnEnd(charName, {
      turnReport: {
        affectionDeltas: { [charName]: delta },
        npcActions: [],
      },
    })

    // Sync main char affection if applicable
    const mainCharName = Object.keys(this.state.affections)[0]
    if (charName === mainCharName) {
      this.state.affection = newVal
    }

    return newVal
  },

  /**
   * Get affection for a character.
   * @param {string} [charName] — omit for main character scalar
   * @returns {number}
   */
  getAffection(charName) {
    if (!charName) return this.state.affection
    return this.state.affections[charName] ?? 50
  },

  /**
   * Get the full affections map (shallow copy).
   * @returns {object}
   */
  getAffections() {
    return { ...this.state.affections }
  },

  /**
   * @private — take a flat USK snapshot for causal diffing
   */
  _snapshotUSK(charName) {
    const state = getFolderUIState(charName)
    if (!state) return null
    return {
      affection: state.relationship?.affection ?? 50,
      tension: state.tension?.unresolved_conflicts ?? 30,
      dependency: state.relationship?.dependency ?? 30,
      anger: state.emotion?.anger ?? 5,
      jealousy: state.emotion?.jealousy ?? 5,
      trust: state.relationship?.trust ?? 30,
    }
  },

  // ═══════════════════════════════════════════════════
  // 4.5. Agent Decision Layer Bridge
  // ═══════════════════════════════════════════════════

  /**
   * Get the agent's autonomous decision for the current state.
   * Called by UI to know what the character "wants" to do.
   *
   * @returns {object} decision { type, intensity, burst, emotion, reason, urgency }
   */
  getDecision() {
    if (!this.state._initialized) return null
    const mainCharName = Object.keys(this.state.affections)[0]
    if (!mainCharName) return null

    return AgentDecisionLayer.decideFromFolder(
      mainCharName,
      this.state.messages,
      this.state.mode || 'drama',
      this.state.lifecycle.turnCount,
      this.state.lifecycle.passiveTurns,
    )
  },

  /**
   * Increment passive turns counter (called on idle / no user input).
   */
  incrementPassiveTurns() {
    this.state.lifecycle.passiveTurns++
  },

  // ═══════════════════════════════════════════════════
  // 5. Turn Execution (core integration point)
  // ═══════════════════════════════════════════════════

  /**
   * Execute a full turn: user message → AI response → state update → persist.
   *
   * This is the primary integration surface. DramaPage calls this instead of
   * manually orchestrating runAgentTurn + dramaTurnEnd + state sync.
   *
   * @param {string} userText — player input
   * @param {string} apiKey — DeepSeek API key
   * @param {function} onStreamToken — (token, fullText, reset) => void for streaming UI
   * @param {object} character — built LLM character descriptor
   * @param {object} folder — raw folder object (for worldview/story_intro merge context)
   * @returns {Promise<object>} result {
   *   reply, reasoningContent, usage, error,
   *   messages, updatedAffections, affectionFlash,
   *   affection, tension, decision, turnReport, worldState,
   * }
   */
  async executeTurn(userText, apiKey, onStreamToken, character, folder) {
    if (!this.state._initialized) {
      return { error: new Error('InteractionKernel not initialized. Call init() first.') }
    }

    try {
      // 1. Add user message
      const userMsg = {
        id: generateMsgId(),
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      }
      this.state.messages.push(userMsg)
      this.state.lifecycle.turnCount++

      // 2. Get USK snapshot for coordinator + pre-turn state for causal engine
      const usk = getRawFolderUSK()
      const mainCharName = character.name
      const uskBefore = mainCharName
        ? this._snapshotUSK(mainCharName)
        : null

      // 2.5. Run agent decision layer
      const decision = mainCharName
        ? AgentDecisionLayer.decideFromFolder(
            mainCharName,
            this.state.messages,
            this.state.mode || 'drama',
            this.state.lifecycle.turnCount,
            this.state.lifecycle.passiveTurns,
          )
        : null

      // 2.6. Decision-driven behavior
      // SILENT: character refuses to respond → inject system message, skip LLM
      if (decision && decision.type === 'silent') {
        const silentMsg = {
          id: generateMsgId(),
          role: 'system',
          content: `【${mainCharName} 选择了沉默】`,
          silent: true,
          duration: decision.duration || 1,
          timestamp: Date.now(),
        }
        this.state.messages.push(silentMsg)
        this.state.lifecycle.passiveTurns++
        this._autoSave()
        this._saveToHydration()
        return {
          reply: null,
          reasoningContent: null,
          usage: null,
          error: null,
          messages: [...this.state.messages],
          updatedAffections: { ...this.state.affections },
          affectionFlash: null,
          affection: this.state.affection,
          tension: this.state.tension,
          decision,
          silent: true,
          turnReport: null,
          worldState: null,
        }
      }

      // INTERRUPT / EMOTIONAL_BURST: inject pre-turn context
      if (decision && (decision.type === 'interrupt' || decision.type === 'emotional_burst')) {
        const emotionLabel = decision.emotion === 'anger' ? '愤怒' :
                             decision.emotion === 'jealousy' ? '嫉妒' : '激动'
        const interruptCtx = {
          id: generateMsgId(),
          role: 'system',
          content: `【${mainCharName} 情绪${emotionLabel}，${decision.reason}】`,
          interruptCtx: true,
          timestamp: Date.now(),
        }
        this.state.messages.push(interruptCtx)
      }

      // 2.7. Drama Orchestrator v1 — advance scene + inject director prompt
      if (this.state.scene && this.state.mode === 'drama') {
        const uskState = getFolderUIState(mainCharName)
        const interactionType = decision?.type === 'emotional_burst' ? 'conflict' :
                               decision?.type === 'silent' ? 'rejection' : null
        const { scene, event } = DramaOrchestrator.advance(this.state.scene, uskState, interactionType)
        this.state.scene = scene
        if (scene) {
          character._sceneContext = DramaOrchestrator.buildDirectorPrompt(scene)
          character._sceneEvent = event
        }
      }

      // 2.8. Stability Compiler — inject compiled constraints into character
      if (this.state.compiledPersona) {
        character._compiledConstraints = StabilityCompiler.buildPromptInjection(this.state.compiledPersona)
        // Validate runtime state against compiled constraints
        const validation = StabilityCompiler.validate(
          {
            softness: (100 - (this.state.tension || 30)) / 100,
            compliance: (50 + (this.state.affection || 50) - (this.state.tension || 30)) / 100,
            conflict: (this.state.tension || 30) / 100,
          },
          this.state.compiledPersona,
        )
        if (!validation.valid) {
          character._stabilityCorrections = validation.corrections
        }
      }

      // 3. Call agent coordinator
      const result = await runAgentTurn(
        userText,
        character,
        { ...this.state.affections },
        this.state.messages,
        apiKey,
        onStreamToken,
        usk,
      )

      // 4. Handle error
      if (result.error || !result.reply) {
        // Remove the orphaned user message on failure
        this.state.messages.pop()
        return {
          error: result.error || new Error('No reply from coordinator'),
          messages: this.state.messages,
        }
      }

      // 5. Clean reply — strip <affection> XML tags
      let cleanReply = result.reply
      if (typeof cleanReply === 'string') {
        cleanReply = cleanReply.replace(/<affection>[\s\S]*?<\/affection>/g, '').trim()
      }

      // 5.5. Anti-Smoothing v2 — post-process to prevent personality collapse
      if (cleanReply && mainCharName) {
        const uskState = getFolderUIState(mainCharName)
        cleanReply = AntiSmoothingV2.apply(cleanReply, {
          uskState,
          character,
        })
      }

      // 6. Add assistant message + reset passive turns
      const assistantMsg = {
        id: generateMsgId(),
        role: 'assistant',
        content: cleanReply,
        reasoningContent: result.reasoningContent || null,
        usage: result.usage || null,
        timestamp: Date.now(),
      }
      this.state.messages.push(assistantMsg)
      // Character has interacted — reset passive turns
      this.state.lifecycle.passiveTurns = 0

      // 7. Track token usage
      if (result.usage) {
        this._trackUsage(result.usage)
      }

      // 8. Update affections map from coordinator result
      if (result.updatedAffections) {
        this.state.affections = { ...result.updatedAffections }
      }

      // 9. Build affectionFlash for UI animation
      let affectionFlash = null
      const turnReport = result.turnReport || {}
      if (turnReport.affectionDeltas) {
        const deltas = {}
        for (const [name, delta] of Object.entries(turnReport.affectionDeltas)) {
          if (delta !== 0) deltas[name] = delta
        }
        if (Object.keys(deltas).length > 0) {
          affectionFlash = deltas
          this.state.affectionFlash = deltas
        }
      }

      // 10. Write affection deltas + NPC actions to USK via stateBridge
      if (mainCharName) {
        dramaTurnEnd(mainCharName, result)
      }

      // 11. Sync affection / tension from USK back into kernel (all chars)
      if (mainCharName) {
        const uiState = getFolderUIState(mainCharName)
        if (uiState) {
          this.state.affection = uiState.relationship?.affection ?? this.state.affection
          this.state.tension = uiState.tension?.unresolved_conflicts ?? this.state.tension
        }
        // Also re-sync all character affections from USK (SSOT)
        for (const charName of Object.keys(this.state.affections)) {
          const charState = getFolderUIState(charName)
          if (charState?.relationship?.affection != null) {
            this.state.affections[charName] = charState.relationship.affection
          }
        }
      }

      // 11.5. Causal Narrative Engine — explain WHY changes happened
      const mode = this.state.mode || 'drama'
      const uskAfter = mainCharName ? this._snapshotUSK(mainCharName) : null
      const causalAnalysis = (uskBefore && uskAfter)
        ? CausalEngine.analyze(uskBefore, uskAfter, mode, { characterName: mainCharName, userText })
        : null

      // 11.6. Memory Interpretation — record + dual-view
      const uskContext = mainCharName ? getFolderUIState(mainCharName) : null
      const interpretation = MemoryInterpreter.interpretTurn(
        { role: 'user', content: userText },
        { role: 'assistant', content: cleanReply },
        mode,
        { uskState: uskContext, turnCount: this.state.lifecycle.turnCount, character },
      )
      // Store in dual-view memory for cross-mode consistency
      DualViewMemory.record(
        { role: 'user', content: userText },
        { role: 'assistant', content: cleanReply },
        { uskState: uskContext, turnCount: this.state.lifecycle.turnCount, character },
      )

      // 12. Persist
      this._autoSave()
      this._saveToHydration()

      // 13. Return result snapshot
      return {
        reply: cleanReply,
        reasoningContent: result.reasoningContent || null,
        usage: result.usage || null,
        error: null,
        messages: [...this.state.messages],
        updatedAffections: { ...this.state.affections },
        affectionFlash,
        affection: this.state.affection,
        tension: this.state.tension,
        decision,
        interpretation,
        causalAnalysis,
        silent: false,
        turnReport: result.turnReport || null,
        worldState: result.worldState || null,
      }
    } catch (err) {
      // Remove orphaned user message on exception
      const lastMsg = this.state.messages[this.state.messages.length - 1]
      if (lastMsg && lastMsg.role === 'user' && lastMsg.content === userText) {
        this.state.messages.pop()
      }
      return {
        error: err,
        messages: [...this.state.messages],
      }
    }
  },

  // ═══════════════════════════════════════════════════
  // 6. Token Tracking
  // ═══════════════════════════════════════════════════

  /** @private */
  _trackUsage(usage) {
    if (!usage) return
    this.state.lifecycle.totalPromptTokens += usage.prompt_tokens || 0
    this.state.lifecycle.totalCompletionTokens += usage.completion_tokens || 0
    this.state.lifecycle.totalCacheHitTokens += usage.prompt_cache_hit_tokens || 0
    this.state.lifecycle.totalCacheMissTokens += usage.prompt_cache_miss_tokens || 0
  },

  /**
   * Set token usage explicitly (e.g., from external source).
   */
  setTokenUsage(usage) {
    if (!usage) return
    this.state.lifecycle.totalPromptTokens = usage.prompt_tokens || 0
    this.state.lifecycle.totalCompletionTokens = usage.completion_tokens || 0
  },

  /**
   * Get accumulated token usage stats.
   * @returns {{ promptTokens, completionTokens, totalTokens, cacheHitTokens, cacheMissTokens, cacheHitRate, turnCount }}
   */
  getTokenUsage() {
    const lc = this.state.lifecycle
    const cacheTotal = lc.totalCacheHitTokens + lc.totalCacheMissTokens
    return {
      promptTokens: lc.totalPromptTokens,
      completionTokens: lc.totalCompletionTokens,
      totalTokens: lc.totalPromptTokens + lc.totalCompletionTokens,
      cacheHitTokens: lc.totalCacheHitTokens,
      cacheMissTokens: lc.totalCacheMissTokens,
      cacheHitRate: cacheTotal > 0 ? (lc.totalCacheHitTokens / cacheTotal * 100).toFixed(1) + '%' : 'N/A',
      turnCount: lc.turnCount,
    }
  },

  // ═══════════════════════════════════════════════════
  // 7. USK Sync
  // ═══════════════════════════════════════════════════

  /**
   * Sync the kernel's internal state to a USK object.
   * @param {object} usk — USK object to stamp lastInteraction on
   * @returns {object} updated USK
   */
  syncUSK(usk) {
    if (!usk) return usk
    usk.lastInteractionAt = Date.now()
    if (usk.global) {
      usk.global.lastInteractionAt = Date.now()
    }
    return usk
  },

  // ═══════════════════════════════════════════════════
  // 8. Persistence (internal)
  // ═══════════════════════════════════════════════════

  /** @private */
  _autoSave() {
    if (!this.state.saveId || !this.state.folderId) return
    const modeKey = this.state.mode === 'drama' ? 'drama' : 'daily'
    saveSaveMessages(this.state.saveId, this.state.folderId, modeKey, this.state.messages)
    // Also sync hydration cache so edit/delete/rollback don't create cache staleness
    const usk = getRawFolderUSK()
    HydrationEngine.save(this.state.folderId, this.state.mode || 'drama', this.state.messages, usk)
  },

  /** @private */
  _saveToHydration() {
    if (!this.state.folderId) return
    const usk = getRawFolderUSK()
    HydrationEngine.save(this.state.folderId, this.state.mode || 'drama', this.state.messages, usk)
  },

  /**
   * Public API: persist current messages to folderStore.
   */
  persistMessages() {
    this._autoSave()
  },

  /**
   * Load messages from a different save slot.
   * @param {string} saveId
   * @returns {object[]} loaded messages
   */
  loadSave(saveId) {
    if (!this.state.folderId) return []
    this.state.saveId = saveId
    const modeKey = this.state.mode === 'drama' ? 'drama' : 'daily'
    this.state.messages = getSaveMessages(saveId, this.state.folderId, modeKey)
    return this.state.messages
  },

  // ═══════════════════════════════════════════════════
  // 9. State Access
  // ═══════════════════════════════════════════════════

  /**
   * Get a full state snapshot (shallow copy of messages/affections).
   * @returns {object} { folderId, mode, saveId, messages, affection, affections,
   *                     affectionFlash, tension, lifecycle, initialized }
   */
  getState() {
    return {
      folderId: this.state.folderId,
      mode: this.state.mode,
      saveId: this.state.saveId,
      messages: [...this.state.messages],
      affection: this.state.affection,
      affections: { ...this.state.affections },
      affectionFlash: this.state.affectionFlash,
      tension: this.state.tension,
      lifecycle: { ...this.state.lifecycle },
      initialized: this.state._initialized,
    }
  },
}
