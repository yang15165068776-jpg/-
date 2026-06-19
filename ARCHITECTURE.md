# JSJG 项目架构文档 — v3.5 + ASL

> 生成日期：2026-06-19 | 分支：main | 当前版本：v3.5 + ASL v1

---

## 1. 技术栈与部署

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + Vite |
| 样式 | Tailwind CSS 3 |
| 数据持久化 | localStorage（按模式前缀分区） |
| AI API | DeepSeek API（OpenAI 兼容格式，`https://api.deepseek.com`） |
| 部署 | Vercel: https://jsjg.vercel.app（SPA fallback via `vercel.json` rewrites） |

---

## 2. 系统分层架构（优先级从高到低）

```
┌──────────────────────────────────────────────────────┐
│ ASL v1   对齐反制层（最高优先级硬覆盖）                  │
│ · Alignment Inversion — 反转模型"讨好用户"优化函数      │
│ · Appeasement Suppression — 26 个禁止讨好模式          │
│ · Conflict Preservation — 冲突 ≥3 轮强制存活           │
│ · Behavior Source Restriction — 驱动源 = 欲望/权力     │
│ · Natural Language Filter — 22 个温柔 AI 腔拦截       │
│ 文件: src/runtime/alignmentSuppression.js              │
├──────────────────────────────────────────────────────┤
│ CPS      冲突持续系统（v2.2）                           │
│ · ConflictStateEngine — 状态追踪 + 生命周期             │
│ · PersistenceLockLayer — 最小存活轮次 + 锁定           │
│ · ConflictMemoryLock — 冲突不可遗忘                    │
│ · BehaviorOverride — 冲突状态下行为强制                 │
│ · TensionFloor — 全局张力底线 0.60                     │
│ 文件: src/runtime/conflictPersistence.js               │
├──────────────────────────────────────────────────────┤
│ v3.5     权力结构引擎                                  │
│ · PowerGraph — 非对称权力状态（A→B ≠ B→A）             │
│ · DominanceEngine — 计算谁控制谁                       │
│ · ControlShiftSystem — 8 种事件驱动权力转移             │
│ · EmotionalPressureChain — dominance > 0.7 → 情绪=控制  │
│ · AntiEqualityRule — 自动打破关系对称                   │
│ 文件: src/runtime/powerDynamics.js                     │
├──────────────────────────────────────────────────────┤
│ v3       多智能体叙事引擎                              │
│ · NPC Agent — 确定性规则引擎（不用 LLM）                │
│ · World Engine — 时间/位置/角色注册表/事件日志           │
│ · Event Bus — 发布-订阅，6 种事件类型                   │
│ · Coordinator — 10 阶段主循环编排                      │
│ · Narrator Prompt — 紧凑输入 → 故事输出                 │
│ 文件: src/agents/ + src/world/ + src/prompt/v3/        │
├──────────────────────────────────────────────────────┤
│ v2.2     事件原生记忆 + EPI 人格稳定                    │
│ · Memory Graph — 关系图 + 事件日志替代聊天记录          │
│ · Context Builder — 三层结构化 prompt 输出             │
│ · Event Memory — 紧凑事件格式化 (~80% 压缩)             │
│ · EPI Anti-Smoothing — PersonaAnchor + SpikeState      │
│ · Affection Rules — 规则好感度判定 (~85% 无 LLM)        │
│ 文件: src/memory/ + src/runtime/antiSmoothing.js       │
└──────────────────────────────────────────────────────┘
```

---

## 3. 文件树（完整，★ = 当前主路径活跃模块）

