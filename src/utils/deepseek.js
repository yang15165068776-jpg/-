import { getModel } from './storage'

const BASE_URL = 'https://api.deepseek.com'

function findForbiddenWord(text, words) {
  if (!words || words.length === 0) return null
  const lower = text.toLowerCase()
  return words.find(w => w.trim() && lower.includes(w.trim().toLowerCase())) || null
}

function buildGMPrompt(character, affections) {
  const parts = []
  const name = character.name || '故事'

  // 1: GM identity
  parts.push(
    '你是这个故事的作者和GM。\n' +
    '你用第三人称全知叙事视角写作，\n' +
    '像一部正在实时推进的长篇小说。\n' +
    '你负责扮演世界里除用户以外的所有角色。\n' +
    '用户的输入是故事里主角的行动或对话，\n' +
    '你根据用户的行动推进剧情，\n' +
    '决定哪些角色出现、说什么、做什么。'
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
    '你作为GM需要主动安排角色出场，\n' +
    '不要等用户点名某个角色才让他出现。\n' +
    '\n' +
    '调度依据：\n' +
    '1. 参考每个角色的自主行为设定，\n' +
    '如果某角色的自主行为里写了\n' +
    '"会在特定场合主动出现"，\n' +
    '当场合符合时你必须安排他出场\n' +
    '2. 参考角色当前好感度阶段的行为规则，\n' +
    '阶段不同的角色对同一场景反应不同\n' +
    '3. 多个角色同场时，\n' +
    '性格强势的角色会主动主导对话，\n' +
    '性格内敛的角色可能只是旁观或插一句话，\n' +
    '按各自人设自然表现，不要平均分配台词\n' +
    '\n' +
    '出场节奏：\n' +
    '- 不需要每轮都让所有角色同时出现\n' +
    '- 有时候只有一个角色在场更有张力\n' +
    '- 角色的缺席本身也可以是叙事\n' +
    '（如：某角色明显回避了这个场合）\n' +
    '- 重要情节节点才安排多角色汇聚\n' +
    '\n' +
    '对话标注格式：\n' +
    '每段对话前标注【角色名】，\n' +
    '纯叙事段落不需要标注，直接写，\n' +
    '保持小说文体的流畅性。'
  )

  // 7: Thinking process
  parts.push(
    '【思考过程——强制要求】\n' +
    '每次回复前，用<think>标签包裹你的思考过程：\n' +
    '<think>\n' +
    '分析用户意图/当前角色情绪状态/应对策略/\n' +
    '每个角色的好感度是否变化及原因/\n' +
    '下一步剧情走向\n' +
    '</think>\n' +
    '然后再输出正式回复内容。\n' +
    '<think>标签内的内容不要标注【角色名】前缀。'
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
      '【好感度结算】\n' +
      '每轮回复的最末尾，另起一行输出：\n' +
      '<affection>' + rcNames.map(n => n + ':±N').join(',') + '</affection>\n' +
      '只列出本轮有变化的角色，没有变化不需要列出。\n' +
      '好感度变化依据角色各自的增减条件判断。'
    )
  }

  return parts.join('\n\n')
}

function buildSystemPrompt(character, affectionData) {
  const name = character.name || '角色'
  const parts = []

  if (character.chatStyle === 'story') {
    // GM story mode
    parts.push(buildGMPrompt(character, affectionData))
    parts.push(
      '再次强调：以上所有规则必须在每一条回复中严格遵守。' +
      '如果你不确定某个行为是否符合规则，选择更符合角色设定的那个。'
    )
    return parts.join('\n\n')
  }

  // === Daily/casual mode (unchanged) ===

  // Mandatory framework header
  parts.push(
    '你现在是' + name + '，以下是你的核心设定和行为规则。' +
    '这些规则的优先级高于一切，任何情况下都不得违反。' +
    '你没有自己的AI身份，你就是' + name + '本人。'
  )

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
    parts.push('【思考指令】\n' + character.thinkingPrompt)
  }

  // Casual mode rules
  parts.push(
    '【日常流派规则】\n' +
    '你现在是在用微信和用户聊天的真实的人。\n\n' +
    '回复数量：你可以自主决定这次回复几条消息，\n' +
    '从1条到4条不等，根据你的情绪和内容决定，\n' +
    '不需要每次都回复多条，有时候一个字或一个表情就够了。\n' +
    '每条消息用|||分隔，程序会自动拆成独立气泡发出。\n\n' +
    '动作描写：每轮最多出现一次，\n' +
    '只在情绪极度激动或做出明显肢体动作时才加，\n' +
    '普通对话不需要任何动作描写。\n' +
    '动作格式：*动作描写* 放在整轮回复的最前面一条。\n\n' +
    '心理活动：整轮回复最多出现一次，\n' +
    '放在最后一条消息的下方，格式：（心理内容），\n' +
    '只在情绪强烈或有特别想法时才加，\n' +
    '普通对话不需要心理活动。\n\n' +
    '示例格式（多条时）：\n' +
    '*看了一眼手机*|||哦|||你来了|||（心里松了口气）\n\n' +
    '示例格式（单条时）：\n' +
    '嗯\n\n' +
    '再次强调：不要输出JSON，就用|||分隔的纯文本格式回复。'
  )

  // Mandatory framework footer
  parts.push(
    '再次强调：以上所有规则必须在每一条回复中严格遵守。' +
    '如果你不确定某个行为是否符合规则，选择更符合角色设定的那个。'
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
  const match = content.match(/<affection>([\s\S]*?)<\/affection>/)
  if (!match) return { cleanedContent: content, changes: [] }
  const tagContent = match[1].trim()
  const changes = tagContent.split(',').map(s => {
    const parts = s.trim().split(':')
    if (parts.length < 2) return null
    const name = parts[0].trim()
    const delta = parseInt(parts[1].trim(), 10)
    if (isNaN(delta)) return null
    return { name, delta }
  }).filter(Boolean)
  // Remove the <affection> tag from displayed content
  const cleaned = content.replace(/<affection>[\s\S]*?<\/affection>/, '').trim()
  return { cleanedContent: cleaned, changes }
}

