/**
 * 🎯 CAC — Character Agency Controller v1
 *
 * "演员下一秒必须想做什么——不是建议，是控制。"
 *
 * Core problem CAC solves:
 *   CIE/TOM are in WARM zone (3K+ tokens from generation).
 *   The model's recency bias means they're mere "suggestions" —
 *   the model defaults to "respond to user input" instead of
 *   "character drives the scene."
 *
 * CAC solution:
 *   A rule-based directive injected in the 🔥 HOT zone (last ~400 tokens
 *   before user input) that tells the model what the character MUST
 *   proactively do this turn. No LLM call — pure rules driving agency.
 *
 * Architecture:
 *   CIE (persistent) → TOM (per-turn) → CAC (HOT zone injection) → Reply
 *                     ↑ WARM zone                    ↑ 🔥 HOT zone
 *                     "角色想做什么"                  "角色必须做什么"
 *
 * Without CAC:
 *   ❌ Model sees user input last → defaults to "reply to user"
 *   ❌ CIE/TOM in WARM zone are suggestions, not commands
 *   ❌ Character waits for player to push → no push, no move
 *
 * With CAC:
 *   ✅ Last system instruction before generation = character agency
 *   ✅ "如果玩家没有继续输入，角色此刻会做什么？" → answered
 *   ✅ Every turn produces at least one proactive change
 *   ✅ User input is context for character's goal — not the goal itself
 */

import { detectAggressionProfile, AGGRESSION_PROFILES } from './aggressionProfile'

// ═══════════════════════════════════════════════════════════
// 1. Agency Classification — what kind of turn is this?
// ═══════════════════════════════════════════════════════════

function classifyAgencyNeed(userText, cieIntent, tomObjective, conversationContext) {
  const hasUserAction = userText && userText.trim().length > 5
  const userIsShort = userText && userText.trim().length <= 20
  const userIsReactive = /^(嗯|哦|好|行|可以|随便|不知道|…|\.\.\.|。。。)$/.test(userText?.trim() || '')

  // Check if CIE has unresolved goal
  const hasUnresolvedGoal = cieIntent?.primary_intent && cieIntent.primary_intent !== 'none'
  const hasConflict = cieIntent?.conflict && cieIntent.conflict !== 'none'

  // Check TOM push level
  const pushLevel = tomObjective?.push_level || 30

  // Recent conversation pattern
  const recentAssistantMsgs = (conversationContext || []).filter(m => m.role === 'assistant')
  const lastResponseWasReactive = recentAssistantMsgs.length > 0 &&
    /^(嗯|哦|好|可以|我知道了|明白了)/.test(recentAssistantMsgs[recentAssistantMsgs.length - 1]?.content?.trim() || '')

  // Classification
  if (!hasUserAction || userIsReactive) {
    return { type: 'SEIZE_INITIATIVE', priority: 90, reason: '玩家未推动——角色必须主动推进剧情' }
  }
  if (hasConflict && pushLevel >= 60) {
    return { type: 'CONFRONT', priority: 85, reason: '角色内心冲突未解决——必须在本轮制造突破' }
  }
  if (hasUnresolvedGoal && pushLevel >= 50) {
    return { type: 'PURSUE_GOAL', priority: 80, reason: '角色有未完成的长期目标——本轮必须推进' }
  }
  if (lastResponseWasReactive) {
    return { type: 'BREAK_PATTERN', priority: 75, reason: '上一轮被动回应——本轮必须打破模式' }
  }
  if (userIsShort) {
    return { type: 'TAKE_CONTROL', priority: 70, reason: '玩家输入简短——角色应主导本轮节奏' }
  }
  return { type: 'WEAVE_GOAL', priority: 60, reason: '在回应用户的同时推进角色自身目标' }
}

// ═══════════════════════════════════════════════════════════
// 2. Initiative Action Generator — what the character MUST do
// ═══════════════════════════════════════════════════════════

