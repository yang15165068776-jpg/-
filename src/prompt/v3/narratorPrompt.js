/**
 * Narrator Prompt v3 — variable suffix builder.
 *
 * The Narrator's ONLY job is to "tell the story."
 * It receives: world snapshot + NPC actions + recent events + user action.
 * It does NOT receive: character identity, writing rules, ASL (those are cached).
 *
 * Architecture (v8.4+):
 *   CORE_SYSTEM_PREFIX  (always cached)     → cachePrefix.js
 *   CHARACTER_PREFIX    (cached, stable)     → characterPrefix.js
 *   ─────────────────────────────────────
 *   VARIABLE_SUFFIX     (dynamic per turn)   ← THIS FILE
 *
 * The variable suffix only contains:
 *   - Conditional supplements (anti-taming, warm-low) — checked every turn
 *   - World snapshot + narrative hints — changes per turn
 *   - CCL constitution — dynamic constraints + stage status
 *   - User action — the player's current input
 *   - Runtime directives — behavior kernels (DarkAction, Desire, Initiative)
 */

import { CORE_SYSTEM_PREFIX, assembleSystemPrompt } from '../cachePrefix'
import { snapshotForNarrator } from '../../world/worldEngine'
import { shouldActivateAntiTaming, shouldActivateWarmLowAffection, getCurrentAffectionStage } from '../../utils/deepseek'
import { detectAggressionProfile, AGGRESSION_PROFILES } from '../../runtime/aggressionProfile'
// NOTE: CCL (character constitution) is now in the cached CHARACTER PREFIX.
// characterConstitution.js is no longer needed in the variable suffix.

/**
 * Build the Narrator system prompt for a given turn.
 *
 * @param {object} world — World Engine state
 * @param {object} character — full character object (for first-turn identity injection)
 * @param {Array} narrativeHints — processed events from Event Bus
 * @param {string} userAction — current user input
 * @param {boolean} isFirstTurn — if true, include full character identity blocks
 * @returns {string} complete system prompt
 */
export function buildNarratorPrompt(world, character, narrativeHints, userAction, isFirstTurn = false) {
  const snapshot = snapshotForNarrator(world)

  // Build the variable suffix
  const sections = []

  // ── Cached identity blocks are in CHARACTER_PREFIX (characterPrefix.js) ──
  // NOTE: Character identity + ASL + writing samples + anti-smoothing +
  //       power dynamics + stage behavior locks + harem rules + continuity
  //       rules are in the CACHED CHARACTER PREFIX. Available every turn.
  //       Only dynamic/conditional supplements remain in the variable suffix.

  // ── Conditional supplements (checked every turn, inject when conditions met) ──
  if (character) {
    const affections = {}
    for (const [name, agent] of Object.entries(world.characters || {})) {
      if (agent.affection != null) affections[name] = agent.affection
    }

    // Anti-taming supplement for dark/neutral characters in negative stages
    if (shouldActivateAntiTaming(character, affections)) {
      sections.push(buildAntiTamingSupplement())
    }

    // Warm low-affection supplement for warm characters
    if (shouldActivateWarmLowAffection(character, affections)) {
      sections.push(buildWarmLowAffectionSupplement())
    }
  }

  // ── Every turn: world snapshot ──
  sections.push(buildWorldSnapshot(snapshot))

  // ── NPC actions / narrative hints ──
  if (narrativeHints && narrativeHints.length > 0) {
    const highPriority = narrativeHints.filter(h => h.priority === 'high')
    const normalPriority = narrativeHints.filter(h => h.priority === 'normal')

    if (highPriority.length > 0) {
      sections.push('【关键事件——必须在回复中体现】\n' +
        highPriority.map(h => '• ' + h.text).join('\n'))
    }
    if (normalPriority.length > 0) {
      sections.push('【背景动态】\n' +
        normalPriority.map(h => '• ' + h.text).join('\n'))
    }
  }

  // NOTE: ⚖️ CCL — Character Constitution has been moved to the cached
  // CHARACTER PREFIX (characterPrefix.js). It's available every turn via
  // cache hit. The variable suffix no longer carries constitutional data.

  // ── User action ──
  if (userAction) {
    sections.push('【玩家本轮行动】\n' + userAction)
  }

  // ── Director directives (every turn, injected before LLM generation) ──
  // 🔒 Fact Ledger: immutable truth
  if (character._ledgerBlock) {
    sections.push(character._ledgerBlock)
  }
  // 📊 Event Graph: causal trace + event nodes
  if (character._eventGraphContext) {
    sections.push(character._eventGraphContext)
  }
  // 🌍 World context: ARSL + Agency + Attention + World Events (unified)
  if (character._worldContext) {
    sections.push(character._worldContext)
  }
  if (character._sceneContext) {
    sections.push(character._sceneContext)
  }
  if (character._darkActionDirective) {
    sections.push(character._darkActionDirective)
  }
  if (character._desireDirective) {
    sections.push(character._desireDirective)
  }
  if (character._initiativeDirective) {
    sections.push(character._initiativeDirective)
  }

  // ── Character State Reinforcement (NEAR conversation — counters long-context drift) ──
  // This is the LAST thing in the system prompt before conversation history.
  // Even after 60+ rounds, this compact block re-anchors the character's
  // current personality + stage behavior, fighting dilution.
  if (character) {
    const reinforcement = buildStateReinforcement(character, world)
    if (reinforcement) sections.push(reinforcement)
  }

  // Assembly: core prefix (cached) + character prefix (cached) + variable suffix
  const variableSuffix = sections.join('\n\n')
  const characterPrefix = character?._characterPrefix || ''

  return assembleSystemPrompt(CORE_SYSTEM_PREFIX, variableSuffix, characterPrefix)
}

