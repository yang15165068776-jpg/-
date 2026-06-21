/**
 * Fact Ledger v2 — Immutable Truth Layer
 *
 * Core problem:
 *   ❗ The LLM "completes the story" by fabricating past events.
 *   The model isn't a fact database — it's a "next-token predictor."
 *   When context is missing, it invents what "probably happened."
 *
 * Solution:
 *   ✅ FACT LEDGER = single source of truth for ALL events, states, identities
 *   ✅ Facts are LOCKED — the LLM cannot modify or contradict them
 *   ✅ Injected EVERY turn — not just on first turn
 *   ✅ Forbidden facts = what the model CANNOT say (based on what didn't happen)
 *
 * This is NOT a prompt patch. It's a STRUCTURAL constraint on narrative generation.
 *
 * Architecture:
 *   Fact Ledger = {
 *     stateFacts:     ["角色A当前赤裸", "场景在卧室"]       ← physical reality
 *     actionFacts:    ["玩家说'滚'", "角色B离开了房间"]     ← what actually happened
 *     identityFacts:  ["玩家名字=落总", "玩家父母双亡"]     ← who people are
 *     relationshipFacts: ["A在第3轮明确拒绝了B"]            ← irreversible events
 *     forbiddenFacts: ["玩家从未说'我爱你'","角色A和B没有独处过"] ← what CAN'T be said
 *   }
 *
 * Integration:
 *   → injected into every prompt (before LLM generation)
 *   → updated after every turn (extract new facts from what just happened)
 *   → validated against after generation (StateLocks already does this)
 */

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

// ═══════════════════════════════════════════════════════════
// 1. Fact Ledger Storage
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = 'jsjg_fact_ledger_'

function _key(characterId, saveId) {
  return STORAGE_KEY + (saveId ? saveId + '_' : '') + characterId
}

function _create() {
  return {
    version: 2,
    // ── State facts: physical reality of the scene ──
    stateFacts: [],           // ["角色A全身赤裸", "两人在卧室床上", "时间是深夜"]
    // ── Action facts: what actually happened (ordered) ──
    actionFacts: [],          // ["玩家说'滚出去'", "角色B推门离开", "角色A哭了"]
    // ── Identity facts: who people are ──
    identityFacts: [],        // ["玩家名字=落总", "玩家父母双亡", "角色A有未婚夫"]
    // ── Relationship facts: irreversible events and states ──
    relationshipFacts: [],    // ["第3轮A明确拒绝了B的告白", "B和C在第5轮接吻了"]
    // ── Forbidden facts: what the LLM CANNOT say ──
    forbiddenFacts: [],       // ["玩家从未说'我爱你'", "A和B从未独处", "没有人脱过衣服"]
    // ── Scene continuity: track the current physical state ──
    sceneState: {
      location: '',           // 当前场景位置
      timePhase: '',          // 时间段
      characterStates: {},    // { "沈寂": "全身赤裸,躺在床上", "落总": "穿着睡衣,坐在床边" }
    },
    updatedAt: null,
  }
}

// ═══════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════

export function loadLedger(characterId, saveId) {
  const key = _key(characterId, saveId)
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.version >= 2) return parsed
    }
  } catch {}
  return _create()
}

