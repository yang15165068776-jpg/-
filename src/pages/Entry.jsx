import { useState, useEffect } from 'react'
import { getAllFolders, deleteFolder } from '../state/folderStore'
import { getPlayerProfile } from '../utils/storage'

/**
 * Entry — Opening page. 3-column layout:
 *   Left  (34%)  : player avatar thumbnail + world card list
 *   Center(flex:1): large round avatar + create world button
 *   Right (70px) : profile icon + settings icon (bottom-aligned)
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
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ═══ LEFT — 34%: thumbnail + world cards ═══ */}
      <div style={{ width: '34%', display: 'flex', flexDirection: 'column', borderRight: '0.5px solid var(--border2)', overflow: 'hidden' }}>
        {/* Player thumbnail */}
        <div onClick={onProfile} style={{ padding: '12px 10px 8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg3)', border: '0.5px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {profile.avatar ? (
              <img src={profile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
            )}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile.name || '玩家'}
          </span>
        </div>

        {/* World card list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text3)', letterSpacing: '0.5px', marginBottom: '8px', padding: '0 2px' }}>
            世界
          </div>

          {folders.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '11px', padding: '20px 0', lineHeight: 1.6 }}>
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
                  style={{ padding: '10px 12px', borderRadius: '14px', background: 'var(--bg2)', marginBottom: '8px', cursor: 'pointer', transition: 'background 0.12s', position: 'relative' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}
                >
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm(`确定删除世界"${f.name}"？\n所有存档将被永久删除。`)) { deleteFolder(f.id); setFolders(getAllFolders()) } }}
                    style={{ position: 'absolute', top: '6px', right: '6px', width: '18px', height: '18px', borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="删除世界"
                  >×</button>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '16px' }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: '4px', lineHeight: 1.4 }}>
                    {f.worldview ? f.worldview.slice(0, 40) + (f.worldview.length > 40 ? '…' : '') : '暂无世界观'}
                  </div>
                  <div style={{ fontSize: '9px', color: 'var(--text3)' }}>{charCount} 角色</div>
                </div>
              )
            })
          )}
        </div>

        {/* Bottom: legacy link */}
        <div style={{ padding: '8px 10px', borderTop: '0.5px solid var(--border2)' }}>
          <button onClick={onLegacyList} style={{ width: '100%', padding: '8px', borderRadius: '12px', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text3)', fontSize: '10px', cursor: 'pointer' }}>
            旧版角色
          </button>
        </div>
      </div>

      {/* ═══ CENTER — flex:1: big avatar + create button ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        {/* Large round avatar */}
        <div onClick={onProfile} style={{ width: '88px', height: '88px', borderRadius: '44px', overflow: 'hidden', cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s', marginBottom: '16px' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {profile.avatar ? (
            <img src={profile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
          )}
        </div>

        {/* Player name */}
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', textAlign: 'center', marginBottom: '18px' }}>
          {profile.name || '玩家'}
        </div>

        {/* Create world button — purple pill */}
        <button onClick={onCreateFolder} style={{ padding: '12px 32px', borderRadius: '24px', border: 'none', background: 'var(--purple)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px' }}>
          + 创建世界观故事
        </button>
      </div>

      {/* ═══ RIGHT — 70px: icon buttons at bottom ═══ */}
      <div style={{ width: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '12px 0', borderLeft: '0.5px solid var(--border2)', gap: '12px' }}>
        {/* Profile icon */}
        <button onClick={onProfile} style={{ width: '40px', height: '40px', borderRadius: '20px', border: '0.5px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}
          title="玩家设定"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
        </button>

        {/* Settings icon */}
        <button onClick={onSettings} style={{ width: '40px', height: '40px', borderRadius: '20px', border: '0.5px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}
          title="设置"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </button>

        {/* User name at bottom */}
        <div style={{ fontSize: '9px', color: 'var(--text3)', textAlign: 'center', padding: '4px', lineHeight: 1.3, marginTop: 'auto' }}>
          {profile.name || '未设定'}
        </div>
      </div>
    </div>
  )
}
