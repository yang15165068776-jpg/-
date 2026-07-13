/**
 * PLD — Prompt Layer Diagnostic v1
 *
 * Answers: "Which layers are actually being processed by the model?"
 *
 * Core insight: The model pays most attention to what's CLOSEST to the
 * generation point (recency bias). A brilliant instruction at position 15K
 * is effectively invisible. A mediocre instruction in the last 500 tokens
 * dominates the output.
 *
 * This tool analyzes the assembled message array and reports:
 *   1. Every layer's presence (is it actually injected?)
 *   2. Token count per layer
 *   3. Distance from generation point (user input = position 0)
 *   4. Visibility zone (HOT/WARM/COLD/DEAD)
 *
 * Zones:
 *   🔥 HOT   — last 2K tokens from generation: MAXIMUM recency bias
 *   🟡 WARM  — 2K-6K tokens away: some attention, competing signals
 *   ❄️ COLD  — 6K-12K tokens away: heavily diluted
 *   💀 DEAD  — 12K+ tokens away: effectively invisible, wasting tokens
 */

// ═══════════════════════════════════════════════════════════
// Layer registry — every possible prompt layer
// ═══════════════════════════════════════════════════════════

const LAYER_REGISTRY = [
  { id: 'CORE_SYSTEM',    name: 'CORE_SYSTEM_PREFIX',       category: '基础',    version: 'v8.2', source: 'cachePrefix.js' },
  { id: 'CHAR_PREFIX',    name: 'CHARACTER_PREFIX',         category: '基础',    version: 'v8.5', source: 'characterPrefix.js' },
  { id: 'VAR_SUFFIX',     name: 'VARIABLE_SUFFIX',          category: '基础',    version: 'v8.0', source: 'narratorPrompt.js' },
  { id: 'POWER',          name: 'Power Dynamics',           category: '关系',    version: 'v8.0', source: 'powerDynamics.js' },
  { id: 'CPS',            name: 'Conflict Persistence',     category: '冲突',    version: 'v8.0', source: 'conflictPersistence.js' },
  { id: 'AIIS',           name: 'AIIS Intent Context',      category: '自主性',  version: 'v8.4', source: 'autonomousInitiativeSystem.js' },
  { id: 'ANDS',           name: 'ANDS Narrative Directive', category: '自主性',  version: 'v8.4', source: 'autonomousNarrativeDrive.js' },
  { id: 'DAS',            name: 'DAS Narrative Event',      category: '自主性',  version: 'v8.4', source: 'dramaAutopilot.js' },
  { id: 'DCS',            name: 'DCS Director Cut',         category: '自主性',  version: 'v8.4', source: 'dramaControlSystem.js' },
  { id: 'NDOS',           name: 'NDOS Scene Card',          category: '自主性',  version: 'v8.4', source: 'narrativeDirectorOS.js' },
  { id: 'CIE',            name: 'CIE Character Intents',    category: '动机',    version: 'v9.1', source: 'characterIntentEngine.js' },
  { id: 'TOM',            name: 'TOM Turn Objectives',      category: '动机',    version: 'v9.1', source: 'turnObjectiveManager.js' },
  { id: 'ITRL',           name: 'ITRL Inner Thought',       category: '状态',    version: 'v8.8', source: 'innerThoughtRenderer.js' },
  { id: 'SSM',            name: 'SSM Scene State',          category: '状态',    version: 'v8.9', source: 'sceneStateManager.js' },
  { id: 'ISM',            name: 'ISM Interaction State',    category: '状态',    version: 'v8.9', source: 'interactionStateMachine.js' },
  { id: 'ES',             name: 'ES Emotion Simulator',     category: '状态',    version: 'v8.9', source: 'emotionSimulator.js' },
  { id: 'CONVERSATION',   name: 'Conversation History',     category: '对话',    version: '—',    source: 'messages array' },
  { id: 'NDC',            name: 'NDC Director Plan',        category: '导演',    version: 'v8.9', source: 'rse.js' },
  { id: 'PCL',            name: 'PCL Compressed Constitution', category: '宪法', version: 'v8.9', source: 'promptCompressionLayer.js' },
  { id: 'USER_INPUT',     name: 'User Input',               category: '输入',    version: '—',    source: 'player' },
]

