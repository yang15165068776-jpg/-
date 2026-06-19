import { useState, useCallback, useEffect } from 'react'
import { NavigationEngine, NAV_EVENT } from './engine/navigationEngine'
import Entry from './pages/Entry'
import PlayerProfile from './pages/PlayerProfile'
import CreateFolder from './pages/CreateFolder'
import FolderInterior from './pages/FolderInterior'
import DramaPage from './pages/DramaPage'
import DailyPage from './pages/DailyPage'
import CharacterEditor from './pages/CharacterEditor'
import StoryCharacterList from './pages/story/CharacterList'
import StoryCharacterForm from './pages/story/CharacterForm'
import DailyCharacterList from './pages/daily/CharacterList'
import DailyCharacterForm from './pages/daily/CharacterForm'
import CharacterHome from './pages/CharacterHome'
import Settings from './pages/Settings'
import DirectChat from './pages/DirectChat'
import Toast from './components/Toast'
import StatusBar from './components/StatusBar'

// ═══════════════════════════════════════
// 🔴 KILL SWITCH v2
// ═══════════════════════════════════════

const V6_ROUTES = new Set([
  'entry', 'profile', 'createFolder', 'folder', 'dramaPage', 'dailyPage', 'characterEditor', 'settings',
])
const LEGACY_REDIRECT = new Set(['list', 'form'])
const LEGACY_BLOCKED = new Set(['character', 'direct'])
const LEGACY_ENABLED = false

