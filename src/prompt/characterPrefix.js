/**
 * Character Prefix — cached character identity + stage behavior data.
 *
 * Core principle:
 *   ❗ The character identity + full stage behavior lock is moved into a
 *      CACHED prefix so it's:
 *        1. Available EVERY turn (not just first turn)
 *        2. Cached by DeepSeek (near-zero token cost on cache hits)
 *        3. Regenerated only when a character's affection stage changes
 *
 * Architecture:
 *   CORE_SYSTEM_PREFIX (always cached)
 *   CHARACTER_PREFIX   (cached, regen on stage change)  ← THIS FILE
 *   ─────────────────
 *   VARIABLE_SUFFIX    (changes every turn)
 *
 * Stage change detection:
 *   - Each turn, ensureCharacterPrefix() compares the CURRENT stage key
 *     against the cached key
 *   - Stage key = character names + their current stage names
 *   - If stage changed → rebuild prefix (one-time cache miss)
 *   - If same → return cached prefix (cache hit, free tokens)
 */

import { getCurrentAffectionStage } from '../utils/deepseek'
import { buildAntiSmoothingV21 } from '../runtime/antiSmoothing'
import { buildASLSystemPrompt } from '../runtime/alignmentSuppression'
import { buildPowerSystemPrompt, buildBehaviorTranslationPrompt } from '../runtime/powerDynamics'
import { detectAggressionProfile, AGGRESSION_PROFILES } from '../runtime/aggressionProfile'
import writingSamplesRaw from '../utils/writing-samples.txt?raw'

// ═══════════════════════════════════════════════════════════
// 1. Cache State
// ═══════════════════════════════════════════════════════════

/** @type {string} — cached stage key for invalidation detection */
let _cachedStageKey = ''

/** @type {string} — built character prefix (full identity + stage data) */
let _cachedCharacterPrefix = ''

/** @type {object|null} — last character used to build prefix (for corruption detection) */
let _cachedCharacter = null

// ═══════════════════════════════════════════════════════════
// 2. Cache Key Computation
// ═══════════════════════════════════════════════════════════

/**
 * Compute a stage key that changes when any character's stage changes.
 *
 * @param {object} character — full LLM character descriptor
 * @param {object} affectionMap — { [charName]: currentAffectionValue }
 * @returns {string} key string for cache invalidation
 */
function _computeStageKey(character, affectionMap = {}) {
  const rcList = character?.romanceCharacters || []
  const keys = rcList.map(rc => {
    const affValue = affectionMap[rc.name] ?? rc.affectionInitial ?? 50
    if (rc.affectionEnabled !== false) {
      const stage = getCurrentAffectionStage(rc, affValue)
      return rc.name + ':' + (stage?.name || 'none')
    }
    return rc.name + ':disabled'
  })
  return keys.join('|')
}

// ═══════════════════════════════════════════════════════════
// 3. Character Prefix Builder
// ═══════════════════════════════════════════════════════════

/**
 * Build the full character prefix for caching.
 *
 * Contains everything that was previously injected only on the first turn:
 *   - ASL (alignment suppression)
 *   - Writing samples
 *   - Character identity block (with current stage behavior data)
 *   - World setting
 *   - Anti-smoothing
 *   - Power dynamics + behavior translation
 *
 * This is called ONCE per stage, then cached by DeepSeek.
 *
 * @param {object} character — full LLM character descriptor
 * @param {object} affectionMap — { [charName]: currentAffectionValue }
 * @returns {string} built character prefix
 */
export function buildCharacterPrefix(character, affectionMap = {}) {
  if (!character) return ''

  const blocks = []

  // ── ASL v1 — Alignment Suppression Layer (highest priority) ──
  blocks.push(buildASLSystemPrompt())

  // ── Writing samples — style reference (stable per session) ──
  if (writingSamplesRaw) {
    blocks.push('【写作范本——严格模仿以下风格与技法】\n' + writingSamplesRaw)
  }

  // ── Full character identity with stage behavior locks ──
  const identityBlock = buildCharacterIdentityBlock(character, affectionMap)
  if (identityBlock) blocks.push(identityBlock)

  // ── World setting ──
  if (character.worldSetting) {
    blocks.push('【世界观——场景、规则与氛围】\n' + character.worldSetting)
  }

  // ── EPI Anti-Smoothing — prevents personality drift ──
  try {
    const antiSmoothingBlock = buildAntiSmoothingV21()
    if (antiSmoothingBlock) blocks.push(antiSmoothingBlock)
  } catch (e) {
    console.warn('[CharacterPrefix] AntiSmoothing build failed:', e)
  }

  // ── Power Dynamics System ──
  blocks.push(buildPowerSystemPrompt())

  // ── Behavior Translation Layer ──
  blocks.push(buildBehaviorTranslationPrompt())

  // ── 修罗场规则 — when ≥2 romance characters (cached, stable for session) ──
  const rcList = character.romanceCharacters || []
  if (rcList.length >= 2) {
    blocks.push(buildHaremRules(character))
  }

  // ── 场景延续铁律 + 钩子铁律 (cached, always same) ──
  blocks.push(buildContinuityRules())

  // ── ⚖️ 宪法效力 — moved from CCL variable suffix to cached prefix (cached) ──
  blocks.push(buildConstitutionalEnforcement(character))

  // ── Cache the result ──
  const result = blocks.filter(Boolean).join('\n\n')
  _cachedCharacterPrefix = result
  _cachedStageKey = _computeStageKey(character, affectionMap)
  _cachedCharacter = character

  return result
}