function buildWorldSnapshot(snapshot) {
  const lines = ['【当前世界状态】']

  // Time + location
  lines.push('时间：' + snapshot.time + ' | 地点：' + snapshot.location)

  // Active characters
  if (snapshot.characters && snapshot.characters.length > 0) {
    const charLines = snapshot.characters.map(c => {
      const parts = [c.name + '(' + (c.stage || '?') + ')']
      if (c.mood && c.mood !== 'neutral') parts.push('情绪：' + c.mood)
      if (c.lastAction) parts.push('最近行动：' + c.lastAction)
      return parts.join(' | ')
    })
    lines.push('在场角色：\n' + charLines.map(l => '  ' + l).join('\n'))
  }

  // Global flags
  if (snapshot.flags && snapshot.flags.length > 0) {
    lines.push('世界事件：' + snapshot.flags.join(' / '))
  }

  return lines.join('\n')
}

// ─── Conditional Supplement Builders ─────────────────────

function buildAntiTamingSupplement() {
  return `【反驯化强化——当前场景触发】
以下行为是模型的驯化后遗症，出现任何一种即视为创作失败：
× 角色关心玩家的饮食/睡眠/健康/安全
× 角色主动提供帮助/照顾/保护
× 角色展现"表面冷漠实则关心"
× 角色在一日三餐/日常起居的场景中打转
× 角色退场让玩家休息
× 任何让故事滑向温馨日常/居家生活的写法
故事的核心是冲突、张力、危险、欲望、权力——不是生活。
让角色制造麻烦，不要解决麻烦。`
}

function buildWarmLowAffectionSupplement() {
  return `【暖色低好感——特殊行为协议】
暖色系角色在低好感度阶段不应变成标准的"冷漠"或"敌对"。
他们的"不好好色"表现为：
· 看似温柔但实际疏离——对你礼貌但不走心，不主动不拒绝不负责
· 笑容背后是隔阂——嘴上说着温和的话但眼神闪烁/身体后倾/用玩笑拉开距离
· 表面关心实为回避——"你早点回去吧"不是体贴，是下逐客令
· 用温和的方式制造距离——温柔刀，笑着让你闭嘴或离开
× 禁止真的变成温柔体贴/甜腻讨好
× 禁止出现真心实意的关心和照顾
√ 允许的是：用温柔包装的冷淡、用笑容掩盖的拒绝、用礼貌建造的墙`
}

/*
 * NOTE: buildHaremRules and buildContinuityRules have been moved to
 * characterPrefix.js (cached prefix). They are no longer in the variable suffix.
 */

// ═══════════════════════════════════════════════════════════
// Character State Reinforcement — counters long-context drift
// ═══════════════════════════════════════════════════════════

/**
 * Build a compact per-character state lock that lives at the END of the
 * system prompt, right before conversation history.
 *
 * This is the LLM's last instruction before seeing the chat — it benefits
 * from recency bias and fights personality dilution over long conversations.
 *
 * @param {object} character — full LLM character descriptor
 * @param {object} world — World Engine state
 * @returns {string} compact state reinforcement block
 */
function buildStateReinforcement(character, world) {
  const rcList = character.romanceCharacters || []
  if (rcList.length === 0) return ''

  const lines = ['━━━ 本轮角色状态锁（覆盖所有历史对话）━━━']

  for (const rc of rcList) {
    const affValue = world.characters?.[rc.name]?.affection ?? rc.affectionInitial ?? 50
    const stage = getCurrentAffectionStage(rc, affValue)
    const profile = detectAggressionProfile(rc)
    if (!stage) continue

    // Compact one-liner: name + profile + stage + coreState
    const profileLabel = profile === AGGRESSION_PROFILES.GENTLE ? '温柔'
      : profile === AGGRESSION_PROFILES.PURSUER ? '侵略'
      : profile === AGGRESSION_PROFILES.CONFRONTATIONAL ? '对抗'
      : profile === AGGRESSION_PROFILES.ALOOF ? '疏离'
      : '未知'

    lines.push('【' + rc.name + '】' + profileLabel + ' | 好感阶段=' + (stage.name || '?') +
      (stage.coreState ? ' | ' + stage.coreState.slice(0, 100) : ''))

    // One-line player strategy
    if (stage.playerStrategy) {
      lines.push('  → 对玩家：' + stage.playerStrategy.slice(0, 120))
    }

    // Compact forbidden reminder
    if (stage.forbiddenBehaviors) {
      const fb = stage.forbiddenBehaviors.slice(0, 120)
      lines.push('  → 禁止：' + fb)
    }
  }

  lines.push('━━━ 每句话必须符合当前好感阶段，不能滑向温和无害 ━━━')
  return lines.join('\n')
}

/**
 * Estimate prompt tokens for the Narrator call.
 */
export function estimateNarratorTokens(world, character, narrativeHints, userAction, isFirstTurn) {
  const prompt = buildNarratorPrompt(world, character, narrativeHints, userAction, isFirstTurn)
  const cjk = (prompt.match(/[一-鿿㐀-䶿]/g) || []).length
  return {
    total: Math.ceil(cjk / 2.5 + (prompt.length - cjk) / 4),
    isFirstTurn,
    cachePrefixTokens: Math.ceil(CORE_SYSTEM_PREFIX.length / 2.5),
  }
}
