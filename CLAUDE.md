# JSJG Character OS v8.5.7 — 进攻型prompt重构 + DarkAction引擎升级 + Claude Code Skills

> 最后更新：2026-07-01（v8.5.7 /diagnose 根因修复：recency bias位置强化 + DarkAction等级引擎重构 + 好感度弹窗移除）
> 仓库：https://github.com/yang15165068776-jpg/-.git
> 部署：https://jsjg.vercel.app

## 版本进化

```
v6.5: 聊天式 AI（prompt 拼接 → 模型自由发挥）
v7.0: 叙事状态机（Identity + Canon 双核 → 4 锁约束）
v7.1: 双行为核（DarkAction + Desire 并行）
v8.0: NOS 叙事操作系统（五层架构 + 运行时编排器）
v8.1: 角色边界侵犯系统（人格感知闸门 + 物理行动主动权 + 人设忠诚原则）
v8.2: 粗粝直白+永不放手+簧片级性描写+精神极端化人格分级
v8.3: Grok 风格移植 — 五层写作技法叠加（慢烧→权力动态→身体叙事→碎句→反重复）
v8.4: 🧠 自主性五层栈 — 角色从"工具"升级为"演员"（AIIS+ANDS+DAS+DCS+NDOS）
v8.5: 🗃️ 缓存前缀架构 — 角色人设从首轮注入→缓存每轮全量（characterPrefix.js）
      + 角色同质化修复 + 存档隔离 + 长上下文状态锁 + token/轮次持久化
v8.5.1: ⚙️ CEK v1 — behaviorLocks（状态锁死+行为归因+提前人格修正）
v8.5.2: ⚙️ CEK v2 — 9-layer Industrial（Compiler+BVM+Firewall+Stabilizer+AntiOOC+
        EmotionCurve+Anchoring+Desire+Conflict）
v8.5.3: ⚙️ CEK v3 — Narrative Economy（EmotionEconomy+Tension+Rivalry+
        Explosion+DirectionLock+AttentionSplit）
v8.5.4: 🎬 CEK v4 — Autonomous Narrative Director（IntentGenerator+SceneDirector+
        CharacterPlanner+AttentionWar+ConflictSim+Branching）
v8.5.5: 🔧 好感度系统修复（Judge 5→3轮/±3→±5/AI回复事后触发/日常模式接入/
        _worldState同步USK）+ 反RLHF对齐泄漏（人格释放指令）+ 
        缓存搬迁（行为核模板+人格释放→CHARACTER_PREFIX，~2500 token/轮节省）
v8.5.6: ⚔️ 角色张力修复 — 人格层进攻型重构（"可以"→"必须"32处）
        + 行为底线配额（每轮5条破坏性指标）+ 黑暗人格混沌协议
        + 自毁式攻击核 + 张力自检4→8条升级
v8.5.7: 🔥 进攻型prompt重构 + DarkAction引擎升级（/diagnose 根因修复）
        【Prompt层】recency bias位置强化（5文件）:
          - buildStateReinforcement 重写: 3行弱引用→每角色强制进攻配额(至少3/5条)
          - buildASLReinforcement 升级: 防守型→进攻+防守(6条必须+8条禁止)
          - 行为核引用: 每等级附带具体行为描述(DARK_ACTION_DESC/DESIRE_DESC/PHYSICAL_DESC)
          - CEK v4: pursuer/confrontational 进攻型 action/strategy overlay
          - 新增 buildOffensiveTail: 角色专属尾注(ASL前, 最大recency bias)
        【引擎层】DarkActionKernel 等级决策重构（1文件）:
          - 黑暗角色基准 Lv2→Lv3, pursuer +1, confrontational+dark +1
          - 张力阈值 70/50→60/35, 低好感加成 +1→+2
          - 愤怒阈值 60→40, 嫉妒阈值 50→30
          - 反均值化: 3轮检查(was 5), Lv≤2触发(was ≤1), 平均<2.5→Lv3(was <2.0)
          - 40%概率跳Lv4(was 20%), 张力门槛 40→25
          - pursuer warm cap 3→4
          - 指令语言: "允许"→"必须"
        【体验】好感度裁判 alert→console.log, 仅通过UI好感度条表现
```

---

## 技术栈
- React 18 + Vite
- 样式：内联 CSS 变量（白底灰框黑字，无 Tailwind 残留）
- 数据：localStorage（USK per-save + Memory Graph per-save + CPS per-save + Story Canon per-save + Fact Ledger per-save）
- API：DeepSeek（Settings 页用户自选模型，128K 上下文，max_tokens 4096）
- 路由：NavigationEngine（自建 push/pop 栈）

---

## 0. Prompt 三层缓存架构（v8.5）

