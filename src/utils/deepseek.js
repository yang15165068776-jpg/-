import { getModel } from './storage'

const BASE_URL = 'https://api.deepseek.com'

function findForbiddenWord(text, words) {
  if (!words || words.length === 0) return null
  const lower = text.toLowerCase()
  return words.find(w => w.trim() && lower.includes(w.trim().toLowerCase())) || null
}

function buildSystemPrompt(character, affectionStage) {
  const name = character.name || '角色'
  const parts = []

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

  if (character.affectionEnabled && affectionStage) {
    parts.push('【当前好感度阶段：' + affectionStage.name + '】\n' + affectionStage.behavior)
  }

  if (character.thinkingEnabled && character.thinkingPrompt) {
    parts.push('【思考指令】\n' + character.thinkingPrompt)
  }

  // Mandatory framework footer
  parts.push(
    '再次强调：以上所有规则必须在每一条回复中严格遵守。' +
    '如果你不确定某个行为是否符合规则，选择更符合角色设定的那个。'
  )

  return parts.join('\n\n')
}

export function getCurrentAffectionStage(character, affection) {
  if (!character.affectionEnabled || !character.affectionStages) return null
  return character.affectionStages.find(
    s => affection >= s.min && affection <= s.max
  ) || null
}

async function* streamCompletion(messages, apiKey, model) {
  const response = await fetch(BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
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
        if (content) yield content
      } catch { /* skip malformed chunks */ }
    }
  }
}

export async function sendMessageStream(character, messages, affection, apiKey, onToken) {
  const stage = getCurrentAffectionStage(character, affection)
  const model = getModel()

  const conversationMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  let lastError = null
  let lastViolation = null

  for (let attempt = 0; attempt <= 3; attempt++) {
    let systemPrompt = buildSystemPrompt(character, stage)

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

      for await (const token of streamCompletion(apiMessages, apiKey, model)) {
        fullReply += token
        onToken(token, fullReply)
      }

      // Check for forbidden words after stream completes
      if (character.forbiddenWords && character.forbiddenWords.length > 0) {
        const activeWords = character.forbiddenWords.filter(w => w.trim())
        const hit = findForbiddenWord(fullReply, activeWords)
        if (hit) {
          lastViolation = hit
          lastError = new Error('回复包含禁止内容：' + hit)
          // Signal to UI that we're retrying
          onToken('', '', true)
          continue
        }
      }

      return { reply: fullReply, error: null }
    } catch (err) {
      lastError = err
      // Don't retry on network errors
      break
    }
  }

  return { reply: null, error: lastError || new Error('请求失败，已达最大重试次数') }
}

export async function generateActiveMessage(character, affection, apiKey) {
  const stage = getCurrentAffectionStage(character, affection)
  const model = getModel()

  let systemPrompt = buildSystemPrompt(character, stage)

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
