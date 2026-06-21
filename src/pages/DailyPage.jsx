import { useState, useEffect, useRef, useCallback } from 'react'
import { sendDailyChatMessage, judgeDailyAffection } from '../utils/deepseek'
import { getApiKey } from '../utils/storage'
import { initBridgeForFolder, getFolderUIState, dailyTurnStart, dailyTurnEnd } from '../state/stateBridge'
import { getSave, getOrCreateDefaultSave, getSaveMessages, saveSaveMessages, getFolder } from '../state/folderStore'
import { getActiveAccount } from '../state/accountStore'
import { HydrationEngine } from '../engine/hydrationEngine'
import { getRawFolderUSK } from '../state/stateBridge'
import ProgressBar from '../components/ProgressBar'
import StatusPanel from '../components/StatusPanel'
import { buildPersonaFromUSK, decideBehavior, getPersonaPromptSuffix } from '../runtime/personaStateEngine'
import { generateBurstSchedule } from '../runtime/dailyGuard'

/**
 * DailyPage — DAILY MODE ONLY. Pure WeChat bubble UI. NO LONG TEXT. NO NARRATIVE.
 * Completely isolated from DramaPage. Uses folder USK + folder saves.
 *
 * Layout: CharacterSidebar (left) | Chat Bubbles (center) | StatusPanel (right)
 */

