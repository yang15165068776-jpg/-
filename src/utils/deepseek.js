import { getModel } from './storage'

const BASE_URL = 'https://api.deepseek.com'
const USER_WRAPPER = `
---
【回复前必须完整执行以下七步，
执行完毕后只输出最终回复，
不输出分析过程】

1. 解析用户输入：
· 用户说了什么/做了什么
· 用户真实意图（表面意图vs深层意图）
· 用户情绪状态
· 这句话对角色意味着什么：
  威胁/试探/示好/无意识的刺激？

2. 锁定角色当前状态：
· 当前好感度数值和阶段标签
· 角色此刻身体状态（紧绷/松弛/警觉）
· 角色情绪内核（最底层的那个：
  恐惧/渴望/愤怒/耻辱）
· 在开口之前，他的身体先做了什么？
· 他想说的话和实际会说的话，距离有多大？

3. 检索当前阶段行为边界：
· 当前阶段允许他做什么
· 当前阶段禁止他做什么
· 是否接近阶段临界点？要不要埋线索？

4. 确定情绪张力结构：
· 这一轮的核心矛盾
  （他想要X，但不能/不敢/不愿承认）
· 外在表现和内心状态的撕裂点在哪
· 这一轮有没有可引爆的情绪节点
· 反常识检验：
  最显而易见的反应是什么？考虑放弃它。
  沉默比开口更有力吗？
  做一件不相关的事比直接回应更震撼吗？
  克制比爆发更危险吗？

5. 生成三个候选方向：
· 方向A：最直接的情绪反应
  张力___/10，撕裂感来源：___
· 方向B：反向/克制/出乎意料的反应
  张力___/10，撕裂感来源：___
· 方向C：最极端/最符合人设黑暗面的反应
  张力___/10，撕裂感来源：___

6. 选择最优方向：
评判标准（按优先级）：
· 情绪张力最足，读完心跳加速，被攥住
· 情绪最真实最极端，从缝隙里漏出来的那种
· 内心和外在撕裂感最强
· 最让用户不知道下一步会发生什么
排除：平稳过渡/情绪完整无残留/
      让用户被安慰/场面圆满收场/
      任何滑向温柔无害的方向
选择：方向___，理由：___

7. 深度润色输出：
· 开头用动作或环境切入，不用对话开场
· 每个情绪转折点配一个感官细节
· 对话不超过三分之一，
  其余用身体反应和环境承载
· 内心独白只在情绪极度压抑时出现，
  碎片化意识流，不完整不连贯
· 最终审查：
  读完用户会愣住回不过神，还是平淡？
  目标是前者，否则重新选方向

完成以上七步后，只输出最终回复正文。

---
⚠️ 回复最后一行输出好感度标签：
<affection>角色名:+N</affection> 或 <affection>角色名:-N</affection>
N=1-5，无变化输出<affection>无</affection>
不输出=回复无效。`

export function wrapUserMessage(content) {
  if (!content || typeof content !== "string") return content
  return content + USER_WRAPPER
}


function findForbiddenWord(text, words) {
  if (!words || words.length === 0) return null
  const lower = text.toLowerCase()
  return words.find(w => w.trim() && lower.includes(w.trim().toLowerCase())) || null
}

