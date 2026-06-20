import { useState, useEffect } from 'react'
import { getPlayerProfile, savePlayerProfile } from '../utils/storage'

const GENDER_OPTIONS = ['男', '女', '其他']
const PRESET_TAGS = ['开朗', '内向', '温柔', '强势', '理性', '感性', '慢热', '直率', '腹黑', '天然']

export default function PlayerProfile({ onBack }) {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [gender, setGender] = useState('')
  const [tags, setTags] = useState([])
  const [customTag, setCustomTag] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const p = getPlayerProfile()
    setName(p.name || '')
    setAvatar(p.avatar || '')
    setGender(p.gender || '')
    setTags(p.personalityTags || [])
  }, [])

  const handleSave = () => {
    savePlayerProfile({ name, avatar, gender, personalityTags: tags })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const addCustomTag = () => { const t = customTag.trim(); if (t && !tags.includes(t)) { setTags(prev => [...prev, t]); setCustomTag('') } }
  const handleCustomKey = (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCustomTag() } }
  const handleAvatarClick = () => { const url = prompt('请输入头像图片链接（URL）：', avatar); if (url !== null) setAvatar(url.trim()) }

  const input = { width: '100%', padding: '10px 14px', borderRadius: '12px', border: '0.5px solid var(--border)', background: 'var(--bg2)', fontSize: '14px', color: 'var(--text)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
  const textarea = { ...input, resize: 'vertical', minHeight: '80px' }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: '48px', borderBottom: '0.5px solid var(--border2)', flexShrink: 0 }}>
        <button onClick={onBack} style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: 'var(--bg2)', cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginRight: '32px' }}>玩家设定</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px' }}>
        {/* Avatar — center + gender selector */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px', position: 'relative' }}>
          <div onClick={handleAvatarClick} style={{ width: '80px', height: '80px', borderRadius: '40px', overflow: 'hidden', cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatar ? (
              <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
            )}
          </div>
          {/* Gender selector — right side of avatar */}
          <div style={{ position: 'absolute', top: 0, right: 'calc(50% - 60px)', display: 'flex', gap: '4px' }}>
            {GENDER_OPTIONS.map(g => (
              <button key={g} onClick={() => setGender(g)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: gender === g ? '1.5px solid var(--purple)' : '0.5px solid var(--border)', background: gender === g ? 'var(--purple-l)' : 'var(--bg)', color: gender === g ? 'var(--purple)' : 'var(--text3)', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{g}</button>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px', cursor: 'pointer' }} onClick={handleAvatarClick}>点击更换头像</div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', marginBottom: '8px' }}>名字</div>
          <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="你的名字" />
        </div>

        {/* Player setting textarea */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', marginBottom: '8px' }}>设定</div>
          <textarea style={textarea} placeholder="设定，可以设置很多也能切换" />
        </div>

        {/* Personality tags */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', marginBottom: '8px' }}>性格标签</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {PRESET_TAGS.map(t => (
              <button key={t} onClick={() => toggleTag(t)} style={{ padding: '6px 14px', borderRadius: '16px', border: '0.5px solid var(--border)', fontSize: '12px', cursor: 'pointer', background: tags.includes(t) ? 'var(--text)' : 'var(--bg)', color: tags.includes(t) ? 'var(--bg)' : 'var(--text2)' }}>{t}</button>
            ))}
            <input style={{ padding: '6px 14px', borderRadius: '16px', border: '0.5px dashed var(--border)', background: 'var(--bg)', fontSize: '12px', color: 'var(--text)', outline: 'none', width: '80px' }} value={customTag} onChange={e => setCustomTag(e.target.value)} onKeyDown={handleCustomKey} onBlur={addCustomTag} placeholder="+ 自定义" />
          </div>
        </div>
      </div>

      {/* Bottom — cancel + confirm */}
      <div style={{ padding: '16px 24px', flexShrink: 0, display: 'flex', gap: '10px' }}>
        <button onClick={onBack} style={{ flex: 1, padding: '14px', borderRadius: '14px', border: '0.5px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}>取消</button>
        <button onClick={handleSave} style={{ flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: 'var(--purple)', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>{saved ? '✓ 已保存' : '确认'}</button>
      </div>
    </div>
  )
}
