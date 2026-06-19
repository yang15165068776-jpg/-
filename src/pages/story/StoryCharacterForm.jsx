import { useState, useEffect, useRef } from 'react'
import { getCharacter, saveCharacter, generateId, getApiKey } from '../../utils/storage'
import { generateAutonomySummary, extractCharacterFromText, extractStoryFromText, generateStageBehaviors } from '../../utils/deepseek'

const emptyStage = () => ({
  name: '',
  min: 0,
  max: 50,
  coreState: '',
  playerStrategy: '',
  riseCondition: '',
  languageSamples: '',
  forbiddenBehaviors: '',
  stageDetails: '',
  emotionalTraits: '',
  stageExplosion: '',
  selfDriveBehaviors: [],
})
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
  transitionTriggers: '',
  irreversibleMoment: '',
  erosionCondition: '',
  anchorSuppression: '',
  thinkingEnabled: true,
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
  const [generatingBehaviors, setGeneratingBehaviors] = useState(false)
  const [showExtractModal, setShowExtractModal] = useState(false)
  const [extractText, setExtractText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [expandedRC, setExpandedRC] = useState(0)
  const [expandedNPC, setExpandedNPC] = useState(0)

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
                transitionTriggers: Array.isArray(rc.transitionTriggers) ? rc.transitionTriggers.join('\n') : (rc.transitionTriggers || ''),
                affectionStages: rc.affectionStages?.length > 0
                  ? rc.affectionStages.map(s => ({
                      ...emptyStage(),
                      ...s,
                      languageSamples: Array.isArray(s.languageSamples) ? s.languageSamples.join('\n') : (s.languageSamples || ''),
                      forbiddenBehaviors: Array.isArray(s.forbiddenBehaviors) ? s.forbiddenBehaviors.join('\n') : (s.forbiddenBehaviors || ''),
                    }))
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

  const addRCStageBehavior = (rcIdx, stageIdx) => {
    const chars = [...form.romanceCharacters]
    const stages = [...chars[rcIdx].affectionStages]
    stages[stageIdx] = {
      ...stages[stageIdx],
      selfDriveBehaviors: [...(stages[stageIdx].selfDriveBehaviors || []), { description: '', trigger: 'overNrounds' }],
    }
    chars[rcIdx] = { ...chars[rcIdx], affectionStages: stages }
    setForm(prev => ({ ...prev, romanceCharacters: chars }))
  }

  const removeRCStageBehavior = (rcIdx, stageIdx, behIdx) => {
    const chars = [...form.romanceCharacters]
    const stages = [...chars[rcIdx].affectionStages]
    stages[stageIdx] = {
      ...stages[stageIdx],
      selfDriveBehaviors: (stages[stageIdx].selfDriveBehaviors || []).filter((_, i) => i !== behIdx),
    }
    chars[rcIdx] = { ...chars[rcIdx], affectionStages: stages }
    setForm(prev => ({ ...prev, romanceCharacters: chars }))
  }

  const updateRCStageBehavior = (rcIdx, stageIdx, behIdx, field, value) => {
    const chars = [...form.romanceCharacters]
    const stages = [...chars[rcIdx].affectionStages]
    const behaviors = [...(stages[stageIdx].selfDriveBehaviors || [])]
    behaviors[behIdx] = { ...behaviors[behIdx], [field]: value }
    stages[stageIdx] = { ...stages[stageIdx], selfDriveBehaviors: behaviors }
    chars[rcIdx] = { ...chars[rcIdx], affectionStages: stages }
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
        affectionStages: rc.affectionEnabled
          ? rc.affectionStages.filter(s => s.name.trim()).map(s => ({
              name: s.name.trim(),
              min: s.min != null ? Number(s.min) : 0,
              max: s.max != null ? Number(s.max) : 50,
              coreState: s.coreState.trim(),
              playerStrategy: s.playerStrategy.trim(),
              riseCondition: s.riseCondition.trim(),
              languageSamples: parseLines(s.languageSamples),
              forbiddenBehaviors: parseLines(s.forbiddenBehaviors),
              selfDriveBehaviors: (s.selfDriveBehaviors || []).filter(b => b.description.trim()),
              stageDetails: s.stageDetails?.trim() || '',
              emotionalTraits: s.emotionalTraits?.trim() || '',
              stageExplosion: s.stageExplosion?.trim() || '',
            }))
          : [],
        transitionTriggers: rc.affectionEnabled ? parseLines(rc.transitionTriggers) : [],
        irreversibleMoment: rc.affectionEnabled ? rc.irreversibleMoment.trim() : '',
        erosionCondition: rc.affectionEnabled ? rc.erosionCondition.trim() : '',
        anchorSuppression: rc.affectionEnabled ? rc.anchorSuppression.trim() : '',
        thinkingEnabled: true,
        thinkingPrompt: '',
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
                  coreState: s.coreState || '',
                  playerStrategy: s.playerStrategy || '',
                  riseCondition: s.riseCondition || '',
                  languageSamples: Array.isArray(s.languageSamples) ? s.languageSamples.join('\n') : (s.languageSamples || ''),
                  forbiddenBehaviors: Array.isArray(s.forbiddenBehaviors) ? s.forbiddenBehaviors.join('\n') : (s.forbiddenBehaviors || ''),
                  selfDriveBehaviors: Array.isArray(s.selfDriveBehaviors)
                    ? s.selfDriveBehaviors.map(b => ({
                        description: b.behavior || b.description || '',
                        trigger: b.trigger || 'overNrounds',
                      }))
                    : [],
                  stageDetails: Array.isArray(s.stageDetails) ? s.stageDetails.join('\n') : (s.stageDetails || ''),
                  emotionalTraits: Array.isArray(s.emotionalTraits) ? s.emotionalTraits.join('\n') : (s.emotionalTraits || ''),
                  stageExplosion: s.stageExplosion || '',
                }))
              : [emptyStage()],
            transitionTriggers: Array.isArray(r['transitionTriggers']) ? r['transitionTriggers'].join('\n') : (r['transitionTriggers'] || ''),
            irreversibleMoment: r['irreversibleMoment'] || '',
            erosionCondition: r['erosionCondition'] || '',
            anchorSuppression: r['anchorSuppression'] || '',
            thinkingEnabled: true,
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

  const handleGenerateBehaviors = async () => {
    const apiKey = getApiKey()
    if (!apiKey) {
      alert('请先在设置页面填写 DeepSeek API Key')
      return
    }
    const validRC = form.romanceCharacters.filter(rc => rc.name.trim())
    if (validRC.length === 0) {
      alert('请先填写至少一个可攻略角色的姓名')
      return
    }
    setGeneratingBehaviors(true)
    try {
      const updatedRC = [...form.romanceCharacters]
      for (let i = 0; i < updatedRC.length; i++) {
        const rc = updatedRC[i]
        if (!rc.name.trim() || rc.affectionStages.length === 0) continue
        const { result, error } = await generateStageBehaviors({
          name: rc.name,
          background: rc.background,
          personality: rc.personality,
          styleRules: rc.styleRules,
          speakingStyle: rc.speakingStyle,
          affectionStages: rc.affectionStages,
        }, apiKey)
        if (error || !result) {
          console.error('[generateBehaviors] 角色 ' + rc.name + ' 生成失败:', error)
          continue
        }
        // Map returned behaviors into stages
        const aiStages = result.stages || []
        const newStages = rc.affectionStages.map(stage => {
          const match = aiStages.find(s => s.label === stage.name) || aiStages.find(s => s.label.includes(stage.name)) || (aiStages.length > 0 ? aiStages[0] : null)
          // Find by index fallback
          const stageIdx = rc.affectionStages.indexOf(stage)
          const aiMatch = match || (aiStages[stageIdx] || null)
          if (aiMatch && Array.isArray(aiMatch.behaviors)) {
            return {
              ...stage,
              selfDriveBehaviors: aiMatch.behaviors.map(b => ({
                description: b.behavior || b.description || '',
                trigger: b.trigger || 'overNrounds',
              })),
            }
          }
          return stage
        })
        updatedRC[i] = { ...rc, affectionStages: newStages }
      }
      setForm(prev => ({ ...prev, romanceCharacters: updatedRC }))
    } catch (err) {
      alert('生成失败：' + err.message)
    }
    setGeneratingBehaviors(false)
  }

  const inputStyle = { width:'100%', padding:'10px 14px', borderRadius:'10px', border:'0.5px solid var(--border)', background:'var(--bg2)', fontSize:'14px', color:'var(--text)', fontFamily:'inherit', outline:'none' }
  const sectionStyle = { background:'var(--bg2)', borderRadius:'12px', padding:'16px', marginBottom:'12px' }
  const labelStyle = { fontSize:'13px', color:'var(--text2)', display:'block', marginBottom:'6px' }
  const groupTitle = { fontSize:'12px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'8px', marginTop:'24px' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      <div style={{ height:'56px', display:'flex', alignItems:'center', padding:'0 16px', gap:'12px', borderBottom:'0.5px solid var(--border2)', flexShrink:0 }}>
        <button type="button" onClick={onCancel} style={{ width:'32px', height:'32px', borderRadius:'50%', background:'var(--bg2)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', color:'var(--text2)' }}>←</button>
        <span style={{ flex:1, fontSize:'16px', fontWeight:500, color:'var(--text)' }}>{characterId?'编辑':'新建'}剧情角色</span>
        <button type="submit" style={{ padding:'8px 16px', borderRadius:'8px', border:'none', background:'var(--purple)', color:'#fff', fontSize:'13px', fontWeight:500, cursor:'pointer' }}>{characterId?'保存':'创建'}</button>
      </div>
      <form onSubmit={handleSubmit} style={{ flex:1, overflowY:'auto', padding:'20px 16px', paddingBottom:'40px' }}>
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
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="text-[11px] text-gray-500">初始好感度</label>
                          <input
                            type="number" min="0" max="100"
                            className={inputClass + " mt-0.5"}
                            value={rc.affectionInitial}
                            onChange={e => updateRC(i, 'affectionInitial', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                          />
                        </div>

                        {/* Affection Stages */}
                        <div>
                          <label className="text-[11px] text-gray-500">好感度阶段</label>
                          <div className="space-y-2 mt-1">
                            {rc.affectionStages.map((stage, si) => (
                              <div key={si} className="bg-gray-700/50 rounded p-2 space-y-1.5">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] text-gray-500 font-medium">阶段 {si + 1}</span>
                                  {rc.affectionStages.length > 1 && (
                                    <button type="button" onClick={() => removeRCStage(i, si)} className="text-[10px] text-red-400 hover:text-red-300">删除</button>
                                  )}
                                </div>
                                <input type="text" className={inputClass} value={stage.name} onChange={e => updateRCStage(i, si, 'name', e.target.value)} placeholder="阶段标题（如：冷漠期）" />
                                <div className="flex gap-2">
                                  <input type="number" min="0" max="100" className={inputClass} value={stage.min} onChange={e => updateRCStage(i, si, 'min', parseInt(e.target.value) || 0)} placeholder="下限" />
                                  <input type="number" min="0" max="100" className={inputClass} value={stage.max} onChange={e => updateRCStage(i, si, 'max', parseInt(e.target.value) || 0)} placeholder="上限" />
                                </div>
                                <textarea className={inputClass + " h-12 resize-none"} value={stage.coreState} onChange={e => updateRCStage(i, si, 'coreState', e.target.value)} placeholder="角色状态描述" />
                                <textarea className={inputClass + " h-12 resize-none"} value={stage.playerStrategy} onChange={e => updateRCStage(i, si, 'playerStrategy', e.target.value)} placeholder="对玩家的核心策略" />
                                <textarea className={inputClass + " h-12 resize-none"} value={stage.riseCondition} onChange={e => updateRCStage(i, si, 'riseCondition', e.target.value)} placeholder="上涨触发条件（预期被打破，不是被善待）" />
                                <textarea className={inputClass + " h-12 resize-none"} value={stage.languageSamples} onChange={e => updateRCStage(i, si, 'languageSamples', e.target.value)} placeholder="本阶段语言样本（每行一句，2-3句）" />
                                <textarea className={inputClass + " h-12 resize-none"} value={stage.forbiddenBehaviors} onChange={e => updateRCStage(i, si, 'forbiddenBehaviors', e.target.value)} placeholder="本阶段禁止行为（每行一条）" />

                                <textarea className={inputClass + " h-16 resize-none"} value={stage.stageDetails} onChange={e => updateRCStage(i, si, 'stageDetails', e.target.value)} placeholder="【本阶段表现细节】每行一条具体行为（如：远远看见你脚步一顿转身走开）。AI会将其作为高频自发动作执行。" />
                                <textarea className={inputClass + " h-16 resize-none"} value={stage.emotionalTraits} onChange={e => updateRCStage(i, si, 'emotionalTraits', e.target.value)} placeholder="【核心情绪与语言特征】每行一条情绪锁（如：任何你对他的冷淡都会让他陷入恐慌）。AI会将其作为底层心理逻辑。" />
                                <textarea className={inputClass + " h-20 resize-none"} value={stage.stageExplosion} onChange={e => updateRCStage(i, si, 'stageExplosion', e.target.value)} placeholder="【阶段爆发/转折点名场面】描述一个当好感度到达临界或转折时的具体剧情高光（如：血色、车祸、失控大哭等名场面）。AI会在剧情需要时强行触发。" />

                                {/* Self-drive behaviors */}
                                <div className="border-t border-gray-600/50 pt-1.5 mt-1.5">
                                  <label className="text-[10px] text-amber-400 font-medium">该阶段自驱行为（3-5条）</label>
                                  {(stage.selfDriveBehaviors || []).map((beh, bi) => (
                                    <div key={bi} className="flex gap-1.5 mt-1 items-start">
                                      <div className="flex-1 space-y-1">
                                        <input
                                          type="text"
                                          className={inputClass}
                                          value={beh.description}
                                          onChange={e => updateRCStageBehavior(i, si, bi, 'description', e.target.value)}
                                          placeholder="行为描述（角色会做什么）"
                                        />
                                        <select
                                          className={inputClass + " text-[11px]"}
                                          value={beh.trigger}
                                          onChange={e => updateRCStageBehavior(i, si, bi, 'trigger', e.target.value)}
                                        >
                                          <option value="overNrounds">超过N轮用户没主动互动</option>
                                          <option value="sceneElement">场景出现特定元素</option>
                                          <option value="stageEnter">好感度刚进入本阶段</option>
                                          <option value="selfDisadvantage">AI判断局面对自己不利</option>
                                        </select>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeRCStageBehavior(i, si, bi)}
                                        className="text-[10px] text-red-400 hover:text-red-300 mt-1 flex-shrink-0"
                                      >
                                        删除
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => addRCStageBehavior(i, si)}
                                    className="w-full py-1 mt-1.5 rounded border border-dashed border-gray-600 text-gray-400 text-[10px] hover:border-gray-500"
                                  >
                                    + 添加自驱行为
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <button type="button" onClick={() => addRCStage(i)} className="w-full py-1.5 mt-1 rounded border border-dashed border-gray-600 text-gray-400 text-xs hover:border-gray-500">+ 添加阶段</button>
                        </div>

                        {/* Transition Anchors */}
                        <div className="bg-gray-700/50 rounded p-2 space-y-2">
                          <label className="text-[11px] text-gray-400 font-medium">阶段转折锚点</label>
                          <textarea className={inputClass + " h-16 resize-none"} value={rc.transitionTriggers} onChange={e => updateRC(i, 'transitionTriggers', e.target.value)} placeholder="各阶段转折的触发事件类型（每行一个）" />
                          <div>
                            <label className="text-[10px] text-gray-500">不可逆转折描述</label>
                            <textarea className={inputClass + " h-12 resize-none mt-0.5"} value={rc.irreversibleMoment} onChange={e => updateRC(i, 'irreversibleMoment', e.target.value)} placeholder="不可逆转折的详细描述" />
                          </div>
                        </div>

                        {/* Iron Law */}
                        <div className="bg-gray-700/50 rounded p-2 space-y-2">
                          <label className="text-[11px] text-gray-400 font-medium">数值增长铁律</label>
                          <div>
                            <label className="text-[10px] text-gray-500">反向侵蚀条件（什么情况下反而-值）</label>
                            <textarea className={inputClass + " h-12 resize-none mt-0.5"} value={rc.erosionCondition} onChange={e => updateRC(i, 'erosionCondition', e.target.value)} placeholder="例如：连续3轮没有任何情绪波动" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500">现实锚点压制（哪类场景本轮禁止上涨）</label>
                            <textarea className={inputClass + " h-12 resize-none mt-0.5"} value={rc.anchorSuppression} onChange={e => updateRC(i, 'anchorSuppression', e.target.value)} placeholder="例如：公共场所、战斗场景、重大危机" />
                          </div>
                          <div className="space-y-1 pt-1 border-t border-gray-600/50">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                              <span className="text-[10px] text-green-400">身体先于数值原则</span>
                              <span className="text-[10px] text-gray-500">— 好感度变化必须先体现在生理反应上</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                              <span className="text-[10px] text-green-400">虚假上涨机制</span>
                              <span className="text-[10px] text-gray-500">— 数值涨时外在表现可能更恶劣</span>
                            </div>
                          </div>
                        </div>
                      </div>
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
              <div key={i} style={{ ...sectionStyle, overflow:'hidden' }}>
                <div onClick={() => setExpandedNPC(expandedNPC === i ? -1 : i)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', paddingBottom: expandedNPC === i ? '12px' : '0', borderBottom: expandedNPC === i ? '0.5px solid var(--border2)' : 'none' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--teal)' }} />
                    <span style={{ fontSize:'13px', fontWeight:500, color:'var(--text)' }}>{npc.name || 'NPC ' + (i + 1)}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <button type="button" onClick={e => { e.stopPropagation(); removeNpc(i) }} style={{ fontSize:'11px', color:'var(--coral)', background:'none', border:'none', cursor:'pointer' }}>删除</button>
                    <span style={{ fontSize:'10px', color:'var(--text3)', transform: expandedNPC === i ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform 0.2s', display:'inline-block' }}>▼</span>
                  </div>
                </div>
                {expandedNPC === i && (
                  <div style={{ paddingTop:'12px', display:'flex', gap:'10px', alignItems:'flex-start' }}>
                    <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleNpcAvatar(i, f) }} id={`npc-avatar-${i}`} />
                    <label htmlFor={`npc-avatar-${i}`} style={{ width:'40px', height:'40px', borderRadius:'50%', border:'2px dashed var(--border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', cursor:'pointer', flexShrink:0, background:'var(--bg)' }}>
                      {npc.avatar ? <img src={npc.avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <span style={{ fontSize:'14px', color:'var(--text3)' }}>+</span>}
                    </label>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'8px' }}>
                      <input type="text" style={inputStyle} value={npc.name} onChange={e => updateNpc(i, 'name', e.target.value)} placeholder="NPC姓名" />
                      <input type="text" style={inputStyle} value={npc.relationship} onChange={e => updateNpc(i, 'relationship', e.target.value)} placeholder="与故事的关系" />
                      <textarea style={{ ...inputStyle, height:'56px', resize:'none' }} value={npc.personality} onChange={e => updateNpc(i, 'personality', e.target.value)} placeholder="性格简介" />
                    </div>
                  </div>
                )}
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

      {/* AI Generate self-drive behaviors */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-200">AI生成自驱行为</h3>
            <p className="text-xs text-gray-500 mt-0.5">根据各角色设定，为每个好感度阶段自动生成3-5条自驱行为</p>
          </div>
          <button
            type="button"
            onClick={handleGenerateBehaviors}
            disabled={generatingBehaviors}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {generatingBehaviors ? '生成中...' : '生成自驱行为'}
          </button>
        </div>
      </div>

      {/* Submit */}
      <div style={{ padding:'16px 0', display:'flex', gap:'10px' }}>
        <button type="button" onClick={onCancel} style={{ flex:1, padding:'12px', borderRadius:'12px', border:'none', background:'var(--bg2)', color:'var(--text)', fontSize:'15px', cursor:'pointer' }}>取消</button>
        <button type="submit" style={{ flex:2, padding:'12px', borderRadius:'12px', border:'none', background:'var(--purple)', color:'#fff', fontSize:'15px', fontWeight:500, cursor:'pointer' }}>{isEdit ? '保存修改' : '创建故事'}</button>
      </div>
    </form>
    </div>
  )
}
