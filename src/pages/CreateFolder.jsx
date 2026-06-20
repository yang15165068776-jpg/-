import { useState } from 'react'

function safeInt(val, fallback = 50) {
  if (val === '' || val === '-') return 0
  const n = parseInt(val, 10)
  return isNaN(n) ? fallback : n
}
function safeFloat(val, fallback = 0.9) {
  if (val === '' || val === '-') return 0
  const n = parseFloat(val)
  return isNaN(n) ? fallback : n
}
import { createFolder, addInlineCharacter, generateId } from '../state/folderStore'
import { createFolderUSK, saveFolderUSK } from '../state/unifiedStateKernel'
import { getApiKey } from '../utils/storage'
import { extractStoryFromText } from '../utils/deepseek'

// ═══════════════════════ Shared mini-components ═══════════════════════

function Toggle({ value, onChange }) {
  return (
    <button
      style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', position: 'relative', background: value ? 'var(--text)' : 'var(--border)', transition: 'background 0.15s', flexShrink: 0 }}
      onClick={() => onChange(!value)}
    >
      <span style={{ position: 'absolute', top: '2px', left: value ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '9px', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
    </button>
  )
}

function StageEditor({ stages, onChange }) {
  const add = () => {
    const last = stages[stages.length - 1] || { max: 100 }
    const newMin = (last.max || 100) + 1
    onChange([...stages, { name: '', min: Math.min(newMin, 100), max: 100, behavior: '', coreState: '', playerStrategy: '', riseCondition: '', languageSamples: '', forbiddenBehaviors: '', stageDetails: '', emotionalTraits: '', stageExplosion: '' }])
  }
  const update = (i, field, val) => {
    const next = [...stages]
    next[i] = { ...next[i], [field]: val }
    onChange(next)
  }
  const remove = (i) => onChange(stages.filter((_, idx) => idx !== i))
  const inp = { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '0.5px solid var(--border)', background: 'var(--bg)', fontSize: '12px', color: 'var(--text)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
  const ta = { ...inp, resize: 'vertical', minHeight: '36px' }

  return (
    <div>
      {stages.map((s, i) => (
        <div key={i} style={{ padding: '8px', borderRadius: '8px', border: '0.5px solid var(--border)', marginBottom: '6px', background: 'var(--bg2)' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
            <input style={{ ...inp, flex: 1 }} placeholder="阶段名" value={s.name || ''} onChange={e => update(i, 'name', e.target.value)} />
            <input style={{ ...inp, width: '46px' }} placeholder="min" type="number" value={s.min ?? ''} onChange={e => update(i, 'min', safeInt(e.target.value, 0))} />
            <span style={{ color: 'var(--text3)', fontSize: '11px' }}>~</span>
            <input style={{ ...inp, width: '46px' }} placeholder="max" type="number" value={s.max ?? ''} onChange={e => update(i, 'max', safeInt(e.target.value, 100))} />
            {stages.length > 1 && <button style={{ padding: '4px 8px', borderRadius: '4px', border: 'none', background: 'var(--coral-l)', color: 'var(--coral)', fontSize: '11px', cursor: 'pointer' }} onClick={() => remove(i)}>✕</button>}
          </div>
          <textarea style={ta} placeholder="行为描述" value={s.behavior || ''} onChange={e => update(i, 'behavior', e.target.value)} />
          <textarea style={ta} placeholder="核心状态" value={s.coreState || ''} onChange={e => update(i, 'coreState', e.target.value)} />
          <textarea style={ta} placeholder="对玩家策略" value={s.playerStrategy || ''} onChange={e => update(i, 'playerStrategy', e.target.value)} />
          <textarea style={ta} placeholder="语言样本" value={s.languageSamples || ''} onChange={e => update(i, 'languageSamples', e.target.value)} />
          <textarea style={ta} placeholder="禁止行为" value={s.forbiddenBehaviors || ''} onChange={e => update(i, 'forbiddenBehaviors', e.target.value)} />
        </div>
      ))}
      <button onClick={add} style={{ padding: '6px', borderRadius: '6px', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text2)', fontSize: '11px', cursor: 'pointer', width: '100%', marginTop: '2px' }}>+ 添加阶段</button>
    </div>
  )
}

// ═══════════════════════ Styles ═══════════════════════

const S = {
  page: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' },
  header: { display: 'flex', alignItems: 'center', padding: '0 12px', height: '48px', borderBottom: '0.5px solid var(--border2)', flexShrink: 0, gap: '8px' },
  title: { flex: 1, fontSize: '15px', fontWeight: 600, color: 'var(--text)' },
  body: { flex: 1, overflowY: 'auto', padding: '12px 14px' },
  card: { padding: '14px', borderRadius: '14px', border: '0.5px solid var(--border)', background: 'var(--bg2)', marginBottom: '10px' },
  aiBox: { background: 'var(--bg2)', borderRadius: '14px', padding: '12px', marginBottom: '14px' },
  label: { fontSize: '11px', fontWeight: 500, color: 'var(--text2)', marginBottom: '3px', display: 'block' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '12px', border: '0.5px solid var(--border)', background: 'var(--bg)', fontSize: '13px', color: 'var(--text)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px 12px', borderRadius: '12px', border: '0.5px solid var(--border)', background: 'var(--bg)', fontSize: '12px', color: 'var(--text)', outline: 'none', resize: 'vertical', minHeight: '56px', fontFamily: 'inherit', boxSizing: 'border-box' },
  btn: { padding: '10px 16px', borderRadius: '12px', border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' },
  btn2: { padding: '10px 16px', borderRadius: '12px', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text2)', fontSize: '12px', cursor: 'pointer' },
  sectionTitle: { fontSize: '12px', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '4px' },
  row: { display: 'flex', gap: '8px', marginBottom: '8px' },
  col: { flex: 1 },
}

function emptyChar() {
  return {
    id: generateId(),
    name: '', avatar: '', personality: '', background: '', speakingStyle: '',
    styleRules: [], forbiddenWords: [],
    protagonistName: '', protagonistGender: '', protagonistBackground: '', protagonistPersonality: '',
    worldSetting: '', openingScenario: '', storyTone: '甜虐',
    affectionEnabled: true, affectionInitial: 50,
    affectionStages: [{ name: '', min: 0, max: 100, behavior: '', coreState: '', playerStrategy: '', riseCondition: '', languageSamples: '', forbiddenBehaviors: '', stageDetails: '', emotionalTraits: '', stageExplosion: '' }],
    transitionTriggers: '', irreversibleMoment: '', erosionCondition: '', anchorSuppression: '',
    thinkingEnabled: false, thinkingPrompt: '',
    activeMessageEnabled: false, activePrompt: '',
    nickname: '', contextWindow: 40, showTimestamp: false, temperature: 0.9, topP: 0.95,
  }
}

// ═══════════════════════ Main Component ═══════════════════════

export default function CreateFolder({ onBack, onCreated }) {
  const [folderName, setFolderName] = useState('')
  const [worldview, setWorldview] = useState('')
  const [storyIntro, setStoryIntro] = useState('')
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [characters, setCharacters] = useState([]) // [{ ...emptyChar, expanded: bool }]
  const apiKey = getApiKey()

  // ── Helpers ──
  const addChar = () => setCharacters(prev => [...prev, { ...emptyChar(), expanded: true }])
  const removeChar = (i) => setCharacters(prev => prev.filter((_, idx) => idx !== i))
  const updateChar = (i, field, val) => {
    setCharacters(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: val }
      return next
    })
  }
  const toggleExpand = (i) => {
    setCharacters(prev => {
      const next = [...prev]
      next[i] = { ...next[i], expanded: !next[i].expanded }
      return next
    })
  }

  // ── AI Generate ──
  const handleAIGenerate = async () => {
    if (!aiInput.trim() || !apiKey) {
      setAiError(apiKey ? '' : '请先在设置中配置 API Key')
      return
    }
    setAiLoading(true)
    setAiError('')
    try {
      const { result, error } = await extractStoryFromText(aiInput.trim(), apiKey)
      if (error) { setAiError('生成失败：' + (error.message || '未知错误')); return }
      if (!result) { setAiError('AI 返回空结果'); return }

      const chars = (result['可攻略角色'] || result.可攻略角色 || []).map(rc => ({
        ...emptyChar(),
        id: generateId(),
        name: rc['角色名'] || rc.角色名 || '',
        personality: rc['性格'] || rc.性格 || '',
        background: rc['背景'] || rc.背景 || '',
        speakingStyle: rc['说话风格'] || rc.说话风格 || '',
        styleRules: Array.isArray(rc['文风规则'] || rc.文风规则) ? (rc['文风规则'] || rc.文风规则) : [],
        forbiddenWords: Array.isArray(rc['禁止行为'] || rc.禁止行为) ? (rc['禁止行为'] || rc.禁止行为) : [],
        affectionEnabled: true,
        affectionInitial: rc['好感度初始'] || rc.好感度初始 || 50,
        affectionStages: (rc['好感度阶段'] || rc.好感度阶段 || []).map(s => ({
          name: s.label || s.name || '', min: s.min || 0, max: s.max || 100,
          behavior: s.behavior || (Array.isArray(s.behaviors) ? s.behaviors.map(b => (typeof b === 'string' ? b : b.behavior || b.description || '')).join('；') : ''),
          coreState: s.coreState || s.coreStateDesc || '',
          playerStrategy: s.playerStrategy || s.userStrategy || '',
          riseCondition: s.riseCondition || '', languageSamples: s.languageSamples || '',
          forbiddenBehaviors: s.forbiddenBehaviors || '', stageDetails: s.stageDetails || '',
          emotionalTraits: s.emotionalTraits || '', stageExplosion: s.stageExplosion || '',
        })),
        transitionTriggers: rc['transitionTriggers'] || rc.transitionTriggers || '',
        irreversibleMoment: rc['irreversibleMoment'] || rc.irreversibleMoment || '',
        erosionCondition: rc['erosionCondition'] || rc.erosionCondition || '',
        anchorSuppression: rc['anchorSuppression'] || rc.anchorSuppression || '',
        expanded: false,
      }))

      setFolderName(result['故事名称'] || result.故事名称 || '')
      setWorldview(result['世界观'] || result.世界观 || '')
      setStoryIntro(result['开场剧情'] || result.开场剧情 || '')
      setCharacters(chars)
    } catch (err) {
      setAiError('生成失败：' + err.message)
    } finally {
      setAiLoading(false)
    }
  }

  // ── Create Folder ──
  const handleCreate = () => {
    const name = folderName.trim() || '未命名世界'
    const folder = createFolder(name, worldview.trim(), storyIntro.trim())
    for (const char of characters) {
      const { expanded, ...charData } = char
      addInlineCharacter(folder.id, charData)
    }
    const charsForUSK = characters.map(c => ({ id: c.name || c.id, name: c.name, affectionInitial: c.affectionInitial }))
    const usk = createFolderUSK(folder.id, charsForUSK, { sourceMode: 'drama' })
    saveFolderUSK(folder.id, usk)
    if (onCreated) onCreated(folder)
  }

  const hasContent = folderName.trim() || characters.length > 0

  // ── Character editor (inline) ──
  const renderCharEditor = (char, i) => (
    <div key={char.id} style={S.card}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => toggleExpand(i)}>
        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--purple)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 500, flexShrink: 0 }}>
          {(char.name || '?')[0]}
        </div>
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{char.name || '角色 ' + (i + 1)}</span>
        <span style={{ fontSize: '10px', color: 'var(--text3)', background: 'var(--bg2)', padding: '2px 6px', borderRadius: '4px' }}>好感 {char.affectionInitial}</span>
        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{char.expanded ? '▲' : '▼'}</span>
        {characters.length > 1 && (
          <button onClick={e => { e.stopPropagation(); removeChar(i) }} style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', background: 'var(--coral-l)', color: 'var(--coral)', fontSize: '10px', cursor: 'pointer' }}>删除</button>
        )}
      </div>

      {char.expanded && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Basic */}
          <div style={S.row}>
            <div style={S.col}><label style={S.label}>名字</label><input style={S.input} value={char.name || ''} onChange={e => updateChar(i, 'name', e.target.value)} placeholder="角色名" /></div>
            <div style={S.col}><label style={S.label}>头像URL</label><input style={S.input} value={char.avatar || ''} onChange={e => updateChar(i, 'avatar', e.target.value)} placeholder="https://…" /></div>
          </div>
          <div style={S.row}>
            <div style={S.col}><label style={S.label}>性格</label><textarea style={{ ...S.textarea, minHeight: '48px' }} value={char.personality || ''} onChange={e => updateChar(i, 'personality', e.target.value)} placeholder="核心性格特征…" /></div>
          </div>
          <div style={S.row}>
            <div style={S.col}><label style={S.label}>背景</label><textarea style={{ ...S.textarea, minHeight: '48px' }} value={char.background || ''} onChange={e => updateChar(i, 'background', e.target.value)} placeholder="身份、过往经历…" /></div>
          </div>
          <div style={S.row}>
            <div style={S.col}><label style={S.label}>说话风格</label><input style={S.input} value={char.speakingStyle || ''} onChange={e => updateChar(i, 'speakingStyle', e.target.value)} placeholder="如：清冷淡漠，话少带刺" /></div>
            <div style={S.col}><label style={S.label}>对玩家称呼</label><input style={S.input} value={char.nickname || ''} onChange={e => updateChar(i, 'nickname', e.target.value)} placeholder="如：笨蛋、你、主人" /></div>
          </div>

          {/* Style rules + Forbidden words */}
          <div style={S.row}>
            <div style={S.col}><label style={S.label}>风格规则（一行一条）</label><textarea style={S.textarea} value={Array.isArray(char.styleRules) ? char.styleRules.join('\n') : (char.styleRules || '')} onChange={e => updateChar(i, 'styleRules', e.target.value.split('\n').filter(Boolean))} placeholder="行为准则…" /></div>
            <div style={S.col}><label style={S.label}>禁止词汇（一行一个）</label><textarea style={S.textarea} value={Array.isArray(char.forbiddenWords) ? char.forbiddenWords.join('\n') : (char.forbiddenWords || '')} onChange={e => updateChar(i, 'forbiddenWords', e.target.value.split('\n').filter(Boolean))} placeholder="绝对不能说的话…" /></div>
          </div>

          {/* ── Affection ── */}
          <div style={{ borderTop: '0.5px solid var(--border2)', paddingTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={S.sectionTitle}>♥ 好感度</span>
              <Toggle value={char.affectionEnabled !== false} onChange={v => updateChar(i, 'affectionEnabled', v)} />
            </div>
            {char.affectionEnabled !== false && (
              <>
                <div style={S.row}>
                  <div style={S.col}><label style={S.label}>初始好感</label><input style={{ ...S.input, width: '60px' }} type="number" min={0} max={100} value={char.affectionInitial ?? 50} onChange={e => updateChar(i, 'affectionInitial', safeInt(e.target.value, 50))} /></div>
                </div>
                <label style={S.label}>好感度阶段</label>
                <StageEditor stages={char.affectionStages || []} onChange={v => updateChar(i, 'affectionStages', v)} />
                <div style={{ ...S.row, marginTop: '6px' }}>
                  <div style={S.col}><label style={S.label}>上涨条件</label><textarea style={S.textarea} value={char.transitionTriggers || ''} onChange={e => updateChar(i, 'transitionTriggers', e.target.value)} placeholder="一行一条…" /></div>
                  <div style={S.col}><label style={S.label}>下降条件</label><textarea style={S.textarea} value={char.irreversibleMoment || ''} onChange={e => updateChar(i, 'irreversibleMoment', e.target.value)} placeholder="一行一条…" /></div>
                </div>
              </>
            )}
          </div>

          {/* ── Daily settings ── */}
          <div style={{ borderTop: '0.5px solid var(--border2)', paddingTop: '8px' }}>
            <span style={S.sectionTitle}>💬 日常设置</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <label style={{ ...S.label, marginBottom: 0 }}>主动消息</label>
              <Toggle value={!!char.activeMessageEnabled} onChange={v => updateChar(i, 'activeMessageEnabled', v)} />
            </div>
            {char.activeMessageEnabled && (
              <textarea style={{ ...S.textarea, minHeight: '40px', marginTop: '4px' }} value={char.activePrompt || ''} onChange={e => updateChar(i, 'activePrompt', e.target.value)} placeholder="主动消息的 AI 指令…" />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <label style={{ ...S.label, marginBottom: 0 }}>思考层</label>
              <Toggle value={!!char.thinkingEnabled} onChange={v => updateChar(i, 'thinkingEnabled', v)} />
            </div>
            {char.thinkingEnabled && (
              <textarea style={{ ...S.textarea, minHeight: '40px', marginTop: '4px' }} value={char.thinkingPrompt || ''} onChange={e => updateChar(i, 'thinkingPrompt', e.target.value)} placeholder="思考层指令…" />
            )}
            <div style={{ ...S.row, marginTop: '6px' }}>
              <div style={S.col}><label style={S.label}>上下文窗口</label><input style={{ ...S.input, width: '60px' }} type="number" min={10} max={100} value={char.contextWindow || 40} onChange={e => updateChar(i, 'contextWindow', safeInt(e.target.value, 40))} /></div>
              <div style={S.col}><label style={S.label}>Temperature</label><input style={{ ...S.input, width: '60px' }} type="number" min={0} max={2} step={0.05} value={char.temperature ?? 0.9} onChange={e => updateChar(i, 'temperature', safeFloat(e.target.value, 0.9))} /></div>
              <div style={S.col}><label style={S.label}>Top P</label><input style={{ ...S.input, width: '60px' }} type="number" min={0} max={1} step={0.05} value={char.topP ?? 0.95} onChange={e => updateChar(i, 'topP', safeFloat(e.target.value, 0.95))} /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={onBack} style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: 'var(--bg2)', cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span style={S.title}>创建新世界</span>
      </div>

      <div style={S.body}>
        {/* ── AI Generate ── */}
        <div style={S.aiBox}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>🤖 AI 一键生成</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', lineHeight: 1.4 }}>
            输入世界观或故事描述，AI 自动生成角色（名字/性格/背景/好感度阶段/风格规则）
          </div>
          <textarea style={{ ...S.textarea, minHeight: '72px', marginBottom: '6px' }} value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder="例如：现代都市背景下，一个冷面CEO与实习生的契约婚姻故事…" />
          {aiError && <div style={{ padding: '8px', borderRadius: '8px', background: 'var(--coral-l)', color: 'var(--coral)', fontSize: '12px', marginBottom: '6px' }}>{aiError}</div>}
          <button style={{ ...S.btn, width: '100%', padding: '10px', opacity: aiLoading || !aiInput.trim() ? 0.5 : 1 }} onClick={handleAIGenerate} disabled={aiLoading || !aiInput.trim()}>
            {aiLoading ? '⏳ AI 生成中...' : '✨ AI 生成角色与世界'}
          </button>
        </div>

        {/* ── World Settings ── */}
        <div style={S.card}>
          <div style={S.sectionTitle}>🌍 世界设定</div>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div><label style={S.label}>世界名称</label><input style={S.input} value={folderName} onChange={e => setFolderName(e.target.value)} placeholder="给你的世界起个名字" /></div>
            <div><label style={S.label}>世界观</label><textarea style={S.textarea} value={worldview} onChange={e => setWorldview(e.target.value)} placeholder="描述这个世界的背景、时代、规则…" /></div>
            <div><label style={S.label}>开场剧情</label><textarea style={S.textarea} value={storyIntro} onChange={e => setStoryIntro(e.target.value)} placeholder="故事从哪里开始？第一幕是什么场景？" /></div>
          </div>
        </div>

        {/* ── Characters ── */}
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🎭 角色 ({characters.length})</span>
          <button style={{ ...S.btn2, padding: '4px 10px', fontSize: '11px' }} onClick={addChar}>+ 手动添加</button>
        </div>

        {characters.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: '12px', lineHeight: 1.6 }}>
            <div style={{ fontSize: '32px', marginBottom: '6px' }}>🎭</div>
            还没有角色<br />使用 AI 一键生成或点击"+ 手动添加"
          </div>
        )}

        {characters.map((char, i) => renderCharEditor(char, i))}
      </div>

      {/* Bottom — cancel + confirm */}
      <div style={{ padding: '12px 14px', borderTop: '0.5px solid var(--border2)', flexShrink: 0, display: 'flex', gap: '10px' }}>
        <button style={{ flex: 1, padding: '14px', borderRadius: '14px', border: '0.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }} onClick={onBack}>取消</button>
        <button style={{ flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: 'var(--purple)', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer', opacity: hasContent ? 1 : 0.4 }} onClick={handleCreate} disabled={!hasContent}>
          确认{characters.length > 0 ? '（' + characters.length + '位角色）' : ''}
        </button>
      </div>
    </div>
  )
}
