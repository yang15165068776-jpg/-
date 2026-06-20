import { useState, useEffect } from 'react'
import { getFolder, updateFolder } from '../state/folderStore'
import { generateId } from '../utils/storage'

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

const sectionCard = {
  padding: '14px',
  borderRadius: '12px',
  border: '0.5px solid var(--border)',
  background: 'var(--bg)',
  marginBottom: '10px',
}
const sectionHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  cursor: 'pointer', userSelect: 'none', padding: '2px 0',
}
const sectionTitle = {
  fontSize: '13px', fontWeight: 600, color: 'var(--text)',
}
const labelStyle = {
  fontSize: '11px', fontWeight: 500, color: 'var(--text2)', marginBottom: '4px', display: 'block',
}
const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: '8px',
  border: '0.5px solid var(--border)', background: 'var(--bg)',
  fontSize: '13px', color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box',
}
const textareaStyle = {
  ...inputStyle, resize: 'vertical', minHeight: '60px',
}
const btnPrimary = {
  padding: '8px 16px', borderRadius: '8px', border: 'none',
  background: 'var(--text)', color: 'var(--bg)', fontSize: '12px',
  fontWeight: 500, cursor: 'pointer',
}
const btnSecondary = {
  padding: '8px 16px', borderRadius: '8px', border: '0.5px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text2)', fontSize: '12px', cursor: 'pointer',
}
const btnDanger = {
  padding: '6px 12px', borderRadius: '6px', border: 'none',
  background: 'var(--coral-l)', color: 'var(--coral)', fontSize: '11px', cursor: 'pointer',
}
const toggleBase = {
  width: '40px', height: '22px', borderRadius: '11px', border: 'none',
  cursor: 'pointer', position: 'relative', transition: 'background 0.15s',
}
const chipStyle = {
  padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 500,
  border: '0.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)',
}

function Toggle({ value, onChange }) {
  return (
    <button
      style={{ ...toggleBase, background: value ? 'var(--text)' : 'var(--border)' }}
      onClick={() => onChange(!value)}
    >
      <span style={{
        position: 'absolute', top: '2px', left: value ? '20px' : '2px',
        width: '18px', height: '18px', borderRadius: '9px', background: '#fff',
        transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }} />
    </button>
  )
}

function CollapseSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={sectionCard}>
      <div style={sectionHeader} onClick={() => setOpen(v => !v)}>
        <span style={sectionTitle}>{title}</span>
        <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={{ marginTop: '10px' }}>{children}</div>}
    </div>
  )
}

