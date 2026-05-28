import { useState, useEffect, useRef } from 'react'
import {
  getApiKey, saveApiKey,
  getModel, saveModel,
  getUserAvatar, saveUserAvatar,
  getCharacters,
} from '../utils/storage'
import { buildSystemPrompt } from '../utils/deepseek'

function imageToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxSize = 200
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height)
          width *= ratio
          height *= ratio
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = () => resolve(reader.result)
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export default function Settings({ onBack }) {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const [model, setModel] = useState('deepseek-chat')
  const [modelList, setModelList] = useState([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelError, setModelError] = useState('')

  const [userAvatar, setUserAvatar] = useState('')
  const avatarInputRef = useRef(null)

  useEffect(() => {
    setApiKey(getApiKey())
    setModel(getModel())
    setUserAvatar(getUserAvatar())
  }, [])

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const base64 = await imageToBase64(file)
    setUserAvatar(base64)
    saveUserAvatar(base64)
    setSaved(false)
  }

  const handleSave = () => {
    saveApiKey(apiKey.trim())
    saveModel(model)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleFetchModels = async () => {
    const key = apiKey.trim()
    if (!key) {
      setModelError('请先填写 API Key')
      return
    }
    setLoadingModels(true)
    setModelError('')
    try {
      const res = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: 'Bearer ' + key },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || `HTTP ${res.status}`)
      }
      const data = await res.json()
      const list = (data.data || []).map(m => m.id).sort()
      setModelList(list)
      // Preserve saved model: don't reset to first list item
      const saved = getModel()
      if (list.includes(saved)) {
        setModel(saved)
      } else if (list.length > 0) {
        setModel(list[0])
        saveModel(list[0])
      }
      if (list.length === 0) {
        setModelError('未获取到可用模型')
      }
    } catch (err) {
      setModelError(err.message)
    } finally {
      setLoadingModels(false)
    }
  }

  const handleModelChange = (value) => {
    setModel(value)
    saveModel(value)
    setSaved(false)
  }

  return (
    <div className="p-4 space-y-6">
      {/* API Key */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-sm font-medium text-gray-200 mb-3">DeepSeek API Key</h3>

        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 pr-16 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none transition-colors"
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); setSaved(false) }}
            placeholder="sk-..."
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs px-2 py-1 rounded transition-colors"
          >
            {showKey ? '隐藏' : '显示'}
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-2">
          API Key 仅保存在浏览器本地存储中，不会上传到任何第三方服务器。
        </p>
      </div>

      {/* User Avatar */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-sm font-medium text-gray-200 mb-3">我的头像</h3>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarChange}
        />
        <div
          onClick={() => avatarInputRef.current?.click()}
          className="w-20 h-20 rounded-full border-2 border-dashed border-gray-500 hover:border-blue-400 flex items-center justify-center overflow-hidden cursor-pointer transition-colors bg-gray-700"
        >
          {userAvatar ? (
            <img src={userAvatar} alt="头像" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-gray-500">
              <div className="text-2xl leading-none">+</div>
              <div className="text-[10px]">上传</div>
            </div>
          )}
        </div>
        {userAvatar && (
          <button
            onClick={() => { setUserAvatar(''); saveUserAvatar(''); }}
            className="mt-1 text-xs text-red-400 hover:text-red-300 block"
          >
            移除头像
          </button>
        )}
      </div>

      {/* Model Selection */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-sm font-medium text-gray-200 mb-3">模型选择</h3>

        <div className="flex gap-2 mb-3">
          <button
            onClick={handleFetchModels}
            disabled={loadingModels}
            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm transition-colors"
          >
            {loadingModels ? '获取中...' : '获取模型列表'}
          </button>
        </div>

        {modelError && (
          <p className="text-xs text-red-400 mb-3">{modelError}</p>
        )}

        {modelList.length > 0 && (
          <select
            value={model}
            onChange={e => handleModelChange(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none transition-colors"
          >
            {modelList.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}

        {modelList.length === 0 && !loadingModels && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">当前模型：</span>
            <input
              type="text"
              value={model}
              onChange={e => handleModelChange(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="deepseek-chat"
            />
          </div>
        )}
      </div>

      {/* How to get key */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-sm font-medium text-gray-200 mb-2">如何获取 API Key？</h3>
        <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
          <li>访问 platform.deepseek.com 并注册账号</li>
          <li>进入 API Keys 页面创建新的 Key</li>
          <li>复制 Key 并粘贴到上方输入框</li>
          <li>DeepSeek API 按使用量计费，价格低廉</li>
        </ol>
      </div>

      {/* Data info */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-sm font-medium text-gray-200 mb-2">数据说明</h3>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>· 所有角色和对话数据存储在浏览器 localStorage 中</li>
          <li>· 清除浏览器数据会导致角色和对话丢失</li>
          <li>· 对话内容会发送至 DeepSeek 服务器以生成回复</li>
          <li>· 请勿在对话中分享敏感个人信息</li>
        </ul>
      </div>

      {/* System Prompt Preview */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-sm font-medium text-gray-200 mb-3">System Prompt 预览</h3>
        <button
          onClick={() => {
            const chars = [...getCharacters('story'), ...getCharacters('daily')]
            if (chars.length === 0) {
              alert('暂无角色数据')
              return
            }
            const lines = []
            lines.push('=== System Prompt 字符数统计 ===\n')
            let grandTotal = 0
            const modes = [
              { label: '剧情模式', mode: 'story' },
              { label: '日常模式', mode: 'daily' },
            ]
            for (const { label, mode } of modes) {
              const modeChars = getCharacters(mode)
              if (modeChars.length === 0) continue
              lines.push('【' + label + '】')
              for (const char of modeChars) {
                const affData = char.chatStyle === 'story' && char.romanceCharacters
                  ? Object.fromEntries(char.romanceCharacters.filter(rc => rc.affectionEnabled).map(rc => [rc.name, rc.affectionInitial ?? 50]))
                  : char.affectionInitial ?? 50
                const prompt = buildSystemPrompt(char, affData)
                const len = prompt.length
                const estTokens = Math.round(len / 2.5)
                lines.push('  ' + char.name + ': ' + len.toLocaleString() + ' 字符 ≈ ' + estTokens.toLocaleString() + ' tokens')
                grandTotal += len
              }
            }
            lines.push('\n总计（所有角色prompt字符和）: ' + grandTotal.toLocaleString() + ' 字符')
            lines.push('注：实际发送时只包含当前角色')
            alert(lines.join('\n'))
          }}
          className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
        >
          计算 System Prompt 大小
        </button>
        <p className="text-xs text-gray-500 mt-2">
          点击查看每个角色的 system prompt 字符数及估算 token 消耗（1 token ≈ 2.5 中文字符）
        </p>
      </div>

      {/* Save button */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 p-4 max-w-lg mx-auto">
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors"
          >
            返回
          </button>
          <button
            onClick={handleSave}
            className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all active:scale-[0.98]"
          >
            {saved ? '已保存 ✓' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  )
}