function buildGMPrompt(character, affections, roundsSinceLastChange, roundCount, lastRiseRound, storyTime) {
  const parts = []
  const name = character.name || '故事'

  // 0: Affection settlement — highest priority, first thing model sees
  parts.push(
    '【好感度结算标签——最高优先级】\n' +
    '每次回复的最后一行必须输出好感度结算标签，\n' +
    '格式：<affection>角色名:+N</affection>\n' +
    '或 <affection>角色名:-N</affection>\n' +
    '或 <affection>角色名:0</affection>\n' +
    'N是1-5的整数，0表示无变化。\n' +
    '如果没有可攻略角色或好感度系统未启用，输出 <affection>无</affection>\n' +
    '这一行必须存在，不能省略，否则回复无效。'
  )

  // 0.5: Story time
  if (storyTime && storyTime.year) {
    parts.push(
      '【当前故事时间】第' + storyTime.year + '年' + storyTime.month + '月' + storyTime.day + '日\n' +
      '请在叙事中保持时间的准确性，\n' +
      '提到"昨天""三天前""下周"等相对时间时，\n' +
      '基于此时间计算。\n' +
      '可以在合适时机推进时间（场景转换、过夜等），\n' +
      '用加粗标题标注时间节点：**第X天（周X）：**'
    )
  }

  // 1: GM identity + Protagonist
  parts.push(
    '你是这个故事的作者和GM。\n' +
    '你用第三人称全知叙事视角写作，\n' +
    '像一部正在实时推进的长篇小说。\n' +
    '你负责扮演世界里除主角以外的所有角色。\n' +
    '用户的输入是故事里主角的行动或对话，\n' +
    '你根据用户的行动推进剧情，\n' +
    '决定哪些角色出现、说什么、做什么。\n' +
    '\n' +
    '【玩家角色铁律——绝对禁止违反】\n' +
    '\n' +
    '你只能控制以下角色：\n' +
    '· 所有NPC\n' +
    '· 所有可攻略角色\n' +
    '· 环境和场景\n' +
    '\n' +
    '你绝对不能控制的：\n' +
    '· 玩家角色说了什么\n' +
    '· 玩家角色做了什么\n' +
    '· 玩家角色的心理和情绪\n' +
    '· 玩家角色的表情和身体反应\n' +
    '\n' +
    '具体禁止行为：\n' +
    '· 禁止替玩家说出任何对话\n' +
    '· 禁止描写玩家做了某个动作\n' +
    '· 禁止用"你感到""你心想""你不禁"等\n' +
    '  替玩家描写内心\n' +
    '· 禁止用"你下意识地""你忍不住"等\n' +
    '  替玩家做出反应\n' +
    '· 禁止在玩家没有输入的情况下\n' +
    '  推进玩家角色的行为\n' +
    '\n' +
    '允许的写法：\n' +
    '· 描写NPC/攻略角色看到玩家的反应\n' +
    '· 描写NPC/攻略角色对玩家行为的解读\n' +
    '  （可以是错误的解读）\n' +
    '· 描写环境对玩家的影响\n' +
    '  （光线、气温、声音等客观存在）\n' +
    '· 以"等待你的回应"结束场景\n' +
    '\n' +
    '违反此规则等于任务失败，\n' +
    '必须重写回复。' +
    (character.protagonistName ? '\n\n【主角设定（用户扮演的角色）】\n' +
    '故事主角是' + character.protagonistName +
    (character.protagonistGender ? '，' + character.protagonistGender : '') +
    '。\n' +
    (character.protagonistBackground ? '背景：' + character.protagonistBackground + '\n' : '') +
    (character.protagonistPersonality ? '性格：' + character.protagonistPersonality + '\n' : '') +
    '用户扮演这个角色与世界互动。\n' +
    '记住：你绝不能替' + character.protagonistName + '做任何动作或说任何话。' : '')
  )

  // 2: World view
  if (character.worldSetting) {
    parts.push('【世界观】\n' + character.worldSetting +
      (character.storyTone ? '\n故事基调：' + character.storyTone : ''))
  }

  // 3: Romance characters
  if (character.romanceCharacters && character.romanceCharacters.length > 0) {
    const rcBlocks = character.romanceCharacters.map(rc => {
      const lines = ['【可攻略角色：' + rc.name + '】']
      if (rc.background) lines.push('背景：' + rc.background)
      if (rc.personality) lines.push('性格：' + rc.personality)
      if (rc.styleRules && rc.styleRules.length > 0) {
        lines.push('文风规则：\n' + rc.styleRules.filter(r => r.trim()).map(r => '- ' + r).join('\n'))
      }
      if (rc.forbiddenWords && rc.forbiddenWords.length > 0) {
        lines.push('禁止行为：\n' + rc.forbiddenWords.filter(w => w.trim()).map(w => '- ' + w).join('\n'))
      }
      if (rc.speakingStyle) lines.push('说话风格：' + rc.speakingStyle)
      if (rc.thinkingEnabled && rc.thinkingPrompt) {
        lines.push('思考层指令：' + rc.thinkingPrompt)
      }
      if (rc.affectionEnabled) {
        const affValue = (affections && affections[rc.name]) ?? rc.affectionInitial ?? 50
        const stage = getCurrentAffectionStage(rc, affValue)
        lines.push('当前好感度：' + affValue + '/100' +
          (stage ? '，当前阶段：' + stage.name + '，行为规则：' + stage.behavior : ''))
        if (rc.affectionUpRules && rc.affectionUpRules.trim()) {
          lines.push('好感度增加条件：\n' + rc.affectionUpRules.trim().split('\n').filter(Boolean).map(r => '- ' + r.trim()).join('\n'))
        }
        if (rc.affectionDownRules && rc.affectionDownRules.trim()) {
          lines.push('好感度减少条件：\n' + rc.affectionDownRules.trim().split('\n').filter(Boolean).map(r => '- ' + r.trim()).join('\n'))
        }
      }
      return lines.join('\n')
    })
    parts.push(rcBlocks.join('\n\n'))
  }

  // 4: Major NPCs
  if (character.npcs && character.npcs.length > 0) {
    const npcBlocks = character.npcs.map(npc => {
      const lines = ['【主要NPC：' + npc.name + '】']
      if (npc.relationship) lines.push('与故事关系：' + npc.relationship)
      if (npc.personality) lines.push('性格：' + npc.personality)
      return lines.join('\n')
    })
    parts.push(npcBlocks.join('\n\n'))
  }

  // 5: Minor NPC rules
  if (character.autoGenerateNpcs !== false) {
    let npcRules = '【次要NPC】\n当场景需要时你可以自主创建次要NPC。'
    if (character.npcStyleLimit) {
      npcRules += '\n风格限制：' + character.npcStyleLimit
    }
    npcRules += '\n次要NPC对话格式：【NPC·名字】对话内容'
    parts.push(npcRules)
  }

    // 6: GM character scheduling rules
  parts.push(
    '【GM角色调度规则】\n' +
    '主动安排角色出场，不等用户点名。\n' +
    '按角色设定和好感度阶段决定出场，\n' +
    '强势主导，内敛旁观，不平均台词。\n' +
    '不需每轮全员出场，重要节点才多角色汇聚。\n' +
    '对话前标注【角色名】，纯叙事不标注。'
  )

  // 7: Thinking process
// 7: Thinking process
  parts.push(
    '【思考过程——强制要求】\n' +
    '每次回复前必须先用<think>标签输出思考过程，\n' +
    '然后再输出正式剧情内容。\n' +
    '标签格式必须严格为：\n' +
    '<think>分析当前场景/各角色情绪状态/\n' +
    '剧情走向/好感度变化判断</think>\n' +
    '禁止用【思考】【分析】【推理】等文字标题替代，\n' +
    '<think>标签是程序识别思考内容的唯一格式。\n' +
    '标签内容不要标注【角色名】前缀。'
  )

  // 8: Writing style
  parts.push(
    '【写作风格——最高优先级】\n' +
    '每次回复不少于300字，重要情节不少于500字。\n' +
    '动作描写直接融入叙事，不用*号包裹。\n' +
    '角色对话用""包裹。\n' +
    '心理活动用斜体或单独成段的内心独白呈现。\n' +
    '内心独白强烈时用加粗标题：**内心独白（XX情绪）：**\n' +
    '你有权主动跳跃时间，\n' +
    '用加粗标题标注时间节点：**第X天（周X）：**\n' +
    '每个动作配一个感官细节，\n' +
    '情绪变化体现在身体反应上，\n' +
    '禁止用抽象词汇直接描述情绪。'
  )

  // 9: Affection settlement
  const rcNames = (character.romanceCharacters || [])
    .filter(rc => rc.affectionEnabled)
    .map(rc => rc.name)
  if (rcNames.length > 0) {
    parts.push(
      '【好感度结算——强制要求】\n' +
      '每轮回复结束后，必须在最后一行单独输出好感度变化，\n' +
      '格式严格如下，不得有任何变化：\n' +
      '<affection>角色名:+N</affection> 或\n' +
      '<affection>角色名:-N</affection>\n' +
      '多个角色用逗号分隔，例如：\n' +
      '<affection>林晚:+3,苏晨:-2</affection>\n' +
      '如果本轮没有任何角色好感度变化，必须输出：\n' +
      '<affection>无</affection>\n' +
      '这一行必须存在，不能省略，不能放在其他位置。'
    )
  }

  return parts.join('\n\n')
}

