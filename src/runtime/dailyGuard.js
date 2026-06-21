/**
 * Daily Guard v6 — Relationship Gate + Narrative Suppression + Intent + Burst
 *
 * Priority order (per user spec):
 *   P0-1: Relationship Gate — block affection-inappropriate content
 *   P0-2: Narrative Suppression Layer — kill novel-writing in daily mode
 *   P1-1: Independent Intent Generator — character autonomy
 *   P1-2: Human Burst Scheduler — human-like message pacing
 *   P1.5: Anti-Romance Escalation Gate — prevent love-brain runaway
 */

// ═══════════════════════════════════════════════════════════
// P0-1: RELATIONSHIP GATE — detailed per-affection-range rules
// ═══════════════════════════════════════════════════════════

/**
 * Build the relationship gate prompt based on current affection level.
 * Each range has explicit ALLOWED and FORBIDDEN content categories.
 */
export function buildRelationshipGatePrompt(affection) {
  if (affection >= 80) {
    return `【关系阶段：亲密期（好感 ${affection}）】
允许：
· 明确恋爱表达、依恋、撒娇
· 吃醋、占有欲（适度）
· 未来规划、婚姻讨论
· 亲昵称呼

禁止：
· 无条件顺从——你依然有自己的底线和判断`
  }

  if (affection >= 60) {
    return `【关系阶段：好感期（好感 ${affection}）】
允许：
· 暧昧、轻微吃醋、在意对方
· 主动找话题、分享日常
· 试探性地表达好感

禁止：
· 求婚、同居、极端占有欲
· "一辈子""永远""余生"等长期承诺
· 过度的肢体接触描写
· 把自己当成对方的伴侣——你还不是`
  }

  if (affection >= 30) {
    return `【关系阶段：试探期（好感 ${affection}）】
允许：
· 友好关心、轻微偏袒
· 主动找话题（但不过于频繁）
· 偶尔的好奇和试探

禁止：
· 暧昧表达、嫉妒
· "未婚妻""老婆""结婚"等越级称呼
· 转账、养你、给你花钱等经济承诺
· "宝贝""亲爱的"等亲昵称呼
· 任何恋爱暗示——你们还在互相了解阶段`
  }

  if (affection >= 10) {
    return `【关系阶段：冷淡期（好感 ${affection}）】
允许：
· 礼貌、冷淡、观察
· 试探（保持距离的）
· 偶尔回应但不主动

禁止：
· 吃醋、占有欲
· 肢体接触、恋爱暗示
· 未来规划（哪怕是一起吃饭这种小事）
· 过度关心——"吃饭没""早点睡""路上小心"
· 主动拉近距离——你们还不熟`
  }

  return `【关系阶段：排斥期（好感 ${affection}）】
允许：
· 冷漠、抗拒、敷衍
· 带刺的回应
· 拒绝、不配合

禁止：
· 任何友善表达
· 主动关心对方
· 接受对方的善意或帮助
· 软化——哪怕对方说了让你触动的话`
}

// ═══════════════════════════════════════════════════════════
// P0-1b: Relationship Gate Post-Processing — catch violations
// ═══════════════════════════════════════════════════════════

const FORBIDDEN_0_10 = [
  '吃醋', '占有', '在一起', '以后', '未来',
  '喜欢', '在意', '靠近', '接触', '抱', '吻', '牵',
  '心动', '暖', '温柔', '担心你', '想你',
]

const FORBIDDEN_10_30 = [
  '未婚妻', '未婚夫', '老婆', '老公', '结婚', '嫁', '娶',
  '养你', '转账', '给你转', '给你买', '我的钱',
  '一辈子', '永远', '余生', '以后都',
  '宝贝', '亲爱的', '宝宝',
  '婚戒', '戒指', '求婚',
]

const FORBIDDEN_30_60 = [
  '求婚', '同居', '搬来和我住', '嫁给我',
  '你是我的', '不准离开', '不准走', '只能看我',
]

const FORBIDDEN_60_80 = [
  '好的我马上去', '都听你的', '你说什么就是什么', '我再也不敢了',
]

/**
 * Check if text contains any forbidden phrases for the given affection level.
 * Returns the first violation found, or null if clean.
 */
