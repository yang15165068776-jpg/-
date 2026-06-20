import { useState, useEffect } from 'react'
import { getAllFolders, deleteFolder } from '../state/folderStore'
import { getPlayerProfile } from '../utils/storage'

/**
 * Entry — Opening page. Strict 3-column layout:
 *   Left  : Story world card list + action button
 *   Center: Large player avatar
 *   Right : Create world button + Settings entry
 */
export default function Entry({
  onEnterFolder,
  onCreateFolder,
  onProfile,
  onSettings,
  onLegacyList,
}) {
  const [folders, setFolders] = useState([])
  const [profile, setProfile] = useState({ name: '', avatar: '' })

  const refresh = () => {
    setFolders(getAllFolders())
    setProfile(getPlayerProfile())
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      {/* ══════════════════════════════════════
          LEFT COLUMN — Story world cards
          ══════════════════════════════════════ */}
      <div style={{
        width: '34%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '0.5px solid var(--border2)',
        overflow: 'hidden',
      }}>
        {/* Card list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 10px',
        }}>
          <div style={{
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--text3)',
            letterSpacing: '0.5px',
            marginBottom: '8px',
            padding: '0 2px',
          }}>
            世界
          </div>

          {folders.length === 0 ? (
            <div style={{
              textAlign: 'center',
              color: 'var(--text3)',
              fontSize: '11px',
              padding: '20px 0',
              lineHeight: 1.6,
            }}>
              <div style={{ fontSize: '28px', marginBottom: '4px' }}>🌍</div>
              暂无
            </div>
          ) : (
            folders.map((f) => {
              const charCount = (f.characterData || []).length + (f.characterIds || []).length
              return (
                <div
                  key={f.id}
                  onClick={() => onEnterFolder(f)}
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    border: '0.5px solid var(--border)',
                    background: 'var(--bg)',
                    marginBottom: '6px',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bg)'}
                >
                  {/* Delete button — stop propagation so click doesn't enter folder */}
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (confirm(`确定删除世界"${f.name}"？\n所有存档将被永久删除。`)) {
                        deleteFolder(f.id)
                        setFolders(getAllFolders())
                      }
                    }}
                    style={{
                      position: 'absolute', top: '4px', right: '4px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      border: 'none', background: 'transparent',
                      color: 'var(--text3)', fontSize: '11px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="删除世界"
                  >×</button>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {f.name}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--text3)',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    marginBottom: '4px',
                    lineHeight: 1.4,
                  }}>
                    {f.worldview ? f.worldview.slice(0, 40) + (f.worldview.length > 40 ? '…' : '') : '暂无世界观'}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text3)' }}>
                    {charCount} 角色
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Left bottom button */}
        <div style={{ padding: '8px 10px', borderTop: '0.5px solid var(--border2)' }}>
          <button
            onClick={onLegacyList}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '8px',
              border: '0.5px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text3)',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            旧版角色
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════
          CENTER — Large player avatar
          ══════════════════════════════════════ */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        {/* Avatar circle */}
        <div
          onClick={onProfile}
          style={{
            width: '96px',
            height: '96px',
            borderRadius: '48px',
            overflow: 'hidden',
            cursor: 'pointer',
            background: 'var(--bg3)',
            border: '0.5px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.15s',
            marginBottom: '12px',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {profile.avatar ? (
            <img src={profile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ color: 'var(--text3)' }}>
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 4-7 8-7s8 3 8 7"/>
            </svg>
          )}
        </div>

        {/* Player name */}
        <div style={{
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--text)',
          textAlign: 'center',
          marginBottom: '2px',
        }}>
          {profile.name || '玩家'}
        </div>
        <div style={{
          fontSize: '11px',
          color: 'var(--text3)',
          textAlign: 'center',
        }}>
          Character OS
        </div>
      </div>

      {/* ══════════════════════════════════════
          RIGHT COLUMN — Actions
          ══════════════════════════════════════ */}
      <div style={{
        width: '30%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '0.5px solid var(--border2)',
        padding: '12px 10px',
        gap: '8px',
      }}>
        {/* Create world — primary */}
        <button
          onClick={onCreateFolder}
          style={{
            width: '100%',
            padding: '14px 8px',
            borderRadius: '12px',
            border: 'none',
            background: 'var(--text)',
            color: 'var(--bg)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.3px',
            marginTop: '4px',
          }}
        >
          + 创建世界
        </button>

        {/* Settings entry */}
        <button
          onClick={onSettings}
          style={{
            width: '100%',
            padding: '12px 8px',
            borderRadius: '10px',
            border: '0.5px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text2)',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          设置
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Player quick info */}
        <div style={{
          textAlign: 'center',
          padding: '8px',
          borderRadius: '8px',
          background: 'var(--bg3)',
          fontSize: '10px',
          color: 'var(--text3)',
          lineHeight: 1.5,
        }}>
          {profile.name || '未设定玩家'}
        </div>
      </div>
    </div>
  )
}
