import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getCharacter,
  getArchive,
  getChatMessages,
  saveChatMessages,
  getAffection,
  saveAffection,
  getAffections,
  saveAffections,
  clearChatHistory,
} from '../utils/storage'
import { sendMessageStream, sendCasualReply, getCurrentAffectionStage, compressChatHistory, checkActiveMessage, parseMultiCharacterMessage, findCharacterAvatar, parseAffectionTags } from '../utils/deepseek'
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

function parseThinkBlock(content) {
  const match = content.match(/<think>([\s\S]*?)<\/think>/)
  if (!match) return { thinkContent: null, mainContent: content }
  const thinkContent = match[1].trim()
  const mainContent = content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
  return { thinkContent, mainContent }
}

function ThinkToggle({ content }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mb-1 cursor-pointer select-none" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
      <span className="text-[12px] text-gray-500 hover:text-gray-300 inline-block">
        {expanded ? '▼' : '▶'} 思考过程
      </span>
      {expanded && (
        <div className="mt-1 p-2 rounded-lg bg-gray-800/90 text-[12px] text-gray-400 leading-relaxed whitespace-pre-wrap" style={{ background: 'rgba(30,30,35,0.95)' }}>
          {content}
        </div>
      )}
    </div>
  )
}

function StoryReplyBlock({ msg, character, index, onRegenerate, showActions, onToggleActions, userAvatar }) {
  const [copied, setCopied] = useState(false)
  const { thinkContent, mainContent } = parseThinkBlock(msg.content)

  const handleCopy = (e) => {
    e.stopPropagation()
    copyToClipboard(msg.content, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleRegenerate = (e) => {
    e.stopPropagation()
    onRegenerate(index)
  }

  return (
    <div
      className="animate-fade-in"
      onMouseEnter={() => onToggleActions(index, true)}
      onMouseLeave={() => onToggleActions(index, false)}
      onClick={() => onToggleActions(index)}
    >
      {/* Think toggle */}
      {thinkContent && <ThinkToggle content={thinkContent} />}

      <div className="flex gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <Avatar src={character.avatar} name={character.name} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-gray-500">{character.name}</span>
            {showActions && (
              <div className="flex gap-1">
                <button onClick={handleRegenerate} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">🔄</button>
                <button onClick={handleCopy} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">{copied ? '✓ 已复制' : '📋'}</button>
              </div>
            )}
          </div>

          <NovelContent content={mainContent} character={character} />

          {msg.isAutonomous && (
            <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded mt-1 inline-block">自主消息</span>
          )}

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] text-purple-500/60 select-none">已读</span>
            {msg.usage && (
              <span className="text-[10px] text-gray-600 select-none">
                [本轮消耗 - 输入: {msg.usage.prompt_tokens ?? '?'} | 输出: {msg.usage.completion_tokens ?? '?'} | 总计: {(msg.usage.prompt_tokens ?? 0) + (msg.usage.completion_tokens ?? 0)}]
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function NovelContent({ content, character }) {
  const sections = parseMultiCharacterMessage(content)

  if (sections.length <= 1) {
    return (
      <div className="relative pl-4 border-l-2 border-gray-700/60">
        <div className="text-[15px] leading-[1.8] text-gray-200 whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className="relative pl-4 border-l-2 border-gray-700/60">
      {sections.map((sec, i) => {
        let charInfo = null
        if (sec.characterName) {
          charInfo = findCharacterAvatar(character, sec.characterName)
        }
        return (
          <div key={i} className={i > 0 ? 'mt-3' : ''}>
            {sec.characterName && (
              <div className="flex items-center gap-1.5 mb-1.5">
                {charInfo?.avatar ? (
                  <img src={charInfo.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : null}
                <span className="text-xs font-bold text-gray-400">
                  【{sec.characterName}】
                </span>
              </div>
            )}
            <div className="text-[15px] leading-[1.8] text-gray-200 whitespace-pre-wrap break-words">
              {sec.content}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function copyToClipboard(text, onDone) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => onDone()).catch(() => {})
  } else {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(textarea)
    onDone()
  }
}


function cleanAndSplitResponse(rawText) {
  let text = rawText

  // 1. Remove <think> blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '')

  // 2. Remove all parenthetical content — handle nesting (both () and （）)
  let prev = ''
  while (prev !== text) {
    prev = text
    text = text.replace(/\([^()]*\)/g, '')
    text = text.replace(/（[^（）]*）/g, '')
  }

  // 3. Clean up orphaned bracket/parenthesis chars
  text = text.replace(/[()（）]/g, '')

  // 4. Extract all quoted dialogue segments — Chinese "" and English ""
  const quotes = []
  const quoteRegex = /[“”"]([^“”"]+?)[“”"]/g
  let match
  while ((match = quoteRegex.exec(text)) !== null) {
    quotes.push(match[1].trim())
  }

  // Also match single-quoted dialogue: Chinese '' and English ''
  const singleQuoteRegex = /[‘’']([^‘’']+?)[‘’']/g
  while ((match = singleQuoteRegex.exec(text)) !== null) {
    quotes.push(match[1].trim())
  }

  let dialogueText
  if (quotes.length > 0) {
    // Use only the spoken content, discard narration framing
    dialogueText = quotes.join('')
  } else {
    // No quotes found — strip narration prefixes like "她笑着说："
    dialogueText = text.replace(/^[^""'']*?[：:]\s*/g, '')
  }

  // 5. Split into individual sentences
  const sentences = dialogueText
    .split(/(?<=[。！？.!?\n])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  // 6. Per-sentence cleanup
  const cleaned = sentences
    .map(s => {
      // Strip any remaining quotation marks at boundaries
      s = s.replace(/^[“”"‘’']+|[“”"‘’']+$/g, '')
      // Strip leading punctuation/commas orphaned by quotation removal
      s = s.replace(/^[，,、\s]+/, '')
      // Collapse multiple spaces
      s = s.replace(/\s{2,}/g, ' ')
      return s.trim()
    })
    .filter(s => {
      // Drop empty strings and pure-punctuation fragments
      if (s.length === 0) return false
      if (/^[，。！？,.!?、：:\s]+$/.test(s)) return false
      return true
    })

  // Fallback: if cleaning removed everything, keep the raw text stripped of brackets
  if (cleaned.length === 0) {
    const fallback = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[()（）]/g, '').trim()
    if (fallback) return [fallback]
  }

  return cleaned
}

function parseStructuredContent(msg) {
  if (msg.parsed) return msg.parsed
  try {
    const p = JSON.parse(msg.content)
    return {
      think: p.think || '',
      action_or_environment: p.action_or_environment || '',
      dialogue: p.dialogue || '',
      psychology: p.psychology || '',
    }
  } catch {
    return { think: '', action_or_environment: '', dialogue: msg.content, psychology: '' }
  }
}

function parseCasualReply(rawText) {
  const segments = rawText.split('|||')
    .map(s => s.trim().replace(/^\|+|\|+$/g, '').trim())
    .filter(s => s.length > 0)

  if (segments.length === 0) return [{ text: rawText.trim() || rawText, action: null, psychology: null }]

  return segments.map((seg, i, arr) => {
    const isFirst = i === 0
    const isLast = i === arr.length - 1

    const actionMatch = isFirst ? seg.match(/^\*([^*]+)\*\s*/) : null
    const psychMatch = isLast ? seg.match(/（([^）]+)）\s*$/) : null

    let text = seg
    let action = null
    let psychology = null

    if (actionMatch) {
      action = actionMatch[1].trim()
      text = text.replace(/^\*[^*]+\*\s*/, '')
    }
    if (psychMatch) {
      psychology = psychMatch[1].trim()
      text = text.replace(/（[^）]+）\s*$/, '')
    }

    return { text: text.trim(), action, psychology }
  }).filter(seg => seg.text || seg.action || seg.psychology)
}

function StoryBubble({ msg, index, character, userAvatar, onRegenerate, showActions, onToggleActions, showTimestamp, revealCount }) {
  const [copied, setCopied] = useState(false)

  const hasSegments = msg.segments && msg.segments.length > 0
  const revealed = hasSegments
    ? (revealCount != null ? msg.segments.slice(0, revealCount) : msg.segments)
    : null
  const pending = hasSegments && revealCount != null && revealCount < msg.segments.length

  // Old format: use parseStructuredContent
  const { think, action_or_environment, dialogue, psychology } = !hasSegments
    ? parseStructuredContent(msg)
    : { think: '', action_or_environment: '', dialogue: '', psychology: '' }

  const handleCopy = (e) => {
    e.stopPropagation()
    copyToClipboard(msg.content, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleRegenerate = (e) => {
    e.stopPropagation()
    onRegenerate(index)
  }

  return (
    <div
      className="flex items-start gap-2 animate-fade-in"
      onMouseEnter={() => onToggleActions(index, true)}
      onMouseLeave={() => onToggleActions(index, false)}
      onClick={() => onToggleActions(index)}
    >
      <Avatar src={character.avatar} name={character.name} />
      <div className="flex flex-col max-w-[75%] space-y-1.5">
        <span className="text-[10px] text-gray-500 px-1">{character.name}</span>

        {showActions && (
          <div className="flex gap-1">
            <button onClick={handleRegenerate} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">🔄</button>
            <button onClick={handleCopy} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">{copied ? '✓ 已复制' : '📋'}</button>
          </div>
        )}

        {msg.isAutonomous && (
          <span className="text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded self-start">自主消息</span>
        )}

        {/* New casual format: segments array */}
        {hasSegments && revealed ? (
          <>
            {/* Action text — rendered once above all bubbles, no bubble background */}
            {revealed[0]?.action && (
              <div className="text-[12px] leading-relaxed whitespace-pre-wrap italic mb-1" style={{ color: '#888' }}>
                {revealed[0].action}
              </div>
            )}
            {revealed.map((seg, si) => (
              <div key={si} className={'animate-fade-in' + (si < revealed.length - 1 ? ' mb-1' : '')}>
                {seg.text && (
                  <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-gradient-to-br from-indigo-700 to-purple-800 text-gray-100 text-sm leading-relaxed whitespace-pre-wrap break-words border border-purple-500/20">
                    {seg.text}
                  </div>
                )}
              </div>
            ))}
            {/* Psychology — rendered below all bubbles */}
            {(() => {
              const lastSeg = revealed[revealed.length - 1]
              return lastSeg?.psychology ? (
                <div className="text-[12px] leading-relaxed whitespace-pre-wrap italic mt-1" style={{ color: '#888' }}>
                  （{lastSeg.psychology}）
                </div>
              ) : null
            })()}
            {pending && (
              <div className="flex items-center gap-1 py-1">
                <span className="inline-flex gap-0.5">
                  <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                  <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                </span>
              </div>
            )}
          </>
        ) : !hasSegments ? (
          <>
            {/* Old format: parseStructuredContent */}
            {think && (
              <ThinkToggle content={think} />
            )}

            {action_or_environment && (
              <div className="text-[12px] text-gray-300 leading-relaxed whitespace-pre-wrap italic opacity-80">
                {action_or_environment}
              </div>
            )}

            <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-gradient-to-br from-indigo-700 to-purple-800 text-gray-100 text-sm leading-relaxed whitespace-pre-wrap break-words border border-purple-500/20">
              {dialogue}
            </div>

            {psychology && (
              <div className="text-[11px] text-gray-400 leading-relaxed whitespace-pre-wrap italic opacity-75">
                {psychology}
              </div>
            )}
          </>
        ) : null}

        {showTimestamp && msg.timestamp && (
          <span className="text-[9px] text-gray-600 px-1 select-none">
            {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        <span className="text-[9px] text-purple-500/60 px-1 select-none">已读</span>

        {msg.usage && (
          <div className="text-[10px] text-gray-600 px-1">
            [本轮消耗 - 输入: {msg.usage.prompt_tokens ?? '?'} | 输出: {msg.usage.completion_tokens ?? '?'} | 总计: {(msg.usage.prompt_tokens ?? 0) + (msg.usage.completion_tokens ?? 0)}]
          </div>
        )}
      </div>
    </div>
  )
}

function FormattedText({ content }) {
  const parts = content.split(/(\*[^*]+\*)/g)
  if (parts.length === 1) return content
  return parts.map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return <span key={i} className="italic text-gray-400">{part.slice(1, -1)}</span>
    }
    return <span key={i}>{part}</span>
  })
}

function CasualReplyGroup({ msg, character, userAvatar, onRegenerate, index, showActions, onToggleActions }) {
  const [thinkExpanded, setThinkExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const { thinkContent, mainContent } = parseThinkBlock(msg.content)
  const bubbles = cleanAndSplitResponse(mainContent)

  const handleCopy = (e) => {
    e.stopPropagation()
    copyToClipboard(msg.content, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleRegenerate = (e) => {
    e.stopPropagation()
    onRegenerate(index)
  }

  return (
    <div
      className="flex items-start gap-2 animate-fade-in"
      onMouseEnter={() => onToggleActions(index, true)}
      onMouseLeave={() => onToggleActions(index, false)}
      onClick={() => onToggleActions(index)}
    >
      <Avatar src={character.avatar} name={character.name} />
      <div className="flex flex-col max-w-[75%] space-y-2">
        <span className="text-[10px] text-gray-500 px-1">{character.name}</span>

        {showActions && (
          <div className="flex gap-1">
            <button onClick={handleRegenerate} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">🔄</button>
            <button onClick={handleCopy} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300">{copied ? '✓ 已复制' : '📋'}</button>
          </div>
        )}

        {thinkContent && (
          <div className="cursor-pointer select-none" onClick={(e) => { e.stopPropagation(); setThinkExpanded(!thinkExpanded) }}>
            <span className="text-[10px] text-gray-500 hover:text-gray-300">{thinkExpanded ? '▼' : '▶'} 查看思考过程</span>
            {thinkExpanded && (
              <div className="mt-1 px-2.5 py-2 rounded-lg bg-gray-800/70 border border-gray-700/50 text-[11px] text-gray-400 leading-relaxed whitespace-pre-wrap">
                {thinkContent}
              </div>
            )}
          </div>
        )}

        {bubbles.map((bubbleText, bi) => (
          <div key={bi} className="px-3 py-2 rounded-2xl rounded-tl-sm bg-gray-700 text-gray-100 text-sm leading-relaxed whitespace-pre-wrap break-words">
            <FormattedText content={bubbleText} />
          </div>
        ))}

        <span className="text-[10px] text-gray-600 px-1">已读 ✓</span>

        {msg.usage && (
          <div className="text-[10px] text-gray-600 px-1">
            [本轮消耗 - 输入: {msg.usage.prompt_tokens ?? '?'} | 输出: {msg.usage.completion_tokens ?? '?'} | 总计: {(msg.usage.prompt_tokens ?? 0) + (msg.usage.completion_tokens ?? 0)}]
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ msg, index, isUser, character, userAvatar, onEdit, onRegenerate, showActions, onToggleActions, showTimestamp }) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [copied, setCopied] = useState(false)

  const { thinkContent, mainContent } = isUser
    ? { thinkContent: null, mainContent: msg.content }
    : parseThinkBlock(msg.content)

  const handleCopy = (e) => {
    e.stopPropagation()
    copyToClipboard(msg.content, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleStartEdit = (e) => {
    e.stopPropagation()
    setEditText(msg.content)
    setEditing(true)
  }

  const handleConfirmEdit = (e) => {
    e.stopPropagation()
    const newText = editText.trim()
    if (!newText) return
    setEditing(false)
    onEdit(index, newText)
  }

  const handleCancelEdit = (e) => {
    e.stopPropagation()
    setEditing(false)
  }

  const handleRegenerate = (e) => {
    e.stopPropagation()
    onRegenerate(index)
  }

  if (editing) {
    return (
      <div className={`flex items-start gap-2 animate-fade-in ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {isUser ? <Avatar src={userAvatar} name="我" /> : <Avatar src={character.avatar} name={character.name} />}
        <div className={`flex flex-col max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
          <span className="text-[10px] text-gray-500 mb-0.5 px-1">{isUser ? '我' : character.name}</span>
          <div className="min-w-[200px]">
            <textarea
              className="w-full bg-gray-700 border border-blue-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none"
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={3}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleConfirmEdit(e)
                }
                if (e.key === 'Escape') {
                  handleCancelEdit(e)
                }
              }}
            />
            <div className="flex gap-1 mt-1">
              <button onClick={handleConfirmEdit} className="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-500">确认</button>
              <button onClick={handleCancelEdit} className="text-xs px-2.5 py-1 rounded bg-gray-600 text-gray-300 hover:bg-gray-500">取消</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-2 animate-fade-in ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {isUser ? (
        <Avatar src={userAvatar} name="我" />
      ) : (
        <Avatar src={character.avatar} name={character.name} />
      )}
      <div
        className={`flex flex-col max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}
        onMouseEnter={() => onToggleActions(index, true)}
        onMouseLeave={() => onToggleActions(index, false)}
        onClick={() => onToggleActions(index)}
      >
        <span className="text-[10px] text-gray-500 mb-0.5 px-1">
          {isUser ? '我' : character.name}
        </span>

        {showActions && (
          <div className={`flex gap-1 mb-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {isUser && (
              <button onClick={handleStartEdit} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300" title="编辑">
                ✏️
              </button>
            )}
            {!isUser && (
              <button onClick={handleRegenerate} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300" title="重新生成">
                🔄
              </button>
            )}
            <button onClick={handleCopy} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300" title="复制">
              {copied ? '✓ 已复制' : '📋'}
            </button>
          </div>
        )}

        {!isUser && thinkContent && (
          <ThinkToggle content={thinkContent} />
        )}

        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-gray-700 text-gray-100 rounded-tl-sm'
          }`}
        >
          {isUser ? mainContent : <FormattedText content={mainContent} />}
        </div>

        {showTimestamp && msg.timestamp && (
          <span className="text-[9px] text-gray-600 px-1 select-none">
            {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        {!isUser && msg.usage && (
          <div className="text-[10px] text-gray-600 mt-0.5 px-1">
            [本轮消耗 - 输入: {msg.usage.prompt_tokens ?? '?'} | 输出: {msg.usage.completion_tokens ?? '?'} | 总计: {(msg.usage.prompt_tokens ?? 0) + (msg.usage.completion_tokens ?? 0)}]
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatRoom({ mode, archiveId, onBack }) {
  const [character, setCharacter] = useState(null)
  const [archiveName, setArchiveName] = useState('')
  const [messages, setMessages] = useState([])
  const [affection, setAffection] = useState(null)
  const [affections, setAffections] = useState(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [userAvatar, setUserAvatarState] = useState('')
  const [activeMenuIdx, setActiveMenuIdx] = useState(null)
  const [showCompress, setShowCompress] = useState(false)
  const [compressSummary, setCompressSummary] = useState('')
  const [compressing, setCompressing] = useState(false)
  const [autonomousPending, setAutonomousPending] = useState(false)
  const [revealingState, setRevealingState] = useState(null) // { msgIndex, revealedCount, totalCount }
  const [showDice, setShowDice] = useState(false)
  const [diceRolling, setDiceRolling] = useState(false)
  const [diceResult, setDiceResult] = useState(null)
  const revealTimerRef = useRef(null)
  const activeCheckTimerRef = useRef(null)
  const activeDisplayRef = useRef(null)
  const autoMsgTimerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const activeTimerRef = useRef(null)
  const lastActivityRef = useRef(Date.now())
  const menuTimerRef = useRef(null)

  useEffect(() => {
    const archive = getArchive(archiveId, mode)
    if (!archive) return
    setArchiveName(archive.name)
    const char = getCharacter(archive.characterId, mode)
    setCharacter(char)
    setMessages(archive.messages || [])
    setUserAvatarState(getUserAvatar())

    if (char?.chatStyle === 'story' && char?.romanceCharacters?.length > 0) {
      const savedAffs = getAffections(archiveId, mode)
      if (savedAffs && Object.keys(savedAffs).length > 0) {
        setAffections(savedAffs)
      } else {
        const initial = {}
        char.romanceCharacters.forEach(rc => {
          if (rc.affectionEnabled) {
            initial[rc.name] = rc.affectionInitial ?? 50
          }
        })
        setAffections(initial)
      }
    } else if (char?.affectionEnabled) {
      const saved = archive.affection
      setAffection(saved !== null ? saved : char.affectionInitial)
    }
  }, [archiveId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    if (character) {
      saveChatMessages(archiveId, messages, mode)
    }
  }, [messages, archiveId, character, mode])

  useEffect(() => {
    if (character?.affectionEnabled && affection !== null) {
      saveAffection(archiveId, affection, mode)
    }
  }, [affection, archiveId, character, mode])

  useEffect(() => {
    if (character?.chatStyle === 'story' && affections !== null) {
      saveAffections(archiveId, affections, mode)
    }
  }, [affections, archiveId, character, mode])

  // Shared function to display active messages sequentially
  const displayActiveMessages = useCallback((messages, archiveId) => {
    if (!messages || messages.length === 0) return
    // Cancel any previous displays
    if (activeDisplayRef.current) {
      clearTimeout(activeDisplayRef.current)
    }
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current)
    }
    setRevealingState(null)

    // Add a new assistant message with segments (simple text segments)
    const segments = messages.map(m => ({ text: m, action: null, psychology: null }))
    setMessages(prev => {
      const updated = [...prev, { role: 'assistant', content: messages.join('|||'), segments, timestamp: Date.now(), isAutonomous: true }]
      saveChatMessages(archiveId, updated, mode)

      // Start sequential reveal
      const msgIndex = updated.length - 1
      let revealed = 0
      const revealNext = () => {
        revealed++
        setRevealingState({ msgIndex, revealedCount: revealed, totalCount: segments.length })
        if (revealed < segments.length) {
          activeDisplayRef.current = setTimeout(revealNext, 800 + Math.random() * 700)
        } else {
          activeDisplayRef.current = null
          setRevealingState(null)
        }
      }
      activeDisplayRef.current = setTimeout(revealNext, 600 + Math.random() * 600)

      return updated
    })

    lastActivityRef.current = Date.now()
  }, [])

  // Active message: triggered by AI decision
  const triggerActiveCheck = useCallback(async () => {
    if (!character?.activeMessageEnabled || !character?.activePrompt) return
    const apiKey = getApiKey()
    if (!apiKey) return

    const minutesSince = Math.floor((Date.now() - lastActivityRef.current) / 60000)
    const { result, error } = await checkActiveMessage(character, minutesSince, apiKey)
    if (error || !result?.send || !result?.messages) return

    const delayMs = Math.max(5, Math.min(300, result.delay_seconds || 30)) * 1000
    activeDisplayRef.current = setTimeout(() => {
      displayActiveMessages(result.messages, archiveId)
    }, delayMs)
  }, [character?.activeMessageEnabled, character?.activePrompt, archiveId, displayActiveMessages])

  // Trigger active check: on page open
  useEffect(() => {
    if (character?.activeMessageEnabled) {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }
      triggerActiveCheck()
    }
  }, [character?.id, character?.activeMessageEnabled])

  // Trigger active check: every 60s, if idle > 30 min
  useEffect(() => {
    if (!character?.activeMessageEnabled) return
    const timer = setInterval(() => {
      const minutesSince = Math.floor((Date.now() - lastActivityRef.current) / 60000)
      if (minutesSince >= 30) {
        triggerActiveCheck()
      }
    }, 60000)
    return () => clearInterval(timer)
  }, [character?.activeMessageEnabled, triggerActiveCheck])

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (autoMsgTimerRef.current) clearTimeout(autoMsgTimerRef.current)
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current)
      if (activeCheckTimerRef.current) clearInterval(activeCheckTimerRef.current)
      if (activeDisplayRef.current) clearTimeout(activeDisplayRef.current)
    }
  }, [])

  const adjustAffection = useCallback((delta, charName) => {
    if (character?.chatStyle === 'story' && charName) {
      setAffections(prev => ({
        ...prev,
        [charName]: Math.min(100, Math.max(0, (prev?.[charName] ?? 50) + delta))
      }))
    } else {
      setAffection(prev => Math.min(100, Math.max(0, prev + delta)))
    }
  }, [character?.chatStyle])

  const handleToggleActions = useCallback((idx, isHoverEnter) => {
    clearTimeout(menuTimerRef.current)
    if (isHoverEnter === true) {
      setActiveMenuIdx(idx)
    } else if (isHoverEnter === false) {
      menuTimerRef.current = setTimeout(() => {
        setActiveMenuIdx(prev => prev === idx ? null : prev)
      }, 300)
    } else {
      setActiveMenuIdx(prev => prev === idx ? null : idx)
    }
  }, [])

  const doSend = useCallback(async (userText, existingMessages) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      setError('请先在设置页面填写 DeepSeek API Key')
      return
    }

    setError('')
    setRetrying(false)
    setActiveMenuIdx(null)
    lastActivityRef.current = Date.now()

    // Clear any pending autonomous message
    if (autoMsgTimerRef.current) {
      clearTimeout(autoMsgTimerRef.current)
      autoMsgTimerRef.current = null
    }
    setAutonomousPending(false)

    const userMsg = { role: 'user', content: userText, timestamp: Date.now() }
    const newMessages = [...existingMessages, userMsg]
    setMessages(newMessages)
    setStreamingText('')
    setLoading(true)

    if (character.chatStyle === 'casual') {
      const { reply, usage, error: apiError } = await sendCasualReply(
        character,
        newMessages,
        affection,
        apiKey,
      )

      setLoading(false)
      setStreamingText('')

      if (apiError || !reply) {
        setError(apiError?.message || '请求失败')
        return false
      }

      const segments = parseCasualReply(reply)
      const assistantMsg = { role: 'assistant', content: reply, segments, usage, timestamp: Date.now() }
      const finalMessages = [...newMessages, assistantMsg]
      const msgIndex = finalMessages.length - 1
      setMessages(finalMessages)

      if (character.affectionEnabled) {
        const delta = Math.floor(Math.random() * 5) + 1
        adjustAffection(delta)
      }

      // Sequential reveal: show segments one by one with delays
      setRevealingState({ msgIndex, revealedCount: 0, totalCount: segments.length })
      let revealed = 0
      const revealNext = () => {
        revealed++
        setRevealingState({ msgIndex, revealedCount: revealed, totalCount: segments.length })
        if (revealed < segments.length) {
          revealTimerRef.current = setTimeout(revealNext, 800 + Math.random() * 700)
        } else {
          revealTimerRef.current = null
          setRevealingState(null)
        }
      }
      revealTimerRef.current = setTimeout(revealNext, 600 + Math.random() * 600)

      triggerActiveCheck()
      return true
    }

    // Story mode: streaming with affections object
    const affectionData = character.chatStyle === 'story' ? affections : affection
    const { reply, usage, error: apiError } = await sendMessageStream(
      character,
      newMessages,
      affectionData,
      apiKey,
      (token, fullText, reset) => {
        if (reset) {
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
      return false
    }

    // Parse affection tags for story mode
    let finalReply = reply
    if (character.chatStyle === 'story') {
      const { cleanedContent, changes } = parseAffectionTags(reply)
      finalReply = cleanedContent || reply
      if (changes.length > 0) {
        setAffections(prev => {
          const updated = { ...prev }
          changes.forEach(({ name, delta }) => {
            updated[name] = Math.min(100, Math.max(0, (updated[name] || 50) + delta))
          })
          return updated
        })
      }
    }

    const assistantMsg = { role: 'assistant', content: finalReply, usage, timestamp: Date.now() }
    setMessages([...newMessages, assistantMsg])

    if (character.affectionEnabled && character.chatStyle !== 'story') {
      const delta = Math.floor(Math.random() * 5) + 1
      adjustAffection(delta)
    }
    triggerActiveCheck()
    return true
  }, [character, affection, affections, adjustAffection, triggerActiveCheck])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || !character) return
    setInput('')
    inputRef.current?.focus()
    await doSend(text, messages)
  }, [input, loading, character, messages, doSend])

  const handleDiceTrigger = useCallback(async (result) => {
    if (loading || !character) return
    setShowDice(false)
    setDiceResult(null)
    const triggerText = '（骰子掷出了' + result + '点，触发随机事件）'
    const diceSystemMsg = {
      role: 'system',
      content: '随机事件触发（强度：' + result + '/20），请根据当前世界观和所有角色的性格，生成一个随机事件并将其融入剧情推进，事件的戏剧性和与角色的关联度与' + result + '/20成正比。',
    }
    const newMessages = [...messages, diceSystemMsg]
    setMessages(newMessages)
    await doSend(triggerText, newMessages)
  }, [loading, character, messages, doSend])

  const handleEditMessage = useCallback((msgIndex, newText) => {
    const truncated = messages.slice(0, msgIndex)
    setMessages(truncated)
    doSend(newText, truncated)
  }, [messages, doSend])

  const handleRegenerateMessage = useCallback((msgIndex) => {
    const truncated = messages.slice(0, msgIndex)
    const lastUserMsg = truncated[truncated.length - 1]
    if (lastUserMsg?.role !== 'user') return
    setMessages(truncated.slice(0, -1))
    doSend(lastUserMsg.content, truncated.slice(0, -1))
  }, [messages, doSend])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    if (window.confirm('确定要清除所有对话记录吗？')) {
      clearChatHistory(archiveId, mode)
      setMessages([])
      if (character?.chatStyle === 'story' && character?.romanceCharacters) {
        const initial = {}
        character.romanceCharacters.forEach(rc => {
          if (rc.affectionEnabled) {
            initial[rc.name] = rc.affectionInitial ?? 50
          }
        })
        setAffections(initial)
      } else if (character?.affectionEnabled) {
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
      {/* Affection bar - GM story mode: multi-character */}
      {character.chatStyle === 'story' && character.romanceCharacters?.length > 0 && (
        <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700/50">
          <div className="flex items-center gap-3 overflow-x-auto">
            {character.romanceCharacters.map(rc => {
              const value = affections?.[rc.name] ?? rc.affectionInitial ?? 50
              const rcStage = rc.affectionEnabled
                ? getCurrentAffectionStage({ affectionEnabled: true, affectionStages: rc.affectionStages }, value)
                : null
              return (
                <div key={rc.name} className="flex items-center gap-2 flex-shrink-0 group">
                  {rc.avatar ? (
                    <img src={rc.avatar} alt="" className="w-7 h-7 rounded-full object-cover border border-gray-600" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-xs text-gray-300 border border-gray-600">
                      {rc.name[0]}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-200 font-medium">{rc.name}</span>
                      <span className="text-[10px] text-pink-400">{value}</span>
                      {rcStage && (
                        <span className="text-[10px] text-gray-500">{rcStage.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <div className="h-1 w-16 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-pink-500 to-rose-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                        />
                      </div>
                      <button
                        onClick={() => adjustAffection(-2, rc.name)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded bg-gray-700 text-gray-400 hover:text-white transition-opacity"
                        title={`降低${rc.name}好感度`}
                      >
                        -2
                      </button>
                      <button
                        onClick={() => adjustAffection(2, rc.name)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded bg-gray-700 text-gray-400 hover:text-white transition-opacity"
                        title={`提高${rc.name}好感度`}
                      >
                        +2
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Affection bar - daily mode: single character */}
      {character.chatStyle !== 'story' && character.affectionEnabled && stage && (
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
            主动消息已开启 · AI根据时间自主决策
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 && !streamingText && (
          <>
            {character.openingScenario && (
              <div className="animate-fade-in">
                <div className="text-center mb-2">
                  <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">开场剧情</span>
                </div>
                <div className="bg-gray-800/80 border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap italic">
                  {character.openingScenario}
                </div>
              </div>
            )}
            <div className="text-center text-gray-600 mt-8">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-sm">开始和{character.name}对话吧</p>
              <p className="text-[10px] text-gray-700 mt-0.5">存档：{archiveName}</p>
              {character.nickname && (
                <p className="text-xs mt-1 text-gray-700">
                  角色会称呼你为「{character.nickname}」
                </p>
              )}
            </div>
          </>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'system') {
            const isDice = msg.content.startsWith('随机事件触发')
            const isMemory = msg.content.startsWith('【历史剧情摘要】')
            return (
              <div key={i} className="flex justify-center my-2 animate-fade-in">
                <div className={(isDice ? 'bg-orange-500/10 border-orange-500/20' : 'bg-amber-500/10 border-amber-500/20') + ' border rounded-lg px-4 py-2 max-w-[85%]'}>
                  <div className={'text-[10px] mb-1 ' + (isDice ? 'text-orange-400' : 'text-amber-400')}>
                    {isDice ? '🎲 随机事件' : '📋 对话记忆'}
                  </div>
                  <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {msg.content.replace(/^【历史剧情摘要】\n?/, '').slice(0, 300)}
                    {msg.content.length > 300 ? '...' : ''}
                  </div>
                </div>
              </div>
            )
          }
          const isUser = msg.role === 'user'
          if (!isUser) {
            if (character.chatStyle === 'casual') {
              return (
                <StoryBubble
                  key={i}
                  msg={msg}
                  index={i}
                  character={character}
                  userAvatar={userAvatar}
                  onRegenerate={handleRegenerateMessage}
                  showActions={activeMenuIdx === i}
                  onToggleActions={handleToggleActions}
                  showTimestamp={character.showTimestamp || false}
                  revealCount={revealingState?.msgIndex === i ? revealingState.revealedCount : undefined}
                />
              )
            }
            // Story mode: novel-style unified block
            return (
              <StoryReplyBlock
                key={i}
                msg={msg}
                index={i}
                character={character}
                userAvatar={userAvatar}
                onRegenerate={handleRegenerateMessage}
                showActions={activeMenuIdx === i}
                onToggleActions={handleToggleActions}
              />
            )
          }
          return (
            <MessageBubble
              key={i}
              msg={msg}
              index={i}
              isUser={isUser}
              character={character}
              userAvatar={userAvatar}
              onEdit={handleEditMessage}
              onRegenerate={handleRegenerateMessage}
              showActions={activeMenuIdx === i}
              onToggleActions={handleToggleActions}
              showTimestamp={character.chatStyle === 'casual' && character.showTimestamp}
            />
          )
        })}

        {/* Streaming message (typewriter) */}
        {streamingText && (
          <div className="flex gap-3 animate-fade-in">
            <div className="flex-shrink-0 mt-0.5">
              <Avatar src={character.avatar} name={character.name} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-gray-500 mb-1.5 block">{character.name}</span>
              {character.chatStyle === 'story' ? (
                <div className="relative pl-4 border-l-2 border-gray-700/60">
                  <div className="text-[15px] leading-[1.8] text-gray-200 whitespace-pre-wrap break-words">
                    {streamingText}
                    <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle" />
                  </div>
                </div>
              ) : (
                <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-gray-700 text-gray-100 text-sm leading-relaxed whitespace-pre-wrap break-words max-w-[75%]">
                  {streamingText}
                  <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle" />
                </div>
              )}
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
                {character.chatStyle === 'casual' ? (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-purple-400">正在构思</span>
                    <span className="inline-flex gap-0.5">
                      <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                      <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                    </span>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Autonomous pending indicator */}
        {autonomousPending && (
          <div className="flex items-start gap-2 animate-fade-in">
            <Avatar src={character.avatar} name={character.name} />
            <div className="flex flex-col max-w-[75%]">
              <span className="text-[10px] text-gray-500 mb-0.5 px-1">{character.name}</span>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-gray-700">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-purple-400">正在输入</span>
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                    <span className="w-1 h-1 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                  </span>
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

      {/* Global token total */}
      {(() => {
        const total = messages.reduce((sum, m) => {
          if (m.role === 'assistant' && m.usage) {
            return sum + (m.usage.prompt_tokens || 0) + (m.usage.completion_tokens || 0)
          }
          return sum
        }, 0)
        const cw = character?.contextWindow || 40
        const userMsgs = messages.filter(m => m.role !== 'system').length
        if (total === 0 && userMsgs === 0) return null
        return (
          <div className="px-4 pb-1">
            <div className="border-t border-gray-700/50 pt-1.5 text-center">
              <span className="text-[11px] text-gray-500">
                上下文窗口: 最近 {cw} 条 | 实际消息: {userMsgs} 条{total > 0 ? ` | Token总计: ${total}` : ''}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Input area */}
      <div className="border-t border-gray-700 bg-gray-800/95 backdrop-blur p-3">
        <div className="flex items-end gap-2">
          {messages.filter(m => m.role !== 'system').length > 0 && (
            <button
              onClick={() => setShowCompress(true)}
              className="px-2 py-2 text-gray-500 hover:text-amber-400 transition-colors text-sm flex-shrink-0"
              title="压缩对话"
            >
              📦
            </button>
          )}
          <button
            onClick={handleClear}
            className="px-2 py-2 text-gray-500 hover:text-red-400 transition-colors text-sm flex-shrink-0"
            title="清除对话"
          >
            🗑
          </button>
          {mode === 'story' && (
            <button
              onClick={() => { setShowDice(true); setDiceRolling(false); setDiceResult(null) }}
              className="px-2 py-2 text-gray-500 hover:text-amber-400 transition-colors text-sm flex-shrink-0"
              title="随机事件骰子"
            >
              🎲
            </button>
          )}
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

      {/* Compression modal */}
      {showCompress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowCompress(false); setCompressSummary('') }}>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-5 mx-4 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-medium text-gray-200 mb-1">对话压缩</h3>
            <p className="text-xs text-gray-500 mb-3">
              将当前对话历史压缩为摘要，释放上下文空间。压缩后所有消息将被清除，仅保留生成的摘要作为角色记忆。
            </p>

            <textarea
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none transition-colors h-28 resize-none mb-2"
              value={compressSummary}
              onChange={e => setCompressSummary(e.target.value)}
              placeholder="手动输入摘要，或点击下方按钮让AI自动生成..."
            />

            <button
              type="button"
              onClick={async () => {
                const apiKey = getApiKey()
                if (!apiKey) {
                  setError('请先在设置页面填写 API Key')
                  return
                }
                if (messages.filter(m => m.role !== 'system').length === 0) {
                  setError('没有可压缩的对话内容')
                  return
                }
                setCompressing(true)
                const { summary, error: compressError } = await compressChatHistory(messages, apiKey)
                setCompressing(false)
                if (compressError || !summary) {
                  setError('压缩失败: ' + (compressError?.message || '未知错误'))
                  return
                }
                setCompressSummary(summary)
              }}
              disabled={compressing}
              className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium transition-colors mb-3"
            >
              {compressing ? 'AI压缩中...' : '🤖 AI自动压缩'}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowCompress(false); setCompressSummary('') }}
                className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const summary = compressSummary.trim()
                  if (!summary) {
                    setError('请填写摘要内容或使用AI自动压缩')
                    return
                  }
                  const memoryMsg = { role: 'system', content: '【历史剧情摘要】\n' + summary }
                  setMessages([memoryMsg])
                  setShowCompress(false)
                  setCompressSummary('')
                  setError('')
                }}
                disabled={!compressSummary.trim()}
                className="flex-[2] py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-medium transition-all disabled:opacity-50"
              >
                确认压缩
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dice panel */}
      {showDice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowDice(false); setDiceResult(null) }}>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-5 mx-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <h3 className="text-base font-medium text-gray-200">随机事件骰子</h3>
            </div>

            <div className="mb-5 text-center">
              {diceRolling ? (
                <div className="py-6">
                  <span className="inline-block text-5xl animate-dice-roll">🎲</span>
                  <p className="text-xs text-gray-500 mt-2">投掷中...</p>
                </div>
              ) : diceResult != null ? (
                <div className="py-4">
                  <div className="text-5xl mb-2">🎲</div>
                  <div className="text-3xl font-bold text-amber-400">
                    投出了 {diceResult}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {diceResult >= 17 ? '重大事件，剧情即将突变' :
                     diceResult >= 12 ? '显著事件，角色将深度卷入' :
                     diceResult >= 7 ? '一般事件，增添叙事层次' :
                     '轻微事件，一个小插曲'}
                  </p>
                </div>
              ) : (
                <div className="py-6">
                  <span className="text-5xl">🎲</span>
                  <p className="text-xs text-gray-500 mt-2">点击下方按钮投掷骰子</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setShowDice(false); setDiceResult(null) }}
                className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
              >
                {diceResult != null ? '取消' : '返回'}
              </button>
              {diceResult != null ? (
                <button
                  onClick={() => handleDiceTrigger(diceResult)}
                  disabled={loading}
                  className="flex-[2] py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-medium transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  确认触发
                </button>
              ) : (
                <button
                  onClick={() => {
                    setDiceRolling(true)
                    setDiceResult(null)
                    setTimeout(() => {
                      const result = Math.floor(Math.random() * 20) + 1
                      setDiceRolling(false)
                      setDiceResult(result)
                    }, 800)
                  }}
                  disabled={diceRolling}
                  className="flex-[2] py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-medium transition-all disabled:opacity-50 active:scale-[0.98]"
                >
                  掷骰子
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
