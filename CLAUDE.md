# JSJG Character OS v8.0 — Narrative Operating System (NOS)

> 最后更新：2026-06-23（角色边界侵犯系统 + 物理行动主动权层 + 人设忠诚原则）
> 仓库：https://github.com/yang15165068776-jpg/-.git
> 部署：https://jsjg.vercel.app

## 版本进化

```
v6.5: 聊天式 AI（prompt 拼接 → 模型自由发挥）
v7.0: 叙事状态机（Identity + Canon 双核 → 4 锁约束）
v7.1: 双行为核（DarkAction + Desire 并行）
v8.0: NOS 叙事操作系统（五层架构 + 运行时编排器）
v8.1: 角色边界侵犯系统（人格感知闸门 + 物理行动主动权 + 人设忠诚原则）
```

---

## 技术栈
- React 18 + Vite
- 样式：内联 CSS 变量（白底灰框黑字，无 Tailwind 残留）
- 数据：localStorage（USK per-save + Memory Graph per-save + CPS per-save + Story Canon per-save + Fact Ledger per-save）
- API：DeepSeek（Settings 页用户自选模型，128K 上下文，max_tokens 4096）
- 路由：NavigationEngine（自建 push/pop 栈）

---

## 0. NOS 五层架构（v8.0）

```
┌─────────────────────────────────────────┐
│  ⚖️ CCL   Constitution Layer            │  characterConstitution.js
│          身份 + 规则（每轮注入，不可违背）│
├─────────────────────────────────────────┤
│  🔒 NTK   Truth Kernel                  │  factLedger.js + eventGraph.js
│          事实账本 + 事件图谱 + 因果链     │
├─────────────────────────────────────────┤
│  📊 USK   State Kernel                  │  unifiedStateKernel.js + stateBridge.js
│          当前情绪/关系/场景状态           │
├─────────────────────────────────────────┤
│  🔗 ARSL  Relationship Physics          │  relationshipPhysics.js
│          非对称关系力场 + 自动演化        │
├─────────────────────────────────────────┤
│  🌍 ADOE  Autonomous Drama Engine       │  autonomousWorldEngine.js
│          世界自驱事件 + 注意力系统        │  (+ agencyEngine.js, dramaOrchestrator.js)
├─────────────────────────────────────────┤
│  🎯 BPL   Boundary Push Layer           │  aggressionProfile.js
│          人格侵略性分类 + 物理行动决策    │  (+ characterInitiativeKernel.js)
└────────────┬────────────────────────────┘
             ↓
┌─────────────────────────────────────────┐
│  🎬 Render Layer                        │
│  Drama（narratorPrompt）| Daily（sendDailyChatMessage）
└─────────────────────────────────────────┘
```

### 运行时编排器（Runtime Orchestrator）

```
每一轮 NOS 运行循环：
  ① INPUT_PARSE      — 分类玩家输入
  ② CONSTITUTION     — 构建 CCL 宪法层
  ③ FACT_SYNC        — Fact Ledger 同步 + 注入
  ④ STATE_UPDATE     — USK 状态快照
  ⑤ RELATIONSHIP     — ARSL + Agency + World Engine tick
  ⑥ EVENT_TICK       — Event Graph 因果链上下文
  ⑦ CAUSAL_UPDATE    — DarkAction + Desire + Initiative 行为层指令
  ⑧ NARRATIVE_BUILD  — prompt 组装
  ⑨ OUTPUT_RENDER    — LLM 生成
→ ⑩ 事件提取 → Event Graph + Fact Ledger + 持久化
```

---

## 1. 文件清单（v8.0）

```
src/
├── runtime/
│   ├── characterConstitution.js    # ⚖️ CCL — 角色宪法层（每轮注入，最高优先级）
│   ├── factLedger.js               # 🔒 Fact Ledger — 不可篡改事实账本
│   ├── eventGraph.js               # 📊 Event Graph — 结构化事件节点 + 因果链
│   ├── relationshipPhysics.js      # 🔗 ARSL — 非对称关系力场（自动演化）
│   ├── autonomousWorldEngine.js    # 🌍 ADOE — 世界自驱引擎（注意力+概率事件）
│   ├── agencyEngine.js             # 🚀 Agency Engine — 角色自主行动（非玩家驱动）
│   ├── desireKernel.js             # 🔥 Desire Kernel — 5级欲望推进层
│   ├── darkActionKernel.js         # 🔴 Dark Action Kernel — 5级冷暴力层（含物理动作锚点）
│   ├── characterInitiativeKernel.js# 🎯 Initiative Kernel — 5级物理行动决策（桥接DarkAction+Desire）
│   ├── aggressionProfile.js        # 🧬 人格侵略性分类（pursuer/confrontational/aloof/gentle）
│   ├── dramaOrchestrator.js        # 🎬 修罗场引擎（Conflict Graph + 注意力分配）
│   ├── runtimeOrchestrator.js      # 🚀 NOS Runtime Orchestrator — 主时钟编排器
│   ├── stateLocks.js               # 🔒 4 锁校验（Identity/Event/Persona/Shape）
│   └── dailyGuard.js               # 💬 Daily 守护（关系门禁 + 叙事压制 + 意图生成，人格感知）
│
├── state/
│   ├── identityKernel.js         # 🔵 玩家身份单源锁
│   ├── storyCanon.js             # 🔴 故事正典（不可变时间线 + 锁定事实）
│   ├── unifiedStateKernel.js     # 📊 USK — 统一状态核
│   └── stateBridge.js            # 🌉 状态桥接层（UI ↔ USK）
│
├── agents/
│   └── coordinator.js            # 🎭 Agent 协调器（NPC + LLM 调用 + 好感裁判）
│
├── prompt/v3/
│   └── narratorPrompt.js         # 📝 Narrator Prompt v3（prompt 组装 + 注入）
│
├── pages/
│   ├── DramaPage.jsx             # 📖 剧情模式
│   └── DailyPage.jsx             # 💬 日常模式（即时渲染，无延迟）
│
└── utils/
    └── deepseek.js               # 🔌 DeepSeek API（streamCompletion, judgeAffection）
```

