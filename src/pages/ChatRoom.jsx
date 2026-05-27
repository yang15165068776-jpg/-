import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getCharacter,
  getChatMessages,
  saveChatMessages,
  getAffection,
  saveAffection,
  clearChatHistory,
} from '../utils/storage'
import { sendMessageStream, generateActiveMessage, getCurrentAffectionStage } from '../utils/deepseek'
import { getApiKey, getUserAvatar } from '../utils/storage'

function Avatar({ src, name, className }) {
  const initial = (name || '?')[0]
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`w-9 h-9 rounded-md object-cover flex-shrink-0 ${className || ''}`}
      />
    )
  }
  return (
    <div className={`w-9 h-9 rounded-md bg-gray-600 flex items-center justify-center flex-shrink-0 text-white text-sm font-medium ${className || ''}`}>
      {initial}
    </div>
  )
}

export default function ChatRoom({ characterId, onBack }) {
  const [character, setCharacter] = useState(null)
  const [messages, setMessages] = useState([])
  const [affection, setAffection] = useState(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [userAvatar, setUserAvatarState] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const activeTimerRef = useRef(null)
  const lastActivityRef = useRef(Date.now())

  useEffect(() => {
    const char = getCharacter(characterId)
    setCharacter(char)
    setMessages(getChatMessages(characterId))
    setUserAvatarState(getUserAvatar())

    if (char?.affectionEnabled) {
      const saved = getAffection(characterId)
      setAffection(saved !== null ? saved : char.affectionInitial)
    }
  }, [characterId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    if (character) {
      saveChatMessages(characterId, messages)
    }
  }, [messages, characterId, character])

  useEffect(() => {
    if (character?.affectionEnabled && affection !== null) {
      saveAffection(characterId, affection)
    }
  }, [affection, characterId, character])

  // Active message timer
  useEffect(() => {
    if (!character?.activeMessageEnabled) return
    const intervalMin = character.activeInterval || 10

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const checkAndSend = async () => {
      const elapsed = Date.now() - lastActivityRef.current
      const threshold = intervalMin * 60 * 1000
      if (elapsed < threshold) return

      const apiKey = getApiKey()
      if (!apiKey) return

      // Don't send if already loading
      const msgs = getChatMessages(characterId)
      const lastMsg = msgs[msgs.length - 1]
      if (lastMsg?.role === 'assistant' && Date.now() - lastActivityRef.current < threshold * 2) {
        // Don't spam - only one active message per interval window
        return
      }

      const { reply, error } = await generateActiveMessage(character, affection, apiKey)
      if (error || !reply) return

      // Append active message
      const activeMsg = { role: 'assistant', content: reply }
      const updated = [...msgs, activeMsg]
      saveChatMessages(characterId, updated)
      setMessages(updated)

      // Browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(character.name, {
          body: reply.slice(0, 120),
          icon: character.avatar || undefined,
          tag: characterId,
        })
      }

      lastActivityRef.current = Date.now()
    }

    activeTimerRef.current = setInterval(checkAndSend, intervalMin * 60 * 1000)

    return () => {
      if (activeTimerRef.current) {
        clearInterval(activeTimerRef.current)
      }
    }
  }, [character?.activeMessageEnabled, character?.activeInterval, characterId])

  const adjustAffection = useCallback((delta) => {
    setAffection(prev => Math.min(100, Math.max(0, prev + delta)))
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || !character) return

    const apiKey = getApiKey()
    if (!apiKey) {
      setError('请先在设置页面填写 DeepSeek API Key')
      return
    }

    setInput('')
    setError('')
    setRetrying(false)
    lastActivityRef.current = Date.now()

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setStreamingText('')
    setLoading(true)

    const { reply, error: apiError } = await sendMessageStream(
      character,
      newMessages,
      affection,
      apiKey,
      (token, fullText, reset) => {
        if (reset) {
          // Retry signal - clear current stream and show retrying indicator
          setStreamingText('')
          setRetrying(true)
          return
        }
        setRetrying(false)
        setStreamingText(fullText)
      }
    )

    setLoading(false)
    setStreamingText('')

    if (apiError || !reply) {
      setError(apiError?.message || '请求失败')
      return
    }

    const assistantMsg = { role: 'assistant', content: reply }
    setMessages([...newMessages, assistantMsg])

    if (character.affectionEnabled) {
      const delta = Math.floor(Math.random() * 5) + 1
      adjustAffection(delta)
    }
  }, [input, loading, character, messages, affection, adjustAffection])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    if (window.confirm('确定要清除所有对话记录吗？')) {
      clearChatHistory(characterId)
      setMessages([])
      if (character?.affectionEnabled) {
        setAffection(character.affectionInitial)
      }
      setError('')
    }
  }

  if (!character) {
    return (
      <div className="p-4 text-center text-gray-500 mt-20">
        <p>加载中...</p>
      </div>
    )
  }

  const stage = character.affectionEnabled
    ? getCurrentAffectionStage(character, affection)
    : null

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Affection bar */}
      {character.affectionEnabled && stage && (
        <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-700/50">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-pink-400">♥</span>
              <span className="text-gray-300">{stage.name}</span>
              <span className="text-gray-500">{affection}/100</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => adjustAffection(-5)}
                className="px-2 py-0.5 rounded bg-gray-700 text-gray-400 hover:text-white text-xs"
                title="手动降低好感度"
              >
                -5
              </button>
              <button
                onClick={() => adjustAffection(5)}
                className="px-2 py-0.5 rounded bg-gray-700 text-gray-400 hover:text-white text-xs"
                title="手动提高好感度"
              >
                +5
              </button>
            </div>
          </div>
          <div className="mt-1 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-rose-400 rounded-full transition-all duration-500"
              style={{ width: `${affection}%` }}
            />
          </div>
        </div>
      )}

      {/* Active message indicator */}
      {character.activeMessageEnabled && (
        <div className="px-4 py-1.5 bg-green-500/10 border-b border-green-500/20 text-center">
          <span className="text-[10px] text-green-400">
            主动消息已开启 · 每{character.activeInterval || 10}分钟检查
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !streamingText && (
          <div className="text-center text-gray-600 mt-8">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm">开始和{character.name}对话吧</p>
            {character.nickname && (
              <p className="text-xs mt-1 text-gray-700">
                角色会称呼你为「{character.nickname}」
              </p>
            )}
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          return (
            <div key={i} className={`flex items-start gap-2 animate-fade-in ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              {isUser ? (
                <Avatar src={userAvatar} name="我" />
              ) : (
                <Avatar src={character.avatar} name={character.name} />
              )}
              <div className={`flex flex-col max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-gray-500 mb-0.5 px-1">
                  {isUser ? '我' : character.name}
                </span>
                <div
                  className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-gray-700 text-gray-100 rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          )
        })}

        {/* Streaming message (typewriter) */}
        {streamingText && (
          <div className="flex items-start gap-2 animate-fade-in">
            <Avatar src={character.avatar} name={character.name} />
            <div className="flex flex-col max-w-[75%]">
              <span className="text-[10px] text-gray-500 mb-0.5 px-1">{character.name}</span>
              <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-gray-700 text-gray-100 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {streamingText}
                <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle" />
              </div>
            </div>
          </div>
        )}

        {/* Loading dots (initial wait before first token) */}
        {loading && !streamingText && !retrying && (
          <div className="flex items-start gap-2 animate-fade-in">
            <Avatar src={character.avatar} name={character.name} />
            <div className="flex flex-col max-w-[75%]">
              <span className="text-[10px] text-gray-500 mb-0.5 px-1">{character.name}</span>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-gray-700">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {retrying && (
          <div className="text-center">
            <p className="text-xs text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg inline-block">
              回复违规，正在重新生成...
            </p>
          </div>
        )}

        {error && (
          <div className="text-center">
            <p className="text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg inline-block">
              {error}
            </p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-700 bg-gray-800/95 backdrop-blur p-3">
        <div className="flex items-end gap-2">
          <button
            onClick={handleClear}
            className="px-2 py-2 text-gray-500 hover:text-red-400 transition-colors text-sm flex-shrink-0"
            title="清除对话"
          >
            🗑
          </button>
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 pr-10 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none"
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              style={{ minHeight: '2.5rem', maxHeight: '8rem' }}
              onInput={(e) => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
              }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium transition-colors active:scale-[0.98] flex-shrink-0"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
