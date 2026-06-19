import { useState, useEffect, useRef } from 'react'
import { getFolder, getSaves, createSave, deleteSave, renameSave, getFolderCharacters } from '../state/folderStore'
import { getPlayerProfile } from '../utils/storage'

export default function FolderInterior({ folderId, onBack, onEnterDrama, onEnterDaily }) {
  const [folder, setFolder] = useState(null)
  const [saves, setSaves] = useState([])
  const [chars, setChars] = useState([])
  const [profile, setProfile] = useState({ name: '', avatar: '' })
  const [fabOpen, setFabOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const longPressRef = useRef(null)

  const refresh = () => {
    const f = getFolder(folderId)
    setFolder(f)
    if (f) {
      setSaves(getSaves(f.id))
      setChars(getFolderCharacters(f.id))
    }
    setProfile(getPlayerProfile())
  }

  useEffect(() => { refresh() }, [folderId])
  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const handleNewSave = () => {
    const name = '存档 ' + (saves.length + 1)
    const save = createSave(folderId, name)
    if (save) {
      setFabOpen(false)
      refresh()
    }
  }

  const handleRenameSave = (saveId, currentName) => {
    const newName = prompt('新名称：', currentName)
    if (!newName) return
    renameSave(saveId, folderId, newName.trim())
    refresh()
  }

  const handleDeleteSave = (saveId) => {
    deleteSave(saveId, folderId)
    setDeleteTarget(null)
    refresh()
  }

  // Long press detection
  const handleTouchStart = (saveId) => {
    longPressRef.current = setTimeout(() => {
      setDeleteTarget(saveId)
    }, 600)
  }
  const handleTouchEnd = () => {
    clearTimeout(longPressRef.current)
  }

  const formatDate = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  }

  if (!folder) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: '48px' }}>
          <button onClick={onBack} style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: 'var(--bg2)', cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
          世界不存在
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 16px', height: '48px',
        borderBottom: '0.5px solid var(--border2)',
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          width: '32px', height: '32px', borderRadius: '8px',
          border: 'none', background: 'var(--bg2)',
          cursor: 'pointer', color: 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginRight: '32px' }}>
          {folder.name}
        </span>
      </div>

      {/* ── Folder Info Bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        margin: '16px 24px', padding: '14px',
        borderRadius: '14px', background: 'var(--bg3)',
        flexShrink: 0,
      }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '22px',
          overflow: 'hidden', background: 'var(--bg)',
          border: '0.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {profile.avatar ? (
            <img src={profile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text3)' }}>
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/>
            </svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>
            {folder.name}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chars.length} 位角色 · {folder.worldview ? folder.worldview.slice(0, 40) + '…' : '暂无世界观'}
          </div>
        </div>
      </div>

      {/* ── Save Slots List ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '12px',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.5px' }}>
            📁 存档 ({saves.length})
          </span>
        </div>

        {saves.length === 0 ? (
          <div style={{
            textAlign: 'center', color: 'var(--text3)', fontSize: '13px',
            padding: '48px 0', lineHeight: 1.8,
          }}>
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>💾</div>
            还没有存档<br />点击右下角 + 创建第一个存档
          </div>
        ) : (
          saves.map((s) => (
            <div
              key={s.id}
              onTouchStart={() => handleTouchStart(s.id)}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchEnd}
              style={{
                padding: '14px',
                borderRadius: '12px',
                border: '0.5px solid var(--border)',
                background: deleteTarget === s.id ? 'var(--coral-l)' : 'var(--bg)',
                marginBottom: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
              onMouseEnter={e => e.currentTarget.style.background = deleteTarget === s.id ? 'var(--coral-l)' : 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = deleteTarget === s.id ? 'var(--coral-l)' : 'var(--bg)'}
            >
              {/* If in delete mode, show delete button */}
              {deleteTarget === s.id ? (
                <>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: 'var(--coral)', fontWeight: 500 }}>确认删除？</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.name}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteSave(s.id) }}
                    style={{
                      padding: '6px 14px', borderRadius: '8px', border: 'none',
                      background: 'var(--coral)', color: '#fff', fontSize: '12px',
                      cursor: 'pointer', fontWeight: 500,
                    }}
                  >
                    删除
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(null) }}
                    style={{
                      padding: '6px 14px', borderRadius: '8px', border: 'none',
                      background: 'var(--bg2)', color: 'var(--text2)', fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  {/* World icon */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: 'var(--bg3)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', flexShrink: 0,
                  }}>
                    💬
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', marginBottom: '3px' }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', gap: '12px' }}>
                      <span>{formatDate(s.createdAt)}</span>
                      <span>{(s.messages || []).length} 条消息</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRenameSave(s.id, s.name) }}
                      style={{
                        width: '28px', height: '28px', borderRadius: '8px', border: 'none',
                        background: 'var(--bg3)', color: 'var(--text3)', fontSize: '12px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      title="重命名"
                    >
                      ✎
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Bottom: Mode Button Group ── */}
      <div style={{
        display: 'flex', gap: '10px',
        padding: '12px 24px',
        borderTop: '0.5px solid var(--border2)',
        flexShrink: 0,
        position: 'relative',
      }}>
        <button
          onClick={() => onEnterDrama && onEnterDrama(folder)}
          style={{
            flex: 1, padding: '14px 0', borderRadius: '14px',
            border: '0.5px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--text)'; e.currentTarget.style.color = 'var(--bg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text)' }}
        >
          📖 剧情模式
        </button>
        <button
          onClick={() => onEnterDaily && onEnterDaily(folder)}
          style={{
            flex: 1, padding: '14px 0', borderRadius: '14px',
            border: '0.5px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--text)'; e.currentTarget.style.color = 'var(--bg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text)' }}
        >
          💬 日常模式
        </button>

        {/* ── Floating Action Button: New Save ── */}
        <div style={{ position: 'absolute', right: '20px', top: '-24px' }}>
          {fabOpen && (
            <div style={{
              position: 'absolute',
              bottom: '52px',
              right: '0',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              alignItems: 'flex-end',
            }}>
              <button
                onClick={handleNewSave}
                style={{
                  padding: '6px 14px', borderRadius: '10px', border: '0.5px solid var(--border)',
                  background: 'var(--bg)', color: 'var(--text2)', fontSize: '12px',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                + 新建存档
              </button>
            </div>
          )}
          <button
            onClick={() => setFabOpen(v => !v)}
            style={{
              width: '48px', height: '48px', borderRadius: '16px',
              border: '0.5px solid var(--border)',
              background: fabOpen ? 'var(--text)' : 'var(--bg)',
              color: fabOpen ? 'var(--bg)' : 'var(--text2)',
              fontSize: '20px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              transition: 'all 0.15s',
            }}
          >
            {fabOpen ? '×' : '+'}
          </button>
        </div>
      </div>
    </div>
  )
}