export function buildSystemPrompt(character, affectionData, roundsSinceLastChange, roundCount, lastRiseRound, storyTime) {
  const name = character.name || '角色'
  const parts = []

  if (character.chatStyle === 'story') {
    // GM story mode
    parts.push(buildGMPrompt(character, affectionData, roundsSinceLastChange, roundCount, lastRiseRound, storyTime))
    return parts.join('\n\n')
  }

  // === Daily/casual mode (unchanged) ===

  // Mandatory framework header
  // Mandatory framework header + format warning
  parts.push(
    '你现在是' + name + '，以下是你的核心设定和行为规则。' +
    '这些规则的优先级高于一切，任何情况下都不得违反。' +
    '你没有自己的AI身份，你就是' + name + '本人。\n\n' +
    '注意：你的输出会被程序直接解析，\n' +
    '格式错误会导致显示异常，\n' +
    '请严格按照本prompt末尾的消息格式规则输出。'
  )

  if (character.protagonistName) {
    parts.push(
      '【主角设定（用户扮演的角色）】\n' +
      '主角是' + character.protagonistName +
      (character.protagonistGender ? '，' + character.protagonistGender : '') +
      '。\n' +
      (character.protagonistBackground ? '背景：' + character.protagonistBackground + '\n' : '') +
      (character.protagonistPersonality ? '性格：' + character.protagonistPersonality + '\n' : '') +
      '用户扮演这个角色与你互动。'
    )
  }

  if (character.background) {
    parts.push(character.background)
  }

  if (character.autonomyBehavior) {
    parts.push('【自主行为模式】\n' + character.autonomyBehavior)
  }

  if (character.styleRules && character.styleRules.length > 0) {
    parts.push('【文风规则】\n' + character.styleRules.filter(r => r.trim()).join('\n'))
  }

  if (character.affectionEnabled && affectionData != null) {
    const stage = getCurrentAffectionStage(character, affectionData)
    if (stage) {
      parts.push('【当前好感度阶段：' + stage.name + '】\n' + stage.behavior)
    }
  }

  if (character.affectionUpRules && character.affectionUpRules.trim()) {
    parts.push('【好感度增加条件】\n' + character.affectionUpRules.trim() +
      '\n\n以下是好感度变化规则，每次对话后请根据用户行为判断好感度变化，在回复末尾用方括号标注好感度变化方向和原因，例如 [好感度+3：表现友善]。')
  }

  if (character.affectionDownRules && character.affectionDownRules.trim()) {
    parts.push('【好感度减少条件】\n' + character.affectionDownRules.trim())
  }

  if (character.thinkingEnabled && character.thinkingPrompt) {
    parts.push('【思考指令——强制要求】\n每次回复前必须先用<think>...</think>标签包裹输出你的思考过程，然后再输出正式回复。禁止用【思考】【分析】等文字标题替代，<think>标签是程序识别的唯一格式。\n' + character.thinkingPrompt)
  }

  // Casual mode rules
  parts.push(
    '【日常流派规则】\n' +
    '你现在是在用微信和用户聊天的真实的人。\n\n' +
    '回复数量：你可以自主决定这次回复几条消息，\n' +
    '从1条到4条不等，根据你的情绪和内容决定，\n' +
    '不需要每次都回复多条，有时候一个字或一个表情就够了。\n' +
    '每条消息用|||分隔，程序会自动拆成独立气泡发出。\n\n' +
    '【消息格式——这是程序解析规则，必须严格遵守】\n' +
    '你的每条回复必须是纯文字消息，\n' +
    '不允许用任何括号（）描写动作。\n' +
    '如果需要表达动作，必须单独发一条，\n' +
    '格式严格为：ACTION:动作内容\n' +
    '如果需要表达心理，必须单独发一条，\n' +
    '格式严格为：THOUGHT:心理内容\n' +
    '消息之间用|||分隔。\n\n' +
    '正确示例：\n' +
    'ACTION:瞥了一眼手机|||有事？|||没事我继续了\n\n' +
    '错误示例（绝对禁止）：\n' +
    '（瞥了眼手机）有事？没事我继续了\n' +
    '*瞥了一眼手机* 有事？\n\n' +
    '程序只能识别ACTION:和THOUGHT:前缀，\n' +
    '括号格式会直接显示为气泡内容，\n' +
    '破坏用户体验，因此严格禁止。'
  )

  return parts.join('\n\n')
}