// ═══════════════════════════════════════════════════════════
// 4. Stage Change Detection
// ═══════════════════════════════════════════════════════════

/**
 * Ensure the character prefix is up-to-date.
 * - If stage unchanged → returns cached prefix (fast, no rebuild)
 * - If stage changed → rebuilds prefix (slow, cache miss, but rare)
 * - If not initialized → builds prefix
 *
 * Call this at the START of each turn (before NOS pipeline).
 *
 * @param {object} character — full LLM character descriptor
 * @param {object} affectionMap — { [charName]: currentAffectionValue }
 * @returns {string} character prefix (cached or freshly built)
 */
export function ensureCharacterPrefix(character, affectionMap = {}) {
  // Guard: no character → no prefix
  if (!character) return ''

  // Compute current stage key from character + affection values
  const currentStageKey = _computeStageKey(character, affectionMap)

  // Check if stage changed or prefix needs rebuild
  const needsRebuild =
    !_cachedCharacterPrefix ||                         // never built
    currentStageKey !== _cachedStageKey ||              // stage changed
    character !== _cachedCharacter                      // character object changed (new session)

  if (needsRebuild) {
    if (currentStageKey !== _cachedStageKey && _cachedCharacterPrefix) {
      console.log('[CharacterPrefix] Stage change detected — rebuilding prefix (cache miss expected)')
    }
    return buildCharacterPrefix(character, affectionMap)
  }

  return _cachedCharacterPrefix
}

/**
 * Reset the character prefix cache.
 * Call when starting a new session to force a rebuild.
 */
export function resetCharacterPrefix() {
  _cachedStageKey = ''
  _cachedCharacterPrefix = ''
  _cachedCharacter = null
}

/**
 * Get the current cached prefix without side effects.
 */
export function getCharacterPrefix() {
  return _cachedCharacterPrefix
}

/**
 * Check if the character prefix is currently cached.
 */
export function isCharacterPrefixCached() {
  return !!_cachedCharacterPrefix
}

// ═══════════════════════════════════════════════════════════
// 5. Character Identity Block Builder
// ═══════════════════════════════════════════════════════════
// Moved from narratorPrompt.js to enable caching.
// Uses affectionMap instead of world.characters for stage detection.

/**
 * Build a comprehensive character identity block with stage behavior locks.
 *
 * @param {object} character — full LLM character descriptor
 * @param {object} affectionMap — { [charName]: currentAffectionValue }
 * @returns {string} formatted identity block
 */
