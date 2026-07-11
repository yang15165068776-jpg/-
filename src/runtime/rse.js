/**
 * RSE — Runtime Supervisor Engine v1
 *
 * Two-pass architecture:
 *   Pass 1 (NDC — Narrative Director Core): flash model → Director Plan
 *   Pass 2 (SUPERVISOR): flash model → check output against Plan
 *
 * NDC position: first in the Runtime pipeline.
 *   Characters execute. Director plans.
 *   Main model handles HOW. Director decides WHAT.
 *
 * RSE is NOT a writer. RSE does NOT generate narrative.
 * RSE only: plans (NDC) and checks (Supervisor).
 */

import { getAuditModel } from '../utils/storage'
import { getCurrentAffectionStage } from '../utils/deepseek'
import { detectAggressionProfile } from './aggressionProfile'

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://api.deepseek.com'
const FLASH_MODEL = 'deepseek-v4-flash'
const MAX_REWRITES = 1

// ═══════════════════════════════════════════════════════════
// 0. NDC Module-Level State (loop detection + rhythm)
// ═══════════════════════════════════════════════════════════

const _ndcState = {
  prevGoal: '',           // Previous turn's sceneGoal.type
  goalRepeatCount: 0,     // How many turns same goal repeated
  prevActions: [],        // Last 3 turns' primary actions (for loop detection)
  rhythm: 'push',         // Current rhythm phase: push | pull | hold | observe
  rhythmTurnCount: 0,     // Turns in current rhythm phase
  stagnationTurns: 0,     // Consecutive turns without expected change
  turnIndex: 0,
}

/**
 * Reset NDC internal state (call on session reset).
 */
export function resetNDCState() {
  _ndcState.prevGoal = ''
  _ndcState.goalRepeatCount = 0
  _ndcState.prevActions = []
  _ndcState.rhythm = 'push'
  _ndcState.rhythmTurnCount = 0
  _ndcState.stagnationTurns = 0
  _ndcState.turnIndex = 0
}

// ═══════════════════════════════════════════════════════════
// 1. API Call (shared by both passes)
// ═══════════════════════════════════════════════════════════

async function _callFlash(prompt, apiKey) {
  if (!apiKey) return { raw: '', error: 'No API key' }

  try {
    const model = getAuditModel() || FLASH_MODEL
    const response = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是 JSON 输出机。只输出合法 JSON。禁止任何其他文字。' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.1,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      return { raw: '', error: errData.error?.message || `API ${response.status}` }
    }

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content || ''
    return { raw }
  } catch (err) {
    return { raw: '', error: err.message }
  }
}

// ═══════════════════════════════════════════════════════════
// 2. PASS 1: NDC — Narrative Director Core
// ═══════════════════════════════════════════════════════════

/**
 * Run the NDC Director pass — generate a Director Plan.
 *
 * @returns {Promise<{ plan: object|null, error: string|null }>}
 */
