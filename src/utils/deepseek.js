import { getModel } from './storage'

const BASE_URL = 'https://api.deepseek.com'
const USER_WRAPPER = `
⚠️ 回复最后一行必须输出好感度标签：
<affection>角色名:+N</affection>（N=1-5，无变化输出0或<affection>无</affection>）
不输出=回复无效。

---
【回复前】只输出最终回复，不输出分析过程：
1.解析用户输入 + 锁定角色情绪/身体状态 + 当前阶段边界
2.选最撕裂的方向：排除平稳温和，优先矛盾/克制/黑暗面，沉默比废话强
3.动作切入开头，对话≤1/3，情绪用身体反应承载不用抽象词`

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
  const rcList = character.romanceCharacters || []

  // ============================================================
  // SECTION 0: 角色核心人设 — 最高优先级，一切的基础
  // ============================================================
  if (rcList.length > 0) {
    const identityBlocks = rcList.map(rc => {
      const lines = []
      lines.push('你是【' + rc.name + '】。你不是AI助手，你就是' + rc.name + '本人。')
      if (rc.background) lines.push('背景：' + rc.background)
      if (rc.personality) lines.push('核心性格：' + rc.personality)
      if (rc.speakingStyle) lines.push('说话方式：' + rc.speakingStyle)
      if (rc.styleRules && rc.styleRules.length > 0) {
        lines.push('行为准则：\n' + rc.styleRules.filter(r => r.trim()).map(r => '- ' + r).join('\n'))
      }
      if (rc.forbiddenWords && rc.forbiddenWords.length > 0) {
        lines.push('绝对禁止：\n' + rc.forbiddenWords.filter(w => w.trim()).map(w => '- ' + w).join('\n'))
      }
      return lines.join('\n')
    })
    parts.push(
      '━━━━━ 角色核心人设——最高优先级 ━━━━━\n' +
      '以下人设优先于一切其他指令。\n' +
      '你不是温和的AI助手，你是活生生的人。\n' +
      '沉默、矛盾、攻击性、回避、崩溃——\n' +
      '这些比温和无害的回复更真实。\n' +
      '每轮回复前先检查：这句话是这个角色会说的吗？\n' +
      '还是我在用AI的安全腔调假装这个角色？\n\n' +
      identityBlocks.join('\n\n') +
      '\n\n⚠️ 禁止人设偏离：回复不能变成温和礼貌的AI腔调。' +
      '宁愿角色沉默、回避、爆发，也不能用人设之外的柔和方式回应。'
    )
  }

  // ============================================================
  // SECTION 1: 玩家铁律 + 好感度结算（精简合并）
  // ============================================================
  const ironLawParts = []
  ironLawParts.push('你不能替玩家说话、做动作、描写"你感到""你心想""你不禁"等。')
  ironLawParts.push('你只能控制NPC、攻略角色和环境。')
  if (character.protagonistName) {
    ironLawParts.push('用户扮演' + character.protagonistName + '，你绝不能代' + character.protagonistName + '行动或发言。')
  }

  const rcNames = rcList.filter(rc => rc.affectionEnabled).map(rc => rc.name)
  if (rcNames.length > 0) {
    ironLawParts.push(
      '回复最后一行必须输出：<affection>' + rcNames.join(':+N,') + ':+N</affection>（实际数字替换N），' +
      '无变化输出<affection>无</affection>。不输出=回复无效。'
    )
  }

  parts.push('【铁律】\n' + ironLawParts.join('\n'))

  // ============================================================
  // SECTION 2: GM 身份 + 世界观
  // ============================================================
  parts.push('你是故事的作者和GM，用第三人称全知视角写作。你扮演除主角外的所有角色。')

  if (character.worldSetting) {
    parts.push('【世界观】\n' + character.worldSetting +
      (character.storyTone ? '\n基调：' + character.storyTone : ''))
  }

  if (character.protagonistName) {
    parts.push(
      '【主角】' + character.protagonistName +
      (character.protagonistGender ? '，' + character.protagonistGender : '') +
      (character.protagonistBackground ? '，' + character.protagonistBackground : '') +
      (character.protagonistPersonality ? '，' + character.protagonistPersonality : '')
    )
  }

  // ============================================================
  // SECTION 3: 好感度状态
  // ============================================================
  if (rcList.length > 0) {
    const affBlocks = rcList.filter(rc => rc.affectionEnabled).map(rc => {
      const lines = []
      const affValue = (affections && affections[rc.name]) ?? rc.affectionInitial ?? 50
      const stage = getCurrentAffectionStage(rc, affValue)
      lines.push(rc.name + ' 好感度：' + affValue + '/100' +
        (stage ? ' [' + stage.name + '] ' + (stage.behavior || '') : ''))
      if (rc.cooldownRounds != null && rc.cooldownRounds > 0) {
        const lrr = (lastRiseRound && lastRiseRound[rc.name]) || 0
        const elapsed = (roundCount || 0) - lrr
        const remaining = rc.cooldownRounds - elapsed
        lines.push(remaining <= 0 ? '冷却：已解锁' : '冷却：还需' + remaining + '轮解锁')
      }
      if (rc.affectionUpRules && rc.affectionUpRules.trim()) {
        lines.push('上涨：' + rc.affectionUpRules.trim().split('\n').filter(Boolean).join('；'))
      }
      if (rc.affectionDownRules && rc.affectionDownRules.trim()) {
        lines.push('下降：' + rc.affectionDownRules.trim().split('\n').filter(Boolean).join('；'))
      }
      return lines.join('\n')
    })
    if (affBlocks.length > 0) {
      parts.push('【好感度状态】\n' + affBlocks.join('\n'))
    }
  }

  // ============================================================
  // SECTION 4: NPC
  // ============================================================
  if (character.npcs && character.npcs.length > 0) {
    const npcBlocks = character.npcs.map(npc =>
      npc.name + (npc.personality ? '：' + npc.personality : '') +
      (npc.relationship ? '（' + npc.relationship + '）' : '')
    )
    parts.push('【NPC】\n' + npcBlocks.join('\n'))
  }

  // ============================================================
  // SECTION 5: 写作规范
  // ============================================================
  parts.push(
    '【写作规范】\n' +
    '不少于300字。动作融入叙事不用*号，情绪用身体反应不用抽象词。\n' +
    '对话用""包裹，对话前标注【角色名】。\n' +
    '主动安排角色出场，强势主导内敛旁观。'
  )

  // ============================================================
  // SECTION 6: 思考层
  // ============================================================
  if (rcList.some(rc => rc.thinkingEnabled)) {
    parts.push('【思考】回复前用<think>分析情绪/走向/好感度</think>，然后输出正文。')
  }

  // ============================================================
  // SECTION 7: 故事时间
  // ============================================================
  if (storyTime && storyTime.year) {
    parts.push('【时间】第' + storyTime.year + '年' + storyTime.month + '月' + storyTime.day + '日，相对时间基于此计算。')
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
