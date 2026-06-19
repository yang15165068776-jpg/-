import { useState, useEffect } from 'react'
import { getPlayerProfile, savePlayerProfile } from '../utils/storage'

const GENDER_OPTIONS = ['男', '女', '其他']
const PRESET_TAGS = ['开朗', '内向', '温柔', '强势', '理性', '感性', '慢热', '直率', '腹黑', '天然']

const styles = {
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    height: '48px',
    borderBottom: '0.5px solid var(--border2)',
    flexShrink: 0,
  },
  backBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--bg2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: 'var(--text2)',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text)',
    marginRight: '32px',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 24px',
  },
  section: {
    marginBottom: '28px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text2)',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  avatarSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  avatarBig: {
    width: '72px',
    height: '72px',
    borderRadius: '36px',
    overflow: 'hidden',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  avatarPlaceholder: {
    fontSize: '32px',
    color: 'var(--text3)',
  },
  avatarHint: {
    fontSize: '12px',
    color: 'var(--text3)',
    cursor: 'pointer',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '0.5px solid var(--border)',
    background: 'var(--bg)',
    fontSize: '15px',
    color: 'var(--text)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  genderRow: {
    display: 'flex',
    gap: '8px',
  },
  genderBtn: {
    flex: 1,
    padding: '10px 0',
    borderRadius: '10px',
    border: '0.5px solid var(--border)',
    fontSize: '14px',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s',
  },
  genderBtnActive: {
    background: 'var(--text)',
    color: 'var(--bg)',
    borderColor: 'var(--text)',
  },
  genderBtnInactive: {
    background: 'var(--bg)',
    color: 'var(--text2)',
  },
  tagsWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tag: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: '0.5px solid var(--border)',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    userSelect: 'none',
  },
  tagActive: {
    background: 'var(--text)',
    color: 'var(--bg)',
    borderColor: 'var(--text)',
  },
  tagInactive: {
    background: 'var(--bg)',
    color: 'var(--text2)',
  },
  customTagInput: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: '0.5px dashed var(--border)',
    background: 'var(--bg)',
    fontSize: '13px',
    color: 'var(--text)',
    outline: 'none',
    width: '80px',
  },
  bottom: {
    padding: '16px 24px',
    flexShrink: 0,
  },
  saveBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: '14px',
    border: 'none',
    background: 'var(--text)',
    color: 'var(--bg)',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
}

export default function PlayerProfile({ onBack }) {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [gender, setGender] = useState('')
  const [tags, setTags] = useState([])
  const [customTag, setCustomTag] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const profile = getPlayerProfile()
    setName(profile.name || '')
    setAvatar(profile.avatar || '')
    setGender(profile.gender || '')
    setTags(profile.personalityTags || [])
  }, [])

  const handleSave = () => {
    savePlayerProfile({ name, avatar, gender, personalityTags: tags })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const toggleTag = (tag) => {
    setTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  const addCustomTag = () => {
    const t = customTag.trim()
    if (t && !tags.includes(t)) {
      setTags(prev => [...prev, t])
      setCustomTag('')
    }
  }

  const handleCustomKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addCustomTag()
    }
  }

  const handleAvatarClick = () => {
    const url = prompt('请输入头像图片链接（URL）：', avatar)
    if (url !== null) setAvatar(url.trim())
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <span style={styles.title}>玩家设定</span>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* Avatar */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>头像</div>
          <div style={styles.avatarSection}>
            <div style={styles.avatarBig} onClick={handleAvatarClick}>
              {avatar ? (
                <img src={avatar} alt="" style={styles.avatarImg} />
              ) : (
                <span style={styles.avatarPlaceholder}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 4-7 8-7s8 3 8 7"/>
                  </svg>
                </span>
              )}
            </div>
            <span style={styles.avatarHint} onClick={handleAvatarClick}>
              点击更换头像（输入图片链接）
            </span>
          </div>
        </div>

        {/* Name */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>名字</div>
          <input
            style={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="你的名字"
          />
        </div>

        {/* Gender */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>性别</div>
          <div style={styles.genderRow}>
            {GENDER_OPTIONS.map(g => (
              <div
                key={g}
                style={{
                  ...styles.genderBtn,
                  ...(gender === g ? styles.genderBtnActive : styles.genderBtnInactive),
                }}
                onClick={() => setGender(g)}
              >
                {g}
              </div>
            ))}
          </div>
        </div>

        {/* Personality Tags */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>性格标签（可选，多选）</div>
          <div style={styles.tagsWrap}>
            {PRESET_TAGS.map(t => (
              <div
                key={t}
                style={{
                  ...styles.tag,
                  ...(tags.includes(t) ? styles.tagActive : styles.tagInactive),
                }}
                onClick={() => toggleTag(t)}
              >
                {t}
              </div>
            ))}
            <input
              style={styles.customTagInput}
              value={customTag}
              onChange={e => setCustomTag(e.target.value)}
              onKeyDown={handleCustomKey}
              onBlur={addCustomTag}
              placeholder="+ 自定义"
            />
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div style={styles.bottom}>
        <button style={styles.saveBtn} onClick={handleSave}>
          {saved ? '✓ 已保存' : '保存设定'}
        </button>
      </div>
    </div>
  )
}
