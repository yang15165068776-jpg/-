import { useState, useCallback } from 'react'
import StoryCharacterList from './pages/story/CharacterList'
import StoryCharacterForm from './pages/story/CharacterForm'
import DailyCharacterList from './pages/daily/CharacterList'
import DailyCharacterForm from './pages/daily/CharacterForm'
import CharacterHome from './pages/CharacterHome'
import Settings from './pages/Settings'
import DirectChat from './pages/DirectChat'
import Toast from './components/Toast'

export default function App() {
  const [page, setPage] = useState('list')
  const [mode, setMode] = useState('story')  // 'story' | 'daily'
  const [characterId, setCharacterId] = useState(null)
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' })
  const showToast = useCallback((message, type = 'info') => {
    setToast({ visible: true, message, type })
  }, [])

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

  const isList = page === 'list'
  const isCharacter = page === 'character'
  const isForm = page === 'form'
  const isSettings = page === 'settings'
  const isDirect = page === 'direct'

  return (
    <div style={{ maxWidth: '430px', height: '100dvh', margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
      {/* ── Header for non-character pages ── */}
      {!isCharacter && (
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
              <button onClick={() => setPage('settings')} style={{ background: 'var(--bg2)', border: 'none', width: '32px', height: '32px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text2)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              </button>
            </div>
          </div>
        </header>
      )}

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
          <CharacterHome character={selectedCharacter} onBack={() => setPage('list')} />
        )}
        {isSettings && (
          <Settings onBack={() => setPage('list')} showToast={showToast} />
        )}
        {isDirect && (
          <DirectChat onBack={() => setPage('list')} />
        )}
      </main>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={() => setToast(t => ({ ...t, visible: false }))} />
    </div>
  )
}
