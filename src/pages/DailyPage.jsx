import { useState, useEffect, useRef, useCallback } from 'react'
import { sendDailyChatMessage } from '../utils/deepseek'
import { getApiKey } from '../utils/storage'
import { initBridgeForFolder, getFolderUIState, dailyTurnStart, dailyTurnEnd } from '../state/stateBridge'
import { getSave, getOrCreateDefaultSave, getSaveMessages, saveSaveMessages } from '../state/folderStore'
import ProgressBar from '../components/ProgressBar'
import StatusPanel from '../components/StatusPanel'

/**
 * DailyPage — DAILY MODE ONLY. Pure WeChat bubble UI. NO LONG TEXT. NO NARRATIVE.
 * Completely isolated from DramaPage. Uses folder USK + folder saves.
 *
 * Layout: CharacterSidebar (left) | Chat Bubbles (center) | StatusPanel (right)
 */

function parseCasualReply(rawText) {
  return rawText.split('|||')
    .map(s => s.trim().replace(/^\|+|\|+$/g, '').trim())
    .filter(s => s.length > 0)
}

export default function DailyPage({ folderId, folderChars, onBack }) {
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
  const [revealing, setRevealing] = useState(null) // { msgIndex, revealed, total }
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const revealTimerRef = useRef(null)

  const mainChar = folderChars[0] || {}
  const apiKey = getApiKey()

  // ── Refresh UI state from USK ──
  const refreshUSK = useCallback(() => {
    const uiState = getFolderUIState(mainChar.name)
    if (uiState) {
      setAffection(uiState.relationship?.affection ?? 50)
      setRelationship(uiState.relationship || { affection: 50, trust: 30, dependency: 30 })
      setEmotion(uiState.emotion || {})
      setTension(uiState.tension || {})
      setLife(uiState.life || {})
    }
  }, [mainChar.name])

  // ── Init ──
  useEffect(() => {
    const save = getOrCreateDefaultSave(folderId)
    if (!save) return
    setSaveId(save.id)

    // Load DAILY messages (completely isolated from drama)
    const msgs = getSaveMessages(save.id, folderId, 'daily')
    setMessages(msgs)

    // Init folder USK
    const charsForUSK = folderChars.map(c => ({ id: c.name, name: c.name, affectionInitial: c.affectionInitial ?? 50 }))
    initBridgeForFolder(folderId, charsForUSK, 'daily')
    refreshUSK()
  }, [folderId])

  // ── Auto-save ──
  useEffect(() => {
    if (saveId && messages.length > 0) {
      saveSaveMessages(saveId, folderId, 'daily', messages)
    }
  }, [messages, saveId, folderId])

  // ── Scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Cleanup reveal timer ──
  useEffect(() => {
    return () => { if (revealTimerRef.current) clearTimeout(revealTimerRef.current) }
  }, [])

  // ── Send ──
  const doSend = useCallback(async (userText) => {
    if (!apiKey) { setError('请先配置 API Key'); return }
    setError('')
    setLoading(true)

    const userMsg = { role: 'user', content: userText, timestamp: Date.now() }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')

    const char = {
      id: mainChar.id || folderId,
      name: mainChar.name,
      chatStyle: 'casual',
      background: mainChar.background || '',
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
    }

    const uskState = { characters: { [mainChar.name]: { relationship, emotion, tension, life } } }

    try {
      const { reply, reasoningContent, usage, error: apiError } = await sendDailyChatMessage(
        char, newMsgs, affection, apiKey, uskState,
        { characters: [{ type: 'romance', name: mainChar.name, affectionEnabled: true, affectionInitial: mainChar.affectionInitial ?? 50 }] }
      )

      setLoading(false)

      if (apiError || !reply) {
        setError(apiError?.message || '请求失败')
        return
      }

      // Parse into bubbles (||| separator → burst)
      const segments = parseCasualReply(reply)
      const assistantMsg = { role: 'assistant', content: reply, segments, reasoningContent, usage, timestamp: Date.now() }
      const finalMsgs = [...newMsgs, assistantMsg]
      const msgIndex = finalMsgs.length - 1
      setMessages(finalMsgs)

      // Update USK
      dailyTurnEnd(mainChar.name, { reply, delta: 0 })
      refreshUSK()

      // Sequential reveal: burst animation
      setRevealing({ msgIndex, revealed: 0, total: segments.length })
      let revealed = 0
      const revealNext = () => {
        revealed++
        setRevealing({ msgIndex, revealedCount: revealed, totalCount: segments.length })
        if (revealed < segments.length) {
          revealTimerRef.current = setTimeout(revealNext, 500 + Math.random() * 700)
        } else {
          revealTimerRef.current = null
          setRevealing(null)
        }
      }
      revealTimerRef.current = setTimeout(revealNext, 400 + Math.random() * 500)
    } catch (e) {
      setLoading(false)
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
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''

    if (isUser) {
      return (
        <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px', animation: 'fadeIn 0.25s ease-out' }}>
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

    // Assistant — can be multiple bubbles (burst)
    const segments = msg.segments || (msg.content ? [{ text: msg.content }] : [])
    const isRevealing = revealing && revealing.msgIndex === i
    const visibleSegments = isRevealing ? segments.slice(0, revealing.revealedCount) : segments

    return (
      <div key={i} style={{ display: 'flex', marginBottom: '8px', animation: 'fadeIn 0.25s ease-out' }}>
        {/* Avatar */}
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px',
          background: mainChar.avatar ? 'transparent' : 'var(--purple)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 500, flexShrink: 0, marginRight: '8px', marginTop: '2px',
          overflow: 'hidden',
        }}>
          {mainChar.avatar ? <img src={mainChar.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (mainChar.name || '?')[0]}
        </div>

        <div style={{ maxWidth: '72%' }}>
          {visibleSegments.map((seg, si) => (
            <div key={si} style={{
              padding: '10px 14px', borderRadius: '4px 16px 16px 16px',
              background: 'var(--bg2)', color: 'var(--text)',
              fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              marginBottom: si < visibleSegments.length - 1 ? '4px' : 0,
              animation: 'fadeIn 0.2s ease-out',
            }}>
              {seg.text || seg}
            </div>
          ))}
          {isRevealing && revealing.revealedCount < segments.length && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 0' }}>
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>正在输入</span>
              <span style={{ display: 'inline-flex', gap: '2px' }}>
                <span className="dot-bounce" style={{ width: '3px', height: '3px', borderRadius: '1.5px', background: 'var(--text3)' }} />
                <span className="dot-bounce" style={{ width: '3px', height: '3px', borderRadius: '1.5px', background: 'var(--text3)', animationDelay: '0.2s' }} />
                <span className="dot-bounce" style={{ width: '3px', height: '3px', borderRadius: '1.5px', background: 'var(--text3)', animationDelay: '0.4s' }} />
              </span>
            </div>
          )}
          {time && !isRevealing && (
            <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '2px', paddingLeft: '4px' }}>{time} · 已读</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', background: 'var(--bg)' }}>
      {/* ── LEFT: Character Sidebar (collapsible) ── */}
      <div style={{
        width: sidebarCollapsed ? '36px' : '120px',
        flexShrink: 0,
        borderRight: '0.5px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        overflow: 'hidden',
      }}>
        <button onClick={() => setSidebarCollapsed(v => !v)} style={{
          width: '100%', padding: '8px 0', border: 'none', background: 'none',
          cursor: 'pointer', color: 'var(--text3)', fontSize: '12px',
          display: 'flex', justifyContent: 'center',
        }}>
          {sidebarCollapsed ? '▶' : '◀'}
        </button>
        {!sidebarCollapsed && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text3)', marginBottom: '8px', letterSpacing: '0.5px' }}>角色</div>
            {folderChars.map((c, i) => (
              <div key={i} style={{
                padding: '8px', borderRadius: '8px', marginBottom: '4px',
                background: c.name === mainChar.name ? 'var(--bg3)' : 'transparent',
                fontSize: '11px', color: 'var(--text2)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '6px',
                  background: c.avatar ? 'transparent' : 'var(--purple)',
                  color: '#fff', fontSize: '9px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', flexShrink: 0,
                }}>
                  {c.avatar ? <img src={c.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (c.name || '?')[0]}
                </div>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CENTER: Chat Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '0 12px', height: '48px',
          borderBottom: '0.5px solid var(--border)', flexShrink: 0, gap: '8px',
        }}>
          <button onClick={onBack} style={{
            width: '32px', height: '32px', borderRadius: '8px', border: 'none',
            background: 'var(--bg2)', cursor: 'pointer', color: 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{mainChar.name || '角色'} · 日常</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '12px', color: 'var(--purple)', fontWeight: 500 }}>♥ {affection}</span>
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

          {/* Typing indicator */}
          {loading && (
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
        tension={tension}
        life={life}
        affectionFlash={affectionFlash}
        collapsed={panelCollapsed}
        onToggle={() => setPanelCollapsed(v => !v)}
      />
    </div>
  )
}
