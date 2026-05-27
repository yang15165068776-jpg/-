import { useState, useCallback } from 'react'
import ModeSelect from './pages/ModeSelect'
import StoryCharacterList from './pages/story/CharacterList'
import StoryCharacterForm from './pages/story/CharacterForm'
import StoryChat from './pages/story/StoryChat'
import StoryArchiveList from './pages/story/ArchiveList'
import DailyCharacterList from './pages/daily/CharacterList'
import DailyCharacterForm from './pages/daily/CharacterForm'
import DailyChat from './pages/daily/DailyChat'
import DailyArchiveList from './pages/daily/ArchiveList'
import Settings from './pages/Settings'
import { getCharacter, getArchive } from './utils/storage'

export default function App() {
  const [page, setPage] = useState('mode-select')
  const [mode, setMode] = useState(null)
  const [characterId, setCharacterId] = useState(null)
  const [archiveId, setArchiveId] = useState(null)

  const navigateToModeSelect = useCallback(() => {
    setPage('mode-select')
    setMode(null)
    setCharacterId(null)
    setArchiveId(null)
  }, [])

  const navigateToStoryList = useCallback(() => {
    setMode('story')
    setPage('list')
    setCharacterId(null)
    setArchiveId(null)
  }, [])

  const navigateToDailyList = useCallback(() => {
    setMode('daily')
    setPage('list')
    setCharacterId(null)
    setArchiveId(null)
  }, [])

  const navigateToNewCharacter = useCallback(() => {
    setPage('form')
    setCharacterId(null)
  }, [])

  const navigateToEditCharacter = useCallback((id) => {
    setPage('form')
    setCharacterId(id)
  }, [])

  const navigateToArchives = useCallback((charId) => {
    setPage('archives')
    setCharacterId(charId)
  }, [])

  const navigateToChat = useCallback((archId) => {
    setPage('chat')
    setArchiveId(archId)
  }, [])

  const navigateToSettings = useCallback(() => {
    setPage('settings')
  }, [])

  const navigateToModeList = useCallback(() => {
    setPage('list')
    setCharacterId(null)
    setArchiveId(null)
  }, [])

  const character = characterId ? getCharacter(characterId, mode) : null
  const chatArchive = archiveId ? getArchive(archiveId, mode) : null

  const isModeSelect = page === 'mode-select'
  const isSettings = page === 'settings'
  const isList = page === 'list'

  let title = ''
  if (isModeSelect) title = '角色扮演对话'
  else if (isSettings) title = '设置'
  else if (isList) title = (mode === 'daily' ? '日常' : '剧情') + '角色库'
  else if (page === 'form') title = (characterId ? '编辑' : '新建') + (mode === 'daily' ? '日常' : '剧情') + '角色'
  else if (page === 'archives') title = (character?.name || '') + ' 的对话存档'
  else if (page === 'chat') title = chatArchive?.name || '对话中'

  const showBack = !isModeSelect
  const handleBack = () => {
    if (isSettings) navigateToModeSelect()
    else if (isList) navigateToModeSelect()
    else navigateToModeList()
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="sticky top-0 z-40 bg-gray-800/95 backdrop-blur border-b border-gray-700">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          {showBack ? (
            <>
              <button onClick={handleBack} className="text-gray-400 hover:text-white transition-colors">
                ← 返回
              </button>
              <h1 className="text-lg font-bold truncate max-w-[200px]">{title}</h1>
              <div className="w-12" />
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold">{title}</h1>
              <button onClick={navigateToSettings} className="w-9 h-9 rounded-full bg-gray-800/80 hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors" title="设置">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto">
        {isModeSelect && (
          <ModeSelect
            onSelectStory={navigateToStoryList}
            onSelectDaily={navigateToDailyList}
            onSettings={navigateToSettings}
          />
        )}

        {mode === 'story' && page === 'list' && (
          <StoryCharacterList
            onCreate={navigateToNewCharacter}
            onEdit={navigateToEditCharacter}
            onArchives={navigateToArchives}
          />
        )}

        {mode === 'story' && page === 'form' && (
          <StoryCharacterForm
            characterId={characterId}
            onSave={navigateToModeList}
            onCancel={navigateToModeList}
          />
        )}

        {mode === 'story' && page === 'archives' && character && (
          <StoryArchiveList
            character={character}
            onBack={navigateToModeList}
            onChat={navigateToChat}
          />
        )}

        {mode === 'story' && page === 'chat' && archiveId && (
          <StoryChat
            archiveId={archiveId}
            onBack={() => {
              if (chatArchive) navigateToArchives(chatArchive.characterId)
              else navigateToModeList()
            }}
          />
        )}

        {mode === 'daily' && page === 'list' && (
          <DailyCharacterList
            onCreate={navigateToNewCharacter}
            onEdit={navigateToEditCharacter}
            onArchives={navigateToArchives}
          />
        )}

        {mode === 'daily' && page === 'form' && (
          <DailyCharacterForm
            characterId={characterId}
            onSave={navigateToModeList}
            onCancel={navigateToModeList}
          />
        )}

        {mode === 'daily' && page === 'archives' && character && (
          <DailyArchiveList
            character={character}
            onBack={navigateToModeList}
            onChat={navigateToChat}
          />
        )}

        {mode === 'daily' && page === 'chat' && archiveId && (
          <DailyChat
            archiveId={archiveId}
            onBack={() => {
              if (chatArchive) navigateToArchives(chatArchive.characterId)
              else navigateToModeList()
            }}
          />
        )}

        {isSettings && (
          <Settings onBack={navigateToModeSelect} />
        )}
      </main>
    </div>
  )
}