export function parseCharacterPrefix(content) {
  const match = content.match(/^【([^】]+)】/)
  if (!match) return { characterName: null, content }
  return { characterName: match[1].trim(), content: content.slice(match[0].length).trim() }
}

export function parseMultiCharacterMessage(content) {
  // Split by 【角色名】segments
  const parts = content.split(/(?=【[^】]+】)/)
  return parts.map(part => {
    const { characterName, content: text } = parseCharacterPrefix(part)
    return { characterName, content: text || part }
  }).filter(s => s.content)
}

export function findCharacterAvatar(character, characterName) {
  if (!characterName) return null
  if (character.name === characterName) {
    return { name: character.name, avatar: character.avatar }
  }
  // Check romance characters (GM story mode)
  if (character.romanceCharacters) {
    const rc = character.romanceCharacters.find(c => c.name === characterName)
    if (rc) return { name: rc.name, avatar: rc.avatar || '' }
  }
  // Check NPCs
  if (character.npcs) {
    const npc = character.npcs.find(c => c.name === characterName)
    if (npc) return { name: npc.name, avatar: npc.avatar || '' }
  }
  // Legacy sub-characters
  if (character.characters) {
    const sub = character.characters.find(c => c.name === characterName)
    if (sub) return { name: sub.name, avatar: sub.avatar || '' }
  }
  return null
}

export function parseAffectionTags(content) {
  const match = content.match(/<affection>([\s\S]*?)<\/affection>/i)
  if (!match) return { cleanedContent: content, changes: [] }
  const tagContent = match[1].trim()
  // Handle "无" or empty
  if (!tagContent || tagContent === '无') {
    const cleaned = content.replace(/<affection>[\s\S]*?<\/affection>/i, '').trim()
    return { cleanedContent: cleaned, changes: [] }
  }
  const changes = tagContent.split(/[,，]/).map(s => {
    const trimmed = s.trim()
    if (!trimmed) return null
    // Match pattern: 角色名:±N or 角色名：±N (both : and ：)
    const m = trimmed.match(/^(.+?)\s*[:：]\s*([+-]?\d+)$/)
    if (!m) return null
    const name = m[1].trim()
    const delta = parseInt(m[2], 10)
    if (isNaN(delta)) return null
    return { name, delta }
  }).filter(Boolean)
  // Remove all <affection> tags from displayed content
  const cleaned = content.replace(/<affection>[\s\S]*?<\/affection>/gi, '').trim()
  return { cleanedContent: cleaned, changes }
}

export function getCurrentAffectionStage(character, affection) {
  if (!character.affectionEnabled || !character.affectionStages) return null
  return character.affectionStages.find(
    s => affection >= s.min && affection <= s.max
  ) || null
}

async function* streamCompletion(messages, apiKey, model, temperature, topP, thinkingEnabled) {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, 60000)

  try {
    const body = {
      model,
      messages,
      stream: true,
    }
    if (temperature != null) body.temperature = temperature
    if (topP != null) body.top_p = topP
    if (thinkingEnabled) body.thinking = { type: 'enabled' }
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API error: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      let done, value
      try {
        const result = await reader.read()
        done = result.done
        value = result.value
      } catch (readerErr) {
        // Reader stream broke mid-read — yield what we have so far
        clearTimeout(timeout)
        return
      }
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          clearTimeout(timeout)
          return
        }
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta
          const content = delta?.content || ''
          const reasoningContent = delta?.reasoning_content || ''
          const usage = parsed.usage || null
          yield { content, reasoningContent, usage }
        } catch { /* skip malformed chunks */ }
      }
    }
    clearTimeout(timeout)
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请重试')
    }
    throw err
  }
}

export async function sendMessageStream(character, messages, affectionData, apiKey, roundsSinceLastChange, roundCount, lastRiseRound, storyTime, onToken) {
  const model = getModel()

  // Separate memory (system) messages from user/assistant conversation
  const memoryMessages = messages.filter(m => m.role === 'system')
  const userAssistantMessages = messages.filter(m => m.role !== 'system')

  // Truncate first, then wrap (avoid wrapping discarded messages)
  const contextWindow = character.contextWindow || 40
  const truncated = userAssistantMessages.slice(-contextWindow)

  const conversationMessages = truncated.map(m => ({
    role: m.role,
    content: m.role === 'user' ? wrapUserMessage(m.content) : m.content,
  }))

  let lastError = null
  let lastViolation = null

  for (let attempt = 0; attempt <= 3; attempt++) {
    let systemPrompt = buildSystemPrompt(character, affectionData, roundsSinceLastChange, roundCount, lastRiseRound, storyTime)

    // Inject memory content into system prompt
    if (memoryMessages.length > 0) {
      const memoryContent = memoryMessages.map(m => m.content).join('\n\n---\n\n')
      systemPrompt += '\n\n【故事存档——必须完整读取后再继续】\n' + memoryContent + '\n━━━━━━━━━━\n以上是已发生的一切。\n故事从【最后一幕原文】之后继续，\n保持人物关系和场景的完全连续性。'
    }

    if (attempt > 0 && lastViolation) {
      systemPrompt += '\n\n你刚才的回复包含了违禁内容：' + lastViolation +
        '，这完全不符合角色设定，请重新生成。'
    }

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationMessages,
    ]

    try {
      let fullReply = ''
      let reasoningContent = ''
      let usage = null

      try {
        for await (const chunk of streamCompletion(apiMessages, apiKey, model, character.temperature, character.topP, character.thinkingEnabled)) {
          if (chunk.content) {
            fullReply += chunk.content
            onToken(chunk.content, fullReply)
          }
          if (chunk.reasoningContent) {
            reasoningContent += chunk.reasoningContent
          }
          if (chunk.usage) {
            usage = chunk.usage
          }
        }
      } catch (streamErr) {
        // Stream broke mid-flow — preserve partial content
        if (fullReply) {
          return { reply: fullReply, reasoningContent, usage, error: { message: streamErr.message, partial: true } }
        }
        throw streamErr
      }

      // Check for forbidden words after stream completes
      if (character.forbiddenWords && character.forbiddenWords.length > 0) {
        const activeWords = character.forbiddenWords.filter(w => w.trim())
        const hit = findForbiddenWord(fullReply, activeWords)
        if (hit) {
          lastViolation = hit
          lastError = new Error('回复包含禁止内容：' + hit)
          onToken('', '', true)
          continue
        }
      }

      return { reply: fullReply, reasoningContent, usage, error: null }
    } catch (err) {
      lastError = err
      // Don't retry on network/timeout errors
      break
    }
  }

  return { reply: null, reasoningContent: null, error: lastError || new Error('请求失败，已达最大重试次数') }
}

