import { useState, useEffect, useRef } from 'react'
import { getAllFolders } from '../state/folderStore'
import { getPlayerProfile } from '../utils/storage'

/**
 * Entry — Opening page of Character OS.
 * Large player avatar center, horizontal world card carousel, create button.
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
  const carouselRef = useRef(null)

  const refresh = () => {
    setFolders(getAllFolders())
    setProfile(getPlayerProfile())
  }

  useEffect(() => { refresh() }, [])
  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const formatDate = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
    return (d.getMonth() + 1) + '/' + d.getDate()
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      {/* ── Settings gear (bottom-right of screen) ── */}
      <button
        onClick={onSettings}
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          width: '40px',
          height: '40px',
          borderRadius: '20px',
          border: '0.5px solid var(--border)',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--text3)',
          zIndex: 10,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      </button>

      {/* ── Center: Large Avatar ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '48px',
        paddingBottom: '20px',
        flexShrink: 0,
      }}>
        <div
          onClick={onProfile}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '40px',
            overflow: 'hidden',
            cursor: 'pointer',
            background: 'var(--bg3)',
            border: '0.5px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {profile.avatar ? (
            <img src={profile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text3)' }}>
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 4-7 8-7s8 3 8 7"/>
            </svg>
          )}
        </div>
        <div style={{
          marginTop: '10px',
          fontSize: '15px',
          fontWeight: 500,
          color: 'var(--text)',
        }}>
          {profile.name || '玩家'}
        </div>
      </div>

      {/* ── World Card Carousel ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {folders.length === 0 ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 32px',
          }}>
            <div style={{
              textAlign: 'center',
              color: 'var(--text3)',
              fontSize: '14px',
              lineHeight: 1.8,
            }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🌍</div>
              还没有世界<br />
              点击下方按钮创建你的第一个世界
            </div>
          </div>
        ) : (
          <>
            <div style={{
              padding: '0 24px',
              marginBottom: '12px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text2)',
              letterSpacing: '0.5px',
            }}>
              你的世界
            </div>
            <div
              ref={carouselRef}
              style={{
                display: 'flex',
                gap: '12px',
                overflowX: 'auto',
                scrollSnapType: 'x mandatory',
                padding: '4px 24px 16px',
                WebkitOverflowScrolling: 'touch',
                scrollBehavior: 'smooth',
              }}
            >
              {folders.map((f) => {
                const charCount = (f.characterData || []).length + (f.characterIds || []).length
                const saveCount = (f.saveIds || []).length
                return (
                  <div
                    key={f.id}
                    onClick={() => onEnterFolder(f)}
                    style={{
                      minWidth: '200px',
                      maxWidth: '200px',
                      padding: '20px 16px',
                      borderRadius: '16px',
                      border: '0.5px solid var(--border)',
                      background: 'var(--bg)',
                      cursor: 'pointer',
                      scrollSnapAlign: 'start',
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'box-shadow 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    {/* World icon placeholder */}
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: 'var(--bg3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      marginBottom: '14px',
                    }}>
                      🌏
                    </div>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text)',
                      marginBottom: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {f.name}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text3)',
                      lineHeight: 1.5,
                      marginBottom: '12px',
                      flex: 1,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {f.worldview ? f.worldview.slice(0, 50) + (f.worldview.length > 50 ? '…' : '') : '暂无世界观描述'}
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      color: 'var(--text3)',
                    }}>
                      <span>{charCount} 角色 · {saveCount} 存档</span>
                      <span>{formatDate(f.updatedAt || f.createdAt)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Bottom: Create Button ── */}
      <div style={{
        padding: '12px 24px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <button
          onClick={onCreateFolder}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '14px',
            border: 'none',
            background: 'var(--text)',
            color: 'var(--bg)',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.3px',
          }}
        >
          + 创建新世界
        </button>
        <button
          onClick={onLegacyList}
          style={{
            width: '100%',
            padding: '6px',
            borderRadius: '8px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text3)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          查看旧版角色列表
        </button>
      </div>
    </div>
  )
}