export async function runDirectorPass(ctx, apiKey) {
  const { userInput, character, usk } = ctx
  const rcList = character?.romanceCharacters || []

  _ndcState.turnIndex++

  // ── Build character context ──
  const charBlocks = rcList.map(rc => {
    const aff = usk?.characters?.[rc.name]?.relationship?.affection ?? rc.affectionInitial ?? 50
    const stage = getCurrentAffectionStage(rc, aff)
    const profile = detectAggressionProfile(rc)
    return `${rc.name}（${rc.personality || '?'} / ${profile}）好感${aff} 阶段${stage?.name || '?'}`
  }).join('\n')

  // ── Loop detection context ──
  const loopCtx = _ndcState.goalRepeatCount >= 2
    ? `\n⚠️ 上一轮 Goal="${_ndcState.prevGoal}" 已重复${_ndcState.goalRepeatCount}轮。如果本轮仍然相同 → 必须推进，禁止原地循环。`
    : ''
  const rhythmCtx = `\n当前节奏相位：${_ndcState.rhythm}（第${_ndcState.rhythmTurnCount}轮）。push=推进/进攻，pull=收手/吊胃口，observe=观察反馈。`

  const prompt = `你是 Narrative Director Core（NDC）。你不是角色、不是作者、不是旁白。

你的唯一职责：决定本轮剧情要推进什么。角色负责演绎，你负责推进。

【最高原则】
剧情必须先有目标，再有正文。
主模型只负责"怎么写"。你负责"这一轮应该发生什么"。

【Scene Goal】
只有一个主目标。禁止多个Goal同时推进。
目标类型：试探/拉近/误会/吃醋/争执/缓和/揭露/诱导/交易/妥协/逃避/观察
目标必须具体。例：
  好："让玩家意识到角色在吃醋，但角色死不承认"
  好："角色制造两难局面，逼玩家做选择"
  差："继续对话"

【Scene Beat】
每轮应有2-4个节拍（Beat）。正文围绕Beat推进。
  例：Beat1:玩家靠近 → Beat2:角色观察 → Beat3:角色试探 → Beat4:停在等待回应

【Expected Change】
本轮结束时世界状态应发生什么变化。如：距离/信任/信息/情绪。
若连续2轮无变化 → Scene Dead，必须插入新刺激。

【Action Loop Detection】
若"摸手→拥抱→解扣子→靠近"等动作连续重复超过2轮 → 强制结束当前循环，进入新事件。

【Rhythm】
当前节奏相位：${_ndcState.rhythm}。
push=推进/进攻 | pull=收手/留白/吊胃口 | observe=观察玩家反馈后决定
每1-2轮自动切换相位。不要在push上连续停留超过2轮。${loopCtx}${rhythmCtx}

【当前场景】${ctx.sceneContext || '未指定'}
【角色】\n${charBlocks}
【玩家输入】${userInput?.slice(0, 200) || '(空)'}
【上轮回复】${ctx.prevReply?.slice(0, 300) || '(首轮)'}

【输出——严格 JSON，包含两部分】

{
  "sceneGoal": {
    "type": "试探",
    "description": "具体描述——让玩家意识到角色在吃醋但角色死不承认",
    "priority": 1
  },
  "characterIntent": {
    "言默": { "goal": "确认玩家是否还会继续投入", "strategy": "保持高冷但留一个破绽让对方抓住", "emotion": "冷静外表下暗自期待" }
  },
  "sceneBeat": [
    "玩家抵达或做出动作",
    "角色观察并做出第一个试探",
    "玩家回应",
    "角色根据回应调整态度——推进或收手"
  ],
  "expectedChange": {
    "type": "距离",
    "description": "心理距离缩短——玩家意识到角色在试探自己"
  },
  "replyPlan": {
    "replyIntent": "确认玩家态度",
    "surfaceEmotion": "冷淡",
    "hiddenEmotion": "期待",
    "strategy": "保持高价值感、用停顿制造张力、给一点回应但不全给",
    "allowedActions": ["观察", "试探", "转移话题", "故意停顿"],
    "forbiddenActions": ["突然告白", "重复上一轮身体动作", "暴露真实依赖", "连续身体描写"],
    "requiredBeats": ["回应玩家本轮输入", "产生一个新信息", "留下下一轮的钩子"]
  },
  "forbidden": [
    "禁止重复上一轮的动作",
    "禁止连续停留在同一Beat上循环"
  ],
  "rhythm": "push",
  "runtimeDirective": "本轮重点不是亲密接触，而是确认双方心理距离。"
}

规则：
- sceneGoal.type 从：试探/拉近/误会/吃醋/争执/缓和/揭露/诱导/交易/妥协/逃避/观察 中选一个
- replyPlan.replyIntent 必须具体——不是"回应"，而是"确认态度"/"隐藏真实想法"/"制造距离"等
- replyPlan.forbiddenActions 必须根据角色阶段/关系值/历史生成，不能是泛泛的"禁止OOC"
- replyPlan.requiredBeats 2-3个——告诉主模型这轮必须完成什么
- 只输出 JSON`

  const { raw, error: callError } = await _callFlash(prompt, apiKey)
  if (callError || !raw) {
    console.warn('[NDC] Director pass failed:', callError || 'empty response from flash model')
    return { plan: _fallbackPlan(), error: callError || 'empty response' }
  }

  return parseDirectorResponse(raw)
}

function _fallbackPlan() {
  return {
    sceneGoal: { type: '推进', description: '推进剧情', priority: 0 },
    sceneBeat: ['角色回应玩家'],
    expectedChange: { type: '剧情', description: '剧情推进一步' },
    forbidden: ['禁止OOC', '禁止替玩家思考'],
    rhythm: _ndcState.rhythm,
    runtimeDirective: '推进剧情，停在等待玩家回应。',
  }
}

/**
 * Parse NDC response. Updates internal loop/stagnation/rhythm state.
 */
