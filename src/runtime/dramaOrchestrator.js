/**
 * Drama Scene Orchestrator v1 — 剧情场景编排器
 *
 * Solves: "why does this scene exist?" not "what to say next?"
 *
 * Architecture:
 *   SceneState → TensionGraph → IntentResolver → ConflictInjector → SceneTransition
 *   ↓
 *   Dialogue Delegate (LLM)
 *
 * Core principle:
 *   ❌ 玩家说一句 → 所有人回应一句（聊天系统）
 *   ✅ 场景决定谁说话 / 张力决定谁被压制 / 冲突决定谁失控
 */

// ═══════════════════════════════════════════════════════════
// Scene State
// ═══════════════════════════════════════════════════════════

export function createSceneState(location = '', time = '') {
  return {
    location: location || '未指定',
    time: time || '未指定',
    participants: [],
    tension: 30,           // 0-100，场景内在张力
    stability: 60,         // 0-100，越低越容易爆剧情
    activeConflict: null,
    lastEvent: null,
    turnInScene: 0,
    scenePhase: 'setup',   // setup → rising → crisis → release
  }
}

// ═══════════════════════════════════════════════════════════
// Scene Events — what CAN happen (not dialogue)
// ═══════════════════════════════════════════════════════════

const SCENE_EVENTS = {
  setup: [
    '建立场景氛围', '角色初次登场', '暗示潜在冲突', '铺垫关系张力',
  ],
  rising: [
    '误会升级', '第三方介入', '情绪冷却失败', '关系试探',
    '信息泄露', '态度转变', '边界被侵犯', '旧事重提',
  ],
  crisis: [
    '冲突爆发', '不可挽回的话说出口', '物理对峙', '真相揭露',
    '被迫选择', '情绪彻底失控', '关系破裂边缘', '第三方插足',
  ],
  release: [
    '短暂平静', '反思与回味', '新的裂痕', '余波未平',
    '下一轮冲突的种子', '关系重新校准',
  ],
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ═══════════════════════════════════════════════════════════
// Phase transition logic
// ═══════════════════════════════════════════════════════════

const PHASE_TRANSITIONS = {
  setup: 'rising',
  rising: 'crisis',
  crisis: 'release',
  release: 'setup',
}

// ═══════════════════════════════════════════════════════════
// Drama Scene Orchestrator
// ═══════════════════════════════════════════════════════════

export const DramaOrchestrator = {

  /**
   * Initialize a scene from character data and folder context.
   */
  initScene(character, folder) {
    const scene = createSceneState(
      character.worldSetting?.slice(0, 100),
      '当前'
    )
    scene.participants = (character.romanceCharacters || [])
      .map(rc => rc.name)
      .filter(Boolean)
    if (character.protagonistName) {
      scene.participants.push(character.protagonistName)
    }
    if (folder?.worldview) {
      scene.location = folder.worldview.slice(0, 80)
    }
    return scene
  },

  /**
   * Determine if the scene should advance to the next phase.
   */
  shouldAdvanceScene(scene) {
    const tensionTrigger = scene.tension > 65
    const instabilityTrigger = scene.stability < 40
    const turnTrigger = scene.turnInScene > 5 && Math.random() < 0.3

    return tensionTrigger || instabilityTrigger || turnTrigger
  },

  /**
   * Detect emotional spikes from USK state.
   */
  detectEmotionalSpike(uskState) {
    if (!uskState) return false
    const emo = uskState.emotion || {}
    return (emo.anger || 0) > 40 ||
           (emo.jealousy || 0) > 40 ||
           (emo.sadness || 0) > 50
  },

  /**
   * Generate a scene event for the current phase.
   * This is NOT dialogue — it's a narrative beat that the LLM will flesh out.
   */
  generateSceneEvent(scene) {
    const events = SCENE_EVENTS[scene.scenePhase] || SCENE_EVENTS.setup
    return {
      type: 'scene_event',
      name: pick(events),
      intensity: scene.tension,
      phase: scene.scenePhase,
    }
  },

  /**
   * Update tension based on the interaction type.
   */
  updateTension(scene, interactionType) {
    let t = scene.tension
    const deltas = {
      conflict: +15,
      jealousy: +15,
      rejection: +20,
      rupture: +25,
      intimacy: -10,
      soft_reply: -10,
      reconciliation: -20,
    }
    t += deltas[interactionType] || 0
    return Math.max(0, Math.min(100, t))
  },

  /**
   * Shuraba (修罗场) detection — 2+ characters both have affection > 60 AND tension > 70.
   * When triggered, forces multi-character confrontation.
   */
  detectShuraba(uskCharacters, threshold) {
    if (!uskCharacters) return false
    const highAffectionChars = Object.entries(uskCharacters)
      .filter(([, s]) => (s.relationship?.affection || 0) > 60)
    return highAffectionChars.length >= 2 && (threshold || 70) > 70
  },

  /**
   * Sync scene state to USK global_state.
   */
  syncToUSK(usk, scene) {
    if (!usk?.global_state) return usk
    usk.global_state.world_tension = scene.tension
    usk.global_state.narrative_phase = scene.scenePhase
    usk.global_state.timeline_pointer = scene.turnInScene
    usk.global_state.folder_mood = Math.max(0, Math.min(100, 50 - (scene.tension - 30) * 0.5))
    return usk
  },

  /**
   * Advance the scene — check triggers, generate event, update phase.
   * Called once per turn BEFORE the LLM prompt is built.
   *
   * @returns {{ scene, event, advanced }} — updated scene + event descriptor
   */
  advance(scene, uskState, interactionType) {
    // Update tension from interaction
    if (interactionType) {
      scene.tension = this.updateTension(scene, interactionType)
    }

    // Update stability based on emotional state
    if (uskState) {
      const spike = this.detectEmotionalSpike(uskState)
      if (spike) scene.stability -= 10
      else scene.stability = Math.min(100, scene.stability + 3) // natural recovery
    }

    scene.turnInScene++

    // Check if scene should advance
    if (!this.shouldAdvanceScene(scene)) {
      return { scene, event: null, advanced: false }
    }

    // Generate event and advance phase
    const event = this.generateSceneEvent(scene)
    scene.lastEvent = event
    scene.tension = Math.min(100, scene.tension + 10)
    scene.stability = Math.max(0, scene.stability - 15)
    scene.scenePhase = PHASE_TRANSITIONS[scene.scenePhase] || 'setup'
    scene.turnInScene = 0

    return { scene, event, advanced: true }
  },

  /**
   * Build the orchestrator's prompt injection for the GM/LLM.
   * This goes into the system prompt to guide narrative direction.
   */
  buildDirectorPrompt(scene) {
    const phaseLabels = {
      setup: '铺垫期 — 建立场景、暗示冲突',
      rising: '上升期 — 张力升级、矛盾浮现',
      crisis: '危机期 — 冲突爆发、不可挽回',
      release: '释放期 — 短暂平静、新裂痕',
    }

    const lines = [
      '【🎬 剧情导演系统——场景编排指令】',
      '',
      '当前场景状态：',
      '· 地点：' + scene.location,
      '· 时间：' + scene.time,
      '· 张力：' + scene.tension + '/100',
      '· 稳定度：' + scene.stability + '/100',
      '· 阶段：' + (phaseLabels[scene.scenePhase] || scene.scenePhase),
      '· 本场景已进行：' + scene.turnInScene + ' 轮',
    ]

    if (scene.lastEvent) {
      lines.push('')
      lines.push('⚠️ 本轮触发了场景事件：【' + scene.lastEvent.name + '】')
      lines.push('强度：' + scene.lastEvent.intensity + '/100')
      lines.push('这意味着场景正在发生变化。你的回复应该回应这个事件，而不是无视它。')
    }

    lines.push('')
    lines.push('导演指令：')
    lines.push('· 你不是在"回复消息"，你是在"推进这一幕剧情"')
    lines.push('· 每个角色的反应必须有差异——不要平均分配戏份')
    lines.push('· 必须有人被压制 / 被忽略 / 被打断')
    lines.push('· 场景不能在你手里终结——每段回复必须以钩子结尾')
    lines.push('· 当前的阶段决定了节奏：' + (phaseLabels[scene.scenePhase] || ''))

    if (scene.tension > 70) {
      lines.push('· ⚠️ 高张力场景：角色情绪接近失控，随时可能爆发')
      lines.push('· 🔥 修罗场条件已满足：必须安排多角色交叉攻击/误解/争夺，不能只写一个角色')
    }
    if (scene.stability < 30) {
      lines.push('· ⚠️ 低稳定度：任何小事都可能引发连锁反应')
    }

    return lines.join('\n')
  },
}