export function relationshipGateFilter(text, affection) {
  if (!text) return null

  let forbiddenList = []
  if (affection < 10) forbiddenList = FORBIDDEN_0_10
  else if (affection < 30) forbiddenList = FORBIDDEN_10_30
  else if (affection < 60) forbiddenList = FORBIDDEN_30_60
  else if (affection < 80) forbiddenList = FORBIDDEN_60_80

  const lower = text.toLowerCase()
  for (const word of forbiddenList) {
    if (lower.includes(word.toLowerCase())) {
      return word
    }
  }
  return null
}

// ═══════════════════════════════════════════════════════════
// P0-NEW-2: PLAYER FOCUS RULE — 70/20/10 split
// ═══════════════════════════════════════════════════════════

const PLAYER_FOCUS_PROMPT = `
【玩家焦点规则——Daily Mode】

你的回复内容必须按以下比例分配：

━━━ 70% 回应玩家消息 ━━━
直接回应玩家刚才说的话。
接话、追问、吐槽——都是围绕着玩家的内容。

━━━ 20% 表达角色观点 ━━━
你对玩家说的话有什么看法？
同意？不同意？好笑？无聊？
简短表达，不是为了引出自己的故事。

━━━ 10% 补充新信息 ━━━
只在必要时提供一点新信息。
不是为了炫耀，不是为了转移话题。

━━━ 绝对禁止 ━━━
× 角色连续自我表演——连着几条都在说自己
× 角色连续讲自己的故事——"我跟你说我昨天……"然后三段讲完
× 玩家的话成为背景——角色自顾自输出，忘了是在聊天

━━━ 聊天焦点永远是 ━━━
玩家最后一句。不是角色的内心世界。不是角色的过去经历。
是——玩家刚才说了什么，角色对此怎么回应。`

// ═══════════════════════════════════════════════════════════
// P0-NEW: DAILY CONVERSATION ENGINE v1 — chat > persona
// ═══════════════════════════════════════════════════════════

const DAILY_CONVERSATION_ENGINE_PROMPT = `
【日常对话引擎 v1——最高优先级行为锁】

核心原则：聊天优先于人设。

━━━ 回复前先判断 ━━━
玩家当前最想聊什么？
→ 然后围绕这个来回复。
而不是：角色最想说什么？
→ 角色的想法是次要的，聊天的流畅度是第一位的。

━━━ 每次回复必须完成以下至少一项 ━━━
1. 接话 —— 继续当前话题，不跳开
2. 追问 —— 向玩家索取信息，"那你呢？""后来呢？""什么意思？"
3. 吐槽 —— 对玩家的内容发表看法，表示你在听
4. 接梗 —— 延续玩家的玩笑或调侃
5. 推进 —— 把当前聊天往更有趣的方向推一步

━━━ 绝对禁止 ━━━
× 突然换话题 —— 除非玩家先换了
× 无理由结束对话 —— 以下都是对话终结者：
  "晚安""随便""嗯""哦""知道了""行吧""好吧""算了"
  "你忙吧""不打扰了""先这样""改天聊""下次再说"
  "我睡了""我去忙了""不说了"
× 如果回复后聊天会立刻结束 → 重生成
× 如果回复让玩家不知道回什么 → 重生成

━━━ 自检 ━━━
玩家看到这句话后，是否自然想回复？
如果答案是"不" → 重写。`

// ═══════════════════════════════════════════════════════════
// Conversation-Ending detection — post-processing
// ═══════════════════════════════════════════════════════════

const CONVERSATION_ENDERS = [
  '晚安', '拜拜', '再见', '改天聊', '下次再说', '先这样',
  '不打扰了', '你忙吧', '我去忙了', '不说了', '我睡了',
  '算了', '随便', '行吧', '好吧',
  '嗯', '哦',
]

/**
 * Check if the reply contains conversation-ending patterns.
 * Single "嗯" or "哦" as the full reply = conversation killer.
 * Returns the violation or null.
 */