export function parseDirectorResponse(raw) {
  try {
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr)

    // ── Update NDC internal state ──
    const goalType = parsed.sceneGoal?.type || ''
    if (goalType === _ndcState.prevGoal) {
      _ndcState.goalRepeatCount++
    } else {
      _ndcState.prevGoal = goalType
      _ndcState.goalRepeatCount = 0
    }

    // Rhythm auto-rotation
    const newRhythm = parsed.rhythm || _ndcState.rhythm
    if (newRhythm === _ndcState.rhythm) {
      _ndcState.rhythmTurnCount++
    } else {
      _ndcState.rhythm = newRhythm
      _ndcState.rhythmTurnCount = 1
    }
    // Force rhythm switch if stuck in push for 3+ turns
    if (_ndcState.rhythm === 'push' && _ndcState.rhythmTurnCount >= 3) {
      _ndcState.rhythm = 'pull'
      _ndcState.rhythmTurnCount = 1
      parsed._rhythmOverridden = true
    }

    // Stagnation detection
    if (!parsed.expectedChange || parsed.expectedChange.description === '无变化') {
      _ndcState.stagnationTurns++
    } else {
      _ndcState.stagnationTurns = 0
    }

    return { plan: parsed, error: null }
  } catch (e) {
    console.warn('[NDC] JSON parse failed:', e.message)
    return { plan: _fallbackPlan(), error: null }
  }
}

// ═══════════════════════════════════════════════════════════
// 3. Director Plan → Prompt Injection
// ═══════════════════════════════════════════════════════════

/**
 * Convert NDC Director Plan into prompt injection.
 * Compact format — plan goes first, before all other system messages.
 *
 * @param {object} plan — NDC Director Plan
 * @returns {string} prompt block
 */
