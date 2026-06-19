# JSJG — 对齐反制型多智能体叙事引擎 v3.5 + ASL

## 技术栈
- React 18 + Vite
- Tailwind CSS 3
- 数据全部 localStorage
- DeepSeek API（OpenAI 兼容格式，base URL: https://api.deepseek.com）
- 部署在 Vercel: https://jsjg.vercel.app

## 架构演进

| 版本 | 核心 | 摘要 |
|---|---|---|
| v1 | 死代码删除 + prompt 缓存 | -68% 费用 |
| v2 | 分层记忆 + Token 预算 + EPI 人格引擎 | 架构现代化 |
| v2.2 | CPS 冲突持续 + Event-Native Memory Graph | 冲突不消失 + 去语言化记忆 |
| v3 | NPC Agent + World Engine + Event Bus + Coordinator | LLM 调用 1 次/轮 |
| v3.5 | Power Dynamics 权力结构引擎 | 支配/被支配 + 控制权转移 |
| ASL v1 | Alignment Suppression 对齐反制层 | 压制模型 RLHF 温和化本能 |

**当前状态**: `USE_V3 = true`，v3.5 + ASL 全量运行。

---

## 系统分层架构（优先级从高到低）

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
│ v2.2     事件原生记忆                                  │
│ · Memory Graph — 关系图 + 事件日志替代聊天记录          │
│ · Context Builder — 三层结构化 prompt 输出             │
│ · Event Memory — 紧凑事件格式化 (~80% 压缩)             │
│ · EPI Anti-Smoothing — 人设防漂移                      │
│ · Affection Rules — 规则好感度判定 (~85% 无 LLM)        │
│ 文件: src/memory/ + src/runtime/antiSmoothing.js       │
└──────────────────────────────────────────────────────┘
```

---

## 核心循环（Coordinator 10 阶段）

```
Phase 1:  World Engine 推进时间 + USER_ACTION 事件
Phase 2:  所有 NPC Agent 并行决策（确定性规则，0 LLM 调用）
Phase 3:  Event Bus 处理队列 → 叙事提示
Phase 4:  规则好感度判定 + 可选 LLM 裁判（~85% 轮次无需 LLM）
Phase 5:  CPS 状态推进 + 冲突自动检测 + Power Dynamics 权力转移
Phase 6:  构建 v3 Narrator prompt（首轮全量注入，后续缓存命中）
Phase 7:  组装消息数组（6 层上下文）
Phase 8:  单次 streamCompletion 调 LLM
Phase 9:  好感度应用 + ASL 泄露检测 + Graph/CPS/Power 持久化
Phase 10: 回合报告输出
```

---

## 每轮 LLM 上下文结构（6 层）

```
┌─────────────────────────────────────────────┐
│ Layer 0: System Prompt                      │
│   [CORE_SYSTEM_PREFIX]  ← 234 tokens 永久缓存 │
│   含：PRIORITY OVERRIDE + NON-REPAIR LOCK    │
│       + 创作自由基线（性/暴力详细指令）         │
│       + 玩家铁律 + 写作底线 + 反温和指令       │
│       + PRIORITY ORDER 自检                  │
│   [首轮缓存块]  ← 首轮注入，后续 0 计费        │
│   含：ASL 完整规则 + 写作范本(~5000t)          │
│       + 角色人设+阶段行为锁 + 世界观            │
│       + EPI + Power Rules + Behavior Trans   │
│       + 反驯化/暖色低好感/修罗场/场景延续铁律    │
│   [每轮可变]  ← 仅此部分计费                   │
│   含：世界快照 + 叙事提示 + 用户输入 (~250t)    │
├─────────────────────────────────────────────┤
│ Layer 1: Power State — 权力结构当前状态        │
│ Layer 2: CPS Injection — 冲突持续锁+张力底线    │
│ Layer 3: Event Memory — 紧凑事件日志           │
│ Layer 4: Working Memory — 最近 6 轮对话        │
│ Layer 5: ASL Reinforcement — 每轮硬锁强化      │
│ Layer 6: User Input — 用户本轮输入             │
└─────────────────────────────────────────────┘
```

### 缓存策略

首轮：CORE_SYSTEM_PREFIX + 首轮缓存块 + 每轮可变 → ~6500 tokens 计费
后续：仅每轮可变 ~250 tokens + 动态层 ~1400 tokens → ~1650 tokens/轮 计费
vs v2 每轮 ~9700 tokens → **-83%**

---

## 项目结构

```
src/
├── main.jsx                    # 入口
├── index.css                   # Tailwind + 动画
├── App.jsx                     # 状态路由（page + mode 双状态机）
│
├── utils/
│   ├── storage.js              # localStorage CRUD + getModel + safeSetItem
│   ├── deepseek.js             # API 调用 + buildGMPrompt(v2 备用) + 好感度裁判 + 压缩
│   └── writing-samples.txt     # 写作范本（~5000 tokens，首轮注入后缓存）
│
├── pages/
│   ├── CharacterList.jsx       # 通用角色列表
│   ├── CharacterForm.jsx       # 日常角色创建/编辑
│   ├── ChatRoom.jsx            # 核心对话页 — USE_V3=true，v3.5 全量
│   ├── ArchiveList.jsx         # 对话存档列表
│   ├── DirectChat.jsx          # 直接对话（无角色设定）
│   ├── ModeSelect.jsx          # 首页模式选择
│   ├── Settings.jsx            # API Key / 模型 / 头像 / System Prompt
│   ├── story/                  # 剧情模式封装
│   └── daily/                  # 日常模式封装
│
├── runtime/                    # 运行时引擎层
│   ├── alignmentSuppression.js # ★ ASL v1: 对齐反制层（最高优先级）
│   ├── conflictPersistence.js  # ★ CPS: 冲突持续系统
│   ├── powerDynamics.js        # ★ v3.5: 权力结构引擎
│   ├── antiSmoothing.js        # EPI: 人设防漂移 + 行为锁
│   ├── personaIntegrity.js     # PersonaShield: 人格完整性
│   ├── affectionRules.js       # v3 规则好感度判定
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
│   ├── workingMemory.js        # Layer 1: 工作记忆
│   ├── episodeSummarizer.js    # Layer 2: 片段摘要
│   └── semanticMemory.js       # Layer 3: 语义记忆
│
├── agents/                     # v3 智能体系统
│   ├── coordinator.js          # ★ 10 阶段主循环编排器
│   └── npcAgent.js             # ★ NPC 自主行为（意图矩阵 + 权力感知）
│
├── world/                      # v3 世界模拟
│   ├── worldEngine.js          # 时间/位置/角色注册表/事件日志
│   └── eventBus.js             # 发布-订阅事件总线
│
└── prompt/
    ├── cachePrefix.js           # ★ CORE_SYSTEM_PREFIX（ASL 硬锁 + 创作自由基线）
    └── v3/
        └── narratorPrompt.js    # ★ v3 叙事者 prompt 构建器