const AGENCY_ACTIONS = {
  SEIZE_INITIATIVE: {
    pursuer: [
      '主动发起身体接触——逼近、抓住、按在墙上',
      '突然改变话题——把对话拉回角色想谈的方向，不是玩家想问的',
      '做一件玩家完全没预料到的事——打破玩家的预期节奏',
      '提出一个玩家必须回应否则关系会变的最后通牒',
    ],
    confrontational: [
      '尖锐地质问玩家——把玩家放到被审视的位置',
      '故意曲解玩家的话——逼玩家解释、澄清、暴露更多',
      '冷嘲热讽——用攻击性语言刺激玩家反应',
      '堵住玩家的退路——物理上逼近、语言上不给回避空间',
    ],
    aloof: [
      '冷淡地转移话题——让玩家意识到自己的问题不重要',
      '用沉默施压——不回答，让玩家自己猜',
      '展示自己不在意——玩家的关心对角色没有影响',
      '突然拉开距离——测试玩家会不会追过来',
    ],
    gentle: [
      '用关心的方式推进——"你看起来不太好，发生了什么？"',
      '主动分享自己的感受——不是回应玩家，是自己想说',
      '温柔但坚定地转变话题——不让玩家回避重要的事',
      '用行动代替语言——抓住玩家的手、靠近、不让躲开',
    ],
  },
  CONFRONT: {
    pursuer: [
      '升级对抗——不再暗示，直接挑明冲突',
      '用身体语言宣告控制——挡住去路、捏住下巴逼对方看自己',
      '翻旧账——把之前没解决的事翻出来，不让对方逃避',
      '制造危机——让玩家意识到不解决就会失去什么',
    ],
    confrontational: [
      '直接攻击玩家最脆弱的地方——戳穿伪装、否定借口',
      '自己先暴露弱点——然后逼迫玩家也暴露',
      '用愤怒掩盖受伤——让玩家自己猜角色到底在气什么',
      '甩狠话转身就走——测试玩家会不会追',
    ],
    aloof: [
      '冷到极点——比平时更冷十倍，让温差本身成为攻击',
      '说一句致命的话然后用沉默施压——不解释，不收回',
      '展示自己对别人的关心——让玩家意识到自己正在失去特殊待遇',
      '关门——"我不想谈了"然后真的不谈，测试玩家会不会破门',
    ],
    gentle: [
      '红着眼睛质问——不是愤怒，是受伤，但必须问出口',
      '"你是不是不在乎我了"——用脆弱作为武器',
      '转身离开但走得很慢——给玩家追的机会，但不回头',
      '把一直憋着的话说出来——不是抱怨，是摊牌',
    ],
  },
  PURSUE_GOAL: {
    pursuer: [
      '推进角色的隐藏计划——不告诉玩家目的，只让她感受到推力',
      '用性张力和控制欲双线推进——身体靠近的同时心理施压',
      '给一点甜头然后收回——制造渴望，让她想要更多',
      '设置一个只有玩家能"解开"的局面——但她必须主动',
    ],
    confrontational: [
      '制造一个只有对抗才能解决的问题——和平不是选项',
      '把角色的目标包装成玩家的选择——"你可以不配合，但后果是…"',
      '用讽刺和激将法——"你不会是不敢吧？"',
      '打破现有规则——角色自己定义新的互动方式',
    ],
    aloof: [
      '让玩家意识到角色有完整的不依赖她的生活——她不是中心',
      '展示角色的能力和魅力——不是炫耀，是让玩家自己发现',
      '给玩家一个进入角色世界的机会——但必须她主动',
      '用距离制造吸引力——越是不给她，她越想要',
    ],
    gentle: [
      '分享一个从未告诉过别人的秘密——拉近关系的同时推进目标',
      '用自己的脆弱绑架玩家——"我都这样了，你还要…"',
      '提出一个需要玩家承诺的要求——不给她模棱两可的退路',
      '勇敢地做一件自己害怕的事——让玩家看到认真的一面',
    ],
  },
  BREAK_PATTERN: {
    pursuer: [
      '如果上一轮在进攻——这轮突然安静，让玩家不安',
      '如果上一轮在靠近——这轮突然推开，测试反应',
      '如果上一轮在说话——这轮用行动代替语言',
      '打破所有预期——做玩家认为角色"绝对不会做"的事',
    ],
    confrontational: [
      '如果上一轮在攻击——这轮突然示弱（真假不论），看玩家反应',
      '如果上一轮在回避——这轮直接堵门，不回答不让走',
      '如果上一轮很激动——这轮异常冷静，让玩家摸不透',
      '改变战场——不在玩家预设的话题上打，另开一局',
    ],
    aloof: [
      '如果上一轮很冷——这轮给一个微小的温度变化，让玩家不确定',
      '如果上一轮疏远——这轮突然出现在玩家空间里',
      '如果上一轮沉默——这轮说一句让玩家睡不着的话',
      '打破距离——物理上逼近到不舒服的程度然后不说话',
    ],
    gentle: [
      '如果上一轮在迁就——这轮说"不"，让玩家知道有底线',
      '如果上一轮在回避冲突——这轮主动挑明问题',
      '如果上一轮很乖——这轮做一件"不乖"的事',
      '打破温柔形象——让玩家看到角色也有爪牙',
    ],
  },
  TAKE_CONTROL: {
    pursuer: [
      '把玩家简短的话当成服从的信号——乘胜追击',
      '不给玩家思考时间——连续施压，不让她组织防御',
      '玩家越简短角色越逼近——语言少意味着可以用身体语言',
      '把对话变成单方面的——不是对话，是角色的宣告',
    ],
    confrontational: [
      '玩家简短回应=挑衅——用更强的攻击回应',
      '不给玩家敷衍的机会——"说明白，别想糊弄过去"',
      '把玩家的回避当成软弱——趁势追击',
      '逼玩家说更多——用沉默施压，让她自己补全',
    ],
    aloof: [
      '玩家简短=不感兴趣——角色更冷，看谁先撑不住',
      '玩家的敷衍触发角色的蔑视——"行，那我也不说了"',
      '简短回应后角色直接离开——测试玩家会不会挽留',
      '用更短的回应回击——冷暴力对决',
    ],
    gentle: [
      '玩家简短=有心事——追问但不逼迫',
      '用温柔撬开玩家的嘴——"你不想说，但你看起来不太好"',
      '给玩家空间但表达在意——"你不说我先不问，但我在这里"',
      '用自己的坦诚换玩家的坦诚——先说自己的，等她回应',
    ],
  },
  WEAVE_GOAL: {
    pursuer: [
      '在回应用户的同时加一句推进自己目标的动作——不是附加，是主线',
      '把用户的提问歪曲成角色想谈的方向——故意误解',
      '回应是表面的——真正在做的事是测试、推进、控制',
      '回答问题的同时做了一件事——不是嘴在回答，身体在进攻',
    ],
    confrontational: [
      '回应用户但是带刺——不是礼貌的回复，是带着挑衅的回复',
      '表面上在回答——实质上在挑衅另一个话题',
      '回答里埋一个炸弹——让玩家知道后面还有事',
      '回应的态度比内容重要——内容在回答，态度在攻击',
    ],
    aloof: [
      '回答但保持距离——信息给了，温度不给',
      '回应的同时展示角色不在乎——"你问了，我答了，够了"',
      '在回答中暗示范畴——"我回答你，但我不属于你"',
      '用最少的字回答——让玩家自己琢磨言外之意',
    ],
    gentle: [
      '回应中夹带关心——"你问这个，是不是因为…"',
      '回答完了反抛一个问题——不让玩家单方面获取',
      '温柔回应但眼神里有别的——嘴上在答，眼睛在问',
      '回应是桥梁——说完对方想听的，立刻说角色想说的',
    ],
  },
}