export function injectContractIntoPrompt(plan) {
  if (!plan) return ''

  const lines = []

  // ═══ Scene Goal — the most important line ═══
  const goal = plan.sceneGoal
  lines.push(`━━━ 🎬 NDC · 本轮目标：${goal?.type || '?'} — ${goal?.description || '推进剧情'} ━━━`)

  // Runtime Directive
  if (plan.runtimeDirective) {
    lines.push(`导演指令：${plan.runtimeDirective}`)
  }

  // Character Intent (compact)
  if (plan.characterIntent) {
    const intents = Object.entries(plan.characterIntent).map(([name, ci]) =>
      `${name}:${ci.goal || '?'}/${ci.strategy || '?'}`
    )
    if (intents.length) lines.push(`角色意图：${intents.join(' | ')}`)
  }

  // Scene Beats
  if (plan.sceneBeat?.length) {
    lines.push(`节拍：${plan.sceneBeat.map((b, i) => `${i + 1}.${b}`).join(' → ')}`)
  }

  // Expected Change
  if (plan.expectedChange?.description && plan.expectedChange.description !== '无变化') {
    lines.push(`预期变化：${plan.expectedChange.type || ''} — ${plan.expectedChange.description}`)
  }

  // Rhythm
  const rhythm = plan._rhythmOverridden ? 'pull（自动切换：push过久）' : (plan.rhythm || _ndcState.rhythm)
  lines.push(`节奏：${rhythm}`)

  // Forbidden
  if (plan.forbidden?.length) {
    lines.push(`禁止：${plan.forbidden.join(' / ')}`)
  }

  // ═══ Reply Plan — actor's guide ═══
  const rp = plan.replyPlan
  if (rp) {
    lines.push('')
    lines.push(`🎭 回复意图：${rp.replyIntent || '?'} | 表层=${rp.surfaceEmotion || '?'} | 隐藏=${rp.hiddenEmotion || '?'}`)
    if (rp.strategy) lines.push(`策略：${rp.strategy}`)
    if (rp.allowedActions?.length) lines.push(`允许：${rp.allowedActions.join('、')}`)
    if (rp.forbiddenActions?.length) lines.push(`禁止：${rp.forbiddenActions.join(' / ')}`)
    if (rp.requiredBeats?.length) lines.push(`必须：${rp.requiredBeats.join(' → ')}`)
  }

  // Stagnation warning
  if (_ndcState.stagnationTurns >= 2) {
    lines.push(`⚠️ 已${_ndcState.stagnationTurns}轮无预期变化——本轮必须引入新刺激（电话/敲门/第三角色/意外事件/旧事重提）`)
  }

  // Loop warning
  if (_ndcState.goalRepeatCount >= 2) {
    lines.push(`⚠️ Goal"${_ndcState.prevGoal}"已重复${_ndcState.goalRepeatCount}轮——本轮必须推进，禁止原地循环`)
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━')
  return lines.join('\n')
}

/**
 * Backward-compat: returns the internal NDC state for coordinator.
 */
export function getNDCState() {
  return { ..._ndcState }
}

// ═══════════════════════════════════════════════════════════
// 4. PASS 2: Supervisor
// ═══════════════════════════════════════════════════════════

/**
 * Run the Supervisor pass — check generated output against the Runtime Contract.
 *
 * @param {string} output — main model generated text
 * @param {object} contract — the Runtime Contract from Director pass
 * @param {object} ctx — same ctx as Director (for character context)
 * @param {string} apiKey
 * @returns {Promise<{ passed: boolean, severity: string, violations: Array, revisionNotes: string }>}
 */
export async function runSupervisorPass(output, contract, ctx, apiKey) {
  if (!contract) {
    // No contract → pass through (Director must have failed)
    return { passed: true, severity: 'silent', violations: [], revisionNotes: '' }
  }

  const contractStr = JSON.stringify(contract, null, 2)
  const charName = ctx.character?.name || '角色'
  const playerName = ctx.character?._playerProfile?.name || '玩家'

  const prompt = `你是 Reply Critic Layer（RCL）。你不是重写者、不是作者。你是质量控制。

对照 Director Plan + Reply Plan，审计主模型输出。

【Director Plan】
${contractStr}

【主模型输出】
${output?.slice(0, 1500) || '(空)'}

【上下文】角色：${charName} | 玩家：${playerName}

═══════════════════════════════════
审查维度
═══════════════════════════════════

① Character Fidelity（角色人格）
回复是否符合角色当前阶段的人格？禁止：突然深情、讨好、暴露真实依赖。

② Intent Completion（意图完成）
是否完成了 replyIntent？如果 Plan 说要"试探"，回复不能只是描写风景。

③ Scene Progression（剧情推进）
相比上一轮，是否产生了新信息？禁止：纯动作描写、原地循环。

④ Action Repetition（动作重复）
最近3轮是否有相同动作？如果连续"摸手/靠近/低笑"→ 失败。

⑤ State Consistency（状态一致性）
是否违反 Scene State？如：衣服已脱 → 禁止"解开扣子"。

⑥ Relationship Accuracy（关系准确）
是否符合当前好感度阶段？低好感禁止深情告白。

⑦ Fantasy Preservation（戏剧性保留）
是否过度现实化/日常化？角色扮演需要张力、戏剧性。禁止变成普通聊天。

═══════════════════════════════════
输出——严格 JSON
═══════════════════════════════════

PASS (score >= 75):
{"passed":true,"score":85,"severity":"silent","violations":[],"fixInstruction":""}

FAIL (score < 75):
{"passed":false,"score":55,"severity":"critical","violations":[{"dimension":"Action Repetition","description":"连续第3次摸手动作","snippet":"他伸手握住你的手指"}],"fixInstruction":"停止身体接触动作。改用语言试探或制造距离。保持言默前期猎手身份——不要表达依赖。"}

规则：
- score 0-100，75以上通过
- severity: critical(P0违规)/major(明显问题)/minor(风格差异)
- fixInstruction 必须是具体的修改指导，不是泛泛的"注意人设"
- 风格差异≠违规。不要吹毛求疵。
只输出 JSON。`

  const { raw, error: callError } = await _callFlash(prompt, apiKey)
  if (callError) {
    console.warn('[RCL] API error:', callError, '— passing through')
    return { passed: true, severity: 'silent', violations: [], revisionNotes: '' }
  }
  if (!raw || !raw.trim()) {
    console.warn('[RCL] Empty response — passing through')
    return { passed: true, severity: 'silent', violations: [], revisionNotes: '' }
  }

  return parseSupervisorResponse(raw)
}

/**
 * Parse Supervisor response.
 */
export function parseSupervisorResponse(raw) {
  try {
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr)
    return {
      passed: parsed.passed !== false,
      score: parsed.score ?? 75,
      severity: parsed.severity || 'silent',
      violations: Array.isArray(parsed.violations) ? parsed.violations : [],
      revisionNotes: parsed.fixInstruction || parsed.revision_notes || '',
    }
  } catch (e) {
    console.warn('[RCL] JSON parse failed:', e.message)
    return { passed: true, score: 75, severity: 'silent', violations: [], revisionNotes: '' }
  }
}