// ═══════════════════════════════════════════════════════════
// Token estimation (DeepSeek: ~2 chars/token for Chinese)
// ═══════════════════════════════════════════════════════════

function estimateTokens(text) {
  if (!text) return 0
  // Chinese chars ~0.6 token each, English ~0.25 token each
  // Rough average for mixed CN/EN: chars / 1.8
  return Math.ceil(text.length / 1.8)
}

function getZone(distanceFromEnd) {
  if (distanceFromEnd <= 2000) return { zone: '🔥 HOT',  attention: 'MAX — 模型最关注这里' }
  if (distanceFromEnd <= 6000) return { zone: '🟡 WARM', attention: '部分注意力，信号竞争' }
  if (distanceFromEnd <= 12000) return { zone: '❄️ COLD', attention: '严重稀释，10%以下注意力' }
  return { zone: '💀 DEAD', attention: '几乎不可见，浪费token' }
}

// ═══════════════════════════════════════════════════════════
// Detection: match message content to layers
// ═══════════════════════════════════════════════════════════

function detectLayer(msg) {
  if (!msg.content) return null
  const c = msg.content

  if (msg.role === 'user') return 'USER_INPUT'
  if (msg.isSummary) return 'SUMMARY'

  // Detect by content markers (each layer has distinctive opening text)
  if (c.includes('CORE_SYSTEM_PREFIX') || c.includes('PRIORITY OVERRIDE') || c.includes('艺术豁免权')) return 'CORE_SYSTEM'
  if (c.includes('━━━ ⚙️ CEK v4') || c.includes('CEK v4 · 本轮导演状态')) return 'CEK'  // embedded in VAR_SUFFIX
  if (c.includes('━━━ 🧠 CIE · 角色心理动机')) return 'CIE'
  if (c.includes('━━━ 🎯 TOM · 本轮角色目标')) return 'TOM'
  if (c.includes('⚡ 权力动态') || c.includes('Power Dynamics')) return 'POWER'
  if (c.includes('🔒 冲突持久化') || c.includes('CPS') || c.includes('冲突锁')) return 'CPS'
  if (c.includes('AIIS') && c.includes('意图')) return 'AIIS'
  if (c.includes('🎭') && c.includes('叙事主动性')) return 'ANDS'
  if (c.includes('🌋') && c.includes('自动驾驶')) return 'DAS'
  if (c.includes('🎛️') && c.includes('导演控制')) return 'DCS'
  if (c.includes('🎬') && c.includes('Scene Card')) return 'NDOS'
  if (c.includes('ITRL') || c.includes('内心活动')) return 'ITRL'
  if (c.includes('SSM') || c.includes('场景状态')) return 'SSM'
  if (c.includes('ISM') || c.includes('交互状态')) return 'ISM'
  if (c.includes('ES') || c.includes('情绪模拟')) return 'ES'
  if (c.includes('🎬') && c.includes('NDC')) return 'NDC'
  if (c.includes('角色宪法 · 本轮有效条款') || c.includes('PCL')) return 'PCL'
  if (c.includes('CHARACTER_PREFIX') || c.includes('━━━ 🗃️')) return 'CHAR_PREFIX'
  if (c.includes('【玩家本轮行动】') || c.includes('世界快照')) return 'VAR_SUFFIX'
  if (c.includes('前情摘要')) return 'SUMMARY'

  // Conversation messages
  if (msg.role === 'assistant') return 'CONVERSATION'
  if (msg.role === 'user' && !c.includes('世界快照')) return 'CONVERSATION'

  return 'UNKNOWN'
}