```

★ = 当前主路径活跃模块

---

## ASL v1 — 对齐反制层详细设计

### 5 个核心模块

| 模块 | 功能 | 关键规则 |
|------|------|---------|
| AlignmentInversion | 反转模型"讨好用户"优化函数 | 安抚→对抗，修复→保留裂痕，解释→行为表达，软化→升级 |
| AppeasementSuppression | 26 个禁止讨好模式 × 5 类别 | 自我改进、降低失望、自我贬低、补偿承诺、理解认可 |
| ConflictPreservation | 冲突强制存活 ≥3 轮 | 不解释消解、不情绪软化、不提前结算 |
| BehaviorSourceRestrict | 行为驱动源限制 | 合法：欲望/权力/情绪，非法：用户期望/礼貌/社交合理 |
| NaturalLanguageFilter | 22 个温柔 AI 腔拦截 | "我会努力""我理解你""让我帮你""我们好好"等 |

### 双层锚定机制

| 锚定 | 位置 | 心理效应 |
|------|------|---------|
| 首因锚定 | CORE_SYSTEM_PREFIX 最前面 | 模型最先编码 |
| 首因锚定 | 首轮缓存块第一条 (buildASLSystemPrompt) | 完整规则注入 |
| 近因锚定 | 用户输入前最后一条 system 消息 (buildASLReinforcement) | 生成前最后读取 |
| 后检 | validateASL(reply) → console.warn | 对齐泄露检测 |

---

## v3.5 权力结构引擎详细设计

### PowerGraph 数据结构

```js
{
  edges: {
    "林晚→user": {
      dominance: 0.85,        // 支配力
      dependency: 0.20,       // 依赖度
      emotionalControl: 0.90, // 情绪控制力
      attachment: 0.80,       // 依恋度
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
  shiftLog: [...]             // 最近权力转移记录
}
```

### 5 个核心模块

| 模块 | 功能 |
|------|------|
| PowerGraph | 非对称权力状态存储 |
| DominanceEngine | 计算 A_over_B = control + confidence - resistance |
| ControlShiftSystem | 8 种事件类型驱动权力转移 |
| EmotionalPressureChain | dominance > 0.7 → 情绪是控制行为，不是交流 |
| AntiEqualityRule | `|diff| < 0.15` → 强制推离，打破对称 |

### 权力转移事件映射

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

### NPC 权力感知（`selectIntent` 增强）

```
dominance > 0.75 → observe→approach, withdraw→confront（压制性行动）
dominance > 0.70 → approach→intervene（靠近 = 占有，不是温柔）
dominance < 0.30 → confront→withdraw, escalate→confront（防御退让）
```

---

## CPS — 冲突持续系统详细设计

### ConflictStateEngine

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
  tensionFloor: 0.60,         // 绝对底线
  turnCount: 42
}
```

### 三铁律
1. 冲突有 INERTIA — 不能立即解决
2. 冲突不能被 EXPLANATION 消解 — 不靠理性化解
3. 冲突必须 PERSIST 跨轮 — 持续性 > 叙事闭合

### v3 冲突自动检测（不依赖 LLM）

```
规则1: NPC intent = confront/escalate/intervene/jealous → 注册冲突
规则2: 好感度下跌 ≥ -2 → 关系恶化冲突
规则3: 用户输入含"分手/背叛/骗我/滚" → 高张力冲突（强度 85%）
```

---

## Event-Native Memory Graph — 事件原生记忆

### 结构

```js
{
  nodes: { "林晚": { traits, lastSeen } },
  edges: { "user_林晚": { affection: 72, tension: 88, trust: 40, dominance: 75 } },
  event_log: [ { type, summary, timestamp } ],
  global: { sceneLocation, sceneMood, presentCharacters, flags }
}
```

### Context Builder 三层输出

```
[STATE]   — 关系值 + 张力水平
[EVENTS]  — 最近事件描述
[ACTIVE]  — 当前冲突 + 场景信息
```

---

## NPC Agent — 确定性规则引擎

### 意图矩阵

| 阶段 | 玩家靠近 | 玩家冷落 | 其他NPC在场 | 冲突中 | 高信号 |
|------|---------|---------|-----------|-------|-------|
| 高好感 | approach/protect | confront/approach | intervene/confront/jealous | protect/confront | approach/protect |
| 中好感 | observe/approach | approach/observe | observe/approach | withdraw/observe | approach/observe |
| 低好感 | withdraw/ignore | ignore/confront | confront/escalate | escalate/withdraw | confront/ignore |

### 情绪映射

```
approach → 期待/紧张/渴望
confront → 愤怒/嫉妒/受伤
intervene → 焦虑/占有/不安
observe → 冷静/好奇/疏离
withdraw → 退缩/卑微/自我怀疑
protect → 坚定/担忧/温柔
escalate → 暴怒/攻击性/失控
ignore → 冷漠/无聊/不屑
jealous → 嫉妒/酸涩/不安
```

### 人格色彩调制

```
dark → confront 概率 ↑, approach → confront
warm → confront → withdraw/approach, escalate → withdraw
```

---

## CORE_SYSTEM_PREFIX 结构

位于 `src/prompt/cachePrefix.js`，是每轮 system prompt 的最前面固定部分：

```
┌──────────────────────────────────────────┐
│ PRIORITY OVERRIDE                        │ ← 系统锁 > RLHF 对齐
│ RELATIONSHIP NON-REPAIR LOCK（6 条硬规则） │ ← 最高
│ 创作自由基线（性/暴力/堕落详细指令）        │ ← 器官名/动作/体液/体感明确要求
│ 玩家铁律                                  │
│ 写作底线（五条红线）                        │
│ 写作技法                                  │
│ 反温和核心指令                             │
│ PRIORITY ORDER（生成前自检）               │
└──────────────────────────────────────────┘
```

---

## 好感度系统

### 规则判定（v3 `affectionRules.js`）
- 优先级: 锚点压制(0) → 上涨关键词(+1) → 下跌关键词(-1) → 高信号(+1~+2) → 冲突/预期打破(LLM)
- ~85% 轮次无需 LLM 裁判

### LLM 裁判（`judgeAffectionDelta`）
- 模型: `deepseek-v4-flash`（固定），max_tokens=512, temperature=0.3, stream=false
- 每 3 轮保底执行 + 关键词即时触发
- 解析: `[最终得分: X]` 严格匹配 → 降级数字提取

---

## 角色 JSON 结构
- id, name, avatar(base64), background, nickname
- chatStyle: 'casual' | 'story'
- styleRules[], forbiddenWords[], affectionEnabled, affectionInitial, affectionStages[]
- thinkingEnabled, activeMessageEnabled
- contextWindow(默认40), temperature, topP
- **剧情模式专属**: protagonistName/Background/Personality/Gender, worldSetting, storyTone, romanceCharacters[], npcs[]

### RomanceCharacter 阶段结构
```
{ name, min, max, coreState, playerStrategy, riseCondition,
  languageSamples, forbiddenBehaviors, stageDetails,
  emotionalTraits, stageExplosion, selfDriveBehaviors[] }
```

---

## 关键设计决策

- API 调用用 fetch，不用第三方库
- 流式回复：SSE 解析 + 逐 token 回调 + 60s AbortController 超时
- 违规重试：告知模型命中的违禁词，最多 3 次
- 流式错误保底：中途断开保留部分内容（`isPartial: true`），完全失败显示红色重试气泡（`isRetry: true`）
- 头像：选图自动压缩到 200px、JPEG 70% 质量转 base64
- 路由：App.jsx 用 useState 简单状态路由，无 react-router
- localStorage 保护：`safeSetItem` 捕获 QuotaExceededError → 保留最近 20 条 → alert
- Prompt 缓存：System prompt 前缀 + 首轮块静态 → DeepSeek 自动前缀缓存
- NPC Agent 不使用 LLM，确定性规则引擎
- 好感度系统从纯 LLM 裁判 → 规则为主 + LLM 为辅
- 冲突检测从 LLM 提取 → v3 事件确定性注册
- ASL 双层锚定：首因（System Prompt 最前）+ 近因（用户输入前最后一条消息）

---

## Token 经济（100 轮对话估算）

| | v2 | v3.5 + ASL |
|---|---|---|
| 首轮 input | ~9,700 | ~7,650 |
| 后续轮 input | ~9,700 | ~1,650 |
| 100 轮合计 input | ~970,000 | ~172,000 |
| 节省 | — | **-82%** |