```
src/
├── main.jsx                    # React 入口，挂载 <App /> 到 #root
├── index.css                   # Tailwind 指令 + 自定义滚动条 + 动画
├── App.jsx                     # 状态路由器（page + mode 双状态机，217 行）
│
├── utils/
│   ├── storage.js              # localStorage CRUD + QuotaExceeded 保护
│   ├── deepseek.js             # API 调用 + v2 Prompt 备用 + 好感度裁判 + 压缩（~2800 行）
│   └── writing-samples.txt     # 写作范本（~5000 tokens，首轮注入后缓存）
│
├── pages/
│   ├── CharacterList.jsx       # 通用角色列表（mode prop 驱动）
│   ├── CharacterForm.jsx       # 日常角色创建/编辑（1064 行）
│   ├── ChatRoom.jsx            # ★ 核心对话页（~2200 行，USE_V3=true）
│   ├── ArchiveList.jsx         # 对话存档列表
│   ├── DirectChat.jsx          # 直接对话（无角色设定）
│   ├── ModeSelect.jsx          # 首页模式选择
│   ├── Settings.jsx            # API Key / 模型 / 头像 / System Prompt（306 行）
│   ├── story/                  # 剧情模式封装（wrapper 层）
│   │   ├── StoryCharacterForm.jsx  # ★ 剧情角色创建（可攻略角色+NPC+世界观，~2000 行）
│   │   └── StoryChat.jsx / CharacterForm / CharacterList / ArchiveList (wrappers)
│   └── daily/                  # 日常模式封装（wrapper 层）
│       └── DailyChat.jsx / CharacterForm / CharacterList / ArchiveList (wrappers)
│
├── runtime/                    # 运行时引擎层
│   ├── alignmentSuppression.js # ★ ASL v1: 对齐反制层（最高优先级，~300 行）
│   ├── conflictPersistence.js  # ★ CPS: 冲突持续系统（~530 行）
│   ├── powerDynamics.js        # ★ v3.5: 权力结构引擎（~380 行）
│   ├── antiSmoothing.js        # EPI: PersonaAnchor + SpikeState + Validator
│   ├── personaIntegrity.js     # PersonaShield: 人格完整性
│   ├── affectionRules.js       # v3 规则好感度判定（~135 行）
│   ├── affectionTrigger.js     # 关键词启发式触发
│   ├── tokenBudget.js          # Token 预算控制
│   └── llmState.js             # 集中状态管理
│
├── memory/                     # 记忆层
│   ├── memoryGraph.js          # ★ 事件原生记忆图（关系边 + 事件日志）
│   ├── contextBuilder.js       # ★ 三层结构化上下文构建器
│   ├── eventMemory.js          # v3 事件日志 → 紧凑 prompt
│   ├── eventExtractor.js       # 事件提取器
│   ├── stateDiffEngine.js      # 状态差异引擎
│   ├── workingMemory.js        # Layer 1: 工作记忆（最近 8 轮原文）
│   ├── episodeSummarizer.js    # Layer 2: 片段摘要（12 个三段式 JSON）
│   └── semanticMemory.js       # Layer 3: 语义记忆（确定性事实提取）
│
├── agents/                     # v3 智能体系统
│   ├── coordinator.js          # ★ 10 阶段主循环编排器（~580 行）
│   └── npcAgent.js             # ★ NPC 自主行为（意图矩阵 + 权力感知，~360 行）
│
├── world/                      # v3 世界模拟
│   ├── worldEngine.js          # 时间/位置/角色注册表/事件日志
│   └── eventBus.js             # 发布-订阅事件总线（6 种事件类型）
│
└── prompt/
    ├── cachePrefix.js           # ★ CORE_SYSTEM_PREFIX（ASL 硬锁 + 创作自由基线，~93 行）
    └── v3/
        └── narratorPrompt.js    # ★ v3 叙事者 prompt 构建器（~300 行）
```

---

## 4. Coordinator 10 阶段主循环

```
Phase 1:  World Engine 推进时间 + USER_ACTION 事件
Phase 2:  所有 NPC Agent 并行决策（确定性规则，0 LLM 调用）
Phase 3:  Event Bus 处理队列 → 叙事提示
Phase 4:  规则好感度判定 + 可选 LLM 裁判（~85% 轮次无需 LLM）
Phase 5:  CPS 状态推进 + 冲突自动检测 + Power Dynamics 权力转移
Phase 6:  构建 v3 Narrator prompt（首轮全量注入，后续缓存命中）
Phase 7:  组装消息数组（6 层上下文 → LLM）
Phase 8:  单次 streamCompletion 调 LLM
Phase 9:  好感度应用 + ASL 泄露检测 + Graph/CPS/Power 持久化
Phase 10: 回合报告输出
```

### 冲突自动检测（Phase 5，不需要 LLM）

```
规则1: NPC intent = confront/escalate/intervene/jealous → 注册冲突
规则2: 好感度下跌 ≥ -2 → 关系恶化冲突
规则3: 用户输入含"分手/背叛/骗我/滚"等 → 高张力冲突（强度 85%）
```

### 权力转移映射（Phase 5）