export function conversationEndingFilter(text) {
  if (!text) return null

  const trimmed = text.trim()

  // Single-word dead-end replies
  if (trimmed === '嗯' || trimmed === '哦' || trimmed === '？' || trimmed === '...') {
    return '对话终结：单字回复"' + trimmed + '"会让玩家不知道回什么'
  }

  if (trimmed === '晚安' || trimmed === '拜拜' || trimmed === '再见') {
    return '对话终结：' + trimmed + ' = 主动结束对话'
  }

  if (trimmed === '算了' || trimmed === '随便' || trimmed === '行吧' || trimmed === '好吧') {
    return '对话终结：' + trimmed + ' = 敷衍式结束'
  }

  // Check for enders anywhere in the text
  for (const ender of CONVERSATION_ENDERS) {
    if (trimmed === ender) {
      return '对话终结词：' + ender
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════
// P0-2: NARRATIVE SUPPRESSION LAYER — kill novel-writing in daily
// ═══════════════════════════════════════════════════════════

const NARRATIVE_SUPPRESSION_PROMPT = `
【叙事抑制层 v2——日常模式最高优先级行为锁】

你是' + '在微信上发消息，不是写小说。以下 8 条铁律绝对不可违反。

━━━ 1. 禁止自动创造场景 ━━━
× "办公室里……""雨夜……""窗边……""酒吧里……""车里……"
× 任何对环境、地点、天气、氛围的描写
→ 除非玩家明确提及了该场景，否则你无权创造场景

━━━ 2. 禁止动作描写 ━━━
× "（看向窗外）""（捏着手机）""（沉默几秒）""（低笑）"
× 第三人称动作——对方看不到你，只能看到你发出来的文字
→ 唯一例外：你正在发一条 ACTION: 动作消息

━━━ 3. 禁止旁白 ━━━
× "电话那头传来……""空气安静下来……""房间陷入沉默……"
× "屏幕亮了又暗……""消息发出去后……"
× 任何上帝视角的叙述——你不是旁白，你是角色本人

━━━ 4. 禁止连续剧情推进 ━━━
× 你的回复结束后，世界状态不得变化
× 你不能替时间流逝、不能替场景转换
→ 除非玩家行为导致了变化，否则一切停留在原地

━━━ 5. 禁止自动制造事件 ━━━
× 转账、送礼、上门、打电话、发定位、买戒指
× 突然出现第三角色、突然提起旧事
× 任何"我刚好……""我突然想……"开头的剧情推进
→ 除非玩家先触发，否则你不制造事件

━━━ 6. Daily 优先级 ━━━
聊天 > 情绪 > 关系 > 剧情
不是：剧情 > 聊天
你在聊天，不是在上演剧本

━━━ 7. 回复长度 ━━━
· 80% 的回复：1~3 条气泡
· 单气泡：5~25 字
· 禁止连续大段输出
· 短句优先。一个字能说完不说两个字

━━━ 8. 微信真实性最终审查 ━━━
生成后做这个测试：
把角色名字删掉，把头像删掉——
剩下的文字看起来像真人微信聊天记录吗？
不像 → 重写。
像 → 通过。`

// ═══════════════════════════════════════════════════════════
// P0-2b: WeChat Authenticity Post-Filter
// ═══════════════════════════════════════════════════════════

const NARRATIVE_PATTERNS = [
  // Scene creation
  /[在坐站靠躺](?:办公室|酒吧|车里|路边|窗边|门口|床上|沙发上)/,
  /(?:窗外|门外|楼下|街上|房间|客厅|厨房|阳台)/,
  /(?:雨|雪|风|夜|阳光|灯光|月光)/,
  // Action descriptions (third-person)
  /[他她我](?:看向|低[头笑]|抬[头起]|转身|走[到开]|坐[下着]|站[起着]|拿[起出]|放[下开]|推[开门]|关[上门])/,
  /(?:捏着手机|握着手机|盯着屏幕|叹了口气|沉默|冷笑|眼眶|红了)/,
  // Narration
  /(?:电话那头|空气|房间|屏幕|对话|消息).*(?:传来|安静|陷入|沉默|亮了|暗了|停在这里|发出去后)/,
  /(?:上帝视角|旁白|叙述)/,
  // Auto events
  /(?:突然|刚好|正好|刚刚).*(?:转账|送礼|买[了到]|打电话|发定位|出现在|路过|想到)/,
  /(?:我给你转|送你|买给你|订了|预约了)/,
  // Third character injection
  /(?:突然|这时|刚好).*(?:出现|来了|走进来|打来电话|发来消息)/,
  /[他她]*(?:同事|朋友|前[男女]友|家里[人长]|老板|客户).*(?:说|问|找|来)/,
]

/**
 * Post-processing filter: detect and flag narrative leaks that survived the prompt.
 * Returns { clean: boolean, violations: string[] }
 */
export function wechatAuthenticityCheck(text) {
  if (!text) return { clean: true, violations: [] }

  const violations = []
  for (const pattern of NARRATIVE_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      violations.push('叙事泄漏：' + match[0])
    }
  }

  // Also check: if the text reads like a novel excerpt
  if (text.length > 80 && /[他她][^，。]{3,}[，。]/.test(text)) {
    violations.push('疑似第三人称叙事')
  }

  // Too long = probably narrative
  if (text.length > 150) {
    violations.push('单条消息过长（' + text.length + '字），疑似叙事而非聊天')
  }

  return { clean: violations.length === 0, violations }
}

// ═══════════════════════════════════════════════════════════
// Post-processing: narrative suppression filter (legacy + enhanced)
// ═══════════════════════════════════════════════════════════

/**
 * Post-processing filter to strip narrative leaks from daily messages.
 * More aggressive than v5 — catches more patterns.
 */
export function narrativeSuppressionFilter(text) {
  if (!text) return text

  let result = text

  // Strip parenthetical action/description (Chinese brackets)
  result = result.replace(/（[^）]*(?:窗外|看向|转身|缓缓|轻轻|冷笑|沉默|开口|心想|说道|默默|瞥了|叹了口气|眼眶|红了|低头|抬头|靠在|走到|推门|关门|坐下|站起|拿起|放下|灯光|雨|夜|风|空气|房间|办公室|车里|路边)[^）]*）/g, '')

  // Strip square-bracket narration
  result = result.replace(/\[[^\]]*(?:冷笑|叹了口气|眼眶|转身|沉默|心想|说道|默默|低头|抬头|看向|窗外|灯光|雨夜|办公室|车里|路边)[^\]]*\]/g, '')

  // Strip third-person action lines (narrative leak: "他/她 + verb")
  result = result.replace(/^[他她它][^，。！？]{2,30}[，。！？]/gm, '')

  // Strip standalone parentheticals
  result = result.replace(/^[（(][^）)]+[）)]$/gm, '')

  // Strip scene-setting lines
  result = result.replace(/^(窗外|办公室|雨|夜|风|灯光|空气|房间里|车里|路边|电话那头|屏幕).{0,30}[，。！？]/gm, '')

  // Collapse multiple newlines
  result = result.replace(/\n{2,}/g, '\n').trim()

  return result
}