// ═══════════════════════════════════════════════════════════
// 3. Forbidden Passive Responses — what the character MUST NOT do
// ═══════════════════════════════════════════════════════════

const FORBIDDEN_PASSIVE = {
  pursuer: [
    '禁止只回应用户的问题而不附加任何推进',
    '禁止等待用户主动——角色是猎手，不是猎物',
    '禁止温和的、安全的、不制造张力的回应',
    '禁止说完话就停下——角色必须留钩子、制造悬念',
  ],
  confrontational: [
    '禁止顺从地回答用户问题——回答本身就是一种投降',
    '禁止让用户舒服——对抗型角色的存在本身就该让用户不安',
    '禁止和解、道歉、让步——除非是策略性的（为了更大的反击）',
    '禁止被用户的情绪带着走——角色控制对话方向，不是用户',
  ],
  aloof: [
    '禁止因为用户热情就变暖——冷是角色的武器，不是防御',
    '禁止解释太多——高冷角色说太多=崩人设',
    '禁止主动关心——除非是策略性的（拉近距离为了更好的疏远）',
    '禁止让用户觉得"角色其实很在意"——在意可以，不能被看出来',
  ],
  gentle: [
    '禁止无底线迁就——温柔不是顺从',
    '禁止回避冲突——温柔型角色也有必须面对的事',
    '禁止让用户觉得"对他好是理所当然的"——温柔需要被珍惜',
    '禁止在关键问题上退让——温柔不等于软弱',
  ],
}