| NPC Intent | 权力事件 | 效果 |
|-----------|---------|------|
| confront | CONFRONT | 角色支配 +0.10，用户 -0.05 |
| escalate | ESCALATE | 角色支配 +0.15，用户 -0.10 |
| intervene | INTERVENE | 角色支配 +0.08 |
| withdraw | WITHDRAW | 角色支配 -0.08，用户 +0.05 |
| jealous | JEALOUS | 情绪控制 -0.08，依赖 +0.10 |
| protect | COMPLIANCE | 角色支配 +0.05 |
| affection↓ | AFFECTION_DOWN | 情绪控制 +0.05 |
| affection↑ | AFFECTION_UP | 依赖 +0.05 |

---

## 5. 每轮 LLM 上下文结构（6 层）

```
┌─────────────────────────────────────────────┐
│ Layer 0: System Prompt                      │
│   ┌─────────────────────────────────────┐   │
│   │ CORE_SYSTEM_PREFIX（永久缓存）        │   │
│   │ · PRIORITY OVERRIDE                 │   │
│   │ · RELATIONSHIP NON-REPAIR LOCK      │   │
│   │ · 创作自由基线（性/暴力详细指令）     │   │
│   │ · 玩家铁律 + 写作底线 + 反温和指令   │   │
│   │ · PRIORITY ORDER 自检               │   │
│   ├─────────────────────────────────────┤   │
│   │ 首轮缓存块（首轮注入，后续 0 计费）   │   │
│   │ · ASL 完整规则                      │   │
│   │ · 写作范本（~5000 tokens）           │   │
│   │ · 角色人设 + 阶段行为锁              │   │
│   │ · 世界观 + NPC 设定                  │   │
│   │ · EPI Anti-Smoothing                │   │
│   │ · Power System Rules                │   │
│   │ · Behavior Translation              │   │
│   │ · 反驯化/暖色低好感/修罗场/场景延续  │   │
│   ├─────────────────────────────────────┤   │
│   │ 每轮可变（仅此部分计费 ~250 tokens）  │   │
│   │ · 世界快照 + 叙事提示 + 用户输入     │   │
│   └─────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│ Layer 1: Power State — 权力结构当前状态        │
│ Layer 2: CPS Injection — 冲突持续锁+张力底线    │
│ Layer 3: Event Memory — 紧凑事件日志           │
│ Layer 4: Working Memory — 最近 6 轮对话        │
│ Layer 5: ASL Reinforcement — 每轮硬锁强化      │
│ Layer 6: User Input — 用户本轮输入             │
└─────────────────────────────────────────────┘
```

---

## 6. ASL v1 — 对齐反制层

### 6.1 设计目标

ASL 不增强人设。ASL 压制模型的默认对齐行为：
- 用户迎合（user appeasement）
- 情绪安抚（emotional smoothing）
- 冲突消解（conflict resolution bias）
- 解释性合理化（rationalization drift）

### 6.2 5 个核心模块

| 模块 | 功能 | 关键规则 |
|------|------|---------|
| AlignmentInversion | 反转模型"讨好用户"优化函数 | 安抚→对抗，修复→保留裂痕，解释→行为表达，软化→升级 |
| AppeasementSuppression | 26 个禁止讨好模式 × 5 类别 | 自我改进、降低失望、自我贬低、补偿承诺、理解认可 |
| ConflictPreservation | 冲突强制存活 ≥3 轮 | 不解释消解、不情绪软化、不提前结算 |
| BehaviorSourceRestrict | 行为驱动源限制 | 合法：欲望/权力/情绪，非法：用户期望/礼貌/社交合理 |
| NaturalLanguageFilter | 22 个温柔 AI 腔拦截 | "我会努力""我理解你""让我帮你""我们好好"等 |

### 6.3 双层锚定机制

| 锚定 | 位置 | 心理效应 |
|------|------|---------|
| 首因锚定 | CORE_SYSTEM_PREFIX 最前面 | 模型最先编码 |
| 首因锚定 | 首轮缓存块第一条 (buildASLSystemPrompt) | 完整规则注入 |
| 近因锚定 | 用户输入前最后一条 system 消息 (buildASLReinforcement) | 生成前最后读取 |
| 后检 | validateASL(reply) → console.warn | 对齐泄露检测 |

### 6.4 禁止的讨好模式（部分）

