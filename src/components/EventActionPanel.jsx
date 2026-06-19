import { useState } from 'react'

/**
 * EventActionPanel — Drama mode floating action panel.
 * Provides: random event (dice), edit episode, delete node.
 *
 * Props:
 *   onDiceOpen: () => void
 *   onEditLast: () => void
 *   onDeleteLast: () => void
 *   hasMessages: boolean — whether there are messages to edit/delete
 *   tension: number — current tension value for display
 */
export default function EventActionPanel({
  onDiceOpen,
  onEditLast,
  onDeleteLast,
  hasMessages = false,
  tension = 50,
}) {
  const [expanded, setExpanded] = useState(false)

  const btnBase = {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    border: '0.5px solid var(--border)',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: '16px',
    color: 'var(--text2)',
    transition: 'all 0.15s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }

  return (
    <div style={{
      position: 'absolute',
      right: '12px',
      bottom: '80px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: 20,
      alignItems: 'flex-end',
    }}>
      {/* Expanded buttons */}
      {expanded && (
        <>
          <button
            style={btnBase}
            onClick={() => { onDiceOpen(); setExpanded(false) }}
            title="随机事件骰子"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.transform = 'scale(1.05)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.transform = 'scale(1)' }}
          >
            🎲
          </button>
          <button
            style={{ ...btnBase, opacity: hasMessages ? 1 : 0.3, cursor: hasMessages ? 'pointer' : 'default' }}
            onClick={() => { if (hasMessages) { onEditLast(); setExpanded(false) } }}
            title="编辑最后一条"
            onMouseEnter={e => { if (hasMessages) { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.transform = 'scale(1.05)' } }}
            onMouseLeave={e => { if (hasMessages) { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.transform = 'scale(1)' } }}
          >
            ✏️
          </button>
          <button
            style={{ ...btnBase, opacity: hasMessages ? 1 : 0.3, cursor: hasMessages ? 'pointer' : 'default' }}
            onClick={() => { if (hasMessages) { onDeleteLast(); setExpanded(false) } }}
            title="删除最后一条"
            onMouseEnter={e => { if (hasMessages) { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.transform = 'scale(1.05)' } }}
            onMouseLeave={e => { if (hasMessages) { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.transform = 'scale(1)' } }}
          >
            🗑
          </button>
        </>
      )}

      {/* Tension indicator (always visible) */}
      <div style={{
        padding: '4px 10px',
        borderRadius: '10px',
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        fontSize: '10px',
        color: 'var(--text3)',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <span>⚡</span>
        <span>{tension}</span>
      </div>

      {/* Main toggle button */}
      <button
        style={{
          ...btnBase,
          width: '48px',
          height: '48px',
          borderRadius: '14px',
          fontSize: '18px',
          background: expanded ? 'var(--text)' : 'var(--bg)',
          color: expanded ? 'var(--bg)' : 'var(--text2)',
          boxShadow: expanded ? '0 2px 8px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? '×' : '✦'}
      </button>
    </div>
  )
}