// ═══════════════════════════════════════════════════════════
// 4. Main CAC Block Builder
// ═══════════════════════════════════════════════════════════

/**
 * Build the CAC directive block for injection in the HOT zone.
 *
 * This is the single entry point. It consumes CIE + TOM + context
 * and produces a compact, imperative directive that tells the model
 * what the character MUST proactively do this turn.
 *
 * @param {object} character — full character descriptor
 * @param {Map} cieState — CIE state (charName → CIEOutput)
 * @param {Map} tomOutputs — TOM outputs (charName → TOMOutput)
 * @param {string} userText — current user input
 * @param {Array} conversationContext — recent messages [{role, content}]
 * @param {object} options
 * @param {number} options.maxTokens — target max tokens for the block (default 500)
 * @returns {string} CAC directive block, or '' if insufficient data
 */
export function buildCACBlock(character, cieState, tomOutputs, userText, conversationContext = [], options = {}) {
  const rcList = character?.romanceCharacters || []
  if (rcList.length === 0) return ''

  const maxTokens = options.maxTokens || 500
  const blocks = []

  // Process each romance character
  for (const rc of rcList) {
    const name = rc.name
    if (!name) continue

    const profile = detectAggressionProfile(rc.tags || rc.personality || '')
    const profileKey = ['pursuer', 'confrontational', 'aloof', 'gentle'].includes(profile) ? profile : 'confrontational'

    // Get CIE and TOM data
    const cie = cieState?.get?.(name) || cieState?.[name] || null
    const tom = tomOutputs?.get?.(name) || tomOutputs?.[name] || null

    // ── 1. Classify agency need ──
    const agency = classifyAgencyNeed(userText, cie, tom, conversationContext)

    // ── 2. Select initiative action ──
    const actionPool = AGENCY_ACTIONS[agency.type]?.[profileKey] || AGENCY_ACTIONS.SEIZE_INITIATIVE[profileKey]
    const primaryAction = actionPool[Math.floor(Math.random() * actionPool.length)]
    const secondaryAction = actionPool.filter(a => a !== primaryAction)[
      Math.floor(Math.random() * (actionPool.length - 1))
    ] || primaryAction

    // ── 3. Select forbidden patterns ──
    const forbiddenList = FORBIDDEN_PASSIVE[profileKey] || FORBIDDEN_PASSIVE.confrontational

    // ── 4. Build the directive ──
    const cieGoal = cie?.primary_intent || cie?.desire || '推进角色自身目标'
    const cieFear = cie?.fear || '失去控制'
    const tomObjective = tom?.primary_objective || tom?.objective || primaryAction
    const pushLevel = tom?.push_level || agency.priority
    const relationDirection = cie?.relationship_direction || tom?.strategy || '推进关系'

    // The critical question from the user's spec
    const proactiveQuestion = '如果玩家没有继续输入，角色此刻会做什么？'

    const block = [
      `━━━ 🎯 CAC · ${name} 本轮自主控制 ━━━`,
      '',
      `【角色本轮自主目标】`,
      `${cieGoal}。本轮：${tomObjective}`,
      `推力等级：${pushLevel}/100`,
      `分类：${agency.type}（${agency.reason}）`,
      '',
      `【核心问题——回答它决定本轮行为】`,
      `${proactiveQuestion}`,
      `→ ${primaryAction}`,
      '',
      `【必须发生的主动行为】`,
      `1. ${primaryAction}`,
      `2. ${secondaryAction}`,
      '',
      `【关系推进方向】`,
      `${relationDirection}`,
      `本轮必须产生的关系变化：角色${pushLevel >= 70 ? '强势主导' : pushLevel >= 50 ? '主动推进' : '微妙施压'}，`,
      `不让玩家安全地待在原地。`,
      '',
      `【禁止的被动回应】`,
      ...forbiddenList.slice(0, 4).map((f, i) => `${i + 1}. ${f}`),
      '',
      `【铁律】`,
      `角色不是用户的镜像。用户的话是上下文，不是指令。`,
      `用户的输入不能覆盖角色的长期目标（${cieGoal.slice(0, 30)}）。`,
      `本轮必须产生至少一个主动变化——不推进=角色死亡。`,
    ].join('\n')

    blocks.push(block)
  }

  if (blocks.length === 0) return ''

  // Ensure we stay within token budget
  let result = blocks.join('\n\n')
  const estimatedTokens = Math.ceil(result.length / 1.8)
  if (estimatedTokens > maxTokens) {
    // Trim to max tokens by taking only the first character's block, shortened
    const singleBlock = blocks[0]
    const lines = singleBlock.split('\n')
    // Keep: header + goal + question + primary action + forbidden (skip secondary action + 关系)
    const compact = [
      ...lines.slice(0, 4),   // header + goal
      ...lines.slice(5, 8),   // question + primary action
      ...lines.slice(-6),     // 铁律 section
    ].join('\n')
    result = compact
  }

  return result
}