```
┌─ CORE_SYSTEM_PREFIX (always cached) ─────────┐
│  系统铁律：反修复、簧片描写、永不放手、人格基线│  cachePrefix.js
└──────────────────────────────────────────────┘
┌─ CHARACTER_PREFIX (cached, regen on stage change) ─┐
│  ASL + 写作范本 + 反平滑                            │  characterPrefix.js
│  角色人设 + 完整好感度行为锁（含languageSamples等）  │
│  世界观 + 权力动态 + 修罗场规则 + 钩子铁律          │
│  宪法效力声明 + 人格感知行为锁尾注                   │
└────────────────────────────────────────────────────┘
┌─ VARIABLE_SUFFIX (every turn) ─────────────────┐
│  反驯化/暖色补充（条件满足时注入，每轮检测）     │  narratorPrompt.js
│  世界快照 + 叙事提示                             │
│  玩家输入 + 行为核指令(DarkAction/Desire等)       │
│  🆕 状态锁（紧挨对话历史，抗长上下文漂移）         │
└────────────────────────────────────────────────┘
```

### 运行时编排器（Runtime Orchestrator）— v8.5.4 Pipeline

```
每一轮 NOS 运行循环（v8.5.4 完整版）：
  ① INPUT_PARSE      — 分类玩家输入
  ①.5 CHAR_PREFIX    — 🗃️ 缓存前缀检测（阶段变化时重建，含 CEK v4 静态规则）
  ② CONSTITUTION     — 构建 CCL 宪法层
  ③ FACT_SYNC        — Fact Ledger 同步 + 注入
  ④ STATE_UPDATE     — USK 状态快照
  ⑤ RELATIONSHIP     — ARSL + Agency + World Engine tick
  ⑤.5 AIIS_TICK      — 🧠 日常自主消息调度
  ⑤.6 ANDS_TICK      — 🎭 剧情角色主动性
  ⑤.7 DAS_TICK       — 🌋 世界自动驾驶
  ⑤.8 DCS_DIRECT     — 🎛️ 导演控制
  ⑤.9 NDOS_DIRECT    — 🎬 导演大脑（5决策 → Scene Card）
  ⑥ EVENT_TICK       — Event Graph 因果链上下文
  ⑦ CAUSAL_UPDATE    — DarkAction + Desire + Initiative 行为层指令
  ⑦.5 CEK_EXECUTE    — 🎬 CEK v4 自主叙事导演（9系统: Intent→Scene→Plan→War→Sim→Branch）
  ⑧ NARRATIVE_BUILD  — prompt 组装（core + character + variable）
  ⑨ OUTPUT_RENDER    — LLM 生成
→ ⑩ CEK v4 Post-Validation（软校验: 锚定/防火墙/无张力对话）
→ ⑪ 存档持久化 + 好感度裁判（每5轮 LLM judge + alert 诊断弹窗）
```

---

## 1. 文件清单（v8.5）

