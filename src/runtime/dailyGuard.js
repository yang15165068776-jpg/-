/**
 * Daily Guard v5 — Anti-Romance Escalation + Relationship Gate + Burst Scheduler
 *
 * Three layers:
 *   1. Prompt injection (prevent bad behavior at source)
 *   2. Post-processing filters (strip leaked narrative)
 *   3. Burst scheduler (human-like pacing)
 */

// ═══════════════════════════════════════════════════════════
// P0-1: Anti-Romance Escalation Gate — prompt injection
// ═══════════════════════════════════════════════════════════

const ANTI_ROMANCE_ESCALATION_PROMPT = `
【反感情暴走闸门——最高优先级行为锁】

当前好感度下，以下内容绝对禁止出现在你的回复中：
× 求婚 / 婚戒 / 嫁给 / 一辈子 / 永远在一起
× 转账（包括任何金额的转账）
× 过度的占有欲表达（"你是我的""不准离开我"等）
× 未经铺垫的情侣化语言（"宝贝""亲爱的"等亲昵称呼）
× 在没有足够感情基础的情况下做出长期承诺

如果好感度低于 70：
→ 你的行为应该保持界限。友好但不过界。关心但有分寸。
→ 你就是对方微信里的一个人，不是伴侣，不是未婚夫/妻。
→ 任何超越当前关系阶段的行为都是人设违规。

自检：你的回复有没有"跳过十个阶段直接求婚"的感觉？→ 有的话，重写。`

// ═══════════════════════════════════════════════════════════
// P0-3: Relationship Gate — prompt injection
// ═══════════════════════════════════════════════════════════

function buildRelationshipGatePrompt(affection) {
  if (affection >= 80) {
    return '当前关系阶段：亲密期。你可以表达依恋、吃醋、占有欲。语言可以亲昵。但保持真实——不要变成甜宠文。'
  }
  if (affection >= 60) {
    return '当前关系阶段：好感期。你对对方有好感但还在确认中。可以主动但不过分。保持一定的自我保护。不承诺、不求婚、不说永远。'
  }
  if (affection >= 40) {
    return '当前关系阶段：试探期。你对对方有些兴趣但尚未信任。保持礼貌但不过于亲密。不表达情绪依赖。不主动拉近距离。'
  }
  if (affection >= 20) {
    return '当前关系阶段：冷淡期。你对对方有保留或不满。语气可以冷淡、敷衍、带刺。不关心对方的感受。不主动找话题。'
  }
  return '当前关系阶段：排斥期。你几乎不想理对方。可以冷漠、抗拒、甚至带攻击性。不配合。不讨好。不解释。'
}

// ═══════════════════════════════════════════════════════════
// P1-1: Independent Intent Generator
// ═══════════════════════════════════════════════════════════

const INTENTS = [
  '试探一下对方现在的心情',
  '冷处理——不想显得太主动',
  '突然想结束这次对话',
  '想起一件旧事，要不要提？',
  '装作不在意，但其实在等对方先开口',
  '轻微吃醋但绝不表现出来',
  '忽略对方刚才那句话，转移话题',
  '想说什么但打了一半又删了',
  '对方说的话让你有点不舒服但不想直说',
  '今天心情不好，不想假装热情',
]

export function generateIndependentIntent() {
  return INTENTS[Math.floor(Math.random() * INTENTS.length)]
}

export function buildIntentInjection() {
  if (Math.random() > 0.25) return ''
  const intent = generateIndependentIntent()
  return '\n【本轮潜在意图——角色自驱行为】\n你现在有一个潜在的心理意图：' + intent +
    '。\n这不是必须执行的指令，而是一个你"可能"会做的行为倾向。\n如果角色性格和当前情境不符合这个意图，忽略它。如果符合，自然地表现出来，不要解释你在做什么。'
}

// ═══════════════════════════════════════════════════════════
// P0-2: Daily Action Filter — post-processing
// ═══════════════════════════════════════════════════════════

export function dailyActionFilter(text) {
  return text
    // Strip parenthetical action descriptions (narrative leak)
    .replace(/（[^）]*(?:低头|看向|转身|缓缓|轻轻|冷笑|沉默|开口|心想|说道|默默|瞥了|叹了口气|眼眶|红了)[^）]*）/g, '')
    // Strip square-bracket narration
    .replace(/\[[^\]]*(?:冷笑|叹了口气|眼眶|转身|沉默|心想|说道|默默)[^\]]*\]/g, '')
    // Collapse multiple newlines
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// ═══════════════════════════════════════════════════════════
// P1-2: Human Burst Scheduler — post-processing
// ═══════════════════════════════════════════════════════════

export function humanBurstScheduler(text) {
  const sentences = text.split(/[,，。！？\n]/).map(s => s.trim()).filter(Boolean)
  if (sentences.length <= 1) return text

  const bursts = []
  for (let i = 0; i < sentences.length; i++) {
    bursts.push(sentences[i])
    // ~35% chance of a pause between sentences (human hesitation)
    if (i < sentences.length - 1 && Math.random() < 0.35) {
      bursts.push('…')
    }
  }
  return bursts.join('，')
}

// ═══════════════════════════════════════════════════════════
// Full prompt injection for buildDailySystemPrompt
// ═══════════════════════════════════════════════════════════

export function buildDailyGuardPrompt(affection) {
  return [
    ANTI_ROMANCE_ESCALATION_PROMPT,
    '\n【关系行为闸门——当前关系阶段的行为边界】',
    buildRelationshipGatePrompt(affection),
    '你的每条回复必须严格保持在上述关系阶段的行为边界内。越过边界就是人设崩塌。',
    buildIntentInjection(),
  ].filter(Boolean).join('\n')
}