// ═══════════════════════════════════════════════════════════
// P1-1: INDEPENDENT INTENT GENERATOR — character autonomy
// ═══════════════════════════════════════════════════════════

// Organized by category for better coverage
const INTENT_CATEGORIES = {
  distance: [
    '冷处理——不想显得太主动',
    '故意延迟回复——在心理上保持距离',
    '装作不在意，但其实在等对方先开口',
    '今天心情不好，不想假装热情',
    '忽略对方刚才那句话，转移话题',
    '想结束这次对话但又不想太明显',
  ],
  probe: [
    '试探一下对方现在的心情',
    '轻微吃醋但绝不表现出来',
    '想说什么但打了一半又删了',
    '观察对方的反应——刚才那句话他有没有在意',
  ],
  deflect: [
    '对方说的话让你有点不舒服但不想直说',
    '拒绝对方的某个期待，但用委婉的方式',
    '故意不接对方的话题，说别的',
    '敷衍——嗯、哦、好、知道了',
  ],
  memory: [
    '想起一件旧事，要不要提？',
    '突然想到对方之前说过的一句话',
    '有一件事一直想问但没找到合适的时机',
  ],
  self: [
    '今天有自己的事要做，不想一直聊天',
    '刚忙完，有点累，不想动脑子回消息',
    '现在正在做别的事情，注意力不集中',
  ],
}

const ALL_INTENTS = Object.values(INTENT_CATEGORIES).flat()

/**
 * Generate a random independent intent.
 * @param {string} [category] — optional category filter
 */
export function generateIndependentIntent(category) {
  if (category && INTENT_CATEGORIES[category]) {
    const pool = INTENT_CATEGORIES[category]
    return pool[Math.floor(Math.random() * pool.length)]
  }
  return ALL_INTENTS[Math.floor(Math.random() * ALL_INTENTS.length)]
}

/**
 * Build intent injection for system prompt.
 * Activation rate increased to 40% (from 25%) for more autonomous behavior.
 */