// ── Affection Stage Editor ──
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

  return (
    <div>
      {stages.map((s, i) => (
        <div key={i} style={{ padding: '10px', borderRadius: '8px', border: '0.5px solid var(--border)', marginBottom: '8px', background: 'var(--bg2)' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="阶段名" value={s.name || ''} onChange={e => update(i, 'name', e.target.value)} />
            <input style={{ ...inputStyle, width: '50px' }} placeholder="min" type="number" value={s.min ?? ''} onChange={e => update(i, 'min', safeInt(e.target.value, 0))} />
            <span style={{ color: 'var(--text3)', fontSize: '12px' }}>~</span>
            <input style={{ ...inputStyle, width: '50px' }} placeholder="max" type="number" value={s.max ?? ''} onChange={e => update(i, 'max', safeInt(e.target.value, 100))} />
            {stages.length > 1 && <button style={btnDanger} onClick={() => remove(i)}>✕</button>}
          </div>
          <textarea style={{ ...textareaStyle, minHeight: '40px', marginBottom: '4px' }} placeholder="行为描述" value={s.behavior || ''} onChange={e => update(i, 'behavior', e.target.value)} />
          <textarea style={{ ...textareaStyle, minHeight: '40px', marginBottom: '4px' }} placeholder="核心状态 (coreState)" value={s.coreState || ''} onChange={e => update(i, 'coreState', e.target.value)} />
          <textarea style={{ ...textareaStyle, minHeight: '40px', marginBottom: '4px' }} placeholder="对玩家策略 (playerStrategy)" value={s.playerStrategy || ''} onChange={e => update(i, 'playerStrategy', e.target.value)} />
          <textarea style={{ ...textareaStyle, minHeight: '40px', marginBottom: '4px' }} placeholder="语言样本 (languageSamples)" value={s.languageSamples || ''} onChange={e => update(i, 'languageSamples', e.target.value)} />
          <textarea style={{ ...textareaStyle, minHeight: '40px', marginBottom: '4px' }} placeholder="禁止行为 (forbiddenBehaviors)" value={s.forbiddenBehaviors || ''} onChange={e => update(i, 'forbiddenBehaviors', e.target.value)} />
          <textarea style={{ ...textareaStyle, minHeight: '40px', marginBottom: '4px' }} placeholder="表现细节 (stageDetails)" value={s.stageDetails || ''} onChange={e => update(i, 'stageDetails', e.target.value)} />
          <textarea style={{ ...textareaStyle, minHeight: '40px', marginBottom: '4px' }} placeholder="情绪特征 (emotionalTraits)" value={s.emotionalTraits || ''} onChange={e => update(i, 'emotionalTraits', e.target.value)} />
          <textarea style={{ ...textareaStyle, minHeight: '40px' }} placeholder="爆发场景 (stageExplosion)" value={s.stageExplosion || ''} onChange={e => update(i, 'stageExplosion', e.target.value)} />
        </div>
      ))}
      <button style={{ ...btnSecondary, width: '100%', marginTop: '4px' }} onClick={add}>+ 添加阶段</button>
    </div>
  )
}

// ── NPC Editor ──
function NPCEditor({ npcs, onChange }) {
  const add = () => onChange([...npcs, { id: generateId(), name: '', relationship: '', personality: '', avatar: '' }])
  const update = (i, field, val) => {
    const next = [...npcs]
    next[i] = { ...next[i], [field]: val }
    onChange(next)
  }
  const remove = (i) => onChange(npcs.filter((_, idx) => idx !== i))

  return (
    <div>
      {npcs.map((n, i) => (
        <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="名字" value={n.name || ''} onChange={e => update(i, 'name', e.target.value)} />
          <input style={{ ...inputStyle, flex: 1 }} placeholder="关系" value={n.relationship || ''} onChange={e => update(i, 'relationship', e.target.value)} />
          <input style={{ ...inputStyle, flex: 1.5 }} placeholder="性格" value={n.personality || ''} onChange={e => update(i, 'personality', e.target.value)} />
          <button style={btnDanger} onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      <button style={{ ...btnSecondary, width: '100%', marginTop: '4px' }} onClick={add}>+ 添加 NPC</button>
    </div>
  )
}

export default function CharacterEditor({ folderId, charIndex, onBack }) {
  const [char, setChar] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const folder = getFolder(folderId)
    if (!folder) return
    const data = (folder.characterData || [])[charIndex]
    if (data) {
      // Deep clone for editing
      setChar(JSON.parse(JSON.stringify(data)))
    }
  }, [folderId, charIndex])

  const update = (field, value) => {
    setChar(prev => prev ? { ...prev, [field]: value } : prev)
    setSaved(false)
  }

  const handleSave = () => {
    if (!char) return
    const folder = getFolder(folderId)
    if (!folder) return
    const chars = [...(folder.characterData || [])]
    chars[charIndex] = { ...char, updatedAt: Date.now() }
    updateFolder(folderId, { characterData: chars })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  if (!char) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', height: '48px', borderBottom: '0.5px solid var(--border)' }}>
          <button onClick={onBack} style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: 'var(--bg2)', cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>角色不存在</div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', height: '48px', borderBottom: '0.5px solid var(--border)', flexShrink: 0, gap: '8px' }}>
        <button onClick={onBack} style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: 'var(--bg2)', cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span style={{ flex: 1, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>编辑角色</span>
        <button style={{ ...btnPrimary, opacity: saved ? 0.6 : 1 }} onClick={handleSave}>{saved ? '✓ 已保存' : '保存'}</button>
      </div>

      {/* Scrollable form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px' }}>
        {/* ── 基础设定 ── */}
        <CollapseSection title="📝 基础设定" defaultOpen={true}>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>名字</label>
            <input style={inputStyle} value={char.name || ''} onChange={e => update('name', e.target.value)} placeholder="角色名字" />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>头像链接（URL）</label>
            <input style={inputStyle} value={char.avatar || ''} onChange={e => update('avatar', e.target.value)} placeholder="https://..." />
          </div>
          <div style={{ marginBottom: '10px', padding: '8px 10px', borderRadius: '8px', background: 'var(--purple-l)', fontSize: '11px', color: 'var(--purple)', lineHeight: 1.5 }}>
            ℹ️ 玩家的名字、性别、设定等信息现在在<b>玩家身份</b>中统一管理。角色会自动识别当前活跃的玩家身份。
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>故事基调</label>
            <select style={inputStyle} value={char.storyTone || '甜虐'} onChange={e => update('storyTone', e.target.value)}>
              <option value="甜虐">甜虐</option>
              <option value="纯爱">纯爱</option>
              <option value="悬疑">悬疑</option>
              <option value="黑深残">黑深残</option>
            </select>
          </div>
        </CollapseSection>

        {/* ── 世界观 & 开场 ── */}
        <CollapseSection title="🌍 世界观 & 开场剧情">
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>世界观</label>
            <textarea style={{ ...textareaStyle, minHeight: '80px' }} value={char.worldSetting || ''} onChange={e => update('worldSetting', e.target.value)} placeholder="世界背景、时代、社会结构…" />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>开场剧情</label>
            <textarea style={{ ...textareaStyle, minHeight: '80px' }} value={char.openingScenario || ''} onChange={e => update('openingScenario', e.target.value)} placeholder="故事第一幕场景…" />
          </div>
        </CollapseSection>

        {/* ── 人设 ── */}
        <CollapseSection title="🎭 人设（性格/说话/规则）">
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>背景故事</label>
            <textarea style={{ ...textareaStyle, minHeight: '60px' }} value={char.background || ''} onChange={e => update('background', e.target.value)} placeholder="角色的身份、过往经历…" />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>核心性格</label>
            <textarea style={{ ...textareaStyle, minHeight: '60px' }} value={char.personality || ''} onChange={e => update('personality', e.target.value)} placeholder="性格特征、价值观、行为模式…" />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>说话风格</label>
            <input style={inputStyle} value={char.speakingStyle || ''} onChange={e => update('speakingStyle', e.target.value)} placeholder="一两句话描述（如：清冷淡漠，话少但每句都带刺）" />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>风格规则（一行一条）</label>
            <textarea style={textareaStyle} value={Array.isArray(char.styleRules) ? char.styleRules.join('\n') : (char.styleRules || '')} onChange={e => update('styleRules', e.target.value.split('\n').filter(Boolean))} placeholder="行为准则和风格约束…" />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>禁止词汇（一行一个）</label>
            <textarea style={textareaStyle} value={Array.isArray(char.forbiddenWords) ? char.forbiddenWords.join('\n') : (char.forbiddenWords || '')} onChange={e => update('forbiddenWords', e.target.value.split('\n').filter(Boolean))} placeholder="角色绝对不能说的话…" />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>对玩家的称呼</label>
            <input style={inputStyle} value={char.nickname || ''} onChange={e => update('nickname', e.target.value)} placeholder="如：你、笨蛋、主人…" />
          </div>
        </CollapseSection>

        {/* ── 好感度阶段 ── */}
        <CollapseSection title="♥ 好感度系统">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>启用好感度</label>
            <Toggle value={char.affectionEnabled !== false} onChange={v => update('affectionEnabled', v)} />
          </div>
          {char.affectionEnabled !== false && (
            <>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>初始好感度</label>
                <input style={{ ...inputStyle, width: '80px' }} type="number" min={0} max={100} value={char.affectionInitial ?? 50} onChange={e => update('affectionInitial', safeInt(e.target.value, 50))} />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>好感度阶段</label>
                <StageEditor
                  stages={char.affectionStages || []}
                  onChange={v => update('affectionStages', v)}
                />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>好感度增加条件（一行一条）</label>
                <textarea style={textareaStyle} value={char.transitionTriggers || char.affectionUpRules || ''} onChange={e => update('transitionTriggers', e.target.value)} placeholder="触发好感度上涨的条件…" />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>好感度减少条件（一行一条）</label>
                <textarea style={textareaStyle} value={char.irreversibleMoment || char.affectionDownRules || ''} onChange={e => update('irreversibleMoment', e.target.value)} placeholder="触发好感度下降的条件…" />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>反向侵蚀条件</label>
                <textarea style={textareaStyle} value={char.erosionCondition || ''} onChange={e => update('erosionCondition', e.target.value)} placeholder="什么情况下反而扣减好感度…" />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>现实锚点压制场景</label>
                <textarea style={textareaStyle} value={char.anchorSuppression || ''} onChange={e => update('anchorSuppression', e.target.value)} placeholder="哪些场景禁止好感度上涨…" />
              </div>
            </>
          )}
        </CollapseSection>

        {/* ── 日常设置 ── */}
        <CollapseSection title="💬 日常模式设置">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>主动消息</label>
            <Toggle value={!!char.activeMessageEnabled} onChange={v => update('activeMessageEnabled', v)} />
          </div>
          {char.activeMessageEnabled && (
            <div style={{ marginBottom: '10px' }}>
              <label style={labelStyle}>主动消息提示词</label>
              <textarea style={{ ...textareaStyle, minHeight: '60px' }} value={char.activePrompt || ''} onChange={e => update('activePrompt', e.target.value)} placeholder="AI 决定发送主动消息时的系统指令…" />
            </div>
          )}

          <div style={{ marginBottom: '10px' }}>
            <label style={labelStyle}>上下文窗口（条数）</label>
            <input style={{ ...inputStyle, width: '80px' }} type="number" min={10} max={100} value={char.contextWindow || 40} onChange={e => update('contextWindow', safeInt(e.target.value, 40))} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>显示时间戳</label>
            <Toggle value={!!char.showTimestamp} onChange={v => update('showTimestamp', v)} />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Temperature</label>
              <input style={inputStyle} type="number" min={0} max={2} step={0.05} value={char.temperature ?? 0.9} onChange={e => update('temperature', safeFloat(e.target.value, 0.9))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Top P</label>
              <input style={inputStyle} type="number" min={0} max={1} step={0.05} value={char.topP ?? 0.95} onChange={e => update('topP', safeFloat(e.target.value, 0.95))} />
            </div>
          </div>
        </CollapseSection>

        {/* ── NPC ── */}
        <CollapseSection title="👥 NPC">
          <NPCEditor
            npcs={char.npcs || []}
            onChange={v => update('npcs', v)}
          />
        </CollapseSection>

        {/* Save button at bottom */}
        <button
          style={{ ...btnPrimary, width: '100%', padding: '14px', fontSize: '14px', marginTop: '8px', marginBottom: '20px' }}
          onClick={handleSave}
        >
          {saved ? '✓ 已保存' : '保存角色设定'}
        </button>
      </div>
    </div>
  )
}
