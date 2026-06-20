import { useState, useEffect } from 'react'
import { getAllFolders, deleteFolder } from '../state/folderStore'
import { getPlayerProfile } from '../utils/storage'

/**
 * Entry — Opening page. 2-column layout:
 *   Left (76px) : toolbar — player avatar, world cards, profile icon, settings icon
 *   Right(flex:1): main — large avatar (selected folder or player), create button
 *
 * Card click → preview in center. Center avatar click → enter folder.
 * Create button → create folder page.
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
  const [selectedFolder, setSelectedFolder] = useState(null)

  const refresh = () => {
    const all = getAllFolders()
    setFolders(all)
    setProfile(getPlayerProfile())
    // Keep selection if folder still exists
    if (selectedFolder && !all.find(f => f.id === selectedFolder.id)) {
      setSelectedFolder(null)
    }
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  // First folder avatar for center display
  const displayFolder = selectedFolder || (folders.length > 0 ? folders[0] : null)
  // Use first character's initial as avatar fallback
  const firstChar = displayFolder?.characterData?.[0]
  const displayName = displayFolder?.name || profile.name || '玩家'
  const displayAvatar = firstChar?.avatar || profile.avatar || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', background: 'var(--bg)' }}>

      {/* ═══ LEFT — 76px toolbar ═══ */}
      <div style={{
        width: '76px', flexShrink: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '12px 8px', background: 'var(--bg2)',
        borderRight: '0.5px solid var(--border2)', height: '100%', overflowY: 'auto',
      }}>
        {/* Player avatar thumbnail (top) */}
        <div onClick={onProfile} style={{ cursor: 'pointer', marginBottom: '16px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden',
            background: 'var(--bg3)', border: '0.5px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {profile.avatar ? (
              <img src={profile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
            )}
          </div>
        </div>

        {/* World card list (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {folders.length === 0 ? (
            <div style={{ fontSize: '20px', color: 'var(--text3)', marginTop: '8px' }}>🌍</div>
          ) : (
            folders.map((f) => {
              const isSelected = selectedFolder?.id === f.id
              return (
                <div key={f.id}
                  onClick={() => setSelectedFolder(f)}
                  style={{
                    width: '52px', height: '52px', borderRadius: '10px',
                    background: isSelected ? 'var(--bg)' : 'var(--bg3)',
                    border: isSelected ? '2px solid var(--purple)' : '0.5px solid var(--border)',
                    marginBottom: '10px', cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '20px', position: 'relative', transition: 'all 0.12s',
                  }}
                  title={f.name}
                >
                  {f.characterData?.[0]?.name?.[0] || f.name?.[0] || '?'}
                  {/* Delete button — long press / right-click */}
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (confirm(`确定删除世界"${f.name}"？`)) {
                        deleteFolder(f.id)
                        if (isSelected) setSelectedFolder(null)
                        setFolders(getAllFolders())
                      }
                    }}
                    style={{
                      position: 'absolute', top: '-4px', right: '-4px',
                      width: '16px', height: '16px', borderRadius: '50%',
                      border: 'none', background: 'var(--coral)', color: '#fff',
                      fontSize: '9px', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', opacity: 0.7,
                    }}
                    title="删除"
                  >×</button>
                </div>
              )
            })
          )}
        </div>

        {/* Bottom icons */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '8px' }}>
          <button onClick={onProfile} title="玩家设定" style={{
            width: '36px', height: '36px', borderRadius: '18px',
            border: '0.5px solid var(--border)', background: 'var(--bg)',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text2)',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
          </button>
          <button onClick={onSettings} title="设置" style={{
            width: '36px', height: '36px', borderRadius: '18px',
            border: '0.5px solid var(--border)', background: 'var(--bg)',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--text2)',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          </button>
        </div>
      </div>

      {/* ═══ RIGHT — flex:1: main display ═══ */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '24px', padding: '24px',
      }}>
        {/* Large round avatar — shows selected folder character or player */}
        <div
          onClick={() => {
            if (displayFolder) onEnterFolder(displayFolder)
          }}
          style={{
            width: '96px', height: '96px', borderRadius: '48px', overflow: 'hidden',
            cursor: displayFolder ? 'pointer' : 'default',
            background: 'var(--bg3)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => { if (displayFolder) e.currentTarget.style.transform = 'scale(1.04)' }}
          onMouseLeave={e => { if (displayFolder) e.currentTarget.style.transform = 'scale(1)' }}
        >
          {displayAvatar ? (
            <img src={displayAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '32px', color: 'var(--text3)' }}>
              {displayFolder ? (firstChar?.name?.[0] || displayFolder.name[0] || '?') : (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
              )}
            </span>
          )}
        </div>

        {/* Name */}
        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', textAlign: 'center' }}>
          {displayName}
        </div>

        {/* Subtitle */}
        {displayFolder && (
          <div style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center', maxWidth: '260px', lineHeight: 1.5 }}>
            {displayFolder.worldview ? displayFolder.worldview.slice(0, 60) + (displayFolder.worldview.length > 60 ? '…' : '') : '暂无世界观'}
            {displayFolder.characterData && (
              <div style={{ marginTop: '4px' }}>{displayFolder.characterData.length} 位角色</div>
            )}
          </div>
        )}

        {/* Create world button — purple pill */}
        <button onClick={onCreateFolder} style={{
          padding: '14px 40px', borderRadius: '24px', border: 'none',
          background: 'var(--purple)', color: '#fff', fontSize: '14px',
          fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px',
        }}>
          + 创建世界观故事
        </button>

        {/* Enter button — shown when a folder is selected */}
        {displayFolder && (
          <button onClick={() => onEnterFolder(displayFolder)} style={{
            padding: '10px 32px', borderRadius: '16px',
            border: '0.5px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text2)', fontSize: '13px', cursor: 'pointer',
          }}>
            进入世界
          </button>
        )}
      </div>
    </div>
  )
}