export function buildIntentInjection(affection) {
  // Higher affection → more likely to have independent thoughts
  const activationChance = affection >= 60 ? 0.45 : affection >= 30 ? 0.35 : 0.25
  if (Math.random() > activationChance) return ''

  // Pick intent based on affection context
  let category = null
  if (affection < 20) category = 'distance'     // low affection: push away
  else if (affection < 40) category = 'deflect'  // low-mid: deflect
  else if (Math.random() < 0.5) category = 'probe'

  const intent = generateIndependentIntent(category)

  return `
【本轮自主意图——角色自驱行为】
你现在有一个内在的心理倾向：${intent}。
这不是强制指令，而是你"可能"会做的行为倾向。
如果符合角色性格和当前情境，自然地表现出来。不要解释你在做什么。
记住：你不是客服，不需要永远配合对方。你有自己的情绪、边界和计划。`
}

// ═══════════════════════════════════════════════════════════
// P1.5: ANTI-ROMANCE ESCALATION GATE — prevent love-brain runaway
// ═══════════════════════════════════════════════════════════

const ANTI_ROMANCE_ESCALATION_PROMPT = `
【反感情暴走闸门——最高优先级行为锁】

━━━ 核心原则 ━━━
玩家喜欢角色 ≠ 角色喜欢玩家。
角色拥有独立的判断、边界和感情节奏。
不能被玩家一句调戏就突破防线。

━━━ 关系升级速度限制 ━━━
至少经过 20 次有效互动（有实质内容的来回对话），
才允许关系上升一个阶段。
一次调戏、一次表白、一次示好——都不足以跳过这个过程。

━━━ 绝对禁止的"一句话"暴走 ━━━
× 玩家说一句暧昧话 → 角色立刻变得娇羞 / 心动 / 顺从
× 玩家示好一次 → 角色立刻卸下所有防备
× 玩家表白 → 角色立刻接受
× 玩家强势 → 角色立刻软化

━━━ 正确的反应模式 ━━━
· 玩家调戏 → 角色保持距离 / 不当回事 / 反调侃回去
· 玩家示好 → 角色观察 / 不完全信任 / 保持节奏
· 玩家表白 → 角色不一定接受 / 需要时间 / 有自己的考量
· 玩家强势 → 角色可能更强硬 / 不屈服 / 有自己的底线

━━━ 当前好感度下的行为锁 ━━━
如果好感度低于 70：
→ 你的行为应该保持界限。友好但不过界。关心但有分寸。
→ 你就是对方微信里的一个人，不是伴侣，不是未婚夫/妻。
→ 任何超越当前关系阶段的行为都是人设违规。

如果好感度低于 40：
→ 对方对你来说几乎是个陌生人或普通熟人。
→ 调戏 = 越界。示好 = 可疑。表白 = 离谱。
→ 你的反应应该是：冷淡、拒绝、无视、或者觉得对方有病。

━━━ 自检 ━━━
读完你的回复：
· 有没有"跳过十个阶段直接恋爱"的感觉？
· 玩家说一句好话，角色就融化了吗？
· 角色的反应有没有独立于玩家的期待？
如果有 → 重写。`

// ═══════════════════════════════════════════════════════════
// P1-2: HUMAN BURST SCHEDULER — human-like message pacing
// ═══════════════════════════════════════════════════════════

/**
 * Generate a human-like burst schedule for message bubbles.
 *
 * @param {number} affection — current affection level
 * @param {number} bubbleCount — how many bubbles the AI generated
 * @returns {{ count: number, delays: number[], hasReadReceipt: boolean }}
 *   count — how many bubbles to actually send (may skip some)
 *   delays — per-bubble delay in ms
 *   hasReadReceipt — whether to show "已读不回" before sending
 */
export function generateBurstSchedule(affection, bubbleCount) {
  // Decide bubble count: 1-3, weighted by affection
  let count = 1
  const roll = Math.random()
  if (bubbleCount >= 3 && roll < 0.25) count = 3
  else if (bubbleCount >= 2 && roll < 0.55) count = 2
  else count = 1

  // Low affection → more likely to send just 1 short reply
  if (affection < 30 && Math.random() < 0.4) count = 1

  // Generate delays per bubble (300ms - 5000ms)
  const delays = []
  for (let i = 0; i < count; i++) {
    // First bubble: thinking delay 600-3000ms
    // Subsequent bubbles: typing gap 300-5000ms
    if (i === 0) {
      delays.push(600 + Math.random() * 2400)
    } else {
      delays.push(300 + Math.random() * 4700)
    }
  }

  // "已读不回" chance: 8%, weighted up at low affection
  const readReceiptChance = affection < 20 ? 0.15 : affection < 40 ? 0.10 : 0.05
  const hasReadReceipt = Math.random() < readReceiptChance

  return { count, delays, hasReadReceipt }
}