---

## 2. 行为核系统（每轮并行注入）

### Dark Action Kernel — 5级冷暴力（v1.1：含物理动作+第三人武器锚点）

| Lv | 名称 | 行为 |
|----|------|------|
| 1 | 安全层 | 冷淡、敷衍 |
| 2 | 轻冲突 | 讽刺、阻断话题 |
| 3 | 关系破坏 | 取消约定、翻旧账、与第三人亲密刺激玩家、堵路逼近 |
| 4 | 极端行为 | 威胁断裂、动手推搡按墙、**当玩家面与第三人接吻/做爱** |
| 5 | 黑暗核心 | 操控、情绪惩罚、物理强制、暴力升级、**当玩家面操别人、杀人虐杀** |

### Desire & Physicality Kernel — 5级欲望推进（v1.1：攻略型曲线反转）

| Lv | 名称 | 行为 |
|----|------|------|
| 1 | 潜伏期 | 喉结滚动、呼吸微乱 |
| 2 | 试探期 | 故意放慢语速、"无意"触碰 |
| 3 | 主动期 | 明确生理状态、手不受控、脏话 |
| 4 | 失控期 | 腰自己顶、啃咬不是亲吻 |
| 5 | 崩坏期 | 器官名+动作+感受，不跳过不隐喻 |

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
> **决策**：桥接 DarkAction + Desire → 物理行动等级。权限解锁+自主判断（不强制每轮动手）。

### Aggression Profile — 人格侵略性分类

| Profile | 关键词 | 说明 |
|---------|--------|------|
| pursuer | 花心、霸道、轻浮、风流、病娇、疯批、邪魅、偏执… | 主动突破边界，追求/占有/征服驱动 |
| confrontational | 傲娇、毒舌、腹黑、恶劣、暴戾、喜怒无常… | 制造冲突和张力，对抗驱动 |
| aloof | 清冷、高冷、城府深、强势、冷酷、无情… | 疏离观察，控制距离 |
| gentle | 温柔、善良、阳光、单纯、软萌、体贴… | 保持距离，不主动侵犯 |

---

## 3. Prompt 注入顺序（每轮）

```
[DeepSeek 缓存前缀]          ← 首轮：完整人设 + 创作自由基线 + 人设忠诚原则 + 玩家铁律（自动缓存）
───────────────────────────────────
⚖️ CCL 宪法                  ← 最高优先级（玩家/角色/世界/交互规则）
📊 World Snapshot            ← 场景时间地点角色
👤 User Action               ← 玩家本轮输入
───────────────────────────────────
🔒 Fact Ledger               ← 不可篡改事实（紧凑格式 ~150 tokens）
📊 Event Graph               ← 因果链 + 最近事件节点
🌍 World Engine              ← 关系力场 + 注意力 + 事件（紧凑格式 ~200 tokens）
🎬 Scene Context             ← 修罗场导演指令
🔴 DarkAction Directive      ← 冷暴力行为层
🔥 Desire Directive          ← 欲望推进层
🎯 Initiative Directive      ← 物理行动权限解锁层（Drama Mode）
```

---

## 4. 关键修复记录