export default function App() {
  // React listens to NavigationEngine events, not raw setPage
  const [page, setPage] = useState(NavigationEngine.current)
  const [pageParams, setPageParams] = useState(NavigationEngine.currentParams)
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
  }, [])

  // ═══════════════════════════════════════
  // 🧠 NavigationEngine: listen to events
  // ═══════════════════════════════════════
  useEffect(() => {
    const handler = (e) => {
      const nextPage = e.detail?.page || NavigationEngine.current
      const params = e.detail?.params || NavigationEngine.currentParams

      // Kill switch: intercept legacy routes
      if (LEGACY_REDIRECT.has(nextPage) || LEGACY_BLOCKED.has(nextPage)) {
        NavigationEngine.replace('entry')
        setPage('entry')
        setPageParams({})
        return
      }
      if (!V6_ROUTES.has(nextPage)) {
        NavigationEngine.replace('entry')
        setPage('entry')
        setPageParams({})
        return
      }

      setPage(nextPage)
      setPageParams(params)

      // Sync folder state from params
      if (params.folder) {
        setSelectedFolder(params.folder)
      }
    }
    window.addEventListener(NAV_EVENT, handler)
    return () => window.removeEventListener(NAV_EVENT, handler)
  }, [])

  // ═══════════════════════════════════════
  // 🧠 Navigation helpers (through engine)
  // ═══════════════════════════════════════
  const nav = {
    entry: () => NavigationEngine.push('entry'),
    profile: () => NavigationEngine.push('profile'),
    createFolder: () => NavigationEngine.push('createFolder'),
    folder: (f) => {
      setSelectedFolder(f)
      NavigationEngine.push('folder', { folder: f })
    },
    dramaPage: (f, chars) => {
      const folderWithChars = { ...f, _chars: chars }
      setSelectedFolder(folderWithChars)
      NavigationEngine.push('dramaPage', { folder: folderWithChars })
    },
    dailyPage: (f, chars) => {
      const folderWithChars = { ...f, _chars: chars }
      setSelectedFolder(folderWithChars)
      NavigationEngine.push('dailyPage', { folder: folderWithChars })
    },
    back: () => {
      // Peek to restore folder context
      const prev = NavigationEngine.peekBack()
      if (prev?.params?.folder) {
        setSelectedFolder(prev.params.folder)
      } else if (prev?.page === 'entry') {
        setSelectedFolder(null)
      }
      NavigationEngine.back()
    },
  }

  // ── v6: Folder navigation callbacks ──
  const handleEnterFolder = useCallback((f) => nav.folder(f), [])
  const handleCreateFolder = useCallback(() => nav.createFolder(), [])
  const handleFolderCreated = useCallback((f) => {
    setSelectedFolder(f)
    NavigationEngine.replace('folder', { folder: f })
    showToast('世界创建成功！', 'success')
  }, [showToast])
  const handleProfile = useCallback(() => nav.profile(), [])

  const handleEnterDrama = useCallback((f) => {
    const chars = (f.characterData || []).filter(c => !c.type || c.type !== 'npc')
    if (chars.length === 0) { showToast('请先在文件夹中添加角色', 'error'); return }
    nav.dramaPage(f, chars)
  }, [showToast])

  const handleEnterDaily = useCallback((f) => {
    const chars = (f.characterData || []).filter(c => !c.type || c.type !== 'npc')
    if (chars.length === 0) { showToast('请先在文件夹中添加角色', 'error'); return }
    nav.dailyPage(f, chars)
  }, [showToast])

  const handleEditCharacter = useCallback((charIndex) => {
    NavigationEngine.push('characterEditor', { folder: selectedFolder, charIndex })
  }, [selectedFolder])

  // ── Page state checks ──
  const isEntry = page === 'entry'
  const isProfile = page === 'profile'
  const isCreateFolder = page === 'createFolder'
  const isFolder = page === 'folder'
  const isDramaPage = page === 'dramaPage'
  const isDailyPage = page === 'dailyPage'
  const isCharacterEditor = page === 'characterEditor'
  const isBlocked = LEGACY_BLOCKED.has(page) || (!V6_ROUTES.has(page) && !LEGACY_REDIRECT.has(page))
  const hasOwnHeader = isEntry || isProfile || isCreateFolder || isFolder || isDramaPage || isDailyPage || isCharacterEditor || isBlocked

  return (
    <div style={{ maxWidth: '430px', height: '100dvh', margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
      <StatusBar />

      {/* Legacy nav header — dead unless LEGACY_ENABLED */}
      {!hasOwnHeader && LEGACY_ENABLED && (
        <header style={{ background: 'var(--bg)', borderBottom: '0.5px solid var(--border2)', flexShrink: 0 }}>
          <div style={{ padding: '0 16px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              {page === 'list' ? '角色列表' : page === 'form' ? (characterId ? '编辑角色' : '新建角色') : ''}
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={nav.entry} style={{ background: 'var(--bg2)', border: 'none', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer' }}>🏠</button>
            </div>
          </div>
        </header>
      )}

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ═══ v6 ROUTES ═══ */}
        {isEntry && (
          <Entry
            onEnterFolder={handleEnterFolder}
            onCreateFolder={handleCreateFolder}
            onProfile={handleProfile}
            onSettings={() => NavigationEngine.push('settings')}
            onLegacyList={() => nav.entry()}
          />
        )}
        {isProfile && <PlayerProfile onBack={nav.back} />}
        {isCreateFolder && <CreateFolder onBack={nav.back} onCreated={handleFolderCreated} />}
        {isFolder && selectedFolder && (
          <FolderInterior
            folderId={selectedFolder.id}
            onBack={nav.back}
            onEnterDrama={handleEnterDrama}
            onEnterDaily={handleEnterDaily}
            onEditCharacter={handleEditCharacter}
          />
        )}
        {isDramaPage && selectedFolder && (
          <DramaPage
            folderId={selectedFolder.id}
            folderChars={selectedFolder._chars || []}
            onBack={nav.back}
          />
        )}
        {isDailyPage && selectedFolder && (
          <DailyPage
            folderId={selectedFolder.id}
            folderChars={selectedFolder._chars || []}
            onBack={nav.back}
          />
        )}
        {isCharacterEditor && selectedFolder && pageParams.charIndex != null && (
          <CharacterEditor
            folderId={selectedFolder.id}
            charIndex={pageParams.charIndex}
            onBack={nav.back}
          />
        )}
        {isSettings && (
          <Settings onBack={nav.back} showToast={showToast} />
        )}

        {/* 🔴 Dead zone — blocked routes fall back to Entry */}
        {isBlocked && (
          <Entry
            onEnterFolder={handleEnterFolder}
            onCreateFolder={handleCreateFolder}
            onProfile={handleProfile}
            onSettings={() => NavigationEngine.push('settings')}
            onLegacyList={() => nav.entry()}
          />
        )}

        {/* ☠️ LEGACY — only if LEGACY_ENABLED=true */}
        {LEGACY_ENABLED && page === 'list' && mode === 'story' && (
          <StoryCharacterList onCreate={handleCreateFolder} onEdit={() => {}} onArchives={() => {}} />
        )}
        {LEGACY_ENABLED && page === 'list' && mode === 'daily' && (
          <DailyCharacterList onCreate={handleCreateFolder} onEdit={() => {}} onArchives={() => {}} />
        )}
        {LEGACY_ENABLED && page === 'character' && selectedCharacter && (
          <CharacterHome character={selectedCharacter} onBack={nav.back} />
        )}
      </main>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={() => setToast(t => ({ ...t, visible: false }))} />
      <div style={{ height: 'env(safe-area-inset-bottom, 8px)', minHeight: '4px', flexShrink: 0, background: 'var(--bg)' }} />
    </div>
  )
}
