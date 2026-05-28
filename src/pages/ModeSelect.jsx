export default function ModeSelect({ onSelectStory, onSelectDaily, onSelectDirect, onSettings }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20">
      <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
        角色扮演对话
      </h1>
      <p className="text-gray-500 text-sm mb-10">选择一个模式开始</p>

      <div className="grid gap-4 w-full max-w-sm">
        <button
          onClick={onSelectStory}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 p-6 text-left hover:from-indigo-500 hover:to-purple-600 transition-all active:scale-[0.98] shadow-lg shadow-purple-900/30"
        >
          <div className="text-3xl mb-3">📖</div>
          <h2 className="text-xl font-bold text-white mb-1">剧情模式</h2>
          <p className="text-sm text-purple-200/80">
            沉浸式角色扮演，丰富的叙述描写、动作环境和心理活动
          </p>
        </button>

        <button
          onClick={onSelectDaily}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-left hover:from-emerald-500 hover:to-teal-600 transition-all active:scale-[0.98] shadow-lg shadow-teal-900/30"
        >
          <div className="text-3xl mb-3">💬</div>
          <h2 className="text-xl font-bold text-white mb-1">日常模式</h2>
          <p className="text-sm text-teal-200/80">
            微信风格聊天，短气泡快速对话，像和真人发消息一样自然
          </p>
        </button>

        <button
          onClick={onSelectDirect}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-600 to-gray-700 p-6 text-left hover:from-gray-500 hover:to-gray-600 transition-all active:scale-[0.98] shadow-lg shadow-gray-900/30"
        >
          <div className="text-3xl mb-3">🤖</div>
          <h2 className="text-xl font-bold text-white mb-1">直接对话</h2>
          <p className="text-sm text-gray-300/80">
            无角色设定，直接与AI对话，简洁高效
          </p>
        </button>
      </div>
    </div>
  )
}