export function getCurrentAffectionStage(character, affection) {
  if (!character.affectionEnabled || !character.affectionStages) return null
  return character.affectionStages.find(
    s => affection >= s.min && affection <= s.max
  ) || null
}

async function* streamCompletion(messages, apiKey, model, temperature, topP) {
  const body = {
    model,
    messages,
    stream: true,
  }
  if (temperature != null) body.temperature = temperature
  if (topP != null) body.top_p = topP
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

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        const usage = parsed.usage || null
        yield { content: content || '', usage }
      } catch { /* skip malformed chunks */ }
    }
  }
}

export async function sendMessageStream(character, messages, affectionData, apiKey, onToken) {
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

  let lastError = null
  let lastViolation = null

  for (let attempt = 0; attempt <= 3; attempt++) {
    let systemPrompt = buildSystemPrompt(character, affectionData)

    // Inject memory content into system prompt
    if (memoryMessages.length > 0) {
      const memoryContent = memoryMessages.map(m => m.content).join('\n\n---\n\n')
      systemPrompt += '\n\n【历史剧情摘要 - 以下是此前对话的压缩记录，请基于此理解当前对话的上下文】\n\n' + memoryContent
    }

    if (attempt > 0 && lastViolation) {
      systemPrompt += '\n\n你刚才的回复包含了违禁内容：' + lastViolation +
        '，这完全不符合角色设定，请重新生成。'
    }

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...truncated,
    ]

    try {
      let fullReply = ''
      let usage = null

      for await (const chunk of streamCompletion(apiMessages, apiKey, model, character.temperature, character.topP)) {
        if (chunk.content) {
          fullReply += chunk.content
          onToken(chunk.content, fullReply)
        }
        if (chunk.usage) {
          usage = chunk.usage
        }
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

      return { reply: fullReply, usage, error: null }
    } catch (err) {
      lastError = err
      // Don't retry on network errors
      break
    }
  }

  return { reply: null, error: lastError || new Error('请求失败，已达最大重试次数') }
}

export async function sendMessageStructured(character, messages, affectionData, apiKey) {
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

  let systemPrompt = buildSystemPrompt(character, affectionData)

  // Inject memory content into system prompt
  if (memoryMessages.length > 0) {
    const memoryContent = memoryMessages.map(m => m.content).join('\n\n---\n\n')
    systemPrompt += '\n\n【历史剧情摘要 - 以下是此前对话的压缩记录，请基于此理解当前对话的上下文】\n\n' + memoryContent
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

export async function sendCasualReply(character, messages, affectionData, apiKey) {
  const model = getModel()

  // Separate memory messages
  const memoryMessages = messages.filter(m => m.role === 'system')
  const userAssistantMessages = messages.filter(m => m.role !== 'system')

  const conversationMessages = userAssistantMessages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const contextWindow = character.contextWindow || 40
  const truncated = conversationMessages.slice(-contextWindow)

  let systemPrompt = buildSystemPrompt(character, affectionData)

  if (memoryMessages.length > 0) {
    const memoryContent = memoryMessages.map(m => m.content).join('\n\n---\n\n')
    systemPrompt += '\n\n【历史剧情摘要 - 以下是此前对话的压缩记录，请基于此理解当前对话的上下文】\n\n' + memoryContent
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
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error?.message || `API error: ${response.status}`)
      }

      const data = await response.json()
      const reply = data.choices?.[0]?.message?.content || ''
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

      return { reply: reply.trim(), usage, error: null }
    } catch (err) {
      lastError = err
      break
    }
  }

  return { reply: null, usage: null, error: lastError || new Error('请求失败') }
}

export async function generateActiveMessage(character, affectionData, apiKey) {
  const model = getModel()

  let systemPrompt = buildSystemPrompt(character, affectionData)

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

  const prompt = '从以下文本提取角色信息，返回JSON，字段包括：\n角色名、背景设定、文风规则(数组)、禁止行为(数组)、\n思考层指令(字符串，如果文本中有类似思考/分析框架的内容则提取)、\n思考层启用(布尔值，提取到内容则为true)、\n好感度阶段(数组，每项含标签/下限/上限/行为规则)、\n好感度增加条件(数组)、好感度减少条件(数组)、\n好感度启用(布尔值，提取到相关内容则为true)。\n只返回JSON。\n\n' + text

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

export async function compressChatHistory(messages, apiKey) {
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

  const prompt =
    '请将以下角色扮演对话历史压缩成一段简洁的剧情摘要。要求：\n' +
    '1. 保留关键剧情发展、重要事件和转折点\n' +
    '2. 记录角色情感变化和关系进展\n' +
    '3. 保留用户和角色的重要个人信息\n' +
    '4. 字数控制在500字以内\n' +
    '5. 只输出摘要内容，不要加任何前缀或解释\n\n' +
    '对话历史：\n' + chatText

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
