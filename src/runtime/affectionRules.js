/**
 * Affection Rules v3 — deterministic scoring system.
 *
 * Replaces LLM-based affection judging for ~85% of turns.
 * Only ambiguous cases (expectation violations, complex conflicts)
 * fall through to the LLM judge.
 *
 * Rule priority (first match wins):
 *   1. Anchor suppression match → 0
 *   2. Affection up rule keyword match → +1
 *   3. Affection down rule keyword match → -1
 *   4. High signal interaction → +2
 *   5. Conflict event → needs LLM
 *   6. Expectation violation → needs LLM
 *   7. Default → 0 (no change)
 */

import { shouldTriggerAffectionJudge } from './affectionTrigger'

/**
 * Score affection deterministically. Returns delta + whether LLM is needed.
 *
 * @param {string} userInput — current user message
 * @param {string} aiReply — Narrator's reply
 * @param {object} agentState — character state from World Engine
 * @param {number} roundCounter — current round index
 * @returns {{ delta: number, needsLLM: boolean, reason: string }}
 */
export function scoreAffection(userInput, aiReply, agentState, roundCounter) {
  // Rule 1: Anchor suppression match
  if (agentState.anchorSuppression && userInput) {
    const suppressionTerms = agentState.anchorSuppression
      .split(/[，,、\n]/)
      .map(s => s.trim())
      .filter(Boolean)

    const matched = suppressionTerms.some(term =>
      userInput.includes(term) || (aiReply || '').includes(term)
    )
    if (matched) {
      return { delta: 0, needsLLM: false, reason: '锚点压制场景，锁死好感度' }
    }
  }

  // Rule 2: Affection up rules keyword match
  if (agentState.affectionUpRules && userInput) {
    const upTerms = extractKeywords(agentState.affectionUpRules)
    if (upTerms.some(t => userInput.includes(t) || (aiReply || '').includes(t))) {
      return { delta: 1, needsLLM: false, reason: '匹配上涨条件关键词' }
    }
  }

  // Rule 3: Affection down rules keyword match
  if (agentState.affectionDownRules && userInput) {
    const downTerms = extractKeywords(agentState.affectionDownRules)
    if (downTerms.some(t => userInput.includes(t) || (aiReply || '').includes(t))) {
      return { delta: -1, needsLLM: false, reason: '匹配下跌/侵蚀条件关键词' }
    }
  }

  // Rule 4: High signal interaction → +1~+2
  const triggerResult = shouldTriggerAffectionJudge(userInput, aiReply, roundCounter, 99) // 99 = never force
  if (triggerResult.trigger && triggerResult.reason.includes('高信号')) {
    // Higher delta for strong signals
    const strongSignals = ['我爱你', '我喜欢你', '接吻', '拥抱', '保护', '信任']
    const isStrong = strongSignals.some(kw => (userInput || '').toLowerCase().includes(kw))
    return { delta: isStrong ? 2 : 1, needsLLM: false, reason: '高信号互动: ' + triggerResult.reason }
  }

  // Rule 5: Check for conflict/expectation-violation → needs LLM
  const conflictKeywords = ['为什么', '你到底', '你从来', '你总是', '我不明白', '凭什么',
    '你变了', '以前你', '记得那天', '你答应过']
  const hasConflict = conflictKeywords.some(kw => (userInput || '').includes(kw))

  if (hasConflict) {
    return { delta: 0, needsLLM: true, reason: '潜在冲突/预期打破，需要LLM裁决' }
  }

  // Default: no change
  return { delta: 0, needsLLM: false, reason: '无显著情感信号' }
}

/**
 * Apply scored affection deltas to all active characters.
 *
 * @param {object} world — World Engine state
 * @param {string} userInput — current user message
 * @param {string} aiReply — Narrator reply
 * @param {number} roundCounter — current round
 * @returns {{ deltas: object, needsLLM: string[], events: Array }}
 */
export function scoreAllAffections(world, userInput, aiReply, roundCounter) {
  const deltas = {}
  const needsLLM = []
  const events = []

  for (const [name, agent] of Object.entries(world.characters)) {
    if (!agent.affectionEnabled) continue
    if (!agent.present) continue

    const result = scoreAffection(userInput, aiReply, agent, roundCounter)

    if (result.needsLLM) {
      needsLLM.push(name)
    } else if (result.delta !== 0) {
      deltas[name] = result.delta

      events.push({
        type: 'RELATIONSHIP_CHANGE',
        timestamp: Date.now(),
        data: {
          source: name,
          target: 'player',
          delta: result.delta,
          trigger: result.reason,
        },
      })
    }
  }

  return { deltas, needsLLM, events }
}

// ─── Helpers ────────────────────────────────────────────

function extractKeywords(ruleText) {
  // Extract meaningful Chinese keywords from rule text
  if (!ruleText) return []

  // Split by common delimiters and filter short fragments
  return ruleText
    .split(/[：:，,、。\n+→\d\-]/)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && s.length <= 15)
}