export default function DailyPage({ folderId, folderChars, saveId: propSaveId, onBack }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [affection, setAffection] = useState(50)
  const [affectionFlash, setAffectionFlash] = useState(null)
  const [relationship, setRelationship] = useState({ affection: 50, trust: 30, dependency: 30 })
  const [emotion, setEmotion] = useState({ anger: 5, sadness: 5, jealousy: 5, anxiety: 10, curiosity: 30, excitement: 20 })
  const [tension, setTension] = useState({ unresolved_conflicts: 0, emotional_pressure: 20, attraction_tension: 40, power_imbalance: 50 })
  const [life, setLife] = useState({ mood: 60, lonely: 40, busy: 20, tired: 15 })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [saveId, setSaveId] = useState(null)
  const [activeCharIndex, setActiveCharIndex] = useState(0)
  const [autoMsgEnabled, setAutoMsgEnabled] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const autoMsgTimerRef = useRef(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)

  const mainChar = folderChars[activeCharIndex] || folderChars[0] || {}
  const apiKey = getApiKey()

  // ── Refresh UI state from USK ──
  const refreshUSK = useCallback(() => {
    const uiState = getFolderUIState(mainChar.name)
    const defaultAffection = mainChar.affectionInitial ?? 50
    if (uiState) {
      setAffection(uiState.relationship?.affection ?? defaultAffection)
      setRelationship(uiState.relationship || { affection: defaultAffection, trust: 30, dependency: 30 })
      setEmotion(uiState.emotion || {})
      setTension(uiState.tension || {})
      setLife(uiState.life || {})
    } else {
      // USK not initialized — use character defaults
      setAffection(defaultAffection)
    }
  }, [mainChar.name])

  // ── Init: hydration → save → USK ──
  useEffect(() => {
    // 1. Try HydrationEngine cache first (back-navigation recovery)
    const cached = HydrationEngine.get(folderId, 'daily')
    if (cached && cached.messages.length > 0) {
      setMessages(cached.messages)
    }

    // 2. Load from folder save — prefer explicit saveId prop
    const save = propSaveId ? { id: propSaveId } : getOrCreateDefaultSave(folderId)
    if (!save) return
    setSaveId(save.id)

    if (!cached || cached.messages.length === 0) {
      const msgs = getSaveMessages(save.id, folderId, 'daily')
      setMessages(msgs)
    }

    // 3. Init folder USK (per-save isolation)
    const charsForUSK = folderChars.map(c => ({ id: c.name, name: c.name, affectionInitial: c.affectionInitial ?? 50 }))
    initBridgeForFolder(folderId, charsForUSK, 'daily', save?.id)
    refreshUSK()
  }, [folderId])

  // ── Save state to HydrationEngine on each message change ──
  useEffect(() => {
    if (messages.length > 0) {
      const usk = getRawFolderUSK()
      HydrationEngine.save(folderId, 'daily', messages, usk)
    }
  }, [messages, folderId])

  // ── Auto-save ──
  useEffect(() => {
    if (saveId && messages.length > 0) {
      saveSaveMessages(saveId, folderId, 'daily', messages)
    }
  }, [messages, saveId, folderId])

  // ── Initiative Engine v4 — auto-message scheduler ──
  useEffect(() => {
    if (!autoMsgEnabled || messages.length === 0) return
    const chance = (affection * 0.005 + (life?.lonely || 40) * 0.004 + (tension?.unresolved_conflicts || 30) * 0.003)
    const interval = 15000 + Math.random() * 25000 // 15-40s between checks
    autoMsgTimerRef.current = setInterval(() => {
      if (Math.random() < Math.min(chance, 0.15)) {
        generateAutoMessage()
      }
    }, interval)
    return () => { if (autoMsgTimerRef.current) clearInterval(autoMsgTimerRef.current) }
  }, [autoMsgEnabled, affection, life, tension, messages.length])

  const generateAutoMessage = useCallback(async () => {
    if (!apiKey || loading) return
    setIsTyping(true)
    try {
      const folder = getFolder(folderId)
      const mergedBg = mainChar.background || (folder ? folder.worldview : '') || ''
      const playerAcct = getActiveAccount()
      const char = {
        id: mainChar.id || folderId, name: mainChar.name, chatStyle: 'casual',
        background: mergedBg, personality: mainChar.personality || '',
        speakingStyle: mainChar.speakingStyle || '',
        styleRules: mainChar.styleRules || [], forbiddenWords: mainChar.forbiddenWords || [],
        temperature: mainChar.temperature ?? 0.9, topP: mainChar.topP ?? 0.95,
        contextWindow: mainChar.contextWindow || 40,
        _playerProfile: playerAcct ? { _id: playerAcct.id || '', name: playerAcct.name || '', gender: playerAcct.gender || '', personalityTags: playerAcct.personalityTags || [], description: playerAcct.description || '' } : null,
      }
      // Initiative prompt: character reaches out proactively, very short
      const systemCtx = { role: 'system', content: '【Daily v4 主动消息】你主动给对方发了一条微信。像突然想到对方了。只发 1 条，5-15 字。不解释自己为什么发。例："在干嘛" / "刚看到个东西" / "[表情包]"' }
      const ctxMsgs = [...messages.slice(-6), systemCtx]
      const uskState = { characters: { [mainChar.name]: { relationship, emotion, tension, life } } }
      const { reply, packet, error: apiError } = await sendDailyChatMessage(
        char, ctxMsgs, affection, apiKey, uskState,
        { characters: [{ type: 'romance', name: mainChar.name, affectionEnabled: true, affectionInitial: mainChar.affectionInitial ?? 50 }] }
      )
      if (apiError) { alert('主动消息请求失败：' + (apiError.message || apiError)); return }
      if (!packet || !packet.bubbles || packet.bubbles.length === 0) return
      // v4 queue renderer — initiative bubble with natural delay
      const bubble = packet.bubbles[0]
      const delay = bubble.delay || 600
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + '_auto',
          role: 'assistant',
          content: bubble.text,
          type: bubble.type || 'text',
          timestamp: Date.now(),
          isAutonomous: true,
          _isBubble: true,
        }])
      }, delay)
      // Update USK with initiative event
      dailyTurnEnd(mainChar.name, { reply: bubble.text, emotion_delta: packet.emotion_delta || 0, relationship_delta: packet.relationship_delta || 0 })
      refreshUSK()
    } catch (err) { alert('主动消息异常：' + (err.message || err)) } finally { setIsTyping(false) }
  }, [apiKey, loading, mainChar, folderId, affection, relationship, emotion, tension, life, messages])

  // ── Scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send ──
  const doSend = useCallback(async (userText) => {
    if (!apiKey) { setError('请先配置 API Key'); return }
    setError('')
    setLoading(true)
    setIsTyping(true) // start typing indicator immediately, no flicker

    const userMsg = { role: 'user', content: userText, timestamp: Date.now() }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')

    // Merge folder-level worldview into character for LLM prompt
    const folder = getFolder(folderId)
    const mergedBackground = mainChar.background || (folder ? folder.worldview : '') || ''
    const playerAcct = getActiveAccount()

    const char = {
      id: mainChar.id || folderId,
      name: mainChar.name,
      chatStyle: 'casual',
      background: mergedBackground,
      personality: mainChar.personality || '',
      speakingStyle: mainChar.speakingStyle || '',
      styleRules: mainChar.styleRules || [],
      forbiddenWords: mainChar.forbiddenWords || [],
      affectionEnabled: mainChar.affectionEnabled !== false,
      affectionInitial: mainChar.affectionInitial ?? 50,
      temperature: mainChar.temperature ?? 0.9,
      topP: mainChar.topP ?? 0.95,
      contextWindow: mainChar.contextWindow || 40,
      thinkingEnabled: mainChar.thinkingEnabled || false,
      nickname: mainChar.nickname || '',
      _playerProfile: playerAcct ? { _id: playerAcct.id || '', name: playerAcct.name || '', gender: playerAcct.gender || '', personalityTags: playerAcct.personalityTags || [], description: playerAcct.description || '' } : null,
    }

    const uskState = { characters: { [mainChar.name]: { relationship, emotion, tension, life } } }
    const uskSnapshot = getFolderUIState(mainChar.name)

    // ── v3 Persona Engine: state → behavior → intent ──
    const persona = buildPersonaFromUSK(uskSnapshot)
    const behavior = decideBehavior(persona)
    const personaSuffix = getPersonaPromptSuffix(persona, behavior)
    // Inject persona behavior as system message (highest priority context)
    const sendMsgs = personaSuffix
      ? [...newMsgs, { role: 'system', content: personaSuffix }]
      : newMsgs

    try {
      const { reply, packet, reasoningContent, usage, error: apiError } = await sendDailyChatMessage(
        char, sendMsgs, affection, apiKey, uskState,
        { characters: [{ type: 'romance', name: mainChar.name, affectionEnabled: true, affectionInitial: mainChar.affectionInitial ?? 50 }] }
      )

      setLoading(false)

      if (apiError || !reply) {
        setError(apiError?.message || '请求失败')
        setIsTyping(false)
        return
      }

      // ── Daily v4: structured packet → queue renderer ──
      const bubbles = (packet && packet.bubbles && packet.bubbles.length > 0)
        ? packet.bubbles
        : [{ text: reply.slice(0, 60), type: 'text', delay: 800 }]

      // ── Daily v4 Affection Judge: independent LLM scoring ──
      const judgeResult = await judgeDailyAffection(
        char, affection, userText, reply, apiKey
      ).catch(() => ({ delta: 0 }))
      const judgedDelta = judgeResult.delta || 0

      // Update USK with JUDGE's delta (NOT LLM's self-report)
      dailyTurnEnd(mainChar.name, {
        reply,
        emotion_delta: packet?.emotion_delta ?? 0,
        relationship_delta: judgedDelta,
      })
      refreshUSK()

      // Set affection flash for UI animation
      if (judgedDelta !== 0) {
        setAffectionFlash(judgedDelta > 0 ? judgedDelta : judgedDelta)
        setTimeout(() => setAffectionFlash(null), 2500)
      }

      // ── v6 Queue Renderer: Human Burst Scheduler → true WeChat pacing ──
      const schedule = generateBurstSchedule(affection, bubbles.length)
      const typingDelay = schedule.delays[0] || 800

      // "已读不回" effect — show typing indicator, then nothing for a while
      if (schedule.hasReadReceipt) {
        setTimeout(() => {
          setIsTyping(false)
          // After a pause, maybe send something or stay silent
        }, typingDelay + 2000)
        return // character read it but didn't reply yet
      }

      setTimeout(() => {
        try {
          setIsTyping(false)
          // Schedule each bubble with human-like pacing from burst scheduler
          let cumulativeDelay = 0
          const sendCount = Math.min(schedule.count, bubbles.length)
          for (let i = 0; i < sendCount; i++) {
            const bubble = bubbles[i]
            // Use scheduler delays, fall back to bubble-provided delay
            const delay = schedule.delays[i] || bubble.delay || (500 + i * 300)
            cumulativeDelay += delay
            setTimeout(() => {
              setMessages(prev => [...prev, {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5) + '_' + i,
                role: 'assistant',
                content: bubble.text,
                type: bubble.type || 'text',
                timestamp: Date.now(),
                _isBubble: true,
                _behavior: behavior,
                reasoningContent: i === 0 ? reasoningContent : null,
                usage: i === 0 ? usage : null,
              }])
            }, cumulativeDelay)
          }
        } catch (err) {
          setIsTyping(false)
          alert('气泡渲染异常：' + (err.message || err))
        }
      }, typingDelay)
    } catch (e) {
      setLoading(false)
      setIsTyping(false)
      setError(e.message)
    }
  }, [messages, affection, apiKey, folderId, mainChar, folderChars, relationship, emotion, tension, life, refreshUSK])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    doSend(text)
  }

  // ── Bubble renderer ──
  const renderBubble = (msg, i) => {
    const isUser = msg.role === 'user'
    const isLastMsg = i === messages.length - 1
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''

    if (isUser) {
      return (
        <div key={msg.id || i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px', animation: 'fadeIn 0.25s ease-out' }}>
          <div style={{ maxWidth: '72%' }}>
            <div style={{
              padding: '10px 14px', borderRadius: '16px 16px 4px 16px',
              background: 'var(--text)', color: 'var(--bg)',
              fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
            {time && (
              <div style={{ fontSize: '9px', color: 'var(--text3)', textAlign: 'right', marginTop: '2px', paddingRight: '4px' }}>{time}</div>
            )}
          </div>
        </div>
      )
    }

    // ── v4: each bubble is a standalone message ──
    const showAvatar = i === 0 || messages[i - 1]?.role !== 'assistant' || messages[i - 1]?.isAutonomous !== msg.isAutonomous
    return (
      <div key={msg.id || i} style={{ display: 'flex', marginBottom: '6px', animation: 'fadeIn 0.25s ease-out' }}>
        {showAvatar ? (
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: mainChar.avatar ? 'transparent' : 'var(--purple)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 500, flexShrink: 0, marginRight: '8px', marginTop: '2px',
            overflow: 'hidden',
          }}>
            {mainChar.avatar ? <img src={mainChar.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (mainChar.name || '?')[0]}
          </div>
        ) : (
          <div style={{ width: '32px', flexShrink: 0, marginRight: '8px' }} />
        )}

        <div style={{ maxWidth: '72%' }}>
          <div style={{
            padding: '10px 14px', borderRadius: '4px 16px 16px 16px',
            background: 'var(--bg2)', color: 'var(--text)',
            fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            animation: 'fadeIn 0.2s ease-out',
          }}>
            {msg.content}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', background: 'var(--bg)' }}>
      {/* ── LEFT: Character Sidebar (56px, round avatars) ── */}
      <div style={{
        width: '56px', flexShrink: 0, borderRight: '0.5px solid var(--border2)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '16px', padding: '12px 0', overflowY: 'auto',
      }}>
        {folderChars.map((c, i) => {
          const isActive = i === activeCharIndex
          const unread = 0 // placeholder for future unread tracking
          return (
            <div key={i} style={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => { setActiveCharIndex(i); refreshUSK() }}
            >
              <div style={{
                width: '40px', height: '40px', borderRadius: '20px',
                overflow: 'hidden', background: 'var(--bg3)',
                border: isActive ? '2px solid var(--purple)' : '0.5px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border 0.15s',
              }}>
                {c.avatar ? (
                  <img src={c.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--purple)' }}>{(c.name || '?')[0]}</span>
                )}
              </div>
              {/* Unread badge */}
              {unread > 0 && (
                <span style={{
                  position: 'absolute', top: '-2px', right: '-2px',
                  minWidth: '16px', height: '16px', borderRadius: '8px',
                  background: 'var(--coral)', color: '#fff', fontSize: '9px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px', fontWeight: 600,
                }}>{unread > 99 ? '99+' : unread}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── CENTER: Chat Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '0 12px', height: '48px',
          borderBottom: '0.5px solid var(--border2)', flexShrink: 0, gap: '8px',
        }}>
          <button onClick={onBack} style={{
            width: '32px', height: '32px', borderRadius: '12px', border: 'none',
            background: 'var(--bg2)', cursor: 'pointer', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{mainChar.name || '角色'} · 日常</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '12px', color: 'var(--purple)', fontWeight: 500 }}>♥ {affection}</span>
          <button onClick={() => setAutoMsgEnabled(v => !v)} title={autoMsgEnabled ? '关闭主动消息' : '开启主动消息'} style={{
            marginLeft: '8px', padding: '2px 10px', borderRadius: '10px', border: autoMsgEnabled ? '1px solid var(--purple)' : '0.5px solid var(--border)',
            background: autoMsgEnabled ? 'var(--purple-l)' : 'var(--bg)', color: autoMsgEnabled ? 'var(--purple)' : 'var(--text3)',
            fontSize: '10px', cursor: 'pointer', fontWeight: autoMsgEnabled ? 500 : 400,
          }}>{autoMsgEnabled ? '自动 ✓' : '自动'}</button>
        </div>

        {/* Thin affection bar */}
        <div style={{ padding: '4px 12px', borderBottom: '0.5px solid var(--border2)', flexShrink: 0 }}>
          <ProgressBar value={affection} color="var(--purple)" height={2} flash={affectionFlash} />
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '60px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>💬</div>
              <div style={{ fontSize: '14px' }}>开始聊天</div>
              <div style={{ fontSize: '11px', marginTop: '2px' }}>像微信一样发消息</div>
            </div>
          )}

          {messages.map((msg, i) => renderBubble(msg, i))}

          {/* Typing indicator — only isTyping, not loading (prevents flicker) */}
          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', animation: 'fadeIn 0.2s ease-out' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'var(--purple)', color: '#fff', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 500, flexShrink: 0,
              }}>
                {(mainChar.name || '?')[0]}
              </div>
              <div style={{
                padding: '8px 14px', borderRadius: '4px 16px 16px 16px',
                background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text3)' }}>正在输入</span>
                <span style={{ display: 'inline-flex', gap: '2px' }}>
                  <span className="dot-bounce" style={{ width: '3px', height: '3px', borderRadius: '1.5px', background: 'var(--text3)' }} />
                  <span className="dot-bounce" style={{ width: '3px', height: '3px', borderRadius: '1.5px', background: 'var(--text3)', animationDelay: '0.2s' }} />
                  <span className="dot-bounce" style={{ width: '3px', height: '3px', borderRadius: '1.5px', background: 'var(--text3)', animationDelay: '0.4s' }} />
                </span>
              </div>
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: '8px', color: 'var(--coral)', fontSize: '12px', background: 'var(--coral-l)', borderRadius: '8px', marginTop: '8px' }}>
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '8px 12px', borderTop: '0.5px solid var(--border)', flexShrink: 0, display: 'flex', gap: '8px' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="输入消息…"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '20px',
              border: '0.5px solid var(--border)', background: 'var(--bg2)',
              fontSize: '14px', color: 'var(--text)', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              width: '40px', height: '40px', borderRadius: '20px', border: 'none',
              background: loading || !input.trim() ? 'var(--bg3)' : 'var(--text)',
              color: loading || !input.trim() ? 'var(--text3)' : 'var(--bg)',
              fontSize: '16px', cursor: loading || !input.trim() ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
      </div>

      {/* ── RIGHT: Status Panel (collapsible) ── */}
      <StatusPanel
        characterName={mainChar.name || ''}
        relationship={relationship}
        emotion={emotion}
        life={life}
        affectionFlash={affectionFlash}
        collapsed={panelCollapsed}
        onToggle={() => setPanelCollapsed(v => !v)}
      />
    </div>
  )
}
