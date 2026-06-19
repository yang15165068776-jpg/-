import { useState, useEffect, useRef, useCallback } from 'react'
import { sendStoryStageMessage, parseMultiCharacterMessage, findCharacterAvatar, judgeAffectionDelta } from '../utils/deepseek'
import { getApiKey, getUserAvatar } from '../utils/storage'
import { shouldTriggerAffectionJudge } from '../runtime/affectionTrigger'
import { runAgentTurn } from '../agents/coordinator'
import { validatePersona } from '../runtime/antiSmoothing'
import { initBridgeForFolder, getFolderUIState, getRawFolderUSK, dramaTurnStart, dramaTurnEnd } from '../state/stateBridge'
import { getSave, getOrCreateDefaultSave, getSaveMessages, saveSaveMessages } from '../state/folderStore'
import ProgressBar from '../components/ProgressBar'
import EventActionPanel from '../components/EventActionPanel'

/**
 * DramaPage — DRAMA MODE ONLY. Pure paragraph narrative. NO BUBBLES. NO TIMESTAMPS.
 * Completely isolated from DailyPage. Uses folder USK + folder saves.
 */
export default function DramaPage({ folderId, folderChars, onBack }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState('')
  const [affection, setAffection] = useState(50)
  const [affections, setAffections] = useState({})
  const [affectionFlash, setAffectionFlash] = useState(null)
  const [tension, setTension] = useState(30)
  const [showDice, setShowDice] = useState(false)
  const [diceResult, setDiceResult] = useState(null)
  const [diceRolling, setDiceRolling] = useState(false)
  const [saveId, setSaveId] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)

  const mainChar = folderChars[0] || {}
  const apiKey = getApiKey()
  const mode = 'drama'

  // ── Init: load save + USK ──
  useEffect(() => {
    const save = getOrCreateDefaultSave(folderId)
    if (!save) return
    setSaveId(save.id)

    // Load DRAMA messages (completely isolated from daily)
    const msgs = getSaveMessages(save.id, folderId, 'drama')
    if (msgs.length === 0 && mainChar.openingScenario) {
      const opening = { role: 'assistant', content: mainChar.openingScenario, timestamp: Date.now(), isOpening: true }
      setMessages([opening])
      saveSaveMessages(save.id, folderId, 'drama', [opening])
    } else {
      setMessages(msgs)
    }

    // Init folder USK
    const charsForUSK = folderChars.map(c => ({ id: c.name, name: c.name, affectionInitial: c.affectionInitial ?? 50 }))
    initBridgeForFolder(folderId, charsForUSK, 'drama')

    const uiState = getFolderUIState(mainChar.name)
    if (uiState) {
      setAffection(uiState.relationship?.affection ?? 50)
      setTension(uiState.tension?.unresolved_conflicts ?? 30)
    }
  }, [folderId])

  // ── Auto-save messages ──
  useEffect(() => {
    if (saveId && messages.length > 0) {
      saveSaveMessages(saveId, folderId, 'drama', messages)
    }
  }, [messages, saveId, folderId])

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // ── Send ──
  const doSend = useCallback(async (userText) => {
    if (!apiKey) { setError('请先配置 API Key'); return }
    setError('')
    setLoading(true)

    const userMsg = { role: 'user', content: userText, timestamp: Date.now() }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    setStreamingText('')

    // Build a minimal character object for the engine
    const char = {
      id: mainChar.id || folderId,
      name: mainChar.name,
      chatStyle: 'story',
      worldSetting: mainChar.worldSetting || '',
      romanceCharacters: mainChar.romanceCharacters || [{
        id: mainChar.id, name: mainChar.name,
        background: mainChar.background || '',
        personality: mainChar.personality || '',
        speakingStyle: mainChar.speakingStyle || '',
        styleRules: mainChar.styleRules || [],
        forbiddenWords: mainChar.forbiddenWords || [],
        affectionEnabled: mainChar.affectionEnabled !== false,
        affectionInitial: mainChar.affectionInitial ?? 50,
        affectionStages: mainChar.affectionStages || [],
      }],
      npcs: mainChar.npcs || [],
      temperature: mainChar.temperature ?? 0.9,
      topP: mainChar.topP ?? 0.95,
      thinkingEnabled: mainChar.thinkingEnabled || false,
      contextWindow: mainChar.contextWindow || 40,
    }

    const usk = getRawFolderUSK()

    try {
      // v3 Agent Coordinator
      const result = await runAgentTurn(
        userText, char, affections, newMsgs, apiKey,
        (token, fullText, reset) => {
          if (reset) { setStreamingText(''); return }
          setStreamingText(fullText)
        },
        usk
      )

      setLoading(false)
      setStreamingText('')

      if (result.error || !result.reply) {
        setError(result.error?.message || '请求失败')
        return
      }

      const cleanReply = (result.reply || '').replace(/<affection>[\s\S]*?<\/affection>/gi, '').trim() || result.reply
      const assistantMsg = { role: 'assistant', content: cleanReply, reasoningContent: result.reasoningContent, usage: result.usage, timestamp: Date.now() }
      setMessages([...newMsgs, assistantMsg])

      // Update affections
      if (result.updatedAffections) {
        setAffections(result.updatedAffections)
        const deltas = result.turnReport?.affectionDeltas || {}
        const flashMap = {}
        for (const [name, delta] of Object.entries(deltas)) {
          if (delta !== 0) flashMap[name] = delta
        }
        if (Object.keys(flashMap).length > 0) {
          setAffectionFlash(flashMap)
          setTimeout(() => setAffectionFlash(null), 1500)
        }
      }

      // Update USK
      dramaTurnEnd(mainChar.name, result)
      const uiState = getFolderUIState(mainChar.name)
      if (uiState) {
        setAffection(uiState.relationship?.affection ?? 50)
        setTension(uiState.tension?.unresolved_conflicts ?? 30)
      }
    } catch (e) {
      setLoading(false)
      setError(e.message)
    }
  }, [messages, affection, affections, apiKey, folderId, mainChar, folderChars])

  const handleSend = () => {
    const text = input.trim()
    if (!text || loading) return
    doSend(text)
  }

  const handleDice = () => {
    if (diceResult != null) {
      const triggerText = '（骰子掷出了' + diceResult + '点，触发随机事件）'
      setShowDice(false)
      setDiceResult(null)
      doSend(triggerText)
    }
  }

  const handleEditLast = () => {
    const lastUserIdx = [...messages].reverse().findIndex(m => m.role === 'user')
    if (lastUserIdx === -1) return
    const idx = messages.length - 1 - lastUserIdx
    const text = prompt('编辑消息：', messages[idx].content)
    if (text) {
      const truncated = messages.slice(0, idx)
      setMessages(truncated)
      doSend(text)
    }
  }

  const handleDeleteLast = () => {
    if (messages.length < 2) return
    // Remove last assistant + user pair
    const lastUserIdx = [...messages].reverse().findIndex(m => m.role === 'user')
    if (lastUserIdx === -1) return
    const idx = messages.length - 1 - lastUserIdx
    setMessages(messages.slice(0, idx))
  }

  // ── Paragraph renderer (NO BUBBLES) ──
  const renderParagraph = (msg, i) => {
    if (msg.role === 'user') {
      return (
        <div key={i} style={{ marginBottom: '20px', paddingLeft: '24px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>主角</div>
          <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {msg.content}
          </div>
        </div>
      )
    }

    const sections = parseMultiCharacterMessage(msg.content)
    return (
      <div key={i} style={{ marginBottom: '24px' }}>
        {msg.isOpening && (
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', color: 'var(--purple)', background: 'var(--purple-l)', padding: '2px 8px', borderRadius: '8px' }}>开场剧情</span>
          </div>
        )}
        {msg.reasoningContent && (
          <details style={{ marginBottom: '6px', cursor: 'pointer' }}>
            <summary style={{ fontSize: '10px', color: 'var(--text3)' }}>思考过程</summary>
            <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '8px', background: 'var(--bg3)', borderRadius: '8px', marginTop: '4px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {msg.reasoningContent}
            </div>
          </details>
        )}
        {sections.length <= 1 ? (
          <div style={{
            paddingLeft: '16px',
            borderLeft: '2px solid var(--border)',
            fontSize: '15px',
            lineHeight: 1.9,
            color: 'var(--text)',
            whiteSpace: 'pre-wrap',
          }}>
            {msg.content}
          </div>
        ) : (
          sections.map((sec, si) => {
            const charInfo = sec.characterName ? findCharacterAvatar(mainChar, sec.characterName) : null
            return (
              <div key={si} style={{ marginBottom: si < sections.length - 1 ? '12px' : 0, paddingLeft: '16px', borderLeft: '2px solid var(--border)' }}>
                {sec.characterName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>
                      【{sec.characterName}】
                    </span>
                  </div>
                )}
                <div style={{ fontSize: '15px', lineHeight: 1.9, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                  {sec.content}
                </div>
              </div>
            )
          })
        )}
      </div>
    )
  }

  const mainCharName = mainChar.name || '角色'
  const affFlashSingle = affectionFlash?.[mainCharName] || null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
      {/* ── Header ── */}
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
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{mainCharName} · 剧情</span>
      </div>

      {/* ── Progress Bars ── */}
      <div style={{ padding: '8px 16px', borderBottom: '0.5px solid var(--border2)', flexShrink: 0 }}>
        <ProgressBar label="好感度" value={affection} color="var(--purple)" height={4} flash={affFlashSingle} />
        <ProgressBar label="张力" value={tension} color="var(--coral)" height={3} />
      </div>

      {/* ── Narrative Area ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
        {messages.length === 0 && !streamingText && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '60px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📖</div>
            <div style={{ fontSize: '14px' }}>剧情模式</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>输入行动开始你的故事</div>
          </div>
        )}

        {messages.map((msg, i) => renderParagraph(msg, i))}

        {/* Streaming text */}
        {streamingText && (
          <div style={{
            paddingLeft: '16px',
            borderLeft: '2px solid var(--purple)',
            fontSize: '15px',
            lineHeight: 1.9,
            color: 'var(--text)',
            whiteSpace: 'pre-wrap',
          }}>
            {streamingText}
            <span style={{ display: 'inline-block', width: '2px', height: '16px', background: 'var(--purple)', marginLeft: '2px', animation: 'blink 1s infinite' }} />
          </div>
        )}

        {/* Loading */}
        {loading && !streamingText && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '16px', color: 'var(--text3)', fontSize: '13px' }}>
            <span>生成中</span>
            <span style={{ display: 'inline-flex', gap: '3px' }}>
              <span className="dot-bounce" style={{ width: '4px', height: '4px', borderRadius: '2px', background: 'var(--text3)' }} />
              <span className="dot-bounce" style={{ width: '4px', height: '4px', borderRadius: '2px', background: 'var(--text3)', animationDelay: '0.2s' }} />
              <span className="dot-bounce" style={{ width: '4px', height: '4px', borderRadius: '2px', background: 'var(--text3)', animationDelay: '0.4s' }} />
            </span>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '8px', color: 'var(--coral)', fontSize: '12px', background: 'var(--coral-l)', borderRadius: '8px' }}>
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Event Action Panel (floating) ── */}
      <EventActionPanel
        onDiceOpen={() => setShowDice(true)}
        onEditLast={handleEditLast}
        onDeleteLast={handleDeleteLast}
        hasMessages={messages.length > 0}
        tension={tension}
      />

      {/* ── Input ── */}
      <div style={{ padding: '10px 12px', borderTop: '0.5px solid var(--border)', flexShrink: 0, display: 'flex', gap: '8px' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          placeholder="输入你的行动…"
          rows={1}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: '12px',
            border: '0.5px solid var(--border)', background: 'var(--bg2)',
            fontSize: '14px', color: 'var(--text)', outline: 'none',
            resize: 'none', fontFamily: 'inherit', minHeight: '42px', maxHeight: '120px',
          }}
          onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            padding: '0 18px', borderRadius: '12px', border: 'none',
            background: loading || !input.trim() ? 'var(--bg3)' : 'var(--text)',
            color: loading || !input.trim() ? 'var(--text3)' : 'var(--bg)',
            fontSize: '14px', fontWeight: 500, cursor: loading || !input.trim() ? 'default' : 'pointer',
            flexShrink: 0,
          }}
        >
          发送
        </button>
      </div>

      {/* ── Dice Modal ── */}
      {showDice && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }} onClick={() => { setShowDice(false); setDiceResult(null) }}>
          <div style={{ background: 'var(--bg)', borderRadius: '16px', padding: '24px', width: '280px', border: '0.5px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '16px' }}>随机事件骰子</div>
            {diceRolling ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <span style={{ fontSize: '48px' }} className="animate-dice-roll">🎲</span>
              </div>
            ) : diceResult != null ? (
              <div style={{ textAlign: 'center', padding: '16px' }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎲</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--purple)' }}>{diceResult}</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)', fontSize: '13px' }}>
                点击下方按钮投掷
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={() => { setShowDice(false); setDiceResult(null) }} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text2)', fontSize: '13px', cursor: 'pointer' }}>取消</button>
              {diceResult != null ? (
                <button onClick={handleDice} style={{ flex: 2, padding: '10px', borderRadius: '10px', border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>确认触发</button>
              ) : (
                <button onClick={() => { setDiceRolling(true); setTimeout(() => { setDiceRolling(false); setDiceResult(Math.floor(Math.random() * 20) + 1) }, 800) }} style={{ flex: 2, padding: '10px', borderRadius: '10px', border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>掷骰子</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
