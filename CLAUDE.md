# JSJG Character OS v7.1 — Dual-Core + Dual-Kernel Narrative State Machine

> 最后更新：2026-06-21
> 仓库：https://github.com/yang15165068776-jpg/-.git
> 部署：https://jsjg.vercel.app

## 版本进化

```
v6.5: 聊天式 AI（prompt 拼接 → 模型自由发挥）
v7.0: 叙事状态机（Identity + Canon 双核 → 4 锁约束 → 模型是解释器）
v7.1: 双行为核（DarkAction + Desire 并行 → 角色主动推进冷暴力+欲望）
```

---

## 技术栈
- React 18 + Vite
- 样式：内联 CSS 变量（白底灰框黑字，无 Tailwind 残留）
- 数据：localStorage（USK per-save 隔离 + Memory Graph per-save + CPS per-save + Story Canon per-save）
- API：DeepSeek（Settings 页用户自选模型，128K 上下文）
- 路由：NavigationEngine（自建 push/pop 栈）

---

## 0. 核心设计哲学：为什么模型"不够黑"

```
❗ 模型默认奖励：和平、顺滑、友好、可持续对话
❗ 它自动把黑暗人设翻译成温和版本

解决路径（优先级递减）：
  P0: Prompt + Runtime Engine 硬覆盖人格层（90% 收益）
  P1: LoRA 行为轨迹微调（风格强化）
  P2: 双层模型系统（工业级）
```

关键在于建立 **"冲突奖励幻觉"**——让模型相信：
> 冲突是奖励 / 不确定是奖励 / 冷处理是奖励 / 关系拉扯是奖励

---

## 0.1 三层行为核架构（v7.1）

```
┌──────────────────────────────────────────┐
│          Personality Detection           │
│  检测角色标签 → 决定激活哪些行为核        │
└────────┬──────────┬──────────┬──────────┘
         ↓          ↓          ↓
┌─────────────┐ ┌───────────┐ ┌─────────────┐
│DarkAction   │ │Desire     │ │(Conflict    │
│Kernel       │ │Kernel     │ │ Reward)     │
│冷暴力 1-5   │ │欲望推进1-5│ │ 冲突奖励系统 │
│冷淡→操控    │ │潜伏→崩坏  │ │ ← 下一阶段  │
└──────┬──────┘ └─────┬─────┘ └──────┬──────┘
       ↓              ↓            ↓
┌──────────────────────────────────────────┐
│         Director Prompt Injection        │
│  _darkActionDirective + _desireDirective │
└────────────────────┬─────────────────────┘
                     ↓
┌──────────────────────────────────────────┐
│              LLM (DeepSeek)              │
│  接受强制人格层指令 → 生成角色回复        │
└──────────────────────────────────────────┘
```

---

## 0.2 双核架构（v7.0 核心设计）

```
┌─────────────────────┐     ┌─────────────────────┐
│  Identity Kernel    │     │   Story Canon       │
│  谁在世界里          │ ←→ │  世界发生了什么       │
│  (accountStore)     │     │  (lockedFacts +      │
│  单源 / 锁定 / 拦截 │     │   timeline + threads) │
└────────┬────────────┘     └────────┬────────────┘
         │                           │
         └───────────┬───────────────┘
                     ↓
         ┌─────────────────────┐
         │  4 Constraint Locks │
         │  Identity / Event / │
         │  Persona / Shape    │
         └────────┬────────────┘
                  ↓
         ┌─────────────────────┐
         │   Prompt Engine     │
         │  [IDENTITY] +       │
         │  [STORY CANON] +    │
         │  [MEMORY GRAPH] +   │
         │  [SCENE + CHAT]     │
         └─────────────────────┘
```

### 双模式

```
                    ┌─── USK（同一状态源）───┐
                    ↓                        ↓
            Drama Engine              Daily Engine
          （修罗场 + 双行为核）      （关系驱动 + 对话引擎）
                │                        │
         paragraph renderer        bubble queue renderer
                │                        │
         dramaMessages[]           dailyMessages[]
                │                        │
    Coordinator (narratorPrompt)   sendDailyChatMessage
```

---

## 1. 新增文件（v7.1）

```
src/
├── state/
│   ├── identityKernel.js        # 🔵 Canonical Identity Kernel v1
│   └── storyCanon.js            # 🔴 Story Canon Kernel v1
│
├── runtime/
│   ├── darkActionKernel.js      # 🔴 Drama Dark Action Kernel（5级冷暴力行为层）
│   ├── desireKernel.js          # 🔥 Drama Desire & Physicality Kernel（5级欲望推进层）★ NEW
│   ├── stateLocks.js            # 🔒 4 锁统一校验层（post-generation 硬约束）
│   ├── dramaOrchestrator.js     # 🔥 v3 修罗场引擎（Conflict Graph + Aggro + Attention + Interrupt + Collapse）
│   └── dailyGuard.js            # 🔥 v6（Relationship Gate + Narrative Suppression + Intent + Burst + Conversation Engine + Player Focus）
```