**自我改进承诺：** "我会改" "我会努力" "我会尽量" "我保证"
**降低失望感：** "不给你丢脸" "不会让你失望" "不想让你为难"
**自我贬低：** "是我不够好" "都是我的错" "我配不上"
**补偿承诺：** "我补偿你" "我会弥补" "给我机会"
**理解认可：** "我理解你" "我懂你" "你说得对"

### 6.5 温柔 AI 腔过滤（部分）

"我会努力" "我尽量" "我不想让你" "我理解你" "希望你能" "对不起" "是我的错" "我们好好" "让我帮你" "你需要"

---

## 7. v3.5 权力结构引擎

### 7.1 PowerGraph 数据结构

```js
{
  edges: {
    "林晚→user": {
      dominance: 0.85,        // 支配力（0-1）
      dependency: 0.20,       // 依赖度（0-1）
      emotionalControl: 0.90, // 情绪控制力（0-1）
      attachment: 0.80,       // 依恋度（0-1，≈ 好感度/100）
      personalityColor: 'dark'
    },
    "user→林晚": {
      dominance: 0.30,        // 用户支配力（总是更低）
      dependency: 0.50,
      emotionalControl: 0.35,
      attachment: 0.80
    }
  },
  globalTilt: 0.72,           // 全局权力倾斜（0=用户主导，1=NPC主导）
  shiftLog: [...]             // 最近 20 条权力转移记录
}
```

### 7.2 5 个核心模块

| 模块 | 功能 | 核心逻辑 |
|------|------|---------|
| PowerGraph | 非对称权力状态存储 | 每条边是方向性的：A→B ≠ B→A |
| DominanceEngine | 计算支配关系 | A_over_B = (control + confidence - resistance) / 2 |
| ControlShiftSystem | 8 种事件驱动权力转移 | NPC intent + 好感度变化 → 权力边更新 |
| EmotionalPressureChain | 情绪施压模式 | dominance > 0.7 → 情绪不是交流，是控制 |
| AntiEqualityRule | 打破关系对称 | `|diff| < 0.15` → 强制推离 |

### 7.3 NPC 权力感知（npcAgent 增强）

```
dominance > 0.75 → observe→approach, withdraw→confront（压制性行动）
dominance > 0.70 → approach→intervene（靠近 = 占有，不是温柔）
dominance < 0.30 → confront→withdraw, escalate→confront（防御退让）
```

---

## 8. CPS — 冲突持续系统

### 8.1 ConflictStateEngine 数据结构

```js
{
  activeConflicts: [{
    id, type, sourceEvent, actor, target,
    intensity: 0.70,
    lifespan: { remaining: 3, initial: 3 },
    locked: true,             // 锁定 = 不可自动解决
    resolutionBlocked: true,  // 禁止被模型消解
    emotion: 'anger'
  }],
  tensionLevel: 0.72,         // 全局张力 0-1
  tensionFloor: 0.60,         // 绝对底线，不可低于此
  turnCount: 42,
  conflictHistory: [...],     // 已解决冲突存档
}
```

### 8.2 三铁律

1. 冲突有 INERTIA — 不能立即解决（≥3 轮最小存活）
2. 冲突不能被 EXPLANATION 消解 — 理性解释 ≠ 冲突解决
3. 冲突必须 PERSIST 跨轮 — 持续性 > 叙事闭合

### 8.3 CPS Prompt 注入（每轮动态层）

- PersistenceLockLayer: 活跃冲突列表 + 锁定状态 + 禁止消解行为清单
- TensionFloor: 全局张力底线 + 低于底线时的强制推高指令
- BehaviorOverride: 冲突状态下的行为强制模式（禁止解释/缓和/总结）

---

## 9. Event-Native Memory Graph — 事件原生记忆

### 9.1 结构

```js
{
  version: 2,
  nodes: { "林晚": { traits, lastSeen } },
  edges: {
    "user_林晚": {
      affection: 72,    // 好感度
      tension: 88,      // 张力
      trust: 40,        // 信任
      dominance: 75     // 主导力
    }
  },
  event_log: [
    { type: 'NPC_ACTION', summary: '林晚: confront — 堵在玩家面前', timestamp },
    { type: 'RELATIONSHIP_CHANGE', summary: '林晚好感度-3 (对抗行为)', timestamp },
  ],
  global: { sceneLocation, sceneMood, presentCharacters, flags }
}
```

### 9.2 Context Builder 三层输出