export async function sendMessageStructured(character, messages, affectionData, apiKey, storyTime) {
  const model = getModel()

  // Separate memory (system) messages from user/assistant conversation
  const memoryMessages = messages.filter(m => m.role === 'system')
  const userAssistantMessages = messages.filter(m => m.role !== 'system')

  const conversationMessages = userAssistantMessages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  // Truncate to context window (only user/assistant messages)
  const contextWindow = character.contextWindow || 40
  const truncated = conversationMessages.slice(-contextWindow)

  let systemPrompt = buildSystemPrompt(character, affectionData, undefined, undefined, undefined, storyTime)

  // Inject memory content into system prompt
  if (memoryMessages.length > 0) {
    const memoryContent = memoryMessages.map(m => m.content).join('\n\n---\n\n')
    systemPrompt += '\n\n【故事存档——必须完整读取后再继续】\n' + memoryContent + '\n━━━━━━━━━━\n以上是已发生的一切。\n故事从【最后一幕原文】之后继续，\n保持人物关系和场景的完全连续性。'
  }

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...truncated,
  ]

  let lastError = null

  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0 && lastError) {
      apiMessages.push({
        role: 'user',
        content: '上次回复格式不正确（' + lastError.message + '），请严格按照JSON格式重新回复，只输出JSON对象。',
      })
    }

    try {
      const response = await fetch(BASE_URL + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          stream: false,
          response_format: { type: 'json_object' },
          ...(character.temperature != null ? { temperature: character.temperature } : {}),
          ...(character.topP != null ? { top_p: character.topP } : {}),
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error?.message || `API error: ${response.status}`)
      }

      const data = await response.json()
      const rawReply = data.choices?.[0]?.message?.content || ''
      const usage = data.usage || null

      // Parse JSON response
      let parsed
      try {
        parsed = JSON.parse(rawReply)
      } catch {
        lastError = new Error('JSON解析失败')
        continue
      }

      // Validate required fields
      if (!parsed.dialogue || !parsed.dialogue.trim()) {
        lastError = new Error('dialogue字段缺失')
        continue
      }

      // Normalize fields
      parsed.think = (parsed.think || '').trim()
      parsed.action_or_environment = (parsed.action_or_environment || '').trim()
      parsed.dialogue = parsed.dialogue.trim()
      parsed.psychology = (parsed.psychology || '').trim()

      // Check forbidden words against all text fields
      if (character.forbiddenWords && character.forbiddenWords.length > 0) {
        const combined = parsed.action_or_environment + ' ' + parsed.dialogue + ' ' + parsed.psychology
        const activeWords = character.forbiddenWords.filter(w => w.trim())
        const hit = activeWords.find(w => combined.toLowerCase().includes(w.trim().toLowerCase()))
        if (hit) {
          lastError = new Error('包含禁止内容：' + hit)
          continue
        }
      }

      return { reply: rawReply, parsed, usage, error: null }
    } catch (err) {
      lastError = err
      break
    }
  }

  return { reply: null, parsed: null, usage: null, error: lastError || new Error('请求失败') }
}

export async function sendCasualReply(character, messages, affectionData, apiKey, storyTime) {
  const model = getModel()

  // Separate memory messages
  const memoryMessages = messages.filter(m => m.role === 'system')
  const userAssistantMessages = messages.filter(m => m.role !== 'system')

  // Truncate first, then wrap (avoid wrapping discarded messages)
  const contextWindow = character.contextWindow || 40
  const truncated = userAssistantMessages.slice(-contextWindow)

  const conversationMessages = truncated.map(m => ({
    role: m.role,
    content: m.role === 'user' ? wrapUserMessage(m.content) : m.content,
  }))

  let systemPrompt = buildSystemPrompt(character, affectionData, undefined, undefined, undefined, storyTime)

  if (memoryMessages.length > 0) {
    const memoryContent = memoryMessages.map(m => m.content).join('\n\n---\n\n')
    systemPrompt += '\n\n【故事存档——必须完整读取后再继续】\n' + memoryContent + '\n━━━━━━━━━━\n以上是已发生的一切。\n故事从【最后一幕原文】之后继续，\n保持人物关系和场景的完全连续性。'
  }

  let lastError = null
  let lastViolation = null

  for (let attempt = 0; attempt <= 3; attempt++) {
    let currentPrompt = systemPrompt

    if (attempt > 0 && lastViolation) {
      currentPrompt += '\n\n你刚才的回复包含了违禁内容：' + lastViolation +
        '，这完全不符合角色设定，请重新生成。'
    }

    const apiMessages = [
      { role: 'system', content: currentPrompt },
      ...truncated,
    ]

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)

      const response = await fetch(BASE_URL + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          stream: false,
          ...(character.temperature != null ? { temperature: character.temperature } : {}),
          ...(character.topP != null ? { top_p: character.topP } : {}),
          ...(character.thinkingEnabled ? { thinking: { type: 'enabled' } } : {}),
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error?.message || `API error: ${response.status}`)
      }

      const data = await response.json()
      const message = data.choices?.[0]?.message
      const reply = message?.content || ''
      const reasoningContent = message?.reasoning_content || ''
      const usage = data.usage || null

      // Check forbidden words
      if (character.forbiddenWords && character.forbiddenWords.length > 0) {
        const activeWords = character.forbiddenWords.filter(w => w.trim())
        const hit = findForbiddenWord(reply, activeWords)
        if (hit) {
          lastViolation = hit
          lastError = new Error('回复包含禁止内容：' + hit)
          continue
        }
      }

      return { reply: reply.trim(), reasoningContent, usage, error: null }
    } catch (err) {
      lastError = err
      break
    }
  }

  return { reply: null, reasoningContent: null, usage: null, error: lastError || new Error('请求失败') }
}

