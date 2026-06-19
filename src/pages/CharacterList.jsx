import { useState, useEffect, useCallback } from 'react'
import {
  getCharacters,
  deleteCharacter,
  getArchives,
} from '../utils/storage'

export default function CharacterList({ mode, onCreate, onEdit, onArchives }) {
  const [characters, setCharacters] = useState([])
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    setCharacters(getCharacters(mode))
  }, [])

  const refresh = useCallback(() => {
    setCharacters(getCharacters(mode))
  }, [])

  // Re-fetch when coming back from other pages
  useEffect(() => {
    const handleFocus = () => refresh()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refresh])

  // Refresh on visibility change (mobile)
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', handleVisible)
    return () => document.removeEventListener('visibilitychange', handleVisible)
  }, [refresh])

  const handleDelete = (id, name) => {
    deleteCharacter(id, mode)
    setDeleteConfirm(null)
    refresh()
  }

  const getPreview = (character) => {
    const archives = getArchives(character.id, mode)
    if (archives.length === 0) return '暂无对话记录'
    let lastMsg = null
    let latestTime = 0
    for (const a of archives) {
      const msgs = a.messages
      if (msgs.length > 0) {
        const candidate = msgs[msgs.length - 1]
        if (a.createdAt > latestTime) {
          latestTime = a.createdAt
          lastMsg = candidate
        }
      }
    }
    if (!lastMsg) return '暂无对话记录'
    const text = lastMsg.role === 'assistant' ? lastMsg.content : '...'
    return text.slice(0, 60) + (text.length > 60 ? '...' : '')
  }

  return (
    <div className="p-4">
      {/* Create button */}
      <button
        onClick={() => { refresh(); onCreate() }}
        className="w-full mb-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all active:scale-[0.98]"
      >
        + 创建新角色
      </button>

      {/* Character grid */}
      {characters.length === 0 ? (
        <div className="text-center text-gray-500 mt-16">
          <div className="text-5xl mb-4">🎭</div>
          <p className="text-lg">还没有角色</p>
          <p className="text-sm mt-1">点击上方按钮创建你的第一个角色</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {characters.map(char => {
            const archives = getArchives(char.id)
            const msgCount = archives.reduce((sum, a) => sum + (a.messages?.length || 0), 0)
            return (
              <div
                key={char.id}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700/50 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base truncate">{char.name}</h3>
                    {char.nickname && (
                      <p className="text-xs text-purple-400 mt-0.5">
                        称呼你：{char.nickname}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                      {getPreview(char)}
                    </p>
                  </div>
                </div>

                {/* Meta tags */}
                <div className="flex gap-2 mt-2">
                  {char.affectionEnabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400">
                      好感度
                    </span>
                  )}
                  {char.thinkingEnabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                      思考层
                    </span>
                  )}
                  {char.activeMessageEnabled && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                      主动消息
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                    {msgCount} 条消息
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onArchives(char)}
                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors active:scale-[0.98]"
                  >
                    对话
                  </button>
                  <button
                    onClick={() => onEdit(char.id)}
                    className="py-2 px-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition-colors active:scale-[0.98]"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(char.id)}
                    className="py-2 px-3 rounded-lg bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white text-sm transition-colors active:scale-[0.98]"
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-700">
            <h3 className="text-lg font-bold mb-2">确认删除</h3>
            <p className="text-gray-400 text-sm mb-4">
              删除后将同时清除该角色的所有对话记录，此操作不可撤销。
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
