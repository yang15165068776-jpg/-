import { useState, useCallback } from 'react'
import CharacterList from './pages/CharacterList'
import CharacterForm from './pages/CharacterForm'
import ChatRoom from './pages/ChatRoom'
import Settings from './pages/Settings'

export default function App() {
  const [page, setPage] = useState('list')
  const [editCharacterId, setEditCharacterId] = useState(null)
  const [chatCharacterId, setChatCharacterId] = useState(null)

  const navigateToList = useCallback(() => {
    setPage('list')
    setEditCharacterId(null)
    setChatCharacterId(null)
  }, [])

  const navigateToCreate = useCallback(() => {
    setPage('form')
    setEditCharacterId(null)
  }, [])

  const navigateToEdit = useCallback((id) => {
    setPage('form')
    setEditCharacterId(id)
  }, [])

  const navigateToChat = useCallback((id) => {
    setPage('chat')
    setChatCharacterId(id)
  }, [])

  const navigateToSettings = useCallback(() => {
    setPage('settings')
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-800/95 backdrop-blur border-b border-gray-700">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          {page === 'list' && (
            <>
              <h1 className="text-lg font-bold">角色库</h1>
              <button
                onClick={navigateToSettings}
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                设置
              </button>
            </>
          )}
          {page === 'form' && (
            <>
              <button
                onClick={navigateToList}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ← 返回
              </button>
              <h1 className="text-lg font-bold">
                {editCharacterId ? '编辑角色' : '新建角色'}
              </h1>
              <div className="w-12" />
            </>
          )}
          {page === 'chat' && (
            <>
              <button
                onClick={navigateToList}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ← 返回
              </button>
              <h1 className="text-lg font-bold truncate max-w-[200px]">
                {chatCharacterId ? '对话中' : ''}
              </h1>
              <div className="w-12" />
            </>
          )}
          {page === 'settings' && (
            <>
              <button
                onClick={navigateToList}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ← 返回
              </button>
              <h1 className="text-lg font-bold">设置</h1>
              <div className="w-12" />
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto">
        {page === 'list' && (
          <CharacterList
            onCreate={navigateToCreate}
            onEdit={navigateToEdit}
            onChat={navigateToChat}
          />
        )}
        {page === 'form' && (
          <CharacterForm
            characterId={editCharacterId}
            onSave={navigateToList}
            onCancel={navigateToList}
          />
        )}
        {page === 'chat' && chatCharacterId && (
          <ChatRoom
            characterId={chatCharacterId}
            onBack={navigateToList}
          />
        )}
        {page === 'settings' && (
          <Settings onBack={navigateToList} />
        )}
      </main>
    </div>
  )
}