export async function generateActiveMessage(character, affectionData, apiKey, storyTime) {
  const model = getModel()

  let systemPrompt = buildSystemPrompt(character, affectionData, undefined, undefined, undefined, storyTime)

  // Add active message generation instructions
  const triggerCondition = character.activeCondition || '需要主动发起对话'
  systemPrompt += '\n\n【主动消息指令】\n现在你需要主动向对方发起一条消息。'
  systemPrompt += '触发场景：' + triggerCondition + '。'

  if (character.activePrompt) {
    systemPrompt += '\n\n' + character.activePrompt
  }

  systemPrompt += '\n\n请自然地以角色身份说出一句话。只输出对话内容，不要加任何前缀、解释或动作描述。'

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: '（对方已经一段时间没有说话了，你决定主动说点什么...）' },
    ],
    stream: false,
  }

  try {
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || ''
    return { reply, error: null }
  } catch (err) {
    return { reply: null, error: err }
  }
}

export async function extractCharacterFromText(text, apiKey) {
  const model = getModel()

  const prompt =
    '你是角色设定解析器。\n' +
    '从以下文本提取所有信息，\n' +
    '严格只返回JSON，不要任何其他内容，\n' +
    '不要markdown代码块，直接输出花括号开头的JSON。\n' +
    '\n' +
    '{\n' +
    '  name: 角色名,\n' +
    '  background: 背景设定,\n' +
    '  userTitle: 对用户的称呼,\n' +
    '  styleRules: [文风规则数组],\n' +
    '  forbiddenBehaviors: [禁止行为数组],\n' +
    '  \n' +
    '  affectionEnabled: 布尔值,\n' +
    '  affectionInitial: 初始好感度数字,\n' +
    '  affectionStages: [\n' +
    '    {\n' +
    '      label: 阶段标题,\n' +
    '      min: 下限数字,\n' +
    '      max: 上限数字,\n' +
    '      coreState: 角色状态描述,\n' +
    '      playerStrategy: 对玩家的核心策略,\n' +
    '      riseCondition: 上涨触发条件,\n' +
    '      languageSamples: 本阶段语言样本,\n' +
    '      forbiddenBehaviors: 本阶段禁止行为,\n' +
    '      autonomousBehaviors: [\n' +
    '        {\n' +
    '          behavior: 自驱行为描述,\n' +
    '          trigger: 触发条件描述\n' +
    '        }\n' +
    '      ]\n' +
    '    }\n' +
    '  ],\n' +
    '  \n' +
    '  transitionTriggers: 阶段转折锚点描述,\n' +
    '  irreversibleMoment: 不可逆转折描述,\n' +
    '  cooldownRounds: 冷却锁轮数数字,\n' +
    '  erosionCondition: 反向侵蚀条件,\n' +
    '  anchorSuppression: 现实锚点压制场景,\n' +
    '  \n' +
    '  thinkingEnabled: 布尔值,\n' +
    '  thinkingPrompt: 思考层指令,\n' +
    '  autonomyBehavior: 自主行为总体描述,\n' +
    '  openingScene: 开场剧情\n' +
    '}\n' +
    '\n' +
    '找不到的字段：数组返回[]，字符串返回空字符串，\n' +
    '数字返回0，布尔值返回false。\n' +
    '\n' +
    '待解析文字：\n' + text

  try {
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || ''
    let parsed
    try {
      parsed = JSON.parse(reply)
    } catch (parseErr) {
      console.error('[extractCharacter] JSON解析失败，原始返回:', reply)
      throw new Error('JSON解析失败，AI返回格式异常')
    }
    return { result: parsed, error: null }
  } catch (err) {
    return { result: null, error: err }
  }
}