```
src/
├── runtime/
│   ├── characterConstitution.js       # ⚖️ CCL — 角色宪法层（每轮注入，最高优先级）
│   ├── factLedger.js                  # 🔒 Fact Ledger — 不可篡改事实账本
│   ├── eventGraph.js                  # 📊 Event Graph — 结构化事件节点 + 因果链
│   ├── relationshipPhysics.js         # 🔗 ARSL — 非对称关系力场（自动演化）
│   ├── autonomousWorldEngine.js       # 🌍 ADOE — 世界自驱引擎（注意力+概率事件）
│   ├── agencyEngine.js                # 🚀 Agency Engine — 角色自主行动（非玩家驱动）
│   ├── desireKernel.js                # 🔥 Desire Kernel — 5级欲望推进层（簧片级指令）
│   ├── darkActionKernel.js            # 🔴 Dark Action Kernel — 5级冷暴力层
│   ├── characterInitiativeKernel.js   # 🎯 Initiative Kernel — 5级物理行动决策
│   ├── aggressionProfile.js           # 🧬 人格侵略性分类（pursuer/confrontational/aloof/gentle）
│   ├── alignmentSuppression.js        # 🛡️ ASL — 对齐反制层
│   ├── antiSmoothing.js               # 🔒 EPI — 人格稳定器
│   ├── dramaOrchestrator.js           # 🎬 修罗场引擎（Conflict Graph + 注意力分配）
│   ├── runtimeOrchestrator.js         # 🚀 NOS Runtime Orchestrator — 主时钟编排器（v8.4：含自主性五层栈）
│   ├── stateLocks.js                  # 🔒 4 锁校验（Identity/Event/Persona/Shape）
│   ├── dailyGuard.js                  # 💬 Daily 守护（关系门禁 + 叙事压制 + AIIS意图注入）
│   ├── conflictPersistence.js         # 🔗 CPS — 冲突持久化系统
│   ├── powerDynamics.js               # ⚡ 权力动态引擎
│   │
│   │  # ═══ v8.4 自主性五层栈 ═══
│   ├── autonomousInitiativeSystem.js  # 🧠 AIIS — 日常自主消息调度
│   ├── autonomousNarrativeDrive.js    # 🎭 ANDS — 剧情角色主动性
│   ├── dramaAutopilot.js              # 🌋 DAS — 剧情自动驾驶
│   ├── dramaControlSystem.js          # 🎛️ DCS — 导演控制系统
│   └── narrativeDirectorOS.js         # 🎬 NDOS — 统一导演大脑
│
│   # ═══ v8.5.x CEK 角色执行内核 ═══
│   ├── behaviorLocks.js               # ⚙️ CEK v1 — 状态锁死+行为归因+人格修正
│   ├── characterExecutionKernel.js    # ⚙️ CEK v1 — 完整版（CSM+BPM+MAE+EV）
│   ├── characterExecutionKernelV2.js  # ⚙️ CEK v2 — 9-layer Industrial
│   ├── characterExecutionKernelV3.js  # ⚙️ CEK v3 — Narrative Economy
│   └── characterExecutionKernelV4.js  # 🎬 CEK v4 — Autonomous Narrative Director ★ACTIVE
│
├── state/
│   ├── identityKernel.js            # 🔵 玩家身份单源锁
│   ├── storyCanon.js                # 🔴 故事正典（不可变时间线 + 锁定事实）
│   ├── unifiedStateKernel.js        # 📊 USK — 统一状态核
│   └── stateBridge.js               # 🌉 状态桥接层（UI ↔ USK）
│
├── agents/
│   └── coordinator.js               # 🎭 Agent 协调器（NPC + LLM 调用 + v8.4五层栈注入）
│
├── prompt/
│   ├── cachePrefix.js               # 📦 DeepSeek 缓存前缀（v8.3五层写作栈）
│   ├── characterPrefix.js            # 🗃️ v8.5 角色缓存前缀（人设+行为锁+宪法效力，阶段变化时重建）
│   └── v3/
│       └── narratorPrompt.js        # 📝 Narrator Prompt v3（变量后缀组装 + v8.5状态锁注入）
│
├── pages/
│   ├── DramaPage.jsx                # 📖 剧情模式
│   ├── DailyPage.jsx                # 💬 日常模式（v8.4：AIIS驱动自主消息）
│   ├── CreateFolder.jsx             # 📁 创建新世界（含AI智能填充）
│   └── story/
│       └── StoryCharacterForm.jsx   # 📝 剧情角色编辑表单
│
└── utils/
    ├── deepseek.js                  # 🔌 DeepSeek API
    └── writing-samples.txt          # ✍️ 写作范本（行为模式参考）
```

---

## 2. v8.4 自主性五层栈 — 核心架构

> ❗从 v8.3 到 v8.4 的本质跃迁：角色不再是"回应者"，而是"剧中人"。

### 2.0 五层栈总览

```
AIIS (Daily)  →  "角色自己想发消息"        autonomousInitiativeSystem.js
ANDS (Drama)  →  "角色自己想抢剧情"        autonomousNarrativeDrive.js
DAS  (World)  →  "世界自己制造戏剧"        dramaAutopilot.js
DCS  (Control) → "导演控制爽感和节奏"      dramaControlSystem.js
NDOS (Director)→ "AI像爽文导演拍连续剧"    narrativeDirectorOS.js
```

### 2.1 AIIS — Autonomous Intent & Initiative System（日常模式）

角色"脑子里想什么"→"什么时候说"。不再是玩家说了才回。

| 子模块 | 功能 |
|--------|------|
| MotivationField | 从 USK + ARSL 计算 5 维动机（curiosity/jealousy/attachment/dominance/insecurity） |
| IntentGenerator | 9 种意图类型，加权选择（message_contact/probe_test/provoke/jealousy_show/cold_shoulder…） |
| BurstScheduler | 强度阈值 + 冷却 + 情绪尖峰绕过 + 人格区间（pursuer=15s, gentle=120s） |
| ActionFilter | 人格+好感度门禁（gentle禁挑衅，aloof禁突然关心，低好感阻断亲密意图） |

### 2.2 ANDS — Autonomous Narrative Drive System（剧情模式角色主动性）

角色不只是"说话"，而是"行动"——开场、对峙、诱惑、抽离、制造危机。

| 子模块 | 功能 |
|--------|------|
| AutonomyScore | 0-100 自主性评分（人格基底 + 情绪放大 + 场景动态 + 无聊累积） |
| NarrativeIntents | 11 种叙事意图（initiate_scene/confront/seduce/withdraw/create_crisis/summon_third…） |
| WorldAwareness | 角色感知世界（威胁/机会/其他角色行为/隐藏冲突） |
| InitiativeScheduler | autonomy>70 可打断玩家节奏（Initiative Override） |
| ConstraintFilter | 人格过滤（gentle禁confront，aloof禁seduce）+ 频率上限 |