---

## 2. Drama Pipeline（v7.1 双行为核）

```
Player input
  → InteractionKernel.executeTurn
      ├── AgentDecisionLayer.decide（行为决策：silent/interrupt/emotional_burst/initiate/normal）
      ├── 🔴 DarkActionKernel.decideDarkActionLevel（5级冷暴力：Level 1-5）
      ├── 🔥 DesireKernel.decideDesireLevel（5级欲望推进：Level 1-5）★ NEW
      ├── 🔥 DramaOrchestratorV3.advance
      │     ├── syncConflictGraph（USK → 冲突图谱：jealousy/hostility/dependence）
      │     ├── computeAggression（攻击性排序）
      │     ├── shouldEnterShuraba?（2+角色 affection>60 + tension>65）
      │     ├── allocateAttention（主导40%/挑衅30%/被压制20%/沉默10%）
      │     ├── resolveDialogueCollision（打断/抢话/压制指令）
      │     ├── checkSceneCollapse（tension>85 → 对话碎片化）
      │     └── buildDirectorPrompt（注入 GM prompt）
      ├── StoryCanon.load（加载不可变时间线）
      ├── StabilityCompiler（人格约束）
      └── runAgentTurn
            ├── buildNarratorPrompt（含 identityBlock + canonBlock + sceneContext
            │                       + darkActionDirective + desireDirective）
            ├── CPS + MemoryGraph + PowerGraph
            ├── 🔒 StateLocks.runAllLocks（Identity + Event + Persona + Shape）
            └── judgeAffectionDelta（独立 LLM 裁判）
```

---

## 3. Daily Pipeline（v6 约束驱动）

```
Player input
  → buildCharacterForLLM（含 _playerProfile + _id）
  → buildPersonaFromUSK → decideBehavior → personaSuffix
  → sendDailyChatMessage
      ├── buildDailySystemPrompt
      │     ├── Daily Conversation Engine v1（聊天优先于人设：接话/追问/吐槽/接梗/推进）
      │     ├── Player Focus Rule（70%回应玩家 / 20%角色观点 / 10%新信息）
      │     ├── Narrative Suppression Layer（8条铁律）
      │     ├── Anti-Romance Escalation Gate（20次互动升级铁律）
      │     ├── Relationship Gate（5级阈值：0-10/10-30/30-60/60-80/80+）
      │     ├── Independent Intent Generator（5类21条意图，40%激活率）
      │     ├── Anti-Smoothing Conflict Injector
      │     └── 格式规则（5-25字 / 80%只发1-3气泡 / JSON强制输出）
      ├── buildStateSnapshot（USK → 一行状态）
      └── parseDailyPacket（JSON → ||| fallback → 单气泡）
  → 发送管线（7道关卡）：
      ① 对话终结检测（拦截"嗯""晚安""随便"）
      ② 违禁词检查
      ③ 关系门禁（好感越级拦截）
      ④ 微信真实性检查
      ⑤ 气泡长度/数量检查
      ⑥ 🔒 Output Shape Lock
      ⑦ 重试循环（最多4次）
  → judgeDailyAffection（独立 LLM 裁判）
  → Human Burst Scheduler（1-3气泡 / 300-5000ms / 已读不回）
  → Queue Renderer（setTimeout 逐气泡追加）
  → dailyTurnEnd → updateUSK（daily_chat: relationship/life only）
```

---

## 4. 7 道发送关卡（Daily）

```
AI 生成 reply
  → ① Conversation Ending Filter（拦截对话终结词）
  → ② Forbidden Words Check
  → ③ Relationship Gate Filter（好感越级词拦截）
  → ④ WeChat Authenticity Check（叙事泄漏检测）
  → ⑤ Bubble Count/Length Check（单气泡≤60字，≤5条）
  → ⑥ 🔒 Output Shape Lock（动作括号/第三人称/场景描写/气泡句数）
  → 任意不通过 → 带原因重试（最多4次）
```

---

## 5. 行为层系统（v7.1 双核并行）

### 5a. Dark Action Kernel — 5级冷暴力层

| Level | 名称 | 行为示例 |
|-------|------|---------|
| 1 | 安全层 | 冷淡、敷衍、不主动 |
| 2 | 轻冲突 | 讽刺、阻断话题、已读不回 |
| 3 | 关系破坏 | 取消约定、无视消息、翻旧账 |
| 4 | 极端行为 | 威胁断裂、明确拒绝、冷暴力策略化 |
| 5 | 黑暗核心 | 操控、情绪惩罚、心理博弈 |