export function saveLedger(characterId, saveId, ledger) {
  const key = _key(characterId, saveId)
  ledger.updatedAt = Date.now()
  // Prune: cap all fact arrays
  if (ledger.stateFacts.length > 30) ledger.stateFacts = ledger.stateFacts.slice(-30)
  if (ledger.actionFacts.length > 50) ledger.actionFacts = ledger.actionFacts.slice(-50)
  if (ledger.relationshipFacts.length > 30) ledger.relationshipFacts = ledger.relationshipFacts.slice(-30)
  if (ledger.forbiddenFacts.length > 20) ledger.forbiddenFacts = ledger.forbiddenFacts.slice(-20)
  try {
    localStorage.setItem(key, JSON.stringify(ledger))
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// 3. Fact Locking
// ═══════════════════════════════════════════════════════════

/**
 * Lock a state fact — a physical reality that cannot change unless explicitly updated.
 */
export function lockStateFact(ledger, fact) {
  if (!ledger.stateFacts.includes(fact)) {
    ledger.stateFacts.push(fact)
  }
}

/**
 * Lock an action fact — something that actually happened.
 */
export function lockActionFact(ledger, fact) {
  if (!ledger.actionFacts.includes(fact)) {
    ledger.actionFacts.push(fact)
  }
}

/**
 * Lock an identity fact — who someone is.
 */
export function lockIdentityFact(ledger, fact) {
  if (!ledger.identityFacts.includes(fact)) {
    ledger.identityFacts.push(fact)
  }
}

/**
 * Lock a relationship fact — an irreversible event between characters.
 */
export function lockRelationshipFact(ledger, fact) {
  if (!ledger.relationshipFacts.includes(fact)) {
    ledger.relationshipFacts.push(fact)
  }
}

/**
 * Lock a forbidden fact — something the LLM CANNOT say.
 * Generated from: what HASN'T happened, what the player has NOT said/done.
 */
export function lockForbiddenFact(ledger, fact) {
  if (!ledger.forbiddenFacts.includes(fact)) {
    ledger.forbiddenFacts.push(fact)
  }
}

/**
 * Update scene state — the current physical reality.
 */
export function updateSceneState(ledger, updates = {}) {
  if (updates.location) ledger.sceneState.location = updates.location
  if (updates.timePhase) ledger.sceneState.timePhase = updates.timePhase
  if (updates.characterStates) {
    for (const [name, state] of Object.entries(updates.characterStates)) {
      ledger.sceneState.characterStates[name] = state
      // Also lock as a state fact
      lockStateFact(ledger, name + '：' + state)
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 4. Fact Extraction — scan turns for new facts
// ═══════════════════════════════════════════════════════════

/**
 * After each turn, extract new facts from what just happened.
 * Called AFTER the LLM reply is generated.
 *
 * @param {object} ledger
 * @param {string} userInput — what the player just said/did
 * @param {string} aiReply — what the character(s) just said/did
 * @param {object} context — { characterNames, playerName }
 */
export function extractTurnFacts(ledger, userInput, aiReply, context = {}) {
  if (!ledger || !aiReply) return ledger

  const playerName = context.playerName || '玩家'
  const charNames = context.characterNames || []

  // ── Extract player actions from user input ──
  if (userInput && userInput.trim()) {
    // Player said something → lock it
    lockActionFact(ledger, playerName + '说：' + userInput.slice(0, 100))

    // Detect key player actions
    const lower = userInput.toLowerCase()
    if (/脱|解[开扣]|褪[下去]|赤裸/.test(lower)) {
      lockActionFact(ledger, playerName + '脱掉了衣服')
    }
    if (/走|离开|出去|滚/.test(lower)) {
      lockActionFact(ledger, playerName + '表达离开/疏远的意图')
    }
    if (/爱|喜欢|在乎|想你/.test(lower)) {
      // Lock ONLY if explicitly said — don't infer
      if (/我爱你|我喜欢你|我在乎你|我想你/.test(userInput)) {
        lockActionFact(ledger, playerName + '表达了感情')
      }
    }
  }

  // ── Extract character actions from AI reply ──
  for (const name of charNames) {
    if (!aiReply.includes(name)) continue

    // Detect clothing state changes
    if (/脱[掉下了去]|解开|褪[去下]|赤裸|裸露|光着/.test(aiReply) && aiReply.includes(name)) {
      const isNaked = /赤裸|全裸|一丝不挂|光着身子|脱[光净]/.test(aiReply)
      const state = isNaked ? '全身赤裸' : '衣物已被脱去部分'
      updateSceneState(ledger, {
        characterStates: { [name]: state },
      })
      lockStateFact(ledger, name + '当前' + state)
    }

    // Detect location
    const locMatch = aiReply.match(/(?:在|坐在|躺在|站在|靠在)([^，。！？\n]{2,10})/)
    if (locMatch && !ledger.sceneState.location) {
      ledger.sceneState.location = locMatch[1]
    }

    // Detect key character actions
    if (/离开|走了|出去|摔门/.test(aiReply) && aiReply.includes(name)) {
      lockActionFact(ledger, name + '离开或试图离开')
    }
    if (/拒绝/.test(aiReply) && aiReply.includes(name)) {
      lockRelationshipFact(ledger, name + '曾在对话中明确拒绝')
    }
    if (/吻|亲|舔|咬/.test(aiReply) && aiReply.includes(name)) {
      lockActionFact(ledger, name + '有亲密身体接触——此事实不可抹除或淡化')
    }
  }

  // ── Generate forbidden facts from what DIDN'T happen ──
  // If player hasn't said "I love you", the model can't claim they did
  const forbiddenChecks = [
    { condition: !/我爱你/.test(userInput || ''), fact: playerName + '从未说过"我爱你"——禁止角色声称玩家说过' },
    { condition: !/我想你/.test(userInput || ''), fact: playerName + '从未说过"我想你"——禁止角色声称玩家说过' },
    { condition: !/我答应|我同意|我愿意/.test(userInput || ''), fact: playerName + '从未承诺或同意任何关系——禁止角色声称玩家同意了某事' },
  ]
  for (const check of forbiddenChecks) {
    if (check.condition) lockForbiddenFact(ledger, check.fact)
  }

  return ledger
}

// ═══════════════════════════════════════════════════════════
// 5. Prompt Builder — the enforcement block
// ═══════════════════════════════════════════════════════════

/**
 * Build the FACT LEDGER enforcement block for prompt injection.
 * This goes into EVERY turn's system prompt, before the LLM generates.
 *
 * It tells the LLM:
 *   1. What IS true (locked facts)
 *   2. What CANNOT be said (forbidden facts)
 *   3. What the current physical state is
 */
export function buildLedgerBlock(ledger) {
  if (!ledger) return ''

  const lines = [
    '【🔒 FACT LEDGER —— 不可篡改的事实账本】',
    '',
    '⚠️ 以下事实是"已发生的真实事件"，不是建议，不是参考。',
    '⚠️ 你绝对不能在叙事中违反、修改、淡化、或"重新诠释"这些事实。',
    '⚠️ 如果一句话和这些事实冲突 → 那句话是幻觉，删掉。',
    '',
  ]

  // ── Scene state (most immediate) ──
  if (ledger.sceneState.location || Object.keys(ledger.sceneState.characterStates).length > 0) {
    lines.push('━━━ 🔴 当前场景状态（物理现实——绝不改变）━━━')
    if (ledger.sceneState.location) {
      lines.push('· 地点：' + ledger.sceneState.location)
    }
    if (ledger.sceneState.timePhase) {
      lines.push('· 时间：' + ledger.sceneState.timePhase)
    }
    for (const [name, state] of Object.entries(ledger.sceneState.characterStates)) {
      lines.push('· ' + name + '：' + state + ' ← 这是此刻的物理状态，禁止自己改变')
    }
    lines.push('· ⚠️ 角色不能"突然穿好衣服""突然起身离开""场景突然切换"——除非有明确的过渡动作')
    lines.push('')
  }

  // ── Identity facts ──
  if (ledger.identityFacts.length > 0) {
    lines.push('━━━ 身份事实（角色都知道的硬事实）━━━')
    for (const fact of ledger.identityFacts.slice(-10)) {
      lines.push('· ' + fact)
    }
    lines.push('')
  }

  // ── Action facts (recent, what happened) ──
  if (ledger.actionFacts.length > 0) {
    lines.push('━━━ 已发生事件（时间线——不可改写）━━━')
    for (const fact of ledger.actionFacts.slice(-10)) {
      lines.push('· ' + fact)
    }
    lines.push('· ⚠️ 以上事件已发生。不能"重新发生"一遍。不能"才发现"。不能"忘记"。')
    lines.push('')
  }

  // ── Relationship facts ──
  if (ledger.relationshipFacts.length > 0) {
    lines.push('━━━ 关系事件（不可回退）━━━')
    for (const fact of ledger.relationshipFacts.slice(-8)) {
      lines.push('· ' + fact)
    }
    lines.push('· ⚠️ 关系不能"回退"。拒绝就是拒绝。发生就是发生。')
    lines.push('')
  }

  // ── State facts ──
  if (ledger.stateFacts.length > 0) {
    lines.push('━━━ 状态快照（此刻的物理事实）━━━')
    for (const fact of ledger.stateFacts.slice(-8)) {
      lines.push('· ' + fact)
    }
    lines.push('')
  }

  // ── Forbidden facts (CANNOT say) ──
  if (ledger.forbiddenFacts.length > 0) {
    lines.push('━━━ 🚫 禁止生成的内容（这些事没有发生——不能编造）━━━')
    for (const fact of ledger.forbiddenFacts.slice(-10)) {
      lines.push('× ' + fact)
    }
    lines.push('')
  }

  lines.push('━━━ 事实账本铁律 ━━━')
  lines.push('1. 禁止生成账本中不存在的历史事件——你不能"补剧情"')
  lines.push('2. 禁止修改账本中已有事实——发生过的不能被改写')
  lines.push('3. 禁止"回溯性补剧情"——不能这轮说上轮发生了没发生的事')
  lines.push('4. 所有历史必须来自账本，不是模型猜测')
  lines.push('5. 如果不知道某个事实 → 让角色也不知道，而不是编造')
  lines.push('6. 场景状态不会自己改变——赤裸不会变半裸，半裸不会变穿好衣服')

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════
// 6. State Continuity Tracker
// ═══════════════════════════════════════════════════════════

/**
 * Before each turn, check the current scene state and ensure continuity.
 * If last turn ended with character naked, lock that fact.
 */
export function enforceSceneContinuity(ledger, lastAIMessage) {
  if (!ledger || !lastAIMessage) return ledger

  // Detect current clothing state from the last AI reply
  for (const [name] of Object.entries(ledger.sceneState.characterStates || {})) {
    const currentState = ledger.sceneState.characterStates[name]
    if (!currentState) continue

    // If character was naked last turn, reinforce it
    if (/赤裸|全裸|一丝不挂|光着/.test(currentState)) {
      lockStateFact(ledger, name + '此刻依然是赤裸的——衣物没有自己穿回去')
      lockForbiddenFact(ledger, '禁止声称' + name + '已经穿好衣服或变成半裸——ta依然是赤裸的')
    }
  }

  return ledger
}

// ═══════════════════════════════════════════════════════════
// 7. Pre-Turn Setup — initialize identity facts from character
// ═══════════════════════════════════════════════════════════

/**
 * Seed the ledger with identity facts from character and player profile.
 * Called once when the ledger is first created.
 */
export function seedIdentityFacts(ledger, character, playerProfile) {
  if (!ledger) return

  // Player identity
  if (playerProfile?.name && playerProfile.name !== '玩家' && playerProfile.name !== '新玩家') {
    lockIdentityFact(ledger, '玩家名字=' + playerProfile.name + '——所有角色必须用此名称呼，禁止编造其他名字')
    if (playerProfile.gender) {
      lockIdentityFact(ledger, '玩家性别=' + playerProfile.gender)
    }
    if (playerProfile.description) {
      lockIdentityFact(ledger, '玩家背景：' + playerProfile.description.slice(0, 300))
    }
    // Generate forbidden facts from player identity
    lockForbiddenFact(ledger, '禁止用"王总""小姐""沈总""那个谁"等编造的名字称呼玩家——玩家的名字是' + playerProfile.name)
  }

  // Character identities
  const rcList = character?.romanceCharacters || []
  for (const rc of rcList) {
    if (!rc.name) continue
    if (rc.personality) lockIdentityFact(ledger, rc.name + '的性格=' + rc.personality.slice(0, 100))
    if (rc.background) lockIdentityFact(ledger, rc.name + '的背景=' + rc.background.slice(0, 200))
  }

  return ledger
}
