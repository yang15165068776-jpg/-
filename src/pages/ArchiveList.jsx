import { useState, useEffect, useCallback } from 'react'
import { getArchives, createArchive, deleteArchive, renameArchive } from '../utils/storage'

function getPreview(messages) {
  if (!messages || messages.length === 0) return '暂无对话记录'
  const last = messages[messages.length - 1]
  const text = last.role === 'assistant' ? last.content : (messages.length > 1 ? messages[messages.length - 2]?.content : '')
  if (!text) return '暂无对话记录'
  return text.slice(0, 60) + (text.length > 60 ? '...' : '')
}

export default function ArchiveList({ mode, character, onBack, onChat }) {
  const [archives, setArchives] = useState([])
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [renameId, setRenameId] = useState(null)
  const [renameText, setRenameText] = useState('')

  const refresh = useCallback(() => {
    setArchives(getArchives(character.id, mode))
  }, [character.id, mode])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCreate = () => {
    const name = '新对话 ' + new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const archive = createArchive(character.id, name, mode)
    onChat(archive.id)
  }

  const handleDelete = (id) => {
    deleteArchive(id, mode)
    setDeleteConfirm(null)
    if (renameId === id) {
      setRenameId(null)
      setRenameText('')
    }
    refresh()
  }

  const handleRenameStart = (archive) => {
    setRenameId(archive.id)
    setRenameText(archive.name)
  }

  const handleRenameConfirm = (id) => {
    const trimmed = renameText.trim()
    if (trimmed) {
      renameArchive(id, trimmed, mode)
    }
    setRenameId(null)
    setRenameText('')
    refresh()
  }

  return (
    <div className="p-4">
      {/* Create button */}
      <button
        onClick={handleCreate}
        className="w-full mb-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all active:scale-[0.98]"
      >
        + 新建对话
      </button>

      {/* Archive list */}
      {archives.length === 0 ? (
        <div className="text-center text-gray-500 mt-16">
          <div className="text-5xl mb-4">💬</div>
          <p className="text-lg">还没有对话存档</p>
          <p className="text-sm mt-1">点击上方按钮开始与 {character.name} 对话</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {archives.map(archive => {
            const msgCount = archive.messages?.filter(m => m.role !== 'system')?.length || 0
            const isRenaming = renameId === archive.id

            return (
              <div
                key={archive.id}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700/50 hover:border-gray-600 transition-colors cursor-pointer"
                onClick={() => { if (!isRenaming) onChat(archive.id) }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <input
                        className="bg-gray-700 border border-blue-500 rounded px-2 py-1 text-sm text-white w-full focus:outline-none"
                        value={renameText}
                        onChange={e => setRenameText(e.target.value)}
                        onBlur={() => handleRenameConfirm(archive.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameConfirm(archive.id)
                          if (e.key === 'Escape') { setRenameId(null); setRenameText('') }
                        }}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <h3 className="font-bold text-base truncate">{archive.name}</h3>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          创建于 {new Date(archive.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </>
                    )}
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                      {getPreview(archive.messages)}
                    </p>
                  </div>
                </div>

                {/* Meta + actions */}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                    {msgCount} 条消息
                  </span>
                  {!isRenaming && (
                    <div className="flex gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); handleRenameStart(archive) }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                      >
                        重命名
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(archive.id) }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">确认删除</h3>
            <p className="text-gray-400 text-sm mb-4">
              删除后将清除该存档的所有对话记录，此操作不可撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
