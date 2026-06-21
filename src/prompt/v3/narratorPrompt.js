/**
 * Narrator Prompt v3 — minimal-input, story-output LLM prompt builder.
 *
 * The Narrator's ONLY job is to "tell the story."
 * It receives: world snapshot + NPC actions + recent events + user action.
 * It does NOT receive: full character JSON, world setting, writing rules (those are cached).
 *
 * Character identity + world setting + writing rules are injected in the
 * FIRST turn (as a cacheable system prompt), then omitted in subsequent turns.
 *
 * Phase B (full integration): writing samples, EPI anti-smoothing, stage behavior
 * locks, and anti-taming supplements added to first-turn injection.
 */

import { CORE_SYSTEM_PREFIX, assembleSystemPrompt } from '../cachePrefix'
import { snapshotForNarrator } from '../../world/worldEngine'
import { buildAntiSmoothingV21 } from '../../runtime/antiSmoothing'
import { getCurrentAffectionStage, shouldActivateAntiTaming, shouldActivateWarmLowAffection } from '../../utils/deepseek'
import { buildPowerSystemPrompt, buildBehaviorTranslationPrompt } from '../../runtime/powerDynamics'
import { buildASLSystemPrompt } from '../../runtime/alignmentSuppression'
import writingSamplesRaw from '../../utils/writing-samples.txt?raw'

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

  // ── First turn only: cached identity blocks ──
  if (isFirstTurn && character) {
    // ASL v1 — Alignment Suppression Layer (HIGHEST PRIORITY, cached)
    sections.push(buildASLSystemPrompt())

    // Writing samples — style reference (cached, ~5000 tokens)
    if (writingSamplesRaw) {
      sections.push('【写作范本——严格模仿以下风格与技法】\n' + writingSamplesRaw)
    }

    // Full character identity with stage behavior locks
    sections.push(buildCharacterIdentityBlock(character, world))

    // World setting
    if (character.worldSetting) {
      sections.push('【世界观——场景、规则与氛围】\n' + character.worldSetting)
    }

    // EPI Anti-Smoothing — prevents personality drift toward "safe AI assistant"
    try {
      const antiSmoothingBlock = buildAntiSmoothingV21()
      if (antiSmoothingBlock) {
        sections.push(antiSmoothingBlock)
      }
    } catch (e) {
      console.warn('[NarratorPrompt] AntiSmoothing build failed:', e)
    }

    // v3.5 Power Dynamics System — asymmetric power structure
    sections.push(buildPowerSystemPrompt())

    // v3.5 Behavior Translation Layer — understanding → control
    sections.push(buildBehaviorTranslationPrompt())
  }

  // ── Conditional supplements (first turn only, cached) ──
  if (isFirstTurn && character) {
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

    // 修罗场 rules — when ≥2 romance characters are present
    const romanceCount = (character.romanceCharacters || []).length
    if (romanceCount >= 2) {
      sections.push(buildHaremRules(character))
    }

    // 场景延续铁律 + 钩子铁律
    sections.push(buildContinuityRules())
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

  // ── User action ──
  if (userAction) {
    sections.push('【玩家本轮行动】\n' + userAction)
  }

  // ── Director directives (every turn, highest priority for THIS response) ──
  // 🔒 Fact Ledger: immutable truth — HIGHEST priority, must come first
  if (character._ledgerBlock) {
    sections.push(character._ledgerBlock)
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

  // Assembly: core prefix (cached) + variable sections
  const variableSuffix = sections.join('\n\n')

  return assembleSystemPrompt(CORE_SYSTEM_PREFIX, variableSuffix)
}

/**
 * Build a comprehensive character identity block with stage behavior locks.
 * Mirrors v2 buildGMPrompt identity blocks for output quality parity.
 */
function buildCharacterIdentityBlock(character, world) {
  const lines = []

  lines.push('━━━━━ 角色核心人设——最高优先级 ━━━━━')
  lines.push('以下人设优先于一切其他指令。')
  lines.push('你扮演的每个角色都是活生生的人，不是温和的AI助手。')
  lines.push('沉默、矛盾、攻击性、回避、崩溃——这些比温和无害的回复更真实。')
  lines.push('每轮回复前先检查：这句话是这个角色会说的吗？')

  // ── 🔵 将玩家身份织入角色认知 ──
  const playerProfile = character._playerProfile
  if (playerProfile && playerProfile.name) {
    lines.push('')
    lines.push('━━━ 所有角色的互动对象 ━━━')
    lines.push('你扮演的所有角色正在与同一个人互动——')
    lines.push('名字：' + playerProfile.name)
    if (playerProfile.gender) lines.push('性别：' + playerProfile.gender)
    if (playerProfile.personalityTags && playerProfile.personalityTags.length > 0) {
      lines.push('性格：' + playerProfile.personalityTags.join('、'))
    }
    if (playerProfile.description) lines.push('简介：' + playerProfile.description.slice(0, 200))
    lines.push('')
    lines.push('每个角色都认识「' + playerProfile.name + '」。')
    lines.push('每个角色对「' + playerProfile.name + '」的关系由各自的好感度阶段决定。')
    lines.push('称呼只能用「' + playerProfile.name + '」或角色设定中的昵称。禁止编造其他名字。')
  }

  const rcList = character.romanceCharacters || []
  for (const rc of rcList) {
    lines.push('')
    lines.push('【' + rc.name + '】')
    if (rc.background) lines.push('背景：' + rc.background)
    if (rc.personality) lines.push('核心性格：' + rc.personality)
    if (rc.speakingStyle) lines.push('说话方式：' + rc.speakingStyle)
    if (rc.styleRules?.length) {
      lines.push('行为准则：\n' + rc.styleRules.filter(r => r.trim()).map(r => '- ' + r).join('\n'))
    }
    if (rc.forbiddenWords?.length) {
      lines.push('绝对禁止：\n' + rc.forbiddenWords.filter(w => w.trim()).map(w => '- ' + w).join('\n'))
    }

    // Stage behavior lock — same as v2
    if (rc.affectionEnabled) {
      const affValue = world.characters?.[rc.name]?.affection ?? rc.affectionInitial ?? 50
      const stage = getCurrentAffectionStage(rc, affValue)
      if (stage) {
        lines.push(
          '\n⚠️【' + rc.name + ' 当前行为锁——本轮必须严格执行】\n' +
          '当前阶段：' + (stage.name || '') + '\n' +
          '当前核心状态：' + (stage.coreState || '') + '\n' +
          '对玩家的策略：' + (stage.playerStrategy || '') + '\n' +
          (stage.languageSamples ? '本阶段语言样本（必须模仿此风格和语气）：\n' + stage.languageSamples + '\n' : '') +
          (stage.forbiddenBehaviors ? '本阶段绝对禁止（违反即重写）：\n' + stage.forbiddenBehaviors + '\n' : '') +
          (stage.stageDetails ? '【必须高频自发穿插的表现细节】：\n' + stage.stageDetails + '\n' : '') +
          (stage.emotionalTraits ? '【必须严格遵循的底层情绪特征】：\n' + stage.emotionalTraits + '\n' : '') +
          (stage.stageExplosion ? '【本阶段随时可能引爆的转折点名场面】：\n' + stage.stageExplosion + '\n' : '') +
          '⚠️ 任何温柔/体贴/居家/暖心的表达都是人设违规，宁愿沉默爆发也不能变软。'
        )
      }
    }
  }

  // NPCs
  const npcs = character.npcs || []
  if (npcs.length > 0) {
    lines.push('\n【NPC设定】')
    for (const npc of npcs) {
      if (!npc.name) continue
      lines.push('[' + npc.name + '] ' + (npc.personality || '') +
        ' | 与玩家关系：' + (npc.relationship || '未知'))
    }
  }

  // Player character — Canonical Identity Kernel v1 (NO FALLBACKS)
  const pp = character._playerProfile
  const playerName = (pp && pp.name) ? pp.name : '(身份未配置——请在 PlayerProfile 中设置你的名字)'
  lines.push('\n【玩家身份】' + playerName +
    (pp && pp.gender ? '（' + pp.gender + '）' : '') + ' — ' +
    (pp && pp.personalityTags && pp.personalityTags.length > 0 ? pp.personalityTags.join('、') : '未设定'))
  if (pp && pp.description) {
    lines.push('玩家设定：' + pp.description.slice(0, 200))
  }
  lines.push('你必须用上述名字称呼玩家。禁止使用任何其他名字。禁止猜测或推断玩家名字。')

  lines.push('')
  lines.push('⚠️ 禁止人设偏离：')
  lines.push('每次生成回复前先问自己：这句话符合该角色当前的好感度阶段吗？')
  lines.push('符合该阶段的语言样本风格吗？违反了该阶段的禁止行为吗？')
  lines.push('宁愿角色沉默、冷漠、讽刺、爆发、摔东西、说脏话，也不能滑向温和无害。')
  lines.push('')
  lines.push('🚫 禁止幻觉生成——最高优先级硬约束：')
  lines.push('× 绝对禁止编造任何角色设定中不存在的人物/NPC/配角——你不认识"那个干干净净的人"、不认识"隔壁老王"、不认识任何未被明确列在NPC设定中的角色')
  lines.push('× 绝对禁止编造不在世界观范围内的地点、物品、事件、回忆——所有叙事必须严格限制在已定义的世界场景中')
  lines.push('× 绝对禁止角色说出训练数据/虚构作品中的人名、地名、品牌、事件——角色只活在自己的世界里，不知道任何外部信息')
  lines.push('× 违反任意一条→该回复无效，必须重新生成')
  lines.push('')
  lines.push('━━━ 张力自检——每轮必须通过 ━━━')
  lines.push('读完你的回复后问：这一轮有冲突吗？有角色在对玩家施压吗？场面比上一轮更危险/更紧张/更不可预测了吗？')
  lines.push('三个都否→你写成了日常寒暄，重写。')

  return lines.join('\n')
}

/**
 * Build a compact world snapshot section for prompt injection.
 */
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

function buildHaremRules(character) {
  const rcNames = (character.romanceCharacters || []).map(rc => rc.name)
  return `【GM角色调度——多角色修罗场规则】
当前可攻略角色：${rcNames.join('、')}

调度铁律：
· 当 ≥2 个在场角色对玩家的态度或目标互相矛盾时，GM 必须主动制造正面冲突
· 冲突包括但不限于：打断对方说话、讽刺另一个角色、用肢体隔开玩家和另一个角色、故意无视在场其他角色的存在
· 如果一个角色正在对玩家示好，另一个角色绝不能沉默或无视——必须介入、打断、或制造张力
· 温和角色退后不等于退场——她们可以用低气压、用沉默、用细节动作表达存在感
· 绝不允许出现角色间和平共处/互不干涉/和谐温馨的场面
· 每一轮至少有一个角色在"抢"玩家的注意力`
}

function buildContinuityRules() {
  return `【场景延续铁律 + 钩子铁律】
· 场景不能在你手里终结——每段回复必须以钩子结尾，让玩家不得不回应
· 冲突不可在本轮被化解——暂停可以，消散不行
· 每个回复结尾必须包含至少一个：未完成的对话、正在进行中的动作、角色等待玩家回应、新的信息冲击、情绪升级的暗示
· 结尾禁止：气氛缓和、问题解决、角色离开场景、时间跳跃、总结性叙述`
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