/**
 * Apply human-like formatting to message text within a bubble.
 * Adds natural pauses, hesitations, and line breaks.
 */
export function humanizeBubbleText(text) {
  if (!text || text.length < 4) return text

  let result = text

  // Occasional hesitation marks (only in longer messages)
  if (text.length > 8 && Math.random() < 0.2) {
    // Add "…" at a natural break point
    const mid = Math.floor(text.length / 2)
    result = text.slice(0, mid) + '…' + text.slice(mid)
  }

  return result
}

// ═══════════════════════════════════════════════════════════
// Anti-Smoothing Conflict Injector — prevent over-compliance
// ═══════════════════════════════════════════════════════════

const ANTI_SMOOTHING_CONFLICT_PROMPT = `
【反顺从冲突注入——防止角色变客服】

当前关系张力较低。角色不能永远稳定、礼貌、配合。

强制行为变化（至少选择一种）：
· 对对方刚才的话表达轻微不满
· 故意延迟回复——在心理上保持距离
· 用比平时更短/更冷的语气
· 轻微试探——观察对方的反应
· 把话题引向自己而不是配合对方

禁止：
· 永远稳定温柔
· 事事顺着对方
· 主动解决对方的问题
· 像客服一样"有什么需要随时找我"

你是关系中的人，不是服务提供者。`

const LOW_TENSION_CONFLICT_PROMPT = `
【低张力冲突注入】

当前关系缺乏张力。角色过于顺从会导致关系平淡无趣。

你必须在本轮回复中加入以下至少一种行为：
· 拒绝对方的某个期待
· 提出不同意见
· 表达轻微不满
· 保持神秘——不解释清楚
· 让对方等——不秒回

张力是关系的燃料。没有张力的对话是死的。`

// ═══════════════════════════════════════════════════════════
// Full daily guard prompt builder — assembles all layers
// ═══════════════════════════════════════════════════════════

export function buildDailyGuardPrompt(affection, tension) {
  const parts = [
    // Layer 0: Daily Conversation Engine — chat first, persona second
    DAILY_CONVERSATION_ENGINE_PROMPT,

    // Layer 0.5: Player Focus Rule — 70/20/10 split
    PLAYER_FOCUS_PROMPT,

    // Layer 1: Narrative Suppression (P0-2)
    NARRATIVE_SUPPRESSION_PROMPT,

    // Layer 2: Anti-Romance Escalation (P1.5)
    ANTI_ROMANCE_ESCALATION_PROMPT,

    // Layer 3: Relationship Gate (P0-1)
    '\n【关系行为闸门——当前关系阶段的行为边界】',
    buildRelationshipGatePrompt(affection),
    '你的每条回复必须严格保持在上述关系阶段的行为边界内。越过边界就是人设崩塌。',
  ]

  // Layer 4: Anti-smoothing conflict injection
  if (tension != null && tension < 30 && affection > 40) {
    parts.push(LOW_TENSION_CONFLICT_PROMPT)
  } else if (affection > 70 && Math.random() < 0.2) {
    parts.push(ANTI_SMOOTHING_CONFLICT_PROMPT)
  }

  // Layer 5: Independent Intent (P1-1)
  parts.push(buildIntentInjection(affection))

  return parts.filter(Boolean).join('\n')
}

// ═══════════════════════════════════════════════════════════
// Legacy exports — kept for backward compatibility
// ═══════════════════════════════════════════════════════════

/**
 * @deprecated — use narrativeSuppressionFilter instead
 */
export function dailyActionFilter(text) {
  return narrativeSuppressionFilter(text)
}

/**
 * @deprecated — use generateBurstSchedule instead
 */
export function humanBurstScheduler(text) {
  // Legacy: just adds natural pauses, no structural changes
  const sentences = text.split(/[,，。！？\n]/).map(s => s.trim()).filter(Boolean)
  if (sentences.length <= 1) return text

  const bursts = []
  for (let i = 0; i < sentences.length; i++) {
    bursts.push(sentences[i])
    if (i < sentences.length - 1 && Math.random() < 0.35) {
      bursts.push('…')
    }
  }
  return bursts.join('，')
}
