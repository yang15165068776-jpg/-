import { useState } from 'react'
import { createFolder, addInlineCharacter, generateId } from '../state/folderStore'
import { createFolderUSK, saveFolderUSK } from '../state/unifiedStateKernel'
import { getApiKey } from '../utils/storage'
import { extractStoryFromText } from '../utils/deepseek'

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
    padding: '20px 24px',
  },
  aiSection: {
    background: 'var(--bg3)',
    borderRadius: '14px',
    padding: '16px',
    marginBottom: '24px',
  },
  aiLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: '8px',
  },
  aiHint: {
    fontSize: '12px',
    color: 'var(--text3)',
    marginBottom: '12px',
    lineHeight: 1.5,
  },
  aiTextarea: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: '0.5px solid var(--border)',
    background: 'var(--bg)',
    fontSize: '13px',
    color: 'var(--text)',
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  aiBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: 'var(--purple)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '10px',
  },
  aiBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
    color: 'var(--text3)',
    fontSize: '12px',
  },
  dividerLine: {
    flex: 1,
    height: '0.5px',
    background: 'var(--border2)',
  },
  field: {
    marginBottom: '20px',
  },
  fieldLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text2)',
    marginBottom: '8px',
    display: 'block',
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
  textarea: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: '0.5px solid var(--border)',
    background: 'var(--bg)',
    fontSize: '13px',
    color: 'var(--text)',
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  previewCard: {
    background: 'var(--bg)',
    borderRadius: '12px',
    border: '0.5px solid var(--border)',
    padding: '14px',
    marginBottom: '10px',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  previewName: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--text)',
  },
  previewBadge: {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '10px',
    background: 'var(--purple-l)',
    color: 'var(--purple)',
    fontWeight: 500,
  },
  previewDetails: {
    fontSize: '12px',
    color: 'var(--text3)',
    lineHeight: 1.5,
  },
  errorBox: {
    padding: '12px',
    borderRadius: '10px',
    background: 'var(--coral-l)',
    color: 'var(--coral)',
    fontSize: '13px',
    marginBottom: '16px',
  },
  bottom: {
    padding: '16px 24px',
    flexShrink: 0,
  },
  createBtn: {
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
  createBtnDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
}