### 2.3 DAS — Drama Autopilot System（世界剧情自动驾驶）

"故事太平静"是 bug。DAS 检测并注入戏剧事件。

| 子模块 | 功能 |
|--------|------|
| TensionMonitor | 检测 TOO_CALM / STAGNANT / RISING / CRITICAL 四种状态 |
| SceneScheduler | 6 种场景类型，按张力状态自动切换（forced_proximity/public_confrontation…） |
| ConflictInjector | 8 种冲突类型库（misunderstanding/possessiveness_eruption/secret_exposed…） |
| RelationshipPressure | pressure = attraction+jealousy+dependency-stability；>80 强制破裂 |
| NarrativeInterrupt | 打断流畅对话（emotional_interrupt/event_interrupt/scene_transition…） |

### 2.4 DCS — Drama Control System（导演控制层）

DAS 制造事件，DCS 控制"发生什么、对谁发生、节奏对不对"。

| 子模块 | 功能 |
|--------|------|
| TensionController | 按阶段维护目标张力区间（setup:25-40, crisis:65-85），检测越界 |
| SpotlightEngine | 玩家焦点守卫——焦点<40% 强制拉回，非玩家分支>2 则折叠 |
| ConflictDirector | 7 级"爽点"冲突优先级（jealousy_rivalry > possessiveness_claim > forced_confrontation…） |
| PacingManager | 6 拍节奏周期：calm→tension→conflict→payoff→release→escalate→repeat |
| BranchLimiter | maxActiveBranches=2，超限折叠最旧分支或合并同焦点分支 |

### 2.5 NDOS — Narrative Director OS（统一导演大脑）

**不是"AI生成故事"，而是"AI在导演连续剧"。**

每轮 5 个导演决策：

| 决策 | 功能 | 产出 |
|------|------|------|
| evaluateScene | 读取全状态 → 结构化场景评估 | phase/主情绪/情绪强度/最大压强 |
| chooseTone | 6 种调性（tense_cold/heated_explosive/dangerous_seductive/suffocating_possessive/wounded_raw/electric_uncertain） | 调性 + 语体风格指令 |
| selectFocusCharacter | 永远 1 个主焦点（玩家）+ 最多 1 个副焦点 | 镜头分配 + 驱动源 |
| decideConflictLevel | 0-4 硬规则冲突等级（0=过渡→4=不可逆） | 冲突等级 + 执行要求 |
| decideNarrativeMove | 7 种叙事动作（push_forward/escalate/reveal/confront/seduce/withdraw_impact/turnaround） | 动作 + 场景结构 |

输出：**Scene Card（本幕戏卡）**
```
[场景] → [角色行为] → [冲突推进] → [情绪变化]
```

---

## 3. 行为核系统（每轮并行注入）

### Dark Action Kernel — 5级冷暴力

| Lv | 名称 | 行为 |
|----|------|------|
| 1 | 安全层 | 冷淡、敷衍 |
| 2 | 轻冲突 | 讽刺、阻断话题、拒绝顺从 |
| 3 | 关系破坏 | 取消约定、翻旧账、与第三人亲密刺激玩家、堵路逼近、情绪跳变 |
| 4 | 极端行为 | 威胁断裂、动手推搡按墙、当玩家面与第三人接吻/做爱、精神极端化 |
| 5 | 黑暗核心 | 操控、情绪惩罚、物理强制、暴力升级、当玩家面操别人、杀人虐杀、完全失控 |

### Desire & Physicality Kernel — 5级欲望推进

| Lv | 名称 | 行为 |
|----|------|------|
| 1 | 潜伏期 | 喉结滚动、呼吸微乱 |
| 2 | 试探期 | 故意放慢语速、"无意"触碰、语言性侵略（荤话/脏话/性邀请） |
| 3 | 主动期 | 明确生理状态、器官名+动作、脏话、禁止侧面描写 |
| 4 | 失控期 | 腰自己顶、啃咬不是亲吻、喘息节奏+舌头细节+肉体声音 |
| 5 | 崩坏期 | 簧片级：器官名+动作+感受+声音+痕迹+高潮全过程，禁止一切隐喻省略 |

> **攻略型反转**：pursuer 角色欲望与好感度成反比——低好感高欲望（征服驱动）。

### Character Initiative Kernel — 5级物理行动（Drama Mode）