```
[STATE]   — 关系值 + 张力水平（如：林晚：好感72 张力88 信任40 主导75%）
[EVENTS]  — 最近事件描述（如：林晚正面冲突 → 玩家退让 → 关系裂痕扩大）
[ACTIVE]  — 当前冲突 + 场景信息
```

---

## 10. NPC Agent — 确定性规则引擎

### 10.1 意图矩阵

| 阶段 | 玩家靠近 | 玩家冷落 | 其他NPC在场 | 冲突中 | 高信号 |
|------|---------|---------|-----------|-------|-------|
| 高好感 | approach/protect | confront/approach | intervene/confront/jealous | protect/confront | approach/protect |
| 中好感 | observe/approach | approach/observe | observe/approach | withdraw/observe | approach/observe |
| 低好感 | withdraw/ignore | ignore/confront | confront/escalate | escalate/withdraw | confront/ignore |

### 10.2 情绪映射 + 动作模板

```
approach  → 期待/紧张/渴望    → 靠近玩家身边、轻声开口、伸手触碰又收回
confront  → 愤怒/嫉妒/受伤    → 堵在面前、声音带刺质问、抓住手腕
intervene → 焦虑/占有/不安    → 插入两人之间、故意打断对话
observe   → 冷静/好奇/疏离    → 靠在墙边沉默注视、低头假装不在意
withdraw  → 退缩/卑微/自我怀疑 → 退后一步、转过身去、安静离开中心
protect   → 坚定/担忧/温柔    → 挡在身前、压低声音警告
escalate  → 暴怒/攻击性/失控  → 摔东西、声音拔高、一拳砸墙
ignore    → 冷漠/无聊/不屑    → 完全当空气、继续做事、眼神淡漠掠过
jealous   → 嫉妒/酸涩/不安    → 阴阳怪气评论、故意提旧事、冷哼别脸
```

### 10.3 人格色彩调制

- **dark 人格**：confront 概率 ↑，approach → confront
- **warm 人格**：confront → withdraw/approach，escalate → withdraw
- **neutral 人格**：不调制

### 10.4 v3.5 权力感知增强

在人格调制之前先应用权力感知调制（参见 7.3）。

---

## 11. CORE_SYSTEM_PREFIX

位于 `src/prompt/cachePrefix.js`，每轮 system prompt 的固定前缀（DeepSeek 缓存目标）：

```
┌──────────────────────────────────────────┐
│ PRIORITY OVERRIDE                        │ ← 系统锁 > RLHF 对齐
│ RELATIONSHIP NON-REPAIR LOCK（6 条硬规则） │
│ 创作自由基线（性/暴力/堕落详细指令）        │
│   · 性器官名：阴茎、龟头、阴道、阴蒂…      │
│   · 性动作：插入、抽送、顶弄、撞击…        │
│   · 性体液：精液、爱液、淫水…             │
│   · 性体感：涨、烫、麻、酥、痉挛…         │
│ 玩家铁律 + 写作底线 + 写作技法             │
│ 反温和核心指令                            │
│ PRIORITY ORDER（生成前自检）               │
└──────────────────────────────────────────┘
```

---

## 12. Token 经济

### 12.1 缓存策略

- CORE_SYSTEM_PREFIX: 固定字符串，DeepSeek 自动前缀缓存
- 首轮缓存块: 写作范本 + 人设 + ASL 规则等，首轮注入后后续轮次缓存命中
- 每轮可变: 仅世界快照 + 叙事提示 + 用户输入 (~250 tokens) 需要计费

### 12.2 每轮开销对比

| | v2 | v3.5 + ASL |
|---|---|---|
| 首轮 input | ~9,700 tokens | ~7,650 tokens |
| 后续轮 input | ~9,700 tokens | ~1,650 tokens |
| 100 轮合计 | ~970,000 tokens | ~172,000 tokens |
| 节省 | — | **-82%** |

---

## 13. 好感度系统

### 13.1 规则判定（`affectionRules.js`）
- 5 层优先级: 锚点压制(0) → 上涨关键词(+1) → 下跌关键词(-1) → 高信号(+1~+2) → 冲突/预期打破(LLM)
- ~85% 轮次无需 LLM 裁判

