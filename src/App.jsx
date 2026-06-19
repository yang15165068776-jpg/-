import { useState, useCallback, useEffect } from 'react'
import Entry from './pages/Entry'
import PlayerProfile from './pages/PlayerProfile'
import CreateFolder from './pages/CreateFolder'
import FolderInterior from './pages/FolderInterior'
import StoryCharacterList from './pages/story/CharacterList'
import StoryCharacterForm from './pages/story/CharacterForm'
import DailyCharacterList from './pages/daily/CharacterList'
import DailyCharacterForm from './pages/daily/CharacterForm'
import CharacterHome from './pages/CharacterHome'
import DramaPage from './pages/DramaPage'
import DailyPage from './pages/DailyPage'
import Settings from './pages/Settings'
import DirectChat from './pages/DirectChat'
import Toast from './components/Toast'
import StatusBar from './components/StatusBar'

// ═══════════════════════════════════════
// 🔴 KILL SWITCH v2 — Legacy Lockdown
// ═══════════════════════════════════════

/** Only these routes are allowed to execute. Everything else is dead. */
const V6_ROUTES = new Set([
  'entry',
  'profile',
  'createFolder',
  'folder',
  'dramaPage',
  'dailyPage',
])

/**
 * Legacy redirect: these routes silently bounce to entry.
 * They exist in the codebase but cannot be navigated to.
 */
const LEGACY_REDIRECT = new Set([
  'list',
  'form',
  'settings',
])

/**
 * Legacy block: these routes are forcibly replaced with <Entry />.
 * If they somehow render, the user sees entry instead.
 */
const LEGACY_BLOCKED = new Set([
  'character',
  'direct',
])

/** Master kill flag — set false to physically unmount all legacy. */
const LEGACY_ENABLED = false

