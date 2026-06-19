/**
 * State Bridge — UI ↔ USK_API ↔ Engine connector
 *
 * The State Bridge is the SINGLE connection point between the UI layer
 * and the state engine. It prevents the "dual-state" problem where UI
 * and engine hold different copies of the same data.
 *
 * Architecture:
 *   ChatRoom UI → StateBridge → USK_API → USK (single source of truth)
 *                              → Coordinator (via syncToMemoryGraph)
 *
 * Rules:
 *   1. UI NEVER reads USK directly — always through bridge
 *   2. UI NEVER writes USK directly — always through bridge
 *   3. Bridge ensures state consistency across mode switches
 */

import * as USK_API from './uskApi'
import { syncToMemoryGraph } from './unifiedStateKernel'
import { loadGraph, saveGraph } from '../memory/memoryGraph'

// ═══════════════════════════════════════════════════════════
// Bridge API
// ═══════════════════════════════════════════════════════════

/**
 * Initialize the bridge. Loads persona + USK.
 * Call once on ChatRoom mount.
 *
 * @param {object} persona — UnifiedPersona
 * @param {string} initialMode — 'drama' | 'daily'
 * @returns {{ state: object, persona: object }}
 */
export function initBridge(persona, initialMode) {
  const stateSnapshot = USK_API.init(persona, { mode: initialMode })
  return {
    state: stateSnapshot,
    persona: USK_API.getPersona(),
  }
}

/**
 * Get current state for UI rendering.
 * Returns a fresh snapshot (not a live reference).
 */
export function getUIState(charName) {
  return USK_API.read(charName)
}

/**
 * Execute a full turn cycle for DRAMA mode.
 *
 * @param {string} charName
 * @param {string} userInput
 * @returns {object} { state, memoryGraph for coordinator }
 */
export function dramaTurnStart(charName, userInput) {
  // Tick: advance time, decay emotions, update initiative
  USK_API.tick(charName)

  // Log the user action
  USK_API.log_event({
    type: 'user_action',
    summary: '玩家行动：' + (userInput || '').slice(0, 80),
    mode: 'drama',
  })

  // Sync to MemoryGraph for coordinator compatibility
  const rawUSK = USK_API._unsafe_getRawUSK()
  if (rawUSK) {
    const edges = syncToMemoryGraph(rawUSK)
    const characterId = USK_API.getPersona()?.id || 'unknown'
    const graph = loadGraph(characterId) || { edges: {} }
    for (const [key, edge] of Object.entries(edges)) {
      graph.edges[key] = { ...(graph.edges[key] || {}), ...edge }
    }
    saveGraph(characterId, graph)
    return { state: USK_API.read(charName), memoryGraph: graph }
  }

  return { state: USK_API.read(charName), memoryGraph: null }
}

/**
 * Complete a DRAMA turn — apply results from coordinator.
 *
 * @param {string} charName
 * @param {object} result — coordinator's turn report
 */
export function dramaTurnEnd(charName, result) {
  if (!result) return

  const turnReport = result.turnReport || {}

  // Apply affection deltas
  if (turnReport.affectionDeltas) {
    for (const [name, delta] of Object.entries(turnReport.affectionDeltas)) {
      if (delta !== 0) {
        USK_API.write({
          type: delta > 0 ? 'intimacy' : 'conflict',
          summary: '剧情回合：好感度' + (delta > 0 ? '+' : '') + delta,
          impact: { affection: delta },
          mode: 'drama',
        }, name)
      }
    }
  }

  // Log conflict events
  if (turnReport.npcActions) {
    for (const action of turnReport.npcActions) {
      if (['confront', 'escalate'].includes(action.intent)) {
        USK_API.write({
          type: 'conflict',
          summary: action.agent + ': ' + action.intent + ' (' + (action.emotion || '') + ')',
          mode: 'drama',
        }, action.agent)
      }
    }
  }

  USK_API.tick(charName)
  return USK_API.read(charName)
}

/**
 * Execute a full turn cycle for DAILY mode.
 *
 * @param {string} charName
 * @param {string} userInput
 * @returns {object} pre-turn state for prompt injection
 */
export function dailyTurnStart(charName, userInput) {
  USK_API.tick(charName)

  USK_API.log_event({
    type: 'user_action',
    summary: '日常对话：' + (userInput || '').slice(0, 80),
    mode: 'daily',
  })

  return USK_API.read(charName)
}

/**
 * Complete a DAILY turn — apply results.
 *
 * @param {string} charName
 * @param {object} result — { reply, delta }
 */
export function dailyTurnEnd(charName, result) {
  if (!result) return

  USK_API.write({
    type: 'daily_chat',
    summary: '日常聊天：' + (result.reply || '').slice(0, 40),
    mode: 'daily',
  }, charName)

  USK_API.tick(charName)
  return USK_API.read(charName)
}

/**
 * Switch mode. State is preserved — only the interpreter changes.
 *
 * @param {string} toMode — 'drama' | 'daily'
 * @returns {object} updated UI state
 */
export function switchMode(toMode, charName) {
  USK_API.switchMode(toMode)
  USK_API.log_event({
    type: 'mode_switch',
    summary: '切换模式 → ' + (toMode === 'drama' ? 'DRAMA' : 'DAILY'),
    mode: toMode,
  })
  return USK_API.read(charName)
}

/**
 * Get prompt-ready state for the current mode.
 */
export function getPromptState(charName, mode) {
  return USK_API.getPromptSnapshot(charName, mode)
}

/**
 * Get prompt-ready event history.
 */
export function getPromptHistory(maxEvents) {
  return USK_API.getPromptEvents(maxEvents)
}

/**
 * Get the persona (read-only).
 */
export function getPersona() {
  return USK_API.getPersona()
}

/**
 * Get raw USK for coordinator sync (INTENTIONAL escape hatch).
 * Only for coordinator. Do NOT use in UI code.
 */
export function getRawUSK() {
  return USK_API._unsafe_getRawUSK()
}