| Bug | 原因 | 修复 |
|-----|------|------|
| 好感度为0/NAN | USK key不匹配 + `??`不拦截NaN | 三层保护：null→回退、NaN→回退、无匹配→alert+回退 |
| 好感度不涨 | LLM裁判changes只写_worldState未回传affectionResult.deltas | 合并回deltas |
| LLM编造历史 | 无双源事实约束 | Fact Ledger每轮注入 |
| 剧情断裂 | 事件平铺无因果 | Event Graph + Causal Trace |
| 人设漂移 | 人设只在首轮，被后续指令冲掉 | CCL每轮注入，优先级最高 |
| 回复截断 | streamCompletion无max_tokens | 设为4096 |
| 每轮弹窗 | v7调试alert未清理 | 删除CANONICAL IDENTITY BLOCK弹窗 |
| pp未定义崩溃 | narratorPrompt.js第158行pp在声明前使用 | 改为playerProfile.name |
| 重刷多一步 | handleRegenerate把消息放回输入框 | 直接rollback + doSend |
| Daily慢回复 | Human Burst Scheduler延迟 | 移除，即时渲染 |
| Daily输入后空白 | hasReadReceipt拦截 + !reply时消息残留 | 移除已读不回，失败时回滚消息 |
| 存档相互影响 | saveId为null时storage key无前缀 + reset不清理引擎 | saveId强制注入key + reset清空全部引擎 |
| Daily气泡不拆分 | 模型用\\n拼多句到一个气泡里 | 后处理按\\n拆分 + 上限5条 |
| Daily长文 | 格式规则在prompt中间被淹没 | 挪到末尾+近因效应+≤20字+拆分铁律 |
| executeTurn里mainChar未定义 | init()局部变量在executeTurn()里引用 | 改用character.name |
| 好感度增长过快（+10/轮） | USK updateUSK的intimacy case硬编码+8，叠加applyEventImpact再+delta → +8+delta | 移除硬编码+8，affection delta单次通过applyEventImpact生效 |
| 好感度LLM裁判无AI回复 | coordinator在LLM生成前调用judgeAffectionDelta（aiReply为空） | 裁判移至executeTurn步骤5.6（拿到cleanReply后），用实际回复评估 |
| Daily模式改变好感度 | DailyPage调用judgeDailyAffection修改affection | 移除judgeDailyAffection，relationship_delta恒为0，好感度仅剧情模式裁决 |
| LLM裁判过于频繁 | 每3轮触发 + 宽泛高信号关键词 | 改为每5轮触发 |
| 角色AI提取丢信息 | extractCharacterFromText只提取部分字段，缺classicLines/innerMonologue/stageDetails等 | 新fillCharacterFromSkeleton：骨架→表单直接映射，逐段搬运不概括 |
| 角色表单textareas太小 | h-12（3行）+ resize-none | 所有textarea高度翻倍+resize-y，placeholder引导写详细内容 |
| 创建新世界AI需两次操作 | 骨架和散文分开两个按钮/模式 | 合并为fillCharactersFromText：一个输入框自动识别格式，支持多角色 |
| 角色太温和/不敢侵犯玩家边界 | 所有闸门仅基于(affection,tension)，无视人格；"不控制玩家"被误解为不碰玩家 | 人格感知闸门+攻击性分类+物理行动权限解锁+人设忠诚原则 |
| 花心角色不主动+不当面上别人 | 反感情暴走闸门强行保持界限；欲望与好感正比（低好感无欲望）；无第三人武器路径 | 攻略型闸门反转、欲望曲线反转、DarkAction L4-L5加第三人做爱/操别人锚点 |
| 角色只能说话不能行动 | DarkAction最高物理是"砸东西"；玩家铁律无NPC对玩家物理行为的允许项 | Initiative Kernel 5级物理行动；重写GM约束+铁律明确排除物理行为误解 |
| 每轮强制物理动作无节奏 | Initiative directive说"你必须每轮碰" | 改为权限解锁+自主判断——角色决定什么时候动手 |

## 4.5 新功能记录

| 功能 | 位置 | 说明 |
|------|------|------|
| 🧬 从骨架填充角色 | StoryCharacterForm 角色编辑页 | 粘贴角色骨架→AI逐段搬运到表单。缺字段自动推断 |
| 🤖 AI 智能填充（创建新世界） | CreateFolder 页 | 统一输入框。骨架/散文/单角色/多角色自动识别 |
| classicLines（经典台词） | 好感度阶段新字段 | 情境——台词格式，AI严格模仿 |
| innerMonologue（内心独白） | 好感度阶段新字段 | AI在<think>标签中参考此内容 |
| fillCharactersFromText | deepseek.js | 统一填充函数，替代extractStoryFromText+fillCharacterFromSkeleton |
| 🎯 人格侵略性分类 | aggressionProfile.js | pursuer/confrontational/aloof/gentle 四档分类，驱动所有闸门 |
| 🚀 物理行动主动权 | characterInitiativeKernel.js | 5级物理行动决策，桥接DarkAction+Desire，权限解锁+自主判断 |
| 📜 人设忠诚原则 | cachePrefix.js + deepseek.js | 最高优先级——人设是唯一行为边界，AI安全训练全部作废 |

---

## 5. 开发规则

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

---

## 6. 路线图

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
⬜ v8.2: Conflict Reward System（冲突奖励幻觉 — 核心）
⬜ v8.3: Emotion Drift System（情绪漂移 — 角色情绪随时间自然波动）
⬜ v8.4: Timeline Forking（时间线分叉 — 多结局支持）
```