export default function App() {
  const [page, setPage] = useState('entry')
  const [mode, setMode] = useState('story')
  const [characterId, setCharacterId] = useState(null)
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' })
  const showToast = useCallback((message, type = 'info') => {
    setToast({ visible: true, message, type })
  }, [])

  // ═══════════════════════════════════════
  // 🔴 Kill Switch: Runtime Lock
  // ═══════════════════════════════════════
  useEffect(() => {
    window.__LEGACY_LOCK__ = true
    console.log('[KILL SWITCH] v6 UI ACTIVE — legacy locked down')
  }, [])

  // ═══════════════════════════════════════
  // 🔴 Kill Switch: safeSetPage
  // ═══════════════════════════════════════
  const safeSetPage = useCallback((nextPage) => {
    // Legacy redirect: silently bounce to entry
    if (LEGACY_REDIRECT.has(nextPage)) {
      console.warn('[KILL SWITCH] Legacy route redirected to entry:', nextPage)
      setPage('entry')
      return
    }

    // Legacy blocked: bounce to entry with warning
    if (LEGACY_BLOCKED.has(nextPage)) {
      console.warn('[KILL SWITCH] Blocked legacy route:', nextPage)
      setPage('entry')
      return
    }

    // Unknown route: bounce to entry
    if (!V6_ROUTES.has(nextPage)) {
      console.warn('[KILL SWITCH] Unknown route blocked:', nextPage)
      setPage('entry')
      return
    }

    setPage(nextPage)
  }, [])

  // ── v6: Folder navigation (all through safeSetPage) ──
  const handleEnterFolder = useCallback((folder) => {
    setSelectedFolder(folder)
    safeSetPage('folder')
  }, [safeSetPage])

  const handleCreateFolder = useCallback(() => {
    safeSetPage('createFolder')
  }, [safeSetPage])

  const handleFolderCreated = useCallback((folder) => {
    setSelectedFolder(folder)
    safeSetPage('folder')
    showToast('世界创建成功！', 'success')
  }, [showToast, safeSetPage])

  const handleProfile = useCallback(() => {
    safeSetPage('profile')
  }, [safeSetPage])

  // ── v6: Drama/Daily entry ──
  const handleEnterDrama = useCallback((folder) => {
    const chars = (folder.characterData || []).filter(c => !c.type || c.type !== 'npc')
    if (chars.length === 0) {
      showToast('请先在文件夹中添加角色', 'error')
      return
    }
    setSelectedFolder({ ...folder, _chars: chars })
    safeSetPage('dramaPage')
  }, [showToast, safeSetPage])

  const handleEnterDaily = useCallback((folder) => {
    const chars = (folder.characterData || []).filter(c => !c.type || c.type !== 'npc')
    if (chars.length === 0) {
      showToast('请先在文件夹中添加角色', 'error')
      return
    }
    setSelectedFolder({ ...folder, _chars: chars })
    safeSetPage('dailyPage')
  }, [showToast, safeSetPage])

  // ── Page state checks ──
  const isEntry = page === 'entry'
  const isProfile = page === 'profile'
  const isCreateFolder = page === 'createFolder'
  const isFolder = page === 'folder'
  const isDramaPage = page === 'dramaPage'
  const isDailyPage = page === 'dailyPage'
  const isV6Page = V6_ROUTES.has(page)
  const isBlocked = LEGACY_BLOCKED.has(page) || (!V6_ROUTES.has(page) && !LEGACY_REDIRECT.has(page))

  // Pages with their own header (no legacy nav bar)
  const hasOwnHeader = isEntry || isProfile || isCreateFolder || isFolder || isDramaPage || isDailyPage || isBlocked

  return (
    <div style={{ maxWidth: '430px', height: '100dvh', margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
      {/* ── Phone Shell: Status Bar ── */}
      <StatusBar />

      {/* ── Legacy nav header (dead zone — only renders if legacy somehow active) ── */}
      {!hasOwnHeader && LEGACY_ENABLED && (
        <header style={{ background: 'var(--bg)', borderBottom: '0.5px solid var(--border2)', flexShrink: 0 }}>
          <div style={{ padding: '0 16px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              {page === 'list' ? '角色列表' : page === 'form' ? (characterId ? '编辑角色' : '新建角色') : ''}
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => safeSetPage('entry')} style={{ background: 'var(--bg2)', border: 'none', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer' }}>🏠</button>
            </div>
          </div>
        </header>
      )}

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ═══════════════════════════════════════
            v6 ROUTES — the only code that runs
            ═══════════════════════════════════════ */}
        {isEntry && (
          <Entry
            onEnterFolder={handleEnterFolder}
            onCreateFolder={handleCreateFolder}
            onProfile={handleProfile}
            onSettings={() => safeSetPage('settings')}
            onLegacyList={() => safeSetPage('list')}
          />
        )}
        {isProfile && (
          <PlayerProfile onBack={() => safeSetPage('entry')} />
        )}
        {isCreateFolder && (
          <CreateFolder
            onBack={() => safeSetPage('entry')}
            onCreated={handleFolderCreated}
          />
        )}
        {isFolder && selectedFolder && (
          <FolderInterior
            folderId={selectedFolder.id}
            onBack={() => { setSelectedFolder(null); safeSetPage('entry') }}
            onEnterDrama={handleEnterDrama}
            onEnterDaily={handleEnterDaily}
          />
        )}
        {isDramaPage && selectedFolder && (
          <DramaPage
            folderId={selectedFolder.id}
            folderChars={selectedFolder._chars || []}
            onBack={() => { setSelectedFolder(null); safeSetPage('folder') }}
          />
        )}
        {isDailyPage && selectedFolder && (
          <DailyPage
            folderId={selectedFolder.id}
            folderChars={selectedFolder._chars || []}
            onBack={() => { setSelectedFolder(null); safeSetPage('folder') }}
          />
        )}

        {/* ═══════════════════════════════════════
            🔴 DEAD ZONE — blocked routes
            ═══════════════════════════════════════ */}
        {isBlocked && (
          <Entry
            onEnterFolder={handleEnterFolder}
            onCreateFolder={handleCreateFolder}
            onProfile={handleProfile}
            onSettings={() => safeSetPage('settings')}
            onLegacyList={() => safeSetPage('list')}
          />
        )}

        {/* ═══════════════════════════════════════
            ☠️ LEGACY — only if LEGACY_ENABLED=true
            ═══════════════════════════════════════ */}
        {LEGACY_ENABLED && page === 'list' && mode === 'story' && (
          <StoryCharacterList onCreate={handleCreateFolder} onEdit={() => {}} onArchives={() => {}} />
        )}
        {LEGACY_ENABLED && page === 'list' && mode === 'daily' && (
          <DailyCharacterList onCreate={handleCreateFolder} onEdit={() => {}} onArchives={() => {}} />
        )}
        {LEGACY_ENABLED && page === 'form' && mode === 'story' && (
          <StoryCharacterForm characterId={characterId} onSave={() => safeSetPage('entry')} onCancel={() => safeSetPage('entry')} />
        )}
        {LEGACY_ENABLED && page === 'form' && mode === 'daily' && (
          <DailyCharacterForm characterId={characterId} onSave={() => safeSetPage('entry')} onCancel={() => safeSetPage('entry')} />
        )}
        {LEGACY_ENABLED && page === 'character' && selectedCharacter && (
          <CharacterHome character={selectedCharacter} onBack={() => { setSelectedCharacter(null); safeSetPage('entry') }} />
        )}
      </main>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={() => setToast(t => ({ ...t, visible: false }))} />

      {/* ── Phone Shell: Bottom Safe Area ── */}
      <div style={{
        height: 'env(safe-area-inset-bottom, 8px)',
        minHeight: '4px',
        flexShrink: 0,
        background: 'var(--bg)',
      }} />
    </div>
  )
}
