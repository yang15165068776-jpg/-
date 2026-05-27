import { useState, useEffect, useRef } from 'react'
import { getCharacter, saveCharacter, generateId, getApiKey } from '../../utils/storage'
import { generateAutonomySummary, extractCharacterFromText, extractStoryFromText } from '../../utils/deepseek'

const emptyStage = () => ({ name: '', min: 0, max: 50, behavior: '' })
const emptyRomanceChar = () => ({
  id: '',
  name: '',
  avatar: '',
  background: '',
  personality: '',
  styleRules: '',
  forbiddenWords: '',
  speakingStyle: '',
  affectionEnabled: true,
  affectionInitial: 50,
  affectionStages: [emptyStage()],
  affectionUpRules: '',
  affectionDownRules: '',
  thinkingEnabled: false,
  thinkingPrompt: '',
})
const emptyNpc = () => ({ id: '', name: '', relationship: '', personality: '', avatar: '' })

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

export default function StoryCharacterForm({ mode, characterId, onSave, onCancel }) {
  const isEdit = !!characterId
  const [generatingAutonomy, setGeneratingAutonomy] = useState(false)
  const [showExtractModal, setShowExtractModal] = useState(false)
  const [extractText, setExtractText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [expandedRC, setExpandedRC] = useState(0) // which romance char section is expanded

  const [form, setForm] = useState({
    id: '',
    name: '',
    avatar: '',
    // Protagonist
    protagonistName: '',
    protagonistGender: '',
    protagonistBackground: '',
    protagonistPersonality: '',
    // Block 1
    worldSetting: '',
    openingScenario: '',
    storyTone: '甜虐',
    // Block 2
    romanceCharacters: [emptyRomanceChar()],
    // Block 3
    npcs: [],
    // Block 4
    autoGenerateNpcs: true,
    npcStyleLimit: '',
    // Shared
    chatStyle: 'story',
    contextWindow: 40,
    showTimestamp: false,
    activeMessageEnabled: false,
    activePrompt: '',
    autoMessageEnabled: false,
    autoMessagePrompt: '',
    autonomyBehavior: '',
    temperature: 0.9,
    topP: 0.95,
  })

  useEffect(() => {
    if (characterId) {
      const char = getCharacter(characterId, mode)
      if (char) {
        setForm({
          id: char.id,
          name: char.name || '',
          avatar: char.avatar || '',
          protagonistName: char.protagonistName || '',
          protagonistGender: char.protagonistGender || '',
          protagonistBackground: char.protagonistBackground || '',
          protagonistPersonality: char.protagonistPersonality || '',
          worldSetting: char.worldSetting || '',
          openingScenario: char.openingScenario || '',
          storyTone: char.storyTone || '甜虐',
          romanceCharacters: char.romanceCharacters?.length > 0
            ? char.romanceCharacters.map(rc => ({
                ...emptyRomanceChar(),
                ...rc,
                styleRules: Array.isArray(rc.styleRules) ? rc.styleRules.join('\n') : (rc.styleRules || ''),
                forbiddenWords: Array.isArray(rc.forbiddenWords) ? rc.forbiddenWords.join('\n') : (rc.forbiddenWords || ''),
                affectionStages: rc.affectionStages?.length > 0
                  ? rc.affectionStages.map(s => ({ ...emptyStage(), ...s }))
                  : [emptyStage()],
              }))
            : [emptyRomanceChar()],
          npcs: char.npcs?.length > 0
            ? char.npcs.map(n => ({ ...emptyNpc(), ...n }))
            : [],
          autoGenerateNpcs: char.autoGenerateNpcs !== false,
          npcStyleLimit: char.npcStyleLimit || '',
          chatStyle: 'story',
          contextWindow: char.contextWindow || 40,
          showTimestamp: char.showTimestamp || false,
          activeMessageEnabled: char.activeMessageEnabled || false,
          activePrompt: char.activePrompt || '',
          autoMessageEnabled: char.autoMessageEnabled || false,
          autoMessagePrompt: char.autoMessagePrompt || '',
          autonomyBehavior: char.autonomyBehavior || '',
          temperature: char.temperature ?? 0.9,
          topP: char.topP ?? 0.95,
        })
      }
    }
  }, [characterId, mode])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  // Romance character helpers
  const updateRC = (index, field, value) => {
    const chars = [...form.romanceCharacters]
    chars[index] = { ...chars[index], [field]: value }
    setForm(prev => ({ ...prev, romanceCharacters: chars }))
  }

  const updateRCStage = (rcIdx, stageIdx, field, value) => {
    const chars = [...form.romanceCharacters]
    const stages = [...chars[rcIdx].affectionStages]
    stages[stageIdx] = { ...stages[stageIdx], [field]: value }
    chars[rcIdx] = { ...chars[rcIdx], affectionStages: stages }
    setForm(prev => ({ ...prev, romanceCharacters: chars }))
  }

  const addRCStage = (rcIdx) => {
    const chars = [...form.romanceCharacters]
    chars[rcIdx] = { ...chars[rcIdx], affectionStages: [...chars[rcIdx].affectionStages, emptyStage()] }
    setForm(prev => ({ ...prev, romanceCharacters: chars }))
  }

  const removeRCStage = (rcIdx, stageIdx) => {
    const chars = [...form.romanceCharacters]
    if (chars[rcIdx].affectionStages.length <= 1) return
    chars[rcIdx] = {
      ...chars[rcIdx],
      affectionStages: chars[rcIdx].affectionStages.filter((_, i) => i !== stageIdx),
    }
    setForm(prev => ({ ...prev, romanceCharacters: chars }))
  }

  const addRomanceChar = () => {
    if (form.romanceCharacters.length >= 3) return
    setForm(prev => ({ ...prev, romanceCharacters: [...prev.romanceCharacters, emptyRomanceChar()] }))
    setExpandedRC(form.romanceCharacters.length)
  }

  const removeRomanceChar = (index) => {
    if (form.romanceCharacters.length <= 1) return
    setForm(prev => ({
      ...prev,
      romanceCharacters: prev.romanceCharacters.filter((_, i) => i !== index),
    }))
    if (expandedRC >= form.romanceCharacters.length - 1) {
      setExpandedRC(Math.max(0, form.romanceCharacters.length - 2))
    }
  }

  const handleRCAvatar = async (index, file) => {
    if (!file) return
    const base64 = await imageToBase64(file)
    updateRC(index, 'avatar', base64)
  }

  // NPC helpers
  const updateNpc = (index, field, value) => {
    const npcs = [...form.npcs]
    npcs[index] = { ...npcs[index], [field]: value }
    setForm(prev => ({ ...prev, npcs }))
  }

  const addNpc = () => {
    setForm(prev => ({ ...prev, npcs: [...prev.npcs, emptyNpc()] }))
  }

  const removeNpc = (index) => {
    setForm(prev => ({ ...prev, npcs: prev.npcs.filter((_, i) => i !== index) }))
  }

  const handleNpcAvatar = async (index, file) => {
    if (!file) return
    const base64 = await imageToBase64(file)
    updateNpc(index, 'avatar', base64)
  }

  // Avatar for main story
  const avatarInputRef = useRef(null)
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const base64 = await imageToBase64(file)
    update('avatar', base64)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      alert('请输入故事名称')
      return
    }
    const validRC = form.romanceCharacters.filter(rc => rc.name.trim())
    if (validRC.length === 0) {
      alert('至少需要一个可攻略角色')
      return
    }

    const character = {
      id: isEdit ? form.id : generateId(),
      name: form.name.trim(),
      avatar: form.avatar || '',
      protagonistName: form.protagonistName.trim(),
      protagonistGender: form.protagonistGender,
      protagonistBackground: form.protagonistBackground.trim(),
      protagonistPersonality: form.protagonistPersonality.trim(),
      worldSetting: form.worldSetting.trim(),
      openingScenario: form.openingScenario.trim(),
      storyTone: form.storyTone,
      romanceCharacters: validRC.map(rc => ({
        id: rc.id || generateId(),
        name: rc.name.trim(),
        avatar: rc.avatar || '',
        background: rc.background.trim(),
        personality: rc.personality.trim(),
        styleRules: parseLines(rc.styleRules),
        forbiddenWords: parseLines(rc.forbiddenWords),
        speakingStyle: rc.speakingStyle.trim(),
        affectionEnabled: rc.affectionEnabled,
        affectionInitial: rc.affectionEnabled ? rc.affectionInitial : 50,
        affectionStages: rc.affectionEnabled ? rc.affectionStages.filter(s => s.name.trim()) : [],
        affectionUpRules: rc.affectionEnabled ? rc.affectionUpRules.trim() : '',
        affectionDownRules: rc.affectionEnabled ? rc.affectionDownRules.trim() : '',
        thinkingEnabled: rc.thinkingEnabled,
        thinkingPrompt: rc.thinkingEnabled ? rc.thinkingPrompt.trim() : '',
      })),
      npcs: form.npcs.filter(n => n.name.trim()).map(n => ({
        id: n.id || generateId(),
        name: n.name.trim(),
        relationship: n.relationship.trim(),
        personality: n.personality.trim(),
        avatar: n.avatar || '',
      })),
      autoGenerateNpcs: form.autoGenerateNpcs,
      npcStyleLimit: form.npcStyleLimit.trim(),
      chatStyle: 'story',
      contextWindow: form.contextWindow || 40,
      showTimestamp: form.showTimestamp || false,
      activeMessageEnabled: form.activeMessageEnabled || false,
      activePrompt: form.activeMessageEnabled ? form.activePrompt.trim() : '',
      autoMessageEnabled: form.autoMessageEnabled || false,
      autoMessagePrompt: form.autoMessageEnabled ? form.autoMessagePrompt.trim() : '',
      autonomyBehavior: form.autonomyBehavior.trim(),
      temperature: form.temperature ?? 0.9,
      topP: form.topP ?? 0.95,
      updatedAt: Date.now(),
    }

    saveCharacter(character, mode)
    onSave()
  }

  const handleExtract = async () => {
    const text = extractText.trim()
    if (!text) return
    const apiKey = getApiKey()
    if (!apiKey) {
      alert('请先在设置页面填写 DeepSeek API Key')
      return
    }
    setExtracting(true)
    const { result, error } = await extractStoryFromText(text, apiKey)
    setExtracting(false)
    if (error || !result) {
      alert('提取失败：' + (error?.message || '未知错误'))
      return
    }

    // Apply extracted data to form
    const rc = result['可攻略角色'] || []
    const npcs = result['主要NPC'] || []

    setForm(prev => ({
      ...prev,
      name: result['故事名称'] || prev.name,
      worldSetting: result['世界观'] || prev.worldSetting,
      openingScenario: result['开场剧情'] || prev.openingScenario,
      storyTone: result['故事基调'] || prev.storyTone,
      romanceCharacters: rc.length > 0
        ? rc.map((r, i) => ({
            ...emptyRomanceChar(),
            name: r['角色名'] || '',
            background: r['背景'] || '',
            personality: r['性格'] || '',
            styleRules: Array.isArray(r['文风规则']) ? r['文风规则'].join('\n') : (r['文风规则'] || ''),
            forbiddenWords: Array.isArray(r['禁止行为']) ? r['禁止行为'].join('\n') : (r['禁止行为'] || ''),
            speakingStyle: r['说话风格'] || '',
            affectionEnabled: true,
            affectionInitial: r['好感度初始'] ?? 50,
            affectionStages: Array.isArray(r['好感度阶段']) && r['好感度阶段'].length > 0
              ? r['好感度阶段'].map(s => ({
                  name: s.label || s.name || '',
                  min: s.min != null ? Number(s.min) : 0,
                  max: s.max != null ? Number(s.max) : 50,
                  behavior: s.rule || s.behavior || '',
                }))
              : [emptyStage()],
            affectionUpRules: Array.isArray(r['好感度增加规则']) ? r['好感度增加规则'].join('\n') : (r['好感度增加规则'] || ''),
            affectionDownRules: Array.isArray(r['好感度减少规则']) ? r['好感度减少规则'].join('\n') : (r['好感度减少规则'] || ''),
            thinkingEnabled: false,
            thinkingPrompt: '',
          }))
        : prev.romanceCharacters,
      npcs: npcs.length > 0
        ? npcs.map(n => ({
            ...emptyNpc(),
            name: n['NPC名'] || '',
            relationship: n['关系'] || '',
            personality: n['性格'] || '',
            avatar: '',
          }))
        : prev.npcs,
    }))

    setShowExtractModal(false)
    setExtractText('')
    if (rc.length > 0) setExpandedRC(0)
  }

  const inputClass = "w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none transition-colors"
  const labelClass = "block text-sm font-medium text-gray-300 mb-1"
  const sectionClass = "bg-gray-800 rounded-xl p-4 border border-gray-700/50"

  return (
    <form onSubmit={handleSubmit} className="p-4 pb-24 space-y-4">
      {/* Story name */}
      <div>
        <label className={labelClass}>故事名称 *</label>
        <input
          type="text"
          className={inputClass}
          value={form.name}
          onChange={e => update('name', e.target.value)}
          placeholder="给你的故事起个名字"
        />
      </div>

      {/* Avatar + AI Extract */}
      <div className="flex gap-3 items-end">
        <div>
          <label className={labelClass}>故事封面（可选）</label>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <div
            onClick={() => avatarInputRef.current?.click()}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-500 hover:border-blue-400 flex items-center justify-center overflow-hidden cursor-pointer transition-colors bg-gray-800"
          >
            {form.avatar ? (
              <img src={form.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-gray-500">
                <div className="text-2xl leading-none">+</div>
                <div className="text-[10px]">封面</div>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowExtractModal(true)}
          className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-medium transition-all active:scale-[0.98]"
        >
          🤖 AI 一键抓取
        </button>
      </div>

      {/* ========== Protagonist ========== */}
      <div className={sectionClass}>
        <h3 className="text-sm font-medium text-gray-200 mb-3">👤 主角设定（你）</h3>
        <p className="text-xs text-gray-500 mb-3">设定你在故事中扮演的角色，AI会根据这些信息来推进剧情。</p>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>主角名字</label>
              <input
                type="text"
                className={inputClass}
                value={form.protagonistName}
                onChange={e => update('protagonistName', e.target.value)}
                placeholder="你在故事中的角色名"
              />
            </div>
            <div>
              <label className={labelClass}>性别</label>
              <select
                className={inputClass}
                value={form.protagonistGender}
                onChange={e => update('protagonistGender', e.target.value)}
              >
                <option value="">未设定</option>
                <option value="男">男</option>
                <option value="女">女</option>
                <option value="其他">其他</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>主角背景简介</label>
            <textarea
              className={inputClass + " h-20 resize-none"}
              value={form.protagonistBackground}
              onChange={e => update('protagonistBackground', e.target.value)}
              placeholder="介绍你的角色的身份、过往经历、在故事世界中的位置..."
            />
          </div>
          <div>
            <label className={labelClass}>主角性格特点</label>
            <textarea
              className={inputClass + " h-16 resize-none"}
              value={form.protagonistPersonality}
              onChange={e => update('protagonistPersonality', e.target.value)}
              placeholder="你的角色有什么性格特征、行为习惯、价值观..."
            />
          </div>
        </div>
      </div>

      {/* ========== BLOCK 1: World & Plot ========== */}
      <div className={sectionClass}>
        <h3 className="text-sm font-medium text-gray-200 mb-3">📖 世界观与剧情设定</h3>

        <div className="space-y-3">
          <div>
            <label className={labelClass}>世界观描述</label>
            <textarea
              className={inputClass + " h-28 resize-none"}
              value={form.worldSetting}
              onChange={e => update('worldSetting', e.target.value)}
              placeholder="描述故事发生的世界背景、时代、社会结构、魔法/科技体系等..."
            />
          </div>

          <div>
            <label className={labelClass}>开场剧情</label>
            <p className="text-[10px] text-gray-500 mb-2">AI第一条消息使用的开场内容，不计入对话历史</p>
            <textarea
              className={inputClass + " h-24 resize-none"}
              value={form.openingScenario}
              onChange={e => update('openingScenario', e.target.value)}
              placeholder="例如：深夜的咖啡馆里，窗外飘着细雨。你推开门，看到一个熟悉的身影坐在角落..."
            />
          </div>

          <div>
            <label className={labelClass}>故事基调</label>
            <div className="flex gap-2">
              {['甜虐', '纯爱', '悬疑', '其他'].map(tone => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => update('storyTone', tone)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.storyTone === tone
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ========== BLOCK 2: Romance Characters ========== */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-gray-200">💕 可攻略角色</h3>
            <p className="text-xs text-gray-500 mt-0.5">最少1个，最多3个</p>
          </div>
          {form.romanceCharacters.length < 3 && (
            <button
              type="button"
              onClick={addRomanceChar}
              className="px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-medium transition-colors"
            >
              + 添加攻略角色
            </button>
          )}
        </div>

        <div className="space-y-3">
          {form.romanceCharacters.map((rc, i) => (
            <div key={i} className="bg-gray-700/30 rounded-lg border border-gray-700/50 overflow-hidden">
              {/* Header bar */}
              <button
                type="button"
                onClick={() => setExpandedRC(expandedRC === i ? -1 : i)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {rc.avatar ? (
                    <img src={rc.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-xs text-gray-300">
                      {rc.name ? rc.name[0] : '?'}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-200">
                    {rc.name || '未命名角色 ' + (i + 1)}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {i === 0 ? '(默认)' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeRomanceChar(i) }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      删除
                    </button>
                  )}
                  <span className="text-gray-500 text-xs">{expandedRC === i ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Expanded content */}
              {expandedRC === i && (
                <div className="p-3 pt-0 space-y-3 border-t border-gray-700/50">
                  {/* Name + Avatar */}
                  <div className="flex gap-3 items-end">
                    <div>
                      <input
                        ref={el => { if (el) el._rcIdx = i }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleRCAvatar(i, f) }}
                        id={`rc-avatar-${i}`}
                      />
                      <label
                        htmlFor={`rc-avatar-${i}`}
                        className="w-14 h-14 rounded-full border-2 border-dashed border-gray-500 hover:border-pink-400 flex items-center justify-center overflow-hidden cursor-pointer transition-colors bg-gray-600 flex-shrink-0 block"
                      >
                        {rc.avatar ? (
                          <img src={rc.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-gray-400 text-lg">+</span>
                        )}
                      </label>
                    </div>
                    <div className="flex-1">
                      <label className={labelClass}>姓名</label>
                      <input
                        type="text"
                        className={inputClass}
                        value={rc.name}
                        onChange={e => updateRC(i, 'name', e.target.value)}
                        placeholder="角色姓名"
                      />
                    </div>
                  </div>

                  {/* Background */}
                  <div>
                    <label className={labelClass}>详细背景设定</label>
                    <textarea
                      className={inputClass + " h-24 resize-none"}
                      value={rc.background}
                      onChange={e => updateRC(i, 'background', e.target.value)}
                      placeholder="描述角色的身份、过往经历、世界观中的位置..."
                    />
                  </div>

                  {/* Personality */}
                  <div>
                    <label className={labelClass}>性格核心</label>
                    <textarea
                      className={inputClass + " h-20 resize-none"}
                      value={rc.personality}
                      onChange={e => updateRC(i, 'personality', e.target.value)}
                      placeholder="角色的核心性格特征、价值观、行为模式..."
                    />
                  </div>

                  {/* Style rules */}
                  <div>
                    <label className={labelClass}>文风规则（每行一条）</label>
                    <textarea
                      className={inputClass + " h-20 resize-none"}
                      value={rc.styleRules}
                      onChange={e => updateRC(i, 'styleRules', e.target.value)}
                      placeholder="该角色的对话和叙事风格规则"
                    />
                  </div>

                  {/* Forbidden words */}
                  <div>
                    <label className={labelClass}>禁止行为（每行一条）</label>
                    <textarea
                      className={inputClass + " h-20 resize-none"}
                      value={rc.forbiddenWords}
                      onChange={e => updateRC(i, 'forbiddenWords', e.target.value)}
                      placeholder="该角色不应出现的言行"
                    />
                  </div>

                  {/* Speaking style */}
                  <div>
                    <label className={labelClass}>说话风格描述</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={rc.speakingStyle}
                      onChange={e => updateRC(i, 'speakingStyle', e.target.value)}
                      placeholder="例如：温柔体贴、爱用古诗词、说话带刺、沉默寡言"
                    />
                  </div>

                  {/* Affection toggle */}
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-medium text-gray-300">好感度系统</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateRC(i, 'affectionEnabled', !rc.affectionEnabled)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${
                          rc.affectionEnabled ? 'bg-pink-500' : 'bg-gray-600'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          rc.affectionEnabled ? 'left-[20px]' : 'left-[2px]'
                        }`} />
                      </button>
                    </div>
                    {rc.affectionEnabled && (
                      <div className="mt-3 space-y-2">
                        <div>
                          <label className="text-[11px] text-gray-500">初始好感度</label>
                          <input
                            type="number" min="0" max="100"
                            className={inputClass + " mt-0.5"}
                            value={rc.affectionInitial}
                            onChange={e => updateRC(i, 'affectionInitial', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500">好感度阶段</label>
                          <div className="space-y-2 mt-1">
                            {rc.affectionStages.map((stage, si) => (
                              <div key={si} className="bg-gray-700/50 rounded p-2 space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-[10px] text-gray-500">阶段 {si + 1}</span>
                                  {rc.affectionStages.length > 1 && (
                                    <button type="button" onClick={() => removeRCStage(i, si)} className="text-[10px] text-red-400">删除</button>
                                  )}
                                </div>
                                <input type="text" className={inputClass} value={stage.name} onChange={e => updateRCStage(i, si, 'name', e.target.value)} placeholder="阶段名" />
                                <div className="flex gap-2">
                                  <input type="number" min="0" max="100" className={inputClass} value={stage.min} onChange={e => updateRCStage(i, si, 'min', parseInt(e.target.value) || 0)} placeholder="下限" />
                                  <input type="number" min="0" max="100" className={inputClass} value={stage.max} onChange={e => updateRCStage(i, si, 'max', parseInt(e.target.value) || 0)} placeholder="上限" />
                                </div>
                                <textarea className={inputClass + " h-12 resize-none"} value={stage.behavior} onChange={e => updateRCStage(i, si, 'behavior', e.target.value)} placeholder="行为规则" />
                              </div>
                            ))}
                          </div>
                          <button type="button" onClick={() => addRCStage(i)} className="w-full py-1.5 mt-1 rounded border border-dashed border-gray-600 text-gray-400 text-xs hover:border-gray-500">+ 添加阶段</button>
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500">好感度增加条件（每行一条）</label>
                          <textarea className={inputClass + " h-16 resize-none"} value={rc.affectionUpRules} onChange={e => updateRC(i, 'affectionUpRules', e.target.value)} placeholder="表现友善：+3" />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-500">好感度减少条件（每行一条）</label>
                          <textarea className={inputClass + " h-16 resize-none"} value={rc.affectionDownRules} onChange={e => updateRC(i, 'affectionDownRules', e.target.value)} placeholder="态度粗鲁：-5" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Thinking toggle */}
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-medium text-gray-300">思考层指令</h4>
                      <button
                        type="button"
                        onClick={() => updateRC(i, 'thinkingEnabled', !rc.thinkingEnabled)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${
                          rc.thinkingEnabled ? 'bg-amber-500' : 'bg-gray-600'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          rc.thinkingEnabled ? 'left-[20px]' : 'left-[2px]'
                        }`} />
                      </button>
                    </div>
                    {rc.thinkingEnabled && (
                      <textarea
                        className={inputClass + " h-20 resize-none mt-2"}
                        value={rc.thinkingPrompt}
                        onChange={e => updateRC(i, 'thinkingPrompt', e.target.value)}
                        placeholder="该角色在说话前的思考框架..."
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ========== BLOCK 3: Major NPCs ========== */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-gray-200">👥 主要NPC</h3>
            <p className="text-xs text-gray-500 mt-0.5">数量不限</p>
          </div>
          <button
            type="button"
            onClick={addNpc}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
          >
            + 添加NPC
          </button>
        </div>

        {form.npcs.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4 border border-dashed border-gray-600 rounded-lg">
            暂未添加NPC
          </p>
        ) : (
          <div className="space-y-2">
            {form.npcs.map((npc, i) => (
              <div key={i} className="bg-gray-700/30 rounded-lg p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">NPC {i + 1}</span>
                  <button type="button" onClick={() => removeNpc(i)} className="text-xs text-red-400 hover:text-red-300">删除</button>
                </div>
                <div className="flex gap-3">
                  <div>
                    <input
                      type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleNpcAvatar(i, f) }}
                      id={`npc-avatar-${i}`}
                    />
                    <label
                      htmlFor={`npc-avatar-${i}`}
                      className="w-10 h-10 rounded-full border-2 border-dashed border-gray-500 hover:border-blue-400 flex items-center justify-center overflow-hidden cursor-pointer transition-colors bg-gray-600 flex-shrink-0 block"
                    >
                      {npc.avatar ? (
                        <img src={npc.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-400 text-sm">+</span>
                      )}
                    </label>
                  </div>
                  <div className="flex-1 space-y-2">
                    <input type="text" className={inputClass} value={npc.name} onChange={e => updateNpc(i, 'name', e.target.value)} placeholder="NPC姓名" />
                    <input type="text" className={inputClass} value={npc.relationship} onChange={e => updateNpc(i, 'relationship', e.target.value)} placeholder="与故事的关系（一行）" />
                    <textarea className={inputClass + " h-14 resize-none"} value={npc.personality} onChange={e => updateNpc(i, 'personality', e.target.value)} placeholder="性格简介（一段话）" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========== BLOCK 4: Minor NPCs ========== */}
      <div className={sectionClass}>
        <h3 className="text-sm font-medium text-gray-200 mb-3">🎭 次要NPC设置</h3>
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xs text-gray-300">AI自动生成次要NPC</span>
            <p className="text-[10px] text-gray-500 mt-0.5">场景需要时AI可自主创建路人、店主等临时NPC</p>
          </div>
          <button
            type="button"
            onClick={() => update('autoGenerateNpcs', !form.autoGenerateNpcs)}
            className={`w-10 h-5 rounded-full transition-colors relative ${
              form.autoGenerateNpcs ? 'bg-green-500' : 'bg-gray-600'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              form.autoGenerateNpcs ? 'left-[20px]' : 'left-[2px]'
            }`} />
          </button>
        </div>
        {form.autoGenerateNpcs && (
          <div>
            <label className={labelClass}>次要NPC风格限制</label>
            <textarea
              className={inputClass + " h-20 resize-none"}
              value={form.npcStyleLimit}
              onChange={e => update('npcStyleLimit', e.target.value)}
              placeholder="例如：符合古代宫廷背景，不出现现代词汇"
            />
          </div>
        )}
      </div>

      {/* ========== Advanced Parameters ========== */}
      <div className={sectionClass}>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between text-sm font-medium text-gray-200"
        >
          <span>高级参数</span>
          <span className="text-gray-400 text-xs">{showAdvanced ? '收起 ▲' : '展开 ▼'}</span>
        </button>
        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400">温度 (Temperature)</label>
                <span className="text-xs text-blue-400 font-mono">{form.temperature ?? 0.9}</span>
              </div>
              <input type="range" min="0" max="2" step="0.1" value={form.temperature ?? 0.9}
                onChange={e => update('temperature', parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none bg-gray-600 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500" />
              <div className="flex justify-between text-[10px] text-gray-600 mt-0.5"><span>0 精确</span><span>2 创意</span></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400">TopP</label>
                <span className="text-xs text-purple-400 font-mono">{form.topP ?? 0.95}</span>
              </div>
              <input type="range" min="0" max="1" step="0.05" value={form.topP ?? 0.95}
                onChange={e => update('topP', parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none bg-gray-600 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500" />
              <div className="flex justify-between text-[10px] text-gray-600 mt-0.5"><span>0 集中</span><span>1 多样</span></div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">上下文窗口</label>
              <select className={inputClass} value={form.contextWindow} onChange={e => update('contextWindow', parseInt(e.target.value))}>
                <option value={20}>20 条消息</option>
                <option value={40}>40 条消息（默认）</option>
                <option value={60}>60 条消息</option>
                <option value={80}>80 条消息</option>
                <option value={100}>100 条消息</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* AI Extract modal */}
      {showExtractModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/60 backdrop-blur-sm" onClick={() => { setShowExtractModal(false); setExtractText('') }}>
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-5 mx-4 w-full max-w-lg max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-medium text-gray-200 mb-1">AI 抓取角色设定</h3>
            <p className="text-xs text-gray-500 mb-3">
              粘贴包含世界观和角色设定的文本，AI 将自动提取并填充表单。支持小说简介、角色设定文档等格式。
            </p>

            <textarea
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none transition-colors flex-1 resize-none"
              value={extractText}
              onChange={e => setExtractText(e.target.value)}
              placeholder="例如：&#10;这是一个发生在未来星际联邦背景下的故事。&#10;&#10;女主角林晚是联邦第一舰队指挥官，性格冷峻果断但内心柔软...&#10;&#10;男主角苏晨是星际科学院首席研究员..."
              rows={12}
            />

            {extracting && (
              <div className="flex items-center gap-2 py-2 text-sm text-purple-400">
                <span className="inline-flex gap-0.5">
                  <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                AI正在分析文本，提取角色信息...
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => { setShowExtractModal(false); setExtractText('') }}
                className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleExtract}
                disabled={extracting || !extractText.trim()}
                className="flex-[2] py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-medium transition-all disabled:opacity-50 active:scale-[0.98]"
              >
                {extracting ? '提取中...' : '🤖 开始提取'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-700 p-4 max-w-lg mx-auto">
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors">
            取消
          </button>
          <button type="submit" className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all active:scale-[0.98]">
            {isEdit ? '保存修改' : '创建故事'}
          </button>
        </div>
      </div>
    </form>
  )
}