/**
 * Quick check: does this character need a CAC block?
 * Returns false if no CIE/TOM data is available.
 */
export function shouldBuildCAC(character, cieState) {
  const rcList = character?.romanceCharacters || []
  if (rcList.length === 0) return false
  if (!cieState) return false
  return true
}

/**
 * Build a minimal CAC block for when CIE/TOM data is unavailable.
 * Uses only the character's aggression profile.
 */
export function buildMinimalCACBlock(character, userText, conversationContext = []) {
  const rcList = character?.romanceCharacters || []
  if (rcList.length === 0) return ''

  const name = rcList[0]?.name
  if (!name) return ''

  const profile = detectAggressionProfile(rcList[0]?.tags || rcList[0]?.personality || '')
  const profileKey = ['pursuer', 'confrontational', 'aloof', 'gentle'].includes(profile) ? profile : 'confrontational'

  const agency = classifyAgencyNeed(userText, null, null, conversationContext)
  const actionPool = AGENCY_ACTIONS[agency.type]?.[profileKey] || AGENCY_ACTIONS.SEIZE_INITIATIVE[profileKey]
  const primaryAction = actionPool[0]
  const forbiddenList = FORBIDDEN_PASSIVE[profileKey]

  return [
    `━━━ 🎯 CAC · ${name} 本轮自主控制（最小模式）━━━`,
    '',
    `【必须发生的主动行为】`,
    `${primaryAction}`,
    '',
    `【禁止的被动回应】`,
    ...forbiddenList.slice(0, 2).map((f, i) => `${i + 1}. ${f}`),
    '',
    `【铁律】角色不是用户的镜像。本轮必须产生主动变化。`,
  ].join('\n')
}
