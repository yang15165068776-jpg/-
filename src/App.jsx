import { useState, useCallback } from 'react'
import Entry from './pages/Entry'
import PlayerProfile from './pages/PlayerProfile'
import CreateFolder from './pages/CreateFolder'
import FolderInterior from './pages/FolderInterior'
import StoryCharacterList from './pages/story/CharacterList'
import StoryCharacterForm from './pages/story/CharacterForm'
import DailyCharacterList from './pages/daily/CharacterList'
import DailyCharacterForm from './pages/daily/CharacterForm'
import CharacterHome from './pages/CharacterHome'
import Settings from './pages/Settings'
import DirectChat from './pages/DirectChat'
import Toast from './components/Toast'
import StatusBar from './components/StatusBar'

export default function App() {
  const [page, setPage] = useState('entry')  // v6: entry is the new home
  const [mode, setMode] = useState('story')  // 'story' | 'daily'
  const [characterId, setCharacterId] = useState(null)
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [selectedFolder, setSelectedFolder] = useState(null) // v6
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' })
  const showToast = useCallback((message, type = 'info') => {
    setToast({ visible: true, message, type })
  }, [])

  // ── Legacy handlers (unchanged) ──
  const handleSelectCharacter = useCallback((char) => {
    setSelectedCharacter(char)
    setPage('character')
  }, [])

  const handleNewCharacter = useCallback(() => {
    setPage('form')
    setCharacterId(null)
  }, [])

  const handleEditCharacter = useCallback((id) => {
    setPage('form')
    setCharacterId(id)
  }, [])

  const handleFormSaved = useCallback(() => {
    setPage('list')
    setCharacterId(null)
  }, [])

  const handleFormCancel = useCallback(() => {
    setPage('list')
    setCharacterId(null)
  }, [])

  // ── v6: Folder navigation ──
  const handleEnterFolder = useCallback((folder) => {
    setSelectedFolder(folder)
    setPage('folder')
  }, [])

  const handleCreateFolder = useCallback(() => {
    setPage('createFolder')
  }, [])

  const handleFolderCreated = useCallback((folder) => {
    setSelectedFolder(folder)
    setPage('folder')
    showToast('世界创建成功！', 'success')
  }, [showToast])

  const handleProfile = useCallback(() => {
    setPage('profile')
  }, [])

  const handleSettings = useCallback(() => {
    setPage('settings')
  }, [])

  const handleLegacyList = useCallback(() => {
    setPage('list')
  }, [])

  // ── v6: Enter drama/daily from folder ──
  const handleEnterDrama = useCallback((folder) => {
    // Convert folder's first character to legacy format for ChatRoom
    const chars = (folder.characterData || []).filter(c => !c.type || c.type !== 'npc')
    if (chars.length === 0) {
      showToast('请先在文件夹中添加角色', 'error')
      return
    }
    const mainChar = chars[0]
    const legacyChar = {
      id: mainChar.id || mainChar.legacyId || folder.id,
      name: mainChar.name || folder.name,
      avatar: mainChar.avatar || '',
      chatStyle: 'story',
      worldSetting: mainChar.worldSetting || folder.worldview || '',
      openingScenario: mainChar.openingScenario || folder.story_intro || '',
      storyTone: mainChar.storyTone || '',
      protagonistName: mainChar.protagonistName || '',
      protagonistGender: mainChar.protagonistGender || '',
      protagonistBackground: mainChar.protagonistBackground || '',
      protagonistPersonality: mainChar.protagonistPersonality || '',
      romanceCharacters: (mainChar.romanceCharacters?.length > 0
        ? mainChar.romanceCharacters
        : [{
            id: mainChar.id,
            name: mainChar.name,
            avatar: mainChar.avatar || '',
            background: mainChar.background || '',
            personality: mainChar.personality || '',
            speakingStyle: mainChar.speakingStyle || '',
            styleRules: mainChar.styleRules || [],
            forbiddenWords: mainChar.forbiddenWords || [],
            affectionEnabled: mainChar.affectionEnabled !== false,
            affectionInitial: mainChar.affectionInitial ?? 50,
            affectionStages: mainChar.affectionStages || [],
            transitionTriggers: mainChar.transitionTriggers || '',
            irreversibleMoment: mainChar.irreversibleMoment || '',
            erosionCondition: mainChar.erosionCondition || '',
            anchorSuppression: mainChar.anchorSuppression || '',
            thinkingEnabled: mainChar.thinkingEnabled || false,
            thinkingPrompt: mainChar.thinkingPrompt || '',
          }]
      ),
      npcs: mainChar.npcs || [],
      contextWindow: mainChar.contextWindow || 40,
      thinkingEnabled: mainChar.thinkingEnabled || false,
      thinkingPrompt: mainChar.thinkingPrompt || '',
      temperature: mainChar.temperature ?? 0.9,
      topP: mainChar.topP ?? 0.95,
      // v6: attach folder info for USK lookup
      _v6FolderId: folder.id,
      _v6FolderChars: chars,
    }
    setSelectedCharacter(legacyChar)
    setPage('character')
  }, [showToast])

  const handleEnterDaily = useCallback((folder) => {
    const chars = (folder.characterData || []).filter(c => !c.type || c.type !== 'npc')
    if (chars.length === 0) {
      showToast('请先在文件夹中添加角色', 'error')
      return
    }
    const mainChar = chars[0]
    const legacyChar = {
      id: mainChar.id || mainChar.legacyId || folder.id,
      name: mainChar.name || folder.name,
      avatar: mainChar.avatar || '',
      chatStyle: 'casual',
      background: mainChar.background || '',
      personality: mainChar.personality || '',
      speakingStyle: mainChar.speakingStyle || '',
      styleRules: mainChar.styleRules || [],
      forbiddenWords: mainChar.forbiddenWords || [],
      affectionEnabled: mainChar.affectionEnabled !== false,
      affectionInitial: mainChar.affectionInitial ?? 50,
      affectionStages: mainChar.affectionStages || [],
      affectionUpRules: mainChar.transitionTriggers || '',
      affectionDownRules: mainChar.irreversibleMoment || '',
      thinkingEnabled: mainChar.thinkingEnabled || false,
      thinkingPrompt: mainChar.thinkingPrompt || '',
      protagonistName: mainChar.protagonistName || '',
      protagonistGender: mainChar.protagonistGender || '',
      protagonistBackground: mainChar.protagonistBackground || '',
      protagonistPersonality: mainChar.protagonistPersonality || '',
      openingScenario: mainChar.openingScenario || folder.story_intro || '',
      worldSetting: mainChar.worldSetting || folder.worldview || '',
      contextWindow: mainChar.contextWindow || 40,
      temperature: mainChar.temperature ?? 0.9,
      topP: mainChar.topP ?? 0.95,
      activeMessageEnabled: mainChar.activeMessageEnabled || false,
      activePrompt: mainChar.activePrompt || '',
      nickname: mainChar.nickname || '',
      npcs: mainChar.npcs || [],
      // v6
      _v6FolderId: folder.id,
      _v6FolderChars: chars,
    }
    setSelectedCharacter(legacyChar)
    setPage('character')
  }, [showToast])

  // ── Page state checks ──
  const isEntry = page === 'entry'
  const isProfile = page === 'profile'
  const isCreateFolder = page === 'createFolder'
  const isFolder = page === 'folder'
  const isList = page === 'list'
  const isCharacter = page === 'character'
  const isForm = page === 'form'
  const isSettings = page === 'settings'
  const isDirect = page === 'direct'

  // Pages with their own header
  const hasOwnHeader = isEntry || isProfile || isCreateFolder || isFolder || isCharacter

  return (
    <div style={{ maxWidth: '430px', height: '100dvh', margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', position: 'relative', borderRadius: 'env(safe-area-inset-top, 0px)' }}>
      {/* ── Phone Shell: Status Bar ── */}
      <StatusBar />
      {/* ── Header for pages that need the old nav bar ── */}
      {!hasOwnHeader && (
        <header style={{ background: 'var(--bg)', borderBottom: '0.5px solid var(--border2)', flexShrink: 0 }}>
          <div style={{ padding: '0 16px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              {isList ? '角色列表' : isForm ? (characterId ? '编辑角色' : '新建角色') : isSettings ? '设置' : isDirect ? '直接对话' : ''}
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {isList && (
                <>
                  <button onClick={() => setMode(m => m === 'story' ? 'daily' : 'story')} style={{
                    padding: '5px 10px', borderRadius: '14px', border: 'none', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                    background: mode === 'story' ? 'var(--bg2)' : 'transparent',
                    color: mode === 'story' ? 'var(--text)' : 'var(--text3)',
                  }}>剧情</button>
                  <button onClick={() => setMode(m => m === 'story' ? 'daily' : 'story')} style={{
                    padding: '5px 10px', borderRadius: '14px', border: 'none', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                    background: mode === 'daily' ? 'var(--bg2)' : 'transparent',
                    color: mode === 'daily' ? 'var(--text)' : 'var(--text3)',
                  }}>日常</button>
                  <button onClick={() => setPage('direct')} style={{ background: 'var(--bg2)', border: 'none', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer' }}>直接对话</button>
                </>
              )}
              {/* v6: Home button to return to Entry */}
              <button onClick={() => setPage('entry')} style={{ background: 'var(--bg2)', border: 'none', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', color: 'var(--text2)', cursor: 'pointer' }}>🏠</button>
              <button onClick={() => setPage('settings')} style={{ background: 'var(--bg2)', border: 'none', width: '32px', height: '32px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text2)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              </button>
            </div>
          </div>
        </header>
      )}

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ── v6: New pages ── */}
        {isEntry && (
          <Entry
            onEnterFolder={handleEnterFolder}
            onCreateFolder={handleCreateFolder}
            onProfile={handleProfile}
            onSettings={handleSettings}
            onLegacyList={handleLegacyList}
          />
        )}
        {isProfile && (
          <PlayerProfile onBack={() => setPage('entry')} />
        )}
        {isCreateFolder && (
          <CreateFolder
            onBack={() => setPage('entry')}
            onCreated={handleFolderCreated}
          />
        )}
        {isFolder && selectedFolder && (
          <FolderInterior
            folderId={selectedFolder.id}
            onBack={() => { setSelectedFolder(null); setPage('entry') }}
            onEnterDrama={handleEnterDrama}
            onEnterDaily={handleEnterDaily}
          />
        )}

        {/* ── Legacy pages (unchanged) ── */}
        {isList && mode === 'story' && (
          <StoryCharacterList onCreate={handleNewCharacter} onEdit={handleEditCharacter} onArchives={handleSelectCharacter} />
        )}
        {isList && mode === 'daily' && (
          <DailyCharacterList onCreate={handleNewCharacter} onEdit={handleEditCharacter} onArchives={handleSelectCharacter} />
        )}
        {isForm && mode === 'story' && (
          <StoryCharacterForm characterId={characterId} onSave={handleFormSaved} onCancel={handleFormCancel} />
        )}
        {isForm && mode === 'daily' && (
          <DailyCharacterForm characterId={characterId} onSave={handleFormSaved} onCancel={handleFormCancel} />
        )}
        {isCharacter && selectedCharacter && (
          <CharacterHome character={selectedCharacter} onBack={() => { setSelectedCharacter(null); setPage(selectedCharacter._v6FolderId ? 'folder' : 'list') }} />
        )}
        {isSettings && (
          <Settings onBack={() => setPage('entry')} showToast={showToast} />
        )}
        {isDirect && (
          <DirectChat onBack={() => setPage('list')} />
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