// ═══════════════════════════════════════════════════════════
// Main diagnostic function
// ═══════════════════════════════════════════════════════════

/**
 * Analyze the assembled message array and print a diagnostic report.
 *
 * @param {Array} messages — assembled narratorMessages array
 * @param {object} options
 * @param {boolean} options.verbose — show full content preview for each layer
 * @param {boolean} options.showDead — show layers in DEAD zone
 */
export function diagnosePromptLayers(messages, options = {}) {
  const { verbose = false, showDead = true } = options

  // Calculate total tokens and position from end
  let totalTokens = 0
  const layers = []

  // Process in reverse (from end = user input = closest to generation)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const tokens = estimateTokens(msg.content || '')
    const layerId = detectLayer(msg)
    const distanceFromEnd = totalTokens  // tokens between this layer and generation

    layers.unshift({
      index: i,
      role: msg.role,
      layerId,
      tokens,
      distanceFromEnd,
      zone: getZone(distanceFromEnd),
      content: msg.content || '',
    })

    totalTokens += tokens
  }

  // Build report
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║          📊 Prompt Layer Diagnostic — 本轮诊断报告           ║',
    '╠══════════════════════════════════════════════════════════════╣',
    `║  总层数: ${layers.length} 层  |  总 tokens: ~${totalTokens.toLocaleString()}  |  距生成点越近越有效  ║`,
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  ]

  // Header
  lines.push(' 位置      Token   距离    可见区   状态  层名')
  lines.push(' ────────  ──────  ──────  ──────  ────  ───────────────────')

  // Track which registered layers are MISSING
  const presentLayers = new Set(layers.map(l => l.layerId))
  const activeCEK = layers.some(l => l.layerId === 'CEK')

  for (const layer of layers) {
    const { zone, attention } = layer.zone
    const pos = layer.index.toString().padStart(3)
    const tok = layer.tokens.toLocaleString().padStart(6)
    const dist = layer.distanceFromEnd.toLocaleString().padStart(6)
    const present = layer.layerId === 'UNKNOWN' ? '❓' : '✅'
    const name = layer.layerId.padEnd(20)

    // Skip DEAD layers unless verbose
    if (zone === '💀 DEAD' && !showDead) continue

    lines.push(`  #${pos}     ${tok}  ${dist}   ${zone}  ${present}  ${name}`)

    if (verbose && layer.content) {
      const preview = layer.content.slice(0, 120).replace(/\n/g, ' ')
      lines.push(`         └─ ${preview}…`)
    }
  }

  lines.push('')
  lines.push('  🔥 HOT  = 最后 2K tokens (recency bias 最大)')
  lines.push('  🟡 WARM = 2K-6K (部分注意力)')
  lines.push('  ❄️ COLD = 6K-12K (严重稀释)')
  lines.push('  💀 DEAD = 12K+ (几乎不可见)')
  lines.push('')

  // ── MISSING LAYERS ──
  const missingLayers = LAYER_REGISTRY.filter(l => {
    if (l.id === 'CEK') return !activeCEK  // CEK is embedded in VAR_SUFFIX
    return !presentLayers.has(l.id) && l.id !== 'CEK'
  })

  if (missingLayers.length > 0) {
    lines.push('╔══════════════════════════════════════════════════════════════╗')
    lines.push('║  ⚠️ 未注入的层（这些指令本轮没有被发送给模型）              ║')
    lines.push('╠══════════════════════════════════════════════════════════════╣')
    for (const l of missingLayers) {
      lines.push(`║  ❌ ${l.id.padEnd(15)} ${l.name.padEnd(30)} ${l.category.padEnd(6)} ${l.version}  ${l.source}`)
    }
    lines.push('╚══════════════════════════════════════════════════════════════╝')
    lines.push('')
  }

  // ── RECOMMENDATIONS ──
  lines.push('╔══════════════════════════════════════════════════════════════╗')
  lines.push('║  🔍 诊断建议                                                 ║')
  lines.push('╠══════════════════════════════════════════════════════════════╣')

  // Count layers by zone
  const hotLayers = layers.filter(l => l.zone.zone === '🔥 HOT')
  const warmLayers = layers.filter(l => l.zone.zone === '🟡 WARM')
  const coldLayers = layers.filter(l => l.zone.zone === '❄️ COLD')
  const deadLayers = layers.filter(l => l.zone.zone === '💀 DEAD')

  const hotTokens = hotLayers.reduce((s, l) => s + l.tokens, 0)
  const deadTokens = deadLayers.reduce((s, l) => s + l.tokens, 0)
  const deadPercent = totalTokens > 0 ? Math.round(deadTokens / totalTokens * 100) : 0

  lines.push(`║  🔥 HOT 层: ${hotLayers.length}层 / ${hotTokens.toLocaleString()} tokens — 真正有效的指令`)
  lines.push(`║  💀 DEAD 层: ${deadLayers.length}层 / ${deadTokens.toLocaleString()} tokens (${deadPercent}%) — 在浪费token`)
  lines.push(`║`)

  if (deadPercent > 40) {
    lines.push(`║  ❗ ${deadPercent}% 的token在DEAD区！精简前端缓存或移除无效层。`)
  }

  // Check: are writing style instructions in HOT zone?
  const writingStyleInHot = hotLayers.some(l =>
    (l.content || '').includes('簧片') || (l.content || '').includes('粗粝') || (l.content || '').includes('权力动态')
  )
  const writingStyleInDead = deadLayers.some(l =>
    (l.content || '').includes('簧片') || (l.content || '').includes('粗粝') || (l.content || '').includes('权力动态')
  )

  if (!writingStyleInHot && writingStyleInDead) {
    lines.push(`║  ❗ 关键发现：簧片/粗粝/权力动态等写作技法指令在DEAD区！`)
    lines.push(`║     模型根本看不到这些。这就是输出平淡的主要原因之一。`)
  }

  // Check: offensive instructions position
  const offensiveInHot = hotLayers.some(l =>
    (l.content || '').includes('必须进攻') || (l.content || '').includes('不能温柔') || (l.content || '').includes('不进攻=死亡')
  )
  if (!offensiveInHot) {
    lines.push(`║  ❗ "必须进攻/不进攻=死亡"指令不在HOT区。角色缺乏进攻驱动力。`)
  }

  // Check: character personality in what zone
  const personalityInDead = deadLayers.some(l =>
    (l.content || '').includes('人格') || (l.content || '').includes('pursuer') || (l.content || '').includes('侵略')
  )
  if (personalityInDead) {
    lines.push(`║  ❗ 角色人设/侵略类型在DEAD区。模型看不到行为底线 → 所有角色趋同。`)
  }

  if (missingLayers.filter(l => l.category === '自主性').length >= 3) {
    lines.push(`║  ❗ 自主性五层栈(AIIS/ANDS/DAS/DCS/NDOS)大部分未注入。`)
    lines.push(`║     这些系统可能在pipeline中生成了但在coordinator中未推入消息数组。`)
  }

  lines.push('╚══════════════════════════════════════════════════════════════╝')

  const report = lines.join('\n')
  console.log(report)

  return {
    layers,
    totalTokens,
    hotLayers, warmLayers, coldLayers, deadLayers,
    missingLayers,
    hotTokens, deadTokens, deadPercent,
  }
}

/**
 * Quick summary — lighter version for per-turn logging.
 */
export function quickDiagnose(messages) {
  let totalTokens = 0
  const present = new Set()

  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(messages[i].content || '')
    const layerId = detectLayer(messages[i])
    present.add(layerId)
    totalTokens += tokens
  }

  return { totalTokens, layerCount: messages.length, presentLayers: [...present] }
}