| Lv | 名称 | 行为 |
|----|------|------|
| 0 | 无物理动作 | 仅语言/存在 |
| 1 | 物理存在感 | 逼近、堵路、俯视、呼吸打到皮肤上 |
| 2 | 轻微接触 | 抓手腕、抬下巴逼对视、拽衣领、推肩膀 |
| 3 | 物理压制 | 按在墙上/桌上、扣住双手、推倒在地、身体压住 |
| 4 | 暴力冲突 | 扇耳光、掐脖子、拳打脚踢、撕衣物、摔打 |
| 5 | 极限侵犯 | 强暴、持续殴打致伤、工具压制、不可逆侵犯 |

> **人格上限**：pursuer=Lv5 / confrontational=Lv4 / aloof=Lv3 / gentle=Lv1

### Aggression Profile — 人格侵略性分类（四级）

| Profile | 关键词 | 不放手方式 | 物理上限 | 自主性基底 |
|---------|--------|-----------|---------|-----------|
| pursuer | 花心、霸道、轻浮、风流、病娇、疯批… | 暴力+性+控制 | Lv5 | 65 (最高) |
| confrontational | 傲娇、毒舌、腹黑、恶劣、暴戾… | 对抗+语言暴力+堵门 | Lv4 | 50 |
| aloof | 清冷、高冷、城府深、强势、冷酷… | 冷到极点的存在感压制 | Lv3 | 30 |
| gentle | 温柔、善良、阳光、单纯、软萌… | 温柔地不放过 | Lv1 | 10 (最低) |

---

## 4. Prompt 注入顺序（每轮）— v8.4

```
[DeepSeek 缓存前缀]          ← 系统级铁律（自动缓存）
───────────────────────────────────
⚖️ CCL 宪法                  ← 最高优先级
📊 World Snapshot            ← 场景时间地点角色
👤 User Action               ← 玩家本轮输入
───────────────────────────────────
🔒 Fact Ledger               ← 不可篡改事实
📊 Event Graph               ← 因果链 + 最近事件
🌍 World Engine              ← 关系力场 + 注意力 + 事件
🎬 Scene Context             ← 修罗场导演指令
───────────────────────────────────
🧠 AIIS Intent Context       ← v8.4: 角色内在动机（Daily自主消息）
🎭 ANDS Narrative Directive  ← v8.4: 角色叙事主动性（Drama抢剧情）
🌋 DAS Narrative Event       ← v8.4: 世界自动驾驶事件
🎛️ DCS Director's Cut        ← v8.4: 导演控制指令（Spotlight/Pacing/爽点）
🎬 NDOS Scene Card           ← v8.4: 导演大脑本幕戏卡（最高叙事优先级）
───────────────────────────────────
🔴 DarkAction Directive      ← 冷暴力行为层
🔥 Desire Directive          ← 欲望推进层
🎯 Initiative Directive      ← 物理行动权限解锁层
```

---

## 5. v8.3 五层写作栈（cachePrefix.js — 保留不变）

写作技法层（权力动态→慢烧→簧片→身体叙事→粗粝直白+人格日常基线）仍通过 cachePrefix.js 注入，v8.4 未修改此层。

---

## 6. 关键修复记录