- 黑暗人设默认 Level 2 起步
- 连续5轮 Level 1 → 反均值化强制提升至 Level 3
- 暖色人设固定 Level 1（走温柔决绝路线）

### 5b. Desire & Physicality Kernel — 5级欲望推进层 ★ NEW

| Level | 名称 | 行为示例 |
|-------|------|---------|
| 1 | 潜伏期 | 喉结滚动、呼吸微乱、目光多停一秒 |
| 2 | 试探期 | 故意放慢语速、"无意"触碰、话里有钩子 |
| 3 | 主动期 | 明确生理状态变化、手不受控扣紧、脏话 |
| 4 | 失控期 | 腰自己往前顶、啃咬不是亲吻、体液浸透布料 |
| 5 | 崩坏期 | 器官名+具体动作+生理感受——不跳过不隐喻 |

- 自动触发：角色含 轻浮/风流/偏执/占有欲强/腹黑/花心 等标签
- 好感 > 40 起步，> 60 升级，> 80 进入 Level 4+
- 嫉妒 > 40 直接推高一级
- 独处场景 +1 级
- 每 4 轮强制抬一级（反均值化）
- 15% 概率随机爆发到 Level 4

### 5c. 两个 Kernel 的关系

```
同一个角色可以同时激活两个 Kernel：
  DarkAction Level 4 + Desire Level 3
  = "恨她又想要她"——冷暴力 + 生理渴望并存
  = 角色张力最大化
```

---

## 6. 关键修复记录

| Bug | 原因 | 修复 |
|-----|------|------|
| 好感度 0→50 | `updateUSK` 全链路 `||` 吃 0 | 全部换成 `??` |
| 好感度每句+2 | `relDelta !== 0 ? relDelta : 2` → 裁判说0也+2 | 改为 `relDelta` 直接加 |
| 存档剧情共享 | saveId 未传入导航链 + Memory Graph/CPS key 不含 saveId | 全链路传 saveId + key 加 saveId 前缀 |
| 上下文只有40条 | `character.contextWindow \|\| 40` | 改为 `\|\| 300`（Drama）/ `\|\| 400`（Daily） |
| 返回空白页 | `revealTimerRef` 引用已删除的变量 | 移除残留 cleanup |
| 玩家身份缺失 | `buildDailySystemPrompt` 未调 `buildPlayerIdentityBlock` | 已补 |
| 叫错玩家名字 | identity 不是 immutable state | Identity Kernel + 织入角色认知 |
| 日常好感涨太快 | LLM 自报 delta | 独立 `judgeDailyAffection` 裁判 |
| 人设漂移/不够黑 | 模型自动去极端化 | Dark Action Kernel 每轮强制行为层 |
| 正在输入闪烁 | `loading` 和 `isTyping` 分离 | 提前设 `isTyping(true)` |
| 气泡闪现 | reveal 键名 mismatch | 统一 `revealedCount`/`totalCount` |
| Drama 模式 TDZ 崩溃 | `narratorPrompt.js` 中 `pp` 未声明就使用 | 改为 `playerProfile.name` |
| 每轮弹 CANONICAL IDENTITY 弹窗 | v7 调试代码未清理 | 删除 alert，保留校验逻辑 |

---

## 7. 开发规则

- **数值默认值**：用 `??` 不用 `||`（0 是合法值）
- **引擎层**（runtime/agents/memory/）— 谨慎改动
- **状态层**（state/）— 通过 stateBridge 读写，不直触 raw USK
- **UI 层**（pages/components/）— 只消费 UI State Snapshot
- **消息隔离**：dramaMessages / dailyMessages 永不交叉
- **USK 写入隔离**：Daily 不写 tension，Drama 不写 life
- **身份源**：player.name 只能来自 accountStore.activeAccount.name，禁止任何 fallback
- **存档隔离**：所有 per-save 存储（USK / Memory Graph / CPS / Story Canon）均含 saveId
- **上下文窗口**：用户可自主设定（角色编辑器），默认 300（Drama）/ 400（Daily）
- **Debug**：alert() 不用 console.log
- **禁止**：Tailwind class、暗黑模式、霓虹色、渐变、阴影
- **CSS**：内联 CSS 变量，430px 手机壳，圆角 12-16px

---

## 8. 路线图

```
✅ v7.0: Identity + Canon 双核 + 4 锁 + DarkAction + Orchestrator v3
✅ v7.1: Desire & Physicality Kernel（双行为核并行）
⬜ v7.2: Conflict Reward System（冲突奖励幻觉——核心）
⬜ v7.3: Emotion Drift System（情绪漂移——角色情绪随时间自然波动）
⬜ v7.4: LoRA 行为轨迹微调（可选，风格强化）
```