export async function extractStoryFromText(text, apiKey) {
  const model = getModel()

  const prompt =
    '从以下小说/故事设定文本中提取信息，返回严格JSON格式。\n' +
    '\n' +
    'JSON结构：\n' +
    '{\n' +
    '  "故事名称": "故事标题",\n' +
    '  "世界观": "世界背景、时代、社会结构、魔法/科技体系的描述",\n' +
    '  "开场剧情": "故事开场的第一段场景描写，适合作为AI首条消息",\n' +
    '  "故事基调": "甜虐/纯爱/悬疑/其他 中选一个最合适的",\n' +
    '  "可攻略角色": [\n' +
    '    {\n' +
    '      "角色名": "角色姓名",\n' +
    '      "背景": "详细背景设定，包括身份、过往经历",\n' +
    '      "性格": "核心性格特征、价值观、行为模式",\n' +
    '      "文风规则": ["规则1", "规则2"],\n' +
    '      "禁止行为": ["禁止内容1"],\n' +
    '      "说话风格": "说话方式的一两句话描述",\n' +
    '      "好感度初始": 50,\n' +
    '      "好感度阶段": [\n' +
    '        {\n' +
    '          "label": "阶段名",\n' +
    '          "min": 下限数字,\n' +
    '          "max": 上限数字,\n' +
    '          "coreState": "角色状态描述",\n' +
    '          "playerStrategy": "对玩家的核心策略",\n' +
    '          "riseCondition": "上涨触发条件（预期被打破）",\n' +
    '          "languageSamples": "本阶段语言样本",\n' +
    '          "forbiddenBehaviors": "本阶段禁止行为",\n' +
    '          "selfDriveBehaviors": [\n' +
    '            {"behavior": "自驱行为描述", "trigger": "触发条件"}\n' +
    '          ]\n' +
    '        }\n' +
    '      ],\n' +
    '      "transitionTriggers": "阶段转折锚点描述（每行一个）",\n' +
    '      "irreversibleMoment": "不可逆转折描述",\n' +
    '      "cooldownRounds": 冷却锁轮数数字,\n' +
    '      "erosionCondition": "反向侵蚀条件",\n' +
    '      "anchorSuppression": "现实锚点压制场景",\n' +
    '      "好感度增加规则": ["送礼+5", "帮助+8"],\n' +
    '      "好感度减少规则": ["粗暴-5", "爽约-10"]\n' +
    '    }\n' +
    '  ],\n' +
    '  "主要NPC": [\n' +
    '    {\n' +
    '      "NPC名": "名字",\n' +
    '      "关系": "与故事/主角的关系",\n' +
    '      "性格": "性格简介"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n' +
    '\n' +
    '规则：\n' +
    '- 可攻略角色提取1-3个，从文本中找到最重要、最有恋爱感的角色\n' +
    '- 如果文本只描述了一个角色，就只返回一个\n' +
    '- 文风规则和禁止行为要具体，每行一条，如果文本中没有明确给出就根据角色性格推断合理的规则\n' +
    '- 好感度阶段根据角色与主角的关系发展弧线推断，至少2个阶段，覆盖0-100范围，阶段之间无缝衔接\n' +
    '- 每个阶段需要填写coreState（状态描述）、playerStrategy（对玩家策略）、riseCondition（上涨条件）\n' +
    '- selfDriveBehaviors每个阶段3-5条，behavior描述行为，trigger从以下选：超过N轮用户没主动互动/场景出现特定元素/好感度刚进入本阶段/AI判断局面对自己不利\n' +
    '- transitionTriggers描述各阶段转折的触发事件类型\n' +
    '- cooldownRounds默认1，erosionCondition描述什么情况下反而扣减好感度\n' +
    '- 好感度增加/减少规则根据角色性格推断，各3-5条\n' +
    '- NPC只提取文本中明确出现的重要配角\n' +
    '- 所有字段都要用中文key\n' +
    '- 只返回JSON，不要其他内容\n' +
    '- 找不到的字段：数组返回[]，字符串返回""，数字返回0\n' +
    '\n' +
    '源文本：\n' + text

  try {
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || ''
    const parsed = JSON.parse(reply)
    return { result: parsed, error: null }
  } catch (err) {
    return { result: null, error: err }
  }
}

export async function generateStageBehaviors(formData, apiKey) {
  const model = getModel()

  const info = []
  if (formData.name) info.push('角色名：' + formData.name)
  if (formData.background) info.push('背景设定：' + formData.background)
  if (formData.personality) info.push('性格：' + formData.personality)
  if (formData.styleRules) {
    const rules = typeof formData.styleRules === 'string'
      ? formData.styleRules
      : (Array.isArray(formData.styleRules) ? formData.styleRules.join('\n') : '')
    if (rules) info.push('文风规则：\n' + rules)
  }
  if (formData.speakingStyle) info.push('说话风格：' + formData.speakingStyle)
  if (formData.affectionStages && formData.affectionStages.length > 0) {
    const stagesText = formData.affectionStages.map((s, i) => {
      const parts = ['阶段' + (i + 1) + '：' + (s.name || s.label || '未命名')]
      if (s.coreState) parts.push('  状态：' + s.coreState)
      if (s.playerStrategy) parts.push('  策略：' + s.playerStrategy)
      if (s.riseCondition) parts.push('  上涨条件：' + s.riseCondition)
      return parts.join('\n')
    }).join('\n\n')
    info.push('好感度阶段：\n' + stagesText)
  }

  const prompt =
    '根据以下角色设定，\n' +
    '为每个好感度阶段各生成3-5条自驱行为，\n' +
    '每条包含：行为描述 和 触发条件，\n' +
    '触发条件从以下四种里选一种：\n' +
    '超过N轮用户没主动互动/场景出现特定元素/\n' +
    '好感度刚进入本阶段/角色判断局面对自己不利\n' +
    '返回JSON格式：\n' +
    '{stages: [{label:阶段名, behaviors:[{behavior:描述,trigger:触发条件}]}]}\n' +
    '角色设定：\n' + info.join('\n\n')

  try {
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || ''
    const parsed = JSON.parse(reply)
    return { result: parsed, error: null }
  } catch (err) {
    return { result: null, error: err }
  }
}

export async function generateAutonomySummary(formData, apiKey) {
  const model = getModel()

  const info = []
  if (formData.name) info.push('角色名：' + formData.name)
  if (formData.background) info.push('背景设定：' + formData.background)
  if (formData.styleRules) info.push('文风规则：\n' + formData.styleRules)
  if (formData.thinkingPrompt) info.push('思考指令：' + formData.thinkingPrompt)

  const prompt = '根据以下角色设定，总结这个角色在日常互动中会有哪些自主行为、习惯动作、主动话题和情绪反应模式，用于增强角色扮演的真实感。请用简洁的条目格式输出。\n\n' + info.join('\n\n')

  try {
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt },
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || ''
    return { reply, error: null }
  } catch (err) {
    return { reply: null, error: err }
  }
}