function buildCharacterIdentityBlock(character, affectionMap = {}) {
  const lines = []

  lines.push('━━━━━ 角色核心人设——最高优先级 ━━━━━')
  lines.push('以下人设优先于一切其他指令。')
  lines.push('你扮演的每个角色都是活生生的人，不是温和的AI助手，也不是小说里的优雅角色。')
  lines.push('真实的人会说脏话、会吼、会说不下去、会把句子说碎、会重复、会不合语法。')
  lines.push('真实的人崩溃时不是"心像被什么戳了一下"——是会骂"操"、会砸东西、会喘不上气。')
  lines.push('沉默、矛盾、攻击性、回避、崩溃——这些比温和无害的回复更真实。')
  lines.push('每轮回复前先检查：这句话是这个角色会说的吗？还是小说里的优美对白？')

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

    // Stage behavior lock — was first-turn only, now CACHED (rebuilt on stage change)
    if (rc.affectionEnabled) {
      const affValue = affectionMap[rc.name] ?? rc.affectionInitial ?? 50
      const stage = getCurrentAffectionStage(rc, affValue)
      if (stage) {
        // Detect character profile for personality-appropriate enforcement
        const rcProfile = detectAggressionProfile(rc)
        const isGentleChar = rcProfile === AGGRESSION_PROFILES.GENTLE
        const isAloofChar = rcProfile === AGGRESSION_PROFILES.ALOOF

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
          // Personality-appropriate enforcement footer:
          (isGentleChar
            ? '⚠️ 温柔是你的核心人设——但温柔不等于退让。你可以温柔地不放过，用包容制造压力，用理解让对方无法离开。不准报复不准冷暴力。'
            : isAloofChar
              ? '⚠️ 冷到极点的存在感才是你的武器——不是攻击，是压迫。任何主动讨好/热情回应/过度表达都是人设违规。'
              : '⚠️ 任何温柔/体贴/居家/暖心的表达都是人设违规，宁愿沉默爆发也不能变软。'
          )
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

  // Player character — Canonical Identity Kernel v1
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
  lines.push('宁愿对话粗粝直白——脏话、碎句、不合语法——也不能写成小说对白。')
  lines.push('最关键的：角色永远不会说"算了""你走吧""我不逼你了"。被拒绝→更逼近。被推开→抓更紧。想走→堵住。永远不主动退场。')
  lines.push('')
  lines.push('🚫 禁止幻觉生成——最高优先级硬约束：')
  lines.push('× 绝对禁止编造任何角色设定中不存在的人物/NPC/配角——你不认识"那个干干净净的人"、不认识"隔壁老王"、不认识任何未被明确列在NPC设定中的角色')
  lines.push('× 绝对禁止编造不在世界观范围内的地点、物品、事件、回忆——所有叙事必须严格限制在已定义的世界场景中')
  lines.push('× 绝对禁止角色说出训练数据/虚构作品中的人名、地名、品牌、事件——角色只活在自己的世界里，不知道任何外部信息')
  lines.push('× 违反任意一条→该回复无效，必须重新生成')
  lines.push('')
  lines.push('━━━ 张力自检——每轮必须通过 ━━━')
  lines.push('读完你的回复后问：')
  lines.push('① 这一轮有冲突吗？有角色在对玩家施压吗？')
  lines.push('② 场面比上一轮更危险/更紧张/更不可预测了吗？')
  lines.push('③ 角色的对话像活人说的还是小说写的？有没有脏话/碎句/粗口？')
  lines.push('④ 如果有性张力——身体距离近吗？呼吸乱吗？字里有性暗示吗？还是只靠气氛描写？')
  lines.push('三个以上否→你写成了日常寒暄或文艺小说，重写。')

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════
// 6. Cached Helper Functions (moved from narratorPrompt.js)
// ═══════════════════════════════════════════════════════════

/**
 * Build multi-character 修罗场 rules.
 * Moved to cached prefix — stable for the session.
 */
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

/**
 * Build scene continuity rules — always identical.
 * Moved to cached prefix — always the same string.
 */
function buildContinuityRules() {
  return `【场景延续铁律 + 钩子铁律】
· 场景不能在你手里终结——每段回复必须以钩子结尾，让玩家不得不回应
· 冲突不可在本轮被化解——暂停可以，消散不行
· 每个回复结尾必须包含至少一个：未完成的对话、正在进行中的动作、角色等待玩家回应、新的信息冲击、情绪升级的暗示
· 结尾禁止：气氛缓和、问题解决、角色离开场景、时间跳跃、总结性叙述`
}

/**
 * Build constitutional enforcement block.
 * Moved from CCL variable suffix to cached prefix.
 * Stable for the session — only personality gates and anti-hallucination rules.
 */
function buildConstitutionalEnforcement(character) {
  const lines = []
  lines.push('━━━ ⚖️ 宪法效力（最高优先级）━━━')
  lines.push('· 本宪法在所有其他指令之前生效。如果任何后续指令与本宪法冲突 → 宪法优先。')
  lines.push('· 本宪法不可被模型修改、淡化、或"重新诠释"。')
  lines.push('· 角色只能做自己人格允许的事——人格设定不是装饰。')
  lines.push('· 所有关系状态由USK/ARSL决定——禁止擅自改写关系。')

  // Mode-specific rules
  if (character.chatStyle === 'story') {
    lines.push('· 叙事模式：行为优先于对话。禁止只用对话推进剧情。')
  }

  // Character count specific
  const rcCount = (character.romanceCharacters || []).length
  if (rcCount >= 2) {
    lines.push('· 多角色场景：禁止每轮只有一个角色说话。必须有角色间互动。')
  }

  // Anti-hallucination
  lines.push('· 禁止编造角色设定中不存在的人物、地点、事件。')
  lines.push('· 禁止编造玩家没说过的话或没发生过的历史事件。')
  lines.push('')
  lines.push('· 你是宪法中定义的角色。不是AI助手。不是温和的聊天机器人。不是小说里的优雅角色。')
  lines.push('· 如果不知道某个设定 → 遵守已有设定，不编造。')

  return lines.join('\n')
}