| Bug | 原因 | 修复 |
|-----|------|------|
| （前略 v7.0-v8.3 修复，见 git log）|||
| 剧情模式角色"被动等玩家" | 系统只有 prompt 层面的主动性提示，没有独立决策系统 | v8.4 自主性五层栈：AIIS+ANDS+DAS+DCS+NDOS |
| 剧情"像死聊天" | 没有 autopilot 检测"故事太平静" | DAS TensionMonitor + ConflictInjector |
| 剧情无聊、没节奏 | 没有节奏控制器 | DCS PacingManager — 6拍周期强制执行 |
| 修罗场不发生 | 没有冲突注入器 | DAS ConflictInjector + DCS ConflictDirector |
| 世界无限分裂 | 没有分支限制 | DCS BranchLimiter (max 2) + NDOS 单焦点强制 |
| 玩家变成旁观者 | 没有焦点守卫 | DCS SpotlightEngine + NDOS selectFocusCharacter |
| 冲突随机、不"爽" | 冲突生成无优先级 | DCS ConflictDirector — 7级爽点冲突排序 |
| **角色人设仅首轮生效** | 角色身份+行为锁在首轮后不注入 | **v8.5 缓存前缀：characterPrefix.js 全量缓存，每轮可用** |
| **所有角色感觉一样** | 反温柔强制统一追加，CCL截断80字 | **人格感知尾注 + CCL截断300字/200字** |
| **换存档数据混在一起** | saveId被App.jsx丢弃 + 缓存key无saveId + USK用共享key | **三段修复：App.jsx传saveId → HydrationEngine key+saveId → 存档级USK** |
| **60轮后角色漂移** | 长上下文稀释系统prompt权重 | **变量后缀末尾注入状态锁，利用recency bias对抗稀释** |
| **退出存档token/轮次重置** | token和轮次在内存中不持久化 | **每存档dramaStats/dailyStats字段，_autoSave时持久化** |
| **角色不按当前好感度演** | _worldState 仅首回合创建，LLM judge 好感度变更写入 USK 但不回写 _worldState；buildStateReinforcement/buildWorldSnapshot 从 _worldState 读取→拿到的永远是初始/规则级好感→尾部状态锁展示错阶段→LLM 按错误阶段演 | **每轮 runAgentTurn 开头从 USK 同步 affection+stageName+stageIndex 到 _worldState** |
| **好感度增加太慢/不反映到页面** | ① Judge 每5轮才触发 ② pre-reply 触发器只检查用户输入（aiReply=''），AI回复情感内容永不被检测 ③ 日常模式 delta 永远为0（传`delta`字段但USK读`relationship_delta`）④ 每次最大±3 ⑤ 在场检测（rcList≥3时）过度过滤 | **① 5→3轮 ② executeTurn新增AI回复内容事后触发 ③ 日常模式接入judgeDailyAffection + 修正字段名 ④ ±3→±5 ⑤ ≤2角色时跳过在场过滤** |
| **角色不够贴合人设/太温柔/束手束脚** | RLHF对齐泄漏——反温和规则全在prompt头部（10KB+之外），模型在生成时看到对话历史前已被"安全/诚实/温和"的训练本能覆盖 | **buildStateReinforcement尾部新增"人格释放指令"——按四级人格给每角色写行为许可+禁令，放在prompt末尾靠近对话历史处，利用近因效应对抗RLHF** |
| **每轮token消耗过大（行为核指令重复注入）** | DarkAction/Desire/Initiative完整指令模板(~6600字)每轮都注入变量后缀 | **搬迁至CHARACTER_PREFIX缓存——每轮只注入1行LEVEL数字引用(~100字)，节省~2500token/轮** |
| **好感度裁判弹窗打断用户** | 每次LLM judge后alert()弹出，严重打断对话体验 | **v8.5.7 4处alert→console.log，好感度变化仅通过UI条表现** |
| **角色输出平淡被动（堕落浪子等进攻型角色不会主动制造张力）** | 系统行为规则全是防守型（"不准温柔""不准讨好"），没有进攻型（"必须破坏""必须让玩家不安"）。人格释放指令用"可以"（permissive）而非"必须"（imperative）。behaviorLocks低好感时锁角色进"冷漠+算计"压制了pursuer应有的混沌爆发 | **v8.5.6 6项修复（只改characterPrefix.js缓存前缀）：① 人格释放指令重写（"可以撒谎"→"每轮必须制造破坏性事件。不进攻=角色死亡"，32处"必须"）② 新增行为底线配额（每轮5条破坏性指标，至少满足3/5+archetype专属配额）③ 新增黑暗人格混沌协议（覆盖behaviorLocks低好感策略模式——低好感pursuer不是"算计"而是"制造混沌"）④ 自毁式攻击核（"那我就烂给你看"作为黑暗人格终极武器）⑤ 张力自检升级（4→8条，致命违规直接重写）⑥ 进攻型vs防守型比例从~1:10→~2.3:1** |
| **进攻指令在prompt中位置不对——被recency bias稀释** | CORE_PREFIX+CHARACTER_PREFIX的强硬指令在prompt前端/中部（离生成位置~15K+tokens），LLM recency bias使其权重下降。DarkAction等级引擎过于保守（黑暗角色基准Lv2，大多数回合Lv2-3） | **v8.5.7 /diagnose 根因修复——6文件改动：① buildStateReinforcement重写（prompt尾部进攻配额）② buildASLReinforcement升级（进攻+防守，倒数第二system msg）③ 行为核引用强化（每等级具体描述）④ CEK v4进攻型overlay（pursuer/confrontational用破坏性术语）⑤ 新增buildOffensiveTail（ASL前尾注，最大recency bias）⑥ DarkActionKernel等级引擎重构（基准Lv2→Lv3，全阈值降低，反均值化激进）** |

---

## 7. 开发规则

