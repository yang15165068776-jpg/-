import { useState, useEffect, useRef } from 'react'
import { getCharacter, saveCharacter, generateId, getApiKey } from '../utils/storage'
import { generateAutonomySummary } from '../utils/deepseek'

const emptyStage = () => ({ name: '', min: 0, max: 50, behavior: '' })

function parseLines(text) {
  return text.split('\n').map(s => s.trim()).filter(Boolean)
}

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

export default function CharacterForm({ characterId, onSave, onCancel }) {
  const isEdit = !!characterId
  const avatarInputRef = useRef(null)
  const [generatingAutonomy, setGeneratingAutonomy] = useState(false)

  const [form, setForm] = useState({
    id: '',
    name: '',
    avatar: '',
    background: '',
    nickname: '',
    styleRules: '',
    forbiddenWords: '',
    affectionEnabled: false,
    affectionInitial: 50,
    affectionStages: [emptyStage()],
    thinkingEnabled: false,
    thinkingPrompt: '',
    activeMessageEnabled: false,
    activeInterval: 10,
    activeCondition: '',
    activePrompt: '',
    autonomyBehavior: '',
  })

  useEffect(() => {
    if (characterId) {
      const char = getCharacter(characterId)
      if (char) {
        setForm({
          id: char.id,
          name: char.name || '',
          avatar: char.avatar || '',
          background: char.background || '',
          nickname: char.nickname || '',
          styleRules: (char.styleRules || []).join('\n'),
          forbiddenWords: (char.forbiddenWords || []).join('\n'),
          affectionEnabled: char.affectionEnabled || false,
          affectionInitial: char.affectionInitial ?? 50,
          affectionStages: char.affectionStages?.length > 0
            ? char.affectionStages.map(s => ({ ...emptyStage(), ...s }))
            : [emptyStage()],
          thinkingEnabled: char.thinkingEnabled || false,
          thinkingPrompt: char.thinkingPrompt || '',
          activeMessageEnabled: char.activeMessageEnabled || false,
          activeInterval: char.activeInterval ?? 10,
          activeCondition: char.activeCondition || '',
          activePrompt: char.activePrompt || '',
          autonomyBehavior: char.autonomyBehavior || '',
        })
      }
    }
  }, [characterId])

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const base64 = await imageToBase64(file)
    update('avatar', base64)
  }

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const updateStage = (index, field, value) => {
    const stages = [...form.affectionStages]
    stages[index] = { ...stages[index], [field]: value }
    setForm(prev => ({ ...prev, affectionStages: stages }))
  }

  const addStage = () => {
    setForm(prev => ({ ...prev, affectionStages: [...prev.affectionStages, emptyStage()] }))
  }

  const removeStage = (index) => {
    if (form.affectionStages.length <= 1) return
    setForm(prev => ({
      ...prev,
      affectionStages: prev.affectionStages.filter((_, i) => i !== index),
    }))
  }

  const handleGenerateAutonomy = async () => {
    const apiKey = getApiKey()
    if (!apiKey) {
      alert('请先在设置页面填写 DeepSeek API Key')
      return
    }
    if (!form.background.trim()) {
      alert('请先填写角色基本设定（至少填写背景）')
      return
    }
    setGeneratingAutonomy(true)
    const { reply, error } = await generateAutonomySummary({
      name: form.name,
      background: form.background,
      styleRules: form.styleRules,
      thinkingPrompt: form.thinkingPrompt,
    }, apiKey)
    setGeneratingAutonomy(false)
    if (error || !reply) {
      alert('生成失败：' + (error?.message || '未知错误'))
      return
    }
    update('autonomyBehavior', reply)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      alert('请输入角色名')
      return
    }

    const character = {
      id: isEdit ? form.id : generateId(),
      name: form.name.trim(),
      avatar: form.avatar || '',
      background: form.background.trim(),
      nickname: form.nickname.trim(),
      styleRules: parseLines(form.styleRules),
      forbiddenWords: parseLines(form.forbiddenWords),
      affectionEnabled: form.affectionEnabled,
      affectionInitial: form.affectionEnabled ? form.affectionInitial : 50,
      affectionStages: form.affectionEnabled
        ? form.affectionStages.filter(s => s.name.trim())
        : [],
      thinkingEnabled: form.thinkingEnabled,
      thinkingPrompt: form.thinkingEnabled ? form.thinkingPrompt.trim() : '',
      activeMessageEnabled: form.activeMessageEnabled,
      activeInterval: form.activeMessageEnabled ? (form.activeInterval || 10) : 10,
      activeCondition: form.activeMessageEnabled ? form.activeCondition.trim() : '',
      activePrompt: form.activeMessageEnabled ? form.activePrompt.trim() : '',
      autonomyBehavior: form.autonomyBehavior.trim(),
      updatedAt: Date.now(),
    }

    saveCharacter(character)
    onSave()
  }

  const inputClass = "w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none transition-colors"
  const labelClass = "block text-sm font-medium text-gray-300 mb-1"

  return (
    <form onSubmit={handleSubmit} className="p-4 pb-24 space-y-4">
      {/* Basic info */}
      <div>
        <label className={labelClass}>角色名 *</label>
        <input
          type="text"
          className={inputClass}
          value={form.name}
          onChange={e => update('name', e.target.value)}
          placeholder="给角色起个名字"
        />
      </div>

      {/* Avatar */}
      <div>
        <label className={labelClass}>头像</label>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarChange}
        />
        <div
          onClick={() => avatarInputRef.current?.click()}
          className="w-20 h-20 rounded-full border-2 border-dashed border-gray-500 hover:border-blue-400 flex items-center justify-center overflow-hidden cursor-pointer transition-colors bg-gray-800"
        >
          {form.avatar ? (
            <img src={form.avatar} alt="头像预览" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-gray-500">
              <div className="text-2xl leading-none">+</div>
              <div className="text-[10px]">上传</div>
            </div>
          )}
        </div>
        {form.avatar && (
          <button
            type="button"
            onClick={() => update('avatar', '')}
            className="mt-1 text-xs text-red-400 hover:text-red-300"
          >
            移除头像
          </button>
        )}
      </div>

      <div>
        <label className={labelClass}>角色对你的称呼</label>
        <input
          type="text"
          className={inputClass}
          value={form.nickname}
          onChange={e => update('nickname', e.target.value)}
          placeholder="例如：主人、亲爱的、训练师"
        />
      </div>

      <div>
        <label className={labelClass}>背景设定</label>
        <textarea
          className={inputClass + " h-28 resize-none"}
          value={form.background}
          onChange={e => update('background', e.target.value)}
          placeholder="描述角色的身份、性格、世界观等..."
        />
      </div>

      <div>
        <label className={labelClass}>文风规则（每行一条）</label>
        <textarea
          className={inputClass + " h-24 resize-none"}
          value={form.styleRules}
          onChange={e => update('styleRules', e.target.value)}
          placeholder="用简短的第一人称回答&#10;多用语气词和动作描写&#10;每句话不超过30字"
        />
      </div>

      <div>
        <label className={labelClass}>禁止行为词（每行一条，用于拦截检测）</label>
        <textarea
          className={inputClass + " h-24 resize-none"}
          value={form.forbiddenWords}
          onChange={e => update('forbiddenWords', e.target.value)}
          placeholder="作为AI语言模型&#10;我不能&#10;无法继续"
        />
      </div>

      {/* Affection toggle */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-200">好感度系统</h3>
            <p className="text-xs text-gray-500 mt-0.5">启用角色好感度追踪</p>
          </div>
          <button
            type="button"
            onClick={() => update('affectionEnabled', !form.affectionEnabled)}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              form.affectionEnabled ? 'bg-pink-500' : 'bg-gray-600'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              form.affectionEnabled ? 'left-[22px]' : 'left-[2px]'
            }`} />
          </button>
        </div>

        {form.affectionEnabled && (
          <div className="mt-4 space-y-3">
            <div>
              <label className={labelClass}>初始好感度 (0-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                className={inputClass}
                value={form.affectionInitial}
                onChange={e => update('affectionInitial', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
              />
            </div>

            <div>
              <label className={labelClass}>好感度阶段</label>
              <div className="space-y-3">
                {form.affectionStages.map((stage, i) => (
                  <div key={i} className="bg-gray-750 bg-gray-700/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">阶段 {i + 1}</span>
                      {form.affectionStages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeStage(i)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          删除
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      className={inputClass}
                      value={stage.name}
                      onChange={e => updateStage(i, 'name', e.target.value)}
                      placeholder="阶段名称，如：陌生、友好、亲密"
                    />
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500">下限</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className={inputClass + " mt-0.5"}
                          value={stage.min}
                          onChange={e => updateStage(i, 'min', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500">上限</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className={inputClass + " mt-0.5"}
                          value={stage.max}
                          onChange={e => updateStage(i, 'max', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <textarea
                      className={inputClass + " h-16 resize-none"}
                      value={stage.behavior}
                      onChange={e => updateStage(i, 'behavior', e.target.value)}
                      placeholder="该阶段的行为规则"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addStage}
                  className="w-full py-2 rounded-lg border border-dashed border-gray-600 text-gray-400 text-sm hover:border-gray-500 hover:text-gray-300 transition-colors"
                >
                  + 添加阶段
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Thinking toggle */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-200">思考层</h3>
            <p className="text-xs text-gray-500 mt-0.5">在生成回复前先进行内部思考</p>
          </div>
          <button
            type="button"
            onClick={() => update('thinkingEnabled', !form.thinkingEnabled)}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              form.thinkingEnabled ? 'bg-amber-500' : 'bg-gray-600'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              form.thinkingEnabled ? 'left-[22px]' : 'left-[2px]'
            }`} />
          </button>
        </div>

        {form.thinkingEnabled && (
          <div className="mt-4">
            <label className={labelClass}>思考指令</label>
            <textarea
              className={inputClass + " h-28 resize-none"}
              value={form.thinkingPrompt}
              onChange={e => update('thinkingPrompt', e.target.value)}
              placeholder="在每次回复前，先在心里思考以下问题：&#10;1. 此刻角色处于什么情绪状态？&#10;2. 根据好感度阶段，应该如何调整语气？&#10;3. 当前对话场景需要特别注意什么？"
            />
          </div>
        )}
      </div>

      {/* Active message toggle */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-200">主动消息</h3>
            <p className="text-xs text-gray-500 mt-0.5">角色可定时主动发起对话</p>
          </div>
          <button
            type="button"
            onClick={() => update('activeMessageEnabled', !form.activeMessageEnabled)}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              form.activeMessageEnabled ? 'bg-green-500' : 'bg-gray-600'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              form.activeMessageEnabled ? 'left-[22px]' : 'left-[2px]'
            }`} />
          </button>
        </div>

        {form.activeMessageEnabled && (
          <div className="mt-4 space-y-3">
            <div>
              <label className={labelClass}>触发间隔（分钟）</label>
              <input
                type="number"
                min="1"
                max="1440"
                className={inputClass}
                value={form.activeInterval}
                onChange={e => update('activeInterval', Math.max(1, parseInt(e.target.value) || 10))}
              />
              <p className="text-[10px] text-gray-500 mt-0.5">每隔此分钟数检查一次是否需要触发主动消息</p>
            </div>

            <div>
              <label className={labelClass}>触发条件描述</label>
              <input
                type="text"
                className={inputClass}
                value={form.activeCondition}
                onChange={e => update('activeCondition', e.target.value)}
                placeholder="例如：超过30分钟没有对话时"
              />
            </div>

            <div>
              <label className={labelClass}>主动消息指令</label>
              <textarea
                className={inputClass + " h-24 resize-none"}
                value={form.activePrompt}
                onChange={e => update('activePrompt', e.target.value)}
                placeholder="告诉AI如何生成主动消息：&#10;根据当前时间和场景自然地发起话题&#10;可以关心对方、分享心情、提出问题等&#10;保持角色风格和性格一致"
              />
            </div>
          </div>
        )}
      </div>

      {/* Autonomy behavior */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-gray-200">自主行为</h3>
            <p className="text-xs text-gray-500 mt-0.5">角色在日常互动中的行为模式总结</p>
          </div>
          <button
            type="button"
            onClick={handleGenerateAutonomy}
            disabled={generatingAutonomy}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            {generatingAutonomy ? '生成中...' : '生成自主行为'}
          </button>
        </div>
        <textarea
          className={inputClass + " h-32 resize-none"}
          value={form.autonomyBehavior}
          onChange={e => update('autonomyBehavior', e.target.value)}
          placeholder="点击上方按钮让AI根据角色设定自动生成，或手动填写角色在互动中的自主行为、习惯动作、主动话题和情绪反应模式..."
        />
      </div>

      {/* Submit buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 p-4 max-w-lg mx-auto">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all active:scale-[0.98]"
          >
            {isEdit ? '保存修改' : '创建角色'}
          </button>
        </div>
      </div>
    </form>
  )
}