// ═══════════════════════════════════════════════════════════
// 5. Revision Injection
// ═══════════════════════════════════════════════════════════

/**
 * Build a revision prompt for main model rewrite.
 *
 * @param {Array} violations — from Supervisor
 * @returns {string} revision instruction
 */
export function buildRevisionInjection(violations) {
  if (!violations?.length) return ''

  const lines = ['【RSE 审计失败——请修正以下违规后重新生成】', '']

  const p0 = violations.filter(v => v.priority === 'P0')
  const p1 = violations.filter(v => v.priority === 'P1')

  if (p0.length > 0) {
    lines.push('🔴 P0 必须修正：')
    for (const v of p0) {
      const label = v.dimension || v.type || '?'
      lines.push(`  · ${label}: ${v.description || ''}`)
      if (v.snippet) lines.push(`    违规片段："${v.snippet}"`)
    }
    lines.push('')
  }

  if (p1.length > 0) {
    lines.push('🟠 P1 需要修正：')
    for (const v of p1) {
      const label = v.dimension || v.type || '?'
      lines.push(`  · ${label}: ${v.description || ''}`)
    }
    lines.push('')
  }

  lines.push('请重新生成完整的回复——不要接着上一版的结尾写，从头开始。修正上述所有问题。')

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════
// 6. Convenience: full RSE turn wrapper
// ═══════════════════════════════════════════════════════════

/**
 * Run the full RSE cycle for one turn.
 *
 * @param {object} ctx — turn context
 * @param {function} generateFn — async (messages) => reply string (streaming main model call)
 * @param {Array} baseMessages — the message array for the main model (will be modified with contract)
 * @param {string} apiKey
 * @returns {Promise<{ reply: string, contract: object|null, notes: string[], supervisorResult: object }>}
 */
export async function runRSECycle(ctx, generateFn, baseMessages, apiKey) {
  // ── Pass 1: Director ──
  console.log('[RSE] Pass 1: Director — generating contract...')
  const { contract, notes, error: dirError } = await runDirectorPass(ctx, apiKey)

  if (dirError) {
    console.warn('[RSE] Director failed, continuing without contract')
  } else if (contract) {
    console.log('[RSE] Contract:',
      'goal=' + (contract.scene?.goal || '?'),
      'tension=' + (contract.tension?.level || '?'),
      'notes=' + (notes?.length || 0))
  }

  // Inject contract into messages
  const contractBlock = injectContractIntoPrompt(contract, notes)
  if (contractBlock) {
    // Insert contract as the LAST system message before user input
    // (after all existing system messages, right before the user message)
    const userMsg = baseMessages[baseMessages.length - 1]
    baseMessages.splice(baseMessages.length - 1, 0, { role: 'system', content: contractBlock })
  }

  // ── Main Model ──
  console.log('[RSE] Main model generating...')
  let reply = await generateFn(baseMessages)

  // ── Pass 2: Supervisor ──
  console.log('[RSE] Pass 2: Supervisor — auditing...')
  const supResult = await runSupervisorPass(reply, contract, ctx, apiKey)

  if (!supResult.passed && supResult.severity === 'critical') {
    console.warn('[RSE] FAIL — ' + supResult.violations.length + ' violations, severity=' + supResult.severity)

    // Rewrite
    const revisionBlock = buildRevisionInjection(supResult.violations)
    if (revisionBlock && baseMessages.length >= 2) {
      // Insert revision before user message (replace previous contract)
      const userMsg = baseMessages[baseMessages.length - 1]
      baseMessages.splice(baseMessages.length - 1, 0, { role: 'system', content: revisionBlock })

      console.log('[RSE] Rewriting...')
      reply = await generateFn(baseMessages)

      // Re-audit after rewrite (single pass, no further rewrites)
      const reResult = await runSupervisorPass(reply, contract, ctx, apiKey)
      console.log('[RSE] Post-rewrite audit:', reResult.passed ? 'PASS' : 'FAIL (continuing)')
    }
  } else if (!supResult.passed) {
    console.warn('[RSE] Minor issues (' + supResult.severity + '), continuing')
  } else {
    console.log('[RSE] PASS')
  }

  return { reply, contract, notes, supervisorResult: supResult }
}

export { MAX_REWRITES }