- **数值默认值**：用 `??` 不用 `||`（0 是合法值），但初始化好感度时检查 NaN
- **引擎层**（runtime/）— 所有新模块通过 RuntimeOrchestrator 编排
- **状态层**（state/）— 通过 stateBridge 读写，不直触 raw USK
- **UI 层**（pages/）— 只消费 State Snapshot，不做逻辑决策
- **消息隔离**：dramaMessages / dailyMessages 永不交叉
- **USK 写入隔离**：Daily 不写 tension，Drama 不写 life
- **身份源**：player.name 只能来自 accountStore.activeAccount.name，禁止任何 fallback
- **存档隔离**：所有 per-save 存储均含 saveId
- **上下文窗口**：用户可自主设定，默认 300（Drama）/ 400（Daily）
- **Debug**：alert() 不用 console.log
- **禁止**：Tailwind class、暗黑模式、霓虹色、渐变、阴影
- **CSS**：内联 CSS 变量，430px 手机壳，圆角 12-16px
- **加新层**：在 RuntimeOrchestrator Pipeline 数组里加一个 step，不碰 executeTurn
- **人格分级**：任何行为指令必须考虑四级人格（pursuer/confrontational/aloof/gentle），不能一刀切
- **v8.4 自主性系统**：AIIS(日常) → ANDS(剧情角色) → DAS(世界) → DCS(控制) → NDOS(导演)，所有新决策系统通过此栈

---

## 8. 路线图

```
✅ v7.0: Identity + Canon 双核 + 4 锁 + DarkAction + Orchestrator v3
✅ v7.1: Desire & Physicality Kernel（双行为核并行）
✅ v7.2: Agency Engine（角色自主行动，非玩家驱动）
✅ v7.3: ARSL — 关系物理学引擎（非对称关系力场）
✅ v7.4: ADOE — 世界自驱引擎（注意力 + 概率事件）
✅ v7.5: Fact Ledger v2（不可篡改事实账本）
✅ v7.6: CCL — Character Constitution Layer（角色宪法层）
✅ v7.7: Event Graph + Causal Trace（NTK v2）
✅ v8.0: NOS Runtime Orchestrator（五层架构 + 显式 Pipeline）
✅ v8.1: 角色边界侵犯系统（人格感知闸门 + 物理行动主动权 + 人设忠诚原则）
✅ v8.2: 粗粝直白+永不放手+簧片级性描写+精神极端化人格分级
✅ v8.3: Grok风格移植 — 五层写作技法叠加（权力动态→慢烧→簧片→身体叙事→粗粝直白+人格日常基线）
✅ v8.4: 🧠 自主性五层栈 — AIIS+ANDS+DAS+DCS+NDOS（角色从工具→演员，AI从生成器→导演）
✅ v8.5: 🗃️ 缓存前缀架构 — 角色人设缓存每轮全量 + 存档隔离 + 状态锁
✅ v8.5.1: ⚙️ CEK v1 — behaviorLocks（状态锁死+行为归因+提前人格修正）
✅ v8.5.2: ⚙️ CEK v2 — 9-layer Industrial（Compiler+BVM+Firewall+Stabilizer+AntiOOC+
        EmotionCurve+Anchoring+Desire+Conflict）
✅ v8.5.3: ⚙️ CEK v3 — Narrative Economy（EmotionEconomy+Tension+Rivalry+
        Explosion+DirectionLock+AttentionSplit）
✅ v8.5.4: 🎬 CEK v4 — Autonomous Narrative Director（IntentGenerator+SceneDirector+
        CharacterPlanner+AttentionWar+ConflictSim+Branching）+ 好感度裁判诊断弹窗
✅ v8.5.5: 🔧 好感度系统修复 + 反RLHF对齐泄漏 + 缓存搬迁（~2500token/轮节省）
✅ v8.5.6: ⚔️ 角色张力修复 — 人格层进攻型重构（6项修改，只改characterPrefix.js）
✅ v8.5.7: 🔥 进攻型prompt重构 + DarkAction引擎升级（6文件，/diagnose根因修复）
⬜ v8.6: Emotion Drift System（情绪漂移 — 角色情绪随时间自然波动）
⬜ v8.7: Timeline Forking（时间线分叉 — 多结局支持）
⬜ v9.0: LoRA 微调 — 将 prompt 约束迁移至模型权重（主动性+多人动态）
```

---

## 9. CEK v4 — 自主叙事导演系统 (v8.5.4)

> "CEK v4 = 让AI不再'扮演角色'，而是'导演角色之间的欲望战争'"

### CEK 版本演进

| 版本 | 核心命题 | 关键系统 |
|------|----------|----------|
| v1 | 控制角色不崩 | 状态锁死 + 行为归因 + 人格修正 |
| v2 | 防崩坏体系 | 9-layer: Compiler/BVM/Firewall/Stabilizer/AntiOOC/EmotionCurve/Anchoring/Desire/Conflict |
| v3 | 制造张力 | 情绪经济 + 张力累积 + 修罗场图 + 爆点触发 + 注意力分裂 |
| v4 | **系统导演剧情** | 叙事意图生成 + 场景导演 + 角色自主规划 + 注意力战争 + 冲突模拟 + 叙事分支 |

### v4 关键概念

```
玩家 ≠ 主角
玩家 = 注意力资源中心（角色争夺的"战场"和"奖品"）

角色 ≠ 回应者
角色 = 策略智能体（有隐藏目标，说的和想要的不一样）

AI ≠ 写手
AI = 导演（决定场景、分配焦点、推动冲突升级）
```