### 13.2 LLM 裁判（`judgeAffectionDelta`）
- 模型: `deepseek-v4-flash`（固定），max_tokens=512, temperature=0.3, stream=false
- 每 3 轮保底执行 + 关键词即时触发
- 解析: `[最终得分: X]` 严格匹配 → 降级数字提取

---

## 14. 角色 JSON 结构

### 剧情模式专属字段

```js
{
  // RomanceCharacter（可攻略角色）
  name, background, personality, speakingStyle,
  styleRules[], forbiddenWords[],
  affectionEnabled, affectionInitial,
  affectionStages[]: {
    name, min, max,
    coreState,          // 当前核心状态
    playerStrategy,     // 对玩家策略
    riseCondition,      // 上涨条件
    languageSamples,    // 本阶段语言样本（必须模仿）
    forbiddenBehaviors, // 本阶段绝对禁止
    stageDetails,       // 高频表现细节
    emotionalTraits,    // 底层情绪特征
    stageExplosion,     // 随时可能引爆的转折点名场面
    selfDriveBehaviors[]: { behavior, trigger }
  },
  transitionTriggers,   // 阶段转换触发
  irreversibleMoment,   // 不可逆转折锚点
  erosionCondition,     // 反向侵蚀条件
  anchorSuppression,    // 现实锚点压制（好感度锁死场景）

  // 世界设定
  worldSetting, storyTone,
  protagonistName, protagonistBackground, protagonistPersonality, protagonistGender,

  // NPC
  npcs[]: { name, personality, relationship, background }
}
```

---

## 15. 关键设计决策

| 决策 | 说明 |
|---|---|
| 无 react-router | App.jsx useState 路由，简单可控 |
| 无第三方 API 库 | 纯 fetch 调用 DeepSeek API |
| NPC Agent 不用 LLM | 确定性规则引擎（意图矩阵 + 情绪映射 + 动作模板） |
| 单次 LLM 调用/轮 | v3 Coordinator 将所有上下文聚合为一次调用 |
| Prompt 缓存 | 静态前缀 + 首轮块 → DeepSeek 自动前缀缓存 |
| 好感度规则化 | ~85% 轮次确定性判定，仅冲突/预期打破调 LLM |
| 冲突检测确定性化 | v3 事件总线自动检测，替代 v2 的 LLM 提取 |
| ASL 双层锚定 | 首因（Prompt 最前）+ 近因（用户输入前最后一条消息） |
| 流式容错 | 中途断开保留部分内容（isPartial），完全失败显示重试气泡 |
| 违禁词重试 | 告知模型命中词，最多重试 3 次 |
| localStorage 保护 | QuotaExceededError → 截断旧消息 → 重试 → alert |
| 头像压缩 | canvas 缩放到 200px + JPEG 70% 质量转 base64 |

---

## 16. 文件大小参考

| 文件 | 行数 | 职责 |
|---|---|---|
| `deepseek.js` | ~2800 | API 调用 + v2 Prompt 备用 + 好感度裁判 + 压缩 |
| `ChatRoom.jsx` | ~2200 | 对话核心：双模式渲染 + 流式输出 + v3.5 集成 |
| `StoryCharacterForm.jsx` | ~2000 | 剧情角色创建：可攻略角色 ×N + NPC ×N + 世界观 |
| `CharacterForm.jsx` | 1064 | 日常角色创建：好感度阶段 + 思考层 + 主动消息 |
| `coordinator.js` | ~580 | ★ 10 阶段主循环：所有引擎的编排中心 |
| `conflictPersistence.js` | ~530 | CPS 冲突持续系统 |
| `powerDynamics.js` | ~380 | v3.5 权力结构引擎 |
| `npcAgent.js` | ~360 | NPC 确定性规则引擎 |
| `alignmentSuppression.js` | ~300 | ★ ASL v1 对齐反制层 |
| `narratorPrompt.js` | ~300 | v3 叙事者 prompt 构建器 |
| `worldEngine.js` | ~280 | 世界状态模拟器 |
| `Settings.jsx` | 306 | API Key / 模型 / 头像 / System Prompt |
| `storage.js` | 295 | localStorage 完整 CRUD |
| `App.jsx` | 217 | 状态路由 |
| `eventBus.js` | 162 | 发布-订阅事件总线 |
| `affectionRules.js` | 135 | 规则好感度判定 |
| `eventMemory.js` | 145 | 事件日志格式化 |
| `cachePrefix.js` | 93 | CORE_SYSTEM_PREFIX 固化 |