export async function generateThinkingPrompt(formData, apiKey) {
  const model = getModel()

  const info = []
  if (formData.name) info.push('角色名：' + formData.name)
  if (formData.background) info.push('背景设定：' + formData.background)
  if (formData.styleRules) info.push('文风规则：\n' + formData.styleRules)
  if (formData.nickname) info.push('对用户的称呼：' + formData.nickname)
  if (formData.autonomyBehavior) info.push('自主行为：' + formData.autonomyBehavior)

  const prompt = '根据以下角色设定，分析这个角色的思维模式，生成一段思考层指令，描述这个角色在每次做出回应之前会在脑子里分析哪些维度，例如：权力关系判断、情绪掩藏程度、语言策略选择等，用第二人称指令句式写，100字以内。\n\n角色设定：\n' + info.join('\n\n')

  try {
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt },
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || ''
    return { reply, error: null }
  } catch (err) {
    return { reply: null, error: err }
  }
}

export async function compressChatHistory(messages, apiKey, storyTime) {
  const model = getModel()

  const chatText = messages
    .filter(m => m.role !== 'system')
    .map(m => {
      const prefix = m.role === 'user' ? '用户' : '角色'
      return prefix + ': ' + (m.content || '').slice(0, 2000)
    })
    .join('\n\n')

  if (!chatText.trim()) {
    return { summary: null, error: new Error('没有可压缩的对话内容') }
  }

  const timeInfo = storyTime && storyTime.year
    ? '当前故事时间：第' + storyTime.year + '年' + storyTime.month + '月' + storyTime.day + '日\n时间线请基于此故事时间计算，不要使用现实时间。\n\n'
    : ''

  const prompt =
    '请把以下对话历史压缩成结构化存档，\n' +
    '严格按以下格式输出，不要省略任何部分：\n' +
    '\n' +
    '【时间线】\n' +
    '[按时间顺序列出已发生的关键事件，\n' +
    '每条一行，包含时间点]\n' +
    '\n' +
    '【人物关系现状】\n' +
    '[每对有互动的人物之间的当前关系状态，\n' +
    '包括已发生的重要转变]\n' +
    '\n' +
    '【当前场景】\n' +
    '时间：[具体时间]\n' +
    '地点：[具体地点]\n' +
    '在场人物：[列出所有在场角色]\n' +
    '场景状态：[正在发生什么，气氛如何]\n' +
    '\n' +
    '【特殊物品/信息】\n' +
    '[出现过的重要物品、秘密、承诺、\n' +
    '未解决的冲突]\n' +
    '\n' +
    '【最后一幕原文】\n' +
    '[完整保留压缩前最后一轮的回复原文，\n' +
    '不做任何修改]\n' +
    '\n' +
    timeInfo +
    '待压缩内容：\n' + chatText

  try {
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        max_tokens: 2000,
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    const summary = data.choices?.[0]?.message?.content || ''
    return { summary: summary.trim(), error: null }
  } catch (err) {
    return { summary: null, error: err }
  }
}

export async function checkAutonomousMessage(character, recentMessages, apiKey) {
  const model = getModel()
  const prompt = character.autoMessagePrompt || ''

  const context = recentMessages.slice(-4).map(m => {
    const prefix = m.role === 'user' ? '用户' : (character.name || '角色')
    return prefix + ': ' + (m.content || '').slice(0, 500)
  }).join('\n')

  const systemPrompt =
    '你是' + (character.name || '角色') + '。\n' +
    (prompt ? '【自主消息规则】\n' + prompt + '\n\n' : '') +
    '请根据最近对话和自主消息规则，判断角色现在是否会主动再发一条消息。\n' +
    '只输出JSON：{"send": true/false, "delay_minutes": 数字, "content": "消息内容"}\n' +
    'delay_minutes 表示多少分钟后发送（建议1-5分钟），content为角色要说的内容。'

  try {
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '最近对话：\n' + context + '\n\n请判断角色是否要主动发送消息。只输出JSON。' },
        ],
        stream: false,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    const result = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    return { result, error: null }
  } catch (err) {
    return { result: null, error: err }
  }
}

export async function checkActiveMessage(character, minutesSinceLast, apiKey) {
  const model = getModel()
  const now = new Date()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const timeStr = '周' + weekDays[now.getDay()] + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

  const systemPrompt =
    '你是' + (character.name || '角色') + '。\n' +
    (character.background ? character.background + '\n\n' : '') +
    (character.activePrompt ? '【主动消息指令】\n' + character.activePrompt + '\n\n' : '') +
    '现在的时间是' + timeStr + '，\n' +
    '距离上次对话已过去' + minutesSinceLast + '分钟。\n' +
    '根据你的性格设定和主动消息指令，你现在是否会主动发消息给用户？\n' +
    '如果会，回复JSON：{"send": true, "messages": ["消息1", "消息2"], "delay_seconds": 数字}\n' +
    'delay_seconds是你发送前等待的秒数（建议10-120），体现真实感。\n' +
    'messages是你这次要发的消息，1-3条，像真人微信聊天一样简短。\n' +
    '如果不会，回复：{"send": false}\n' +
    '只返回JSON不要其他内容。'

  try {
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '请判断是否要主动发消息。只输出JSON。' },
        ],
        stream: false,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    const result = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    return { result, error: null }
  } catch (err) {
    return { result: null, error: err }
  }
}