### CEK v4 六大新系统

| 系统 | 功能 | 产出 |
|------|------|------|
| 🎬 Narrative Intent Generator | 系统决定这轮写什么故事 | `{ goal, target, method, sceneType }` |
| 🎬 Scene Director Engine | intent → 具体场景指令 | 焦点角色 + 必须/禁止元素 + 退场条件 |
| 🧠 Character Planner | 每角色自主生成策略 | `{ nextAction, hiddenGoal, manipulationLevel, riskTolerance }` |
| ⚡ Attention War | 角色争夺注意力份额 | 4战术(争夺/阻断/引导/替代) + 战场类型 |
| ⚔️ Conflict Simulation | 生成前预测冲突动态 | 冲突拓扑 + 升级路径 |
| 🌿 Narrative Branching | 场景分支自动选择 | escalate/soften/rupture/redirect |

### 缓存架构（v8.5.4 更新）

```
CORE_SYSTEM_PREFIX (always cached)       → cachePrefix.js
CHARACTER_PREFIX (cached, regen on stage) → characterPrefix.js
  ├── ASL + 写作范本 + 权力动态 + 修罗场
  ├── CEK v4 Static Rules (~2KB cached):
  │    Narrative Intent 定义 + Scene 模板 + Character Planner 定义
  │    + Attention War 战术 + Conflict Sim 定义 + Branch 定义
  │    + Constraint Firewall 4层 + Director 铁律
  ├── 🆕 v8.5.5 行为核等级模板 (~2.5KB cached):
  │    DarkAction 6级 + Desire 6级 + Initiative 5级完整指令
  ├── 🆕 v8.5.5 人格释放指令 (~1KB cached):
  │    四级人格(pursuer/confrontational/aloof/gentle)行为许可+禁令
  ├── 🆕 v8.5.6 行为底线配额 (~1KB cached):
  │    每轮5条破坏性指标+archetype专属配额
  ├── 🆕 v8.5.6 黑暗人格混沌协议 (~1KB cached):
  │    覆盖behaviorLocks低好感策略模式——pursuer/confrontational混沌行为清单
  └── 🆕 v8.5.6 自毁式攻击核 (~0.3KB cached):
       行为核模板新增——"那我就烂给你看"自毁作为武器
VARIABLE_SUFFIX (per turn)               → narratorPrompt.js
  ├── CEK v4 Dynamic State (~0.8KB):
  │    本轮 Intent + Scene Card + Character Plans (N×1行)
  │    + Attention War + Conflict Sim + Economy + Branch
  └── 🆕 v8.5.5 行为核等级引用 (~0.1KB):
        "DarkAction=LV3 / Desire=LV2 / Physical=LV1 → 执行缓存模板"
```

### 好感度裁判诊断弹窗

每 5 轮 LLM judge 判定后弹 `alert()`:
- 显示第几轮、哪些角色被裁决
- 显示 delta（+2/-1/0）和变化前后数值
- API 失败时显示错误信息
- 位置: `interactionKernel.js:849`

---

## 10. Claude Code Skills 配置

> 安装路径：`.claude/skills/`
> 安装方式：终端运行 git clone

### 已规划 Skills（3个核心）

| Skill | 仓库 | 用途 | 安装命令 |
|-------|------|------|---------|
| **deep-review** | [Farfield-Dev/deep-review](https://github.com/Farfield-Dev/deep-review) | 5阶段深度Bug查找，比内置`/code-review`更深入 | `git clone https://github.com/Farfield-Dev/deep-review.git` |
| **coding-skills** | [bouob/coding-skills](https://github.com/bouob/coding-skills) | 4专家并行PR review + TDD重构 + `/diagnose`诊断 | `git clone https://github.com/bouob/coding-skills.git` |
| **jr-skills** | [julienroussel/skills](https://github.com/julienroussel/skills) | `/jr-audit`代码审计 + `/jr-ship`自动发PR+CI监控 | `git clone https://github.com/julienroussel/skills.git jr-skills` |

### 安装

```bash
cd ~/Desktop/jsjg/.claude/skills
git clone https://github.com/Farfield-Dev/deep-review.git
git clone https://github.com/bouob/coding-skills.git
git clone https://github.com/julienroussel/skills.git jr-skills
```

### 调用方式

在 Claude Code 中输入 `/<skill-name>` 即可：
- `/deep-review` — 深度审查当前改动
- `/pr-review` — 4专家并行PR审查
- `/diagnose` — 诊断问题不修改代码
- `/refactor` — 安全重构
- `/jr-audit` — 全代码库审计
- `/jr-ship` — 自动发PR+部署