export default function CreateFolder({ onBack, onCreated }) {
  const [folderName, setFolderName] = useState('')
  const [worldview, setWorldview] = useState('')
  const [storyIntro, setStoryIntro] = useState('')
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [generatedChars, setGeneratedChars] = useState(null) // { storyName, worldview, storyIntro, characters[] }

  const apiKey = getApiKey()

  const handleAIGenerate = async () => {
    if (!aiInput.trim()) return
    if (!apiKey) {
      setAiError('请先在设置中配置 API Key')
      return
    }
    setAiLoading(true)
    setAiError('')

    try {
      const { result, error } = await extractStoryFromText(aiInput.trim(), apiKey)
      if (error) {
        setAiError('生成失败：' + (error.message || '未知错误'))
        return
      }
      if (!result) {
        setAiError('生成失败：AI 返回空结果')
        return
      }

      // Map AI result to our format
      const chars = (result['可攻略角色'] || result.可攻略角色 || []).map(rc => ({
        id: generateId(),
        name: rc['角色名'] || rc.角色名 || '',
        avatar: '',
        personality: rc['性格'] || rc.性格 || '',
        background: rc['背景'] || rc.背景 || '',
        speakingStyle: rc['说话风格'] || rc.说话风格 || '',
        styleRules: Array.isArray(rc['文风规则'] || rc.文风规则) ? (rc['文风规则'] || rc.文风规则) : [],
        forbiddenWords: Array.isArray(rc['禁止行为'] || rc.禁止行为) ? (rc['禁止行为'] || rc.禁止行为) : [],
        affectionEnabled: true,
        affectionInitial: rc['好感度初始'] || rc.好感度初始 || 50,
        affectionStages: (rc['好感度阶段'] || rc.好感度阶段 || []).map(s => ({
          name: s.label || s.name || '',
          min: s.min || 0,
          max: s.max || 100,
          coreState: s.coreState || '',
          playerStrategy: s.playerStrategy || '',
          languageSamples: s.languageSamples || '',
          forbiddenBehaviors: s.forbiddenBehaviors || '',
          stageDetails: s.stageDetails || '',
          emotionalTraits: s.emotionalTraits || '',
          stageExplosion: s.stageExplosion || '',
        })),
        transitionTriggers: rc['transitionTriggers'] || rc.transitionTriggers || '',
        irreversibleMoment: rc['irreversibleMoment'] || rc.irreversibleMoment || '',
        erosionCondition: rc['erosionCondition'] || rc.erosionCondition || '',
        anchorSuppression: rc['anchorSuppression'] || rc.anchorSuppression || '',
      }))

      const npcs = (result['主要NPC'] || result.主要NPC || []).map(npc => ({
        id: generateId(),
        name: npc['NPC名'] || npc.NPC名 || '',
        avatar: '',
        personality: npc['性格'] || npc.性格 || '',
        background: '',
        relationship: npc['关系'] || npc.关系 || '',
      }))

      setGeneratedChars({
        storyName: result['故事名称'] || result.故事名称 || '未命名',
        worldview: result['世界观'] || result.世界观 || '',
        storyIntro: result['开场剧情'] || result.开场剧情 || '',
        storyTone: result['故事基调'] || result.故事基调 || '',
        characters: chars,
        npcs,
      })

      // Pre-fill form
      setFolderName(result['故事名称'] || result.故事名称 || '')
      setWorldview(result['世界观'] || result.世界观 || '')
      setStoryIntro(result['开场剧情'] || result.开场剧情 || '')
    } catch (err) {
      setAiError('生成失败：' + err.message)
    } finally {
      setAiLoading(false)
    }
  }

  const handleCreate = () => {
    const name = folderName.trim() || '未命名世界'

    // Create folder
    const folder = createFolder(name, worldview.trim(), storyIntro.trim())

    // Add characters to folder
    const allChars = generatedChars?.characters || []
    for (const char of allChars) {
      addInlineCharacter(folder.id, char)
    }

    // If NPCs exist, add them too
    const allNpcs = generatedChars?.npcs || []
    for (const npc of allNpcs) {
      if (npc.name) {
        addInlineCharacter(folder.id, { ...npc, type: 'npc' })
      }
    }

    // Create folder-scoped USK
    const charsForUSK = allChars.map(c => ({
      id: c.id,
      name: c.name,
      affectionInitial: c.affectionInitial,
    }))
    const usk = createFolderUSK(folder.id, charsForUSK, { sourceMode: 'drama' })
    saveFolderUSK(folder.id, usk)

    // Notify parent
    if (onCreated) onCreated(folder)
  }

  const hasContent = folderName.trim() || (generatedChars?.characters?.length > 0)

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <span style={styles.title}>创建新世界</span>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* AI Generate Section */}
        <div style={styles.aiSection}>
          <div style={styles.aiLabel}>🤖 AI 一键生成</div>
          <div style={styles.aiHint}>
            输入世界观或故事描述，AI 自动生成世界观、开场剧情和 1-3 个可攻略角色
          </div>
          <textarea
            style={styles.aiTextarea}
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            placeholder="例如：现代都市背景下，一个冷面CEO与实习生的契约婚姻故事…"
          />
          {aiError && <div style={styles.errorBox}>{aiError}</div>}
          <button
            style={{ ...styles.aiBtn, ...(aiLoading || !aiInput.trim() ? styles.aiBtnDisabled : {}) }}
            onClick={handleAIGenerate}
            disabled={aiLoading || !aiInput.trim()}
          >
            {aiLoading ? '⏳ AI 生成中...' : '✨ AI 生成角色与世界'}
          </button>
        </div>

        {/* Generated Preview */}
        {generatedChars && generatedChars.characters.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text2)',
              marginBottom: '10px',
            }}>
              生成的角色 ({generatedChars.characters.length})
            </div>
            {generatedChars.characters.map((c, i) => (
              <div key={c.id} style={styles.previewCard}>
                <div style={styles.previewHeader}>
                  <span style={styles.previewName}>{c.name || '角色 ' + (i + 1)}</span>
                  <span style={styles.previewBadge}>好感 {c.affectionInitial}</span>
                </div>
                <div style={styles.previewDetails}>
                  {c.personality && '性格：' + c.personality.slice(0, 60) + (c.personality.length > 60 ? '…' : '')}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Divider */}
        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span>手动编辑</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Manual Form */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>世界名称</label>
          <input
            style={styles.input}
            value={folderName}
            onChange={e => setFolderName(e.target.value)}
            placeholder="给你的世界起个名字"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel}>世界观</label>
          <textarea
            style={styles.textarea}
            value={worldview}
            onChange={e => setWorldview(e.target.value)}
            placeholder="描述这个世界的背景、时代、规则…"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.fieldLabel}>开场剧情</label>
          <textarea
            style={styles.textarea}
            value={storyIntro}
            onChange={e => setStoryIntro(e.target.value)}
            placeholder="故事从哪里开始？第一幕是什么场景？"
          />
        </div>
      </div>

      {/* Bottom */}
      <div style={styles.bottom}>
        <button
          style={{
            ...styles.createBtn,
            ...(!hasContent ? styles.createBtnDisabled : {}),
          }}
          onClick={handleCreate}
          disabled={!hasContent}
        >
          创建世界
          {generatedChars?.characters?.length > 0 && `（含 ${generatedChars.characters.length} 位角色）`}
        </button>
      </div>
    </div>
  )
}
