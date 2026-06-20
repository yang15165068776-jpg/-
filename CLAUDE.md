# JSJG Character OS v6.4

> 最后更新：2026-06-20
> 仓库：https://github.com/yang15165068776-jpg/-.git
> 部署：https://jsjg.vercel.app

## 技术栈
- React 18 + Vite
- 样式：内联 CSS 变量（白底灰框黑字，无 Tailwind 残留）
- 数据：localStorage
- API：DeepSeek（OpenAI 兼容，https://api.deepseek.com）
- 路由：NavigationEngine（自建 push/pop 栈，无 React Router）

---

## 0. 账户系统（v6.4 新增）

```
Account（玩家身份 = 一部手机）
  ├── id, name, avatar, gender, personalityTags, description
  │
  ├── Folder A（世界）
  │     ├── Character X（角色）
  │     └── Saves + USK
  │
  └── Folder B（世界）
        └── ...
```

- **Storage**：`jsjg_accounts` (Account[]), `jsjg_active_account` (string)
- **Folder 归属**：Folder.accountId 关联到账户
- **玩家→AI 链路**：DramaPage/DailyPage 将 activeAccount 注入 `character._playerProfile`，deepseek.js 的 `buildPlayerIdentityBlock()` 将其写入系统 prompt
- **迁移**：首次加载自动从旧 `jsjg_player_profile` 迁移

---

## 1. 完整系统架构（7 层引擎）

```
Player Account (玩家身份)
        ↓
Character Profile (角色设定)
        ↓
StabilityCompiler     ← 人格编译锁死
        ↓
AgentDecisionLayer    ← 行为决策（打断/沉默/主动搭话）
        ↓
coordinator (LLM)     ← AI 生成回复
        ↓
AntiSmoothingV2       ← 输出后修正（防变温柔/反对齐）
        ↓
MemoryInterpreter     ← 双视角解释（同一事实/不同模式）
        ↓
CausalEngine          ← 因果叙事（数值变化→为什么）
        ↓
InteractionKernel     ← 执行与记忆（消息/好感/token/turn）
        ↓
UI（DramaPage / DailyPage）
```

---

## 2. 导航路由树

```
App.jsx (430px 手机壳 + StatusBar + BottomSafeArea)
│
├── [page='entry']           → Entry.jsx              ← 双栏布局：左工具栏/右主显示
├── [page='profile']         → PlayerProfile.jsx
├── [page='createFolder']    → CreateFolder.jsx        ← AI生成 + 角色编辑
├── [page='folder']          → FolderInterior.jsx      ← 存档大厅（两级流程）
├── [page='dramaPage']       → DramaPage.jsx           ← 剧情模式（段落叙事+流式）
├── [page='dailyPage']       → DailyPage.jsx           ← 日常模式（微信气泡+人格驱动）
├── [page='characterEditor'] → CharacterEditor.jsx     ← 角色编辑器
├── [page='settings']        → Settings.jsx            ← API Key 设置
│
└── [LEGACY, LEGACY_ENABLED=false, 均已封锁]
```

导航流：
```
Entry（双栏：左工具栏/右主显示）
  ├── 左栏（84px）：玩家缩略图 → 世界卡片(横条+名称) → 账号+设置图标
  ├── 右栏：大头像 + 世界观预览 + 创建按钮 + 进入按钮
  ├── 👤 头像 → PlayerProfile
  ├── ⚙ 设置 → Settings
  ├── + 创建 → CreateFolder → FolderInterior
  └── 世界卡片 → FolderInterior（选存档→选模式）
        ├── 📖 剧情 → DramaPage
        └── 💬 日常 → DailyPage
```

---

## 3. 文件树

```
src/
├── engine/                          # 引擎层
│   ├── navigationEngine.js          # 路由栈 push/pop/back + CustomEvent
│   ├── hydrationEngine.js           # 内存缓存 save/get/hydrate
│   ├── interactionKernel.js         # ⭐ 交互内核：消息/好感/token/turn 状态机
│   └── agentDecisionLayer.js        # ⭐ 角色决策层：规则评分→行为选择
│
├── state/                           # 状态层
│   ├── accountStore.js              # ⭐ 账户系统：多玩家身份 CRUD + 迁移
│   ├── unifiedStateKernel.js        # USK：4层20维 + 文件夹USK
│   ├── uskApi.js                    # USK 访问控制
│   ├── stateBridge.js               # UI↔USK 桥接
│   └── folderStore.js               # Folder/Save/PlayerProfile CRUD
│
├── pages/                           # 页面
│   ├── Entry.jsx                    # ⭐ 双栏首页（左84px工具栏/右主显示）
│   ├── DramaPage.jsx                # ⭐ 剧情模式（编辑/删除/重刷/压缩/好感±2/token）
│   ├── DailyPage.jsx                # ⭐ 日常模式（人格驱动+burst流+自动消息）
│   ├── PlayerProfile.jsx            # 玩家设定
│   ├── CreateFolder.jsx             # 创建世界（AI生成+角色编辑器）
│   ├── FolderInterior.jsx           # 存档大厅
│   ├── CharacterEditor.jsx          # 角色编辑器（思考层已移除）
│   └── Settings.jsx                 # API Key/Model
│
├── components/                      # UI 组件
│   ├── StatusBar.jsx                # 手机顶栏
│   ├── ProgressBar.jsx              # 进度条（支持 showValue 数字显示）
│   ├── EventActionPanel.jsx         # 剧情浮动面板（右侧垂直居中圆形图标）
│   ├── StatusPanel.jsx              # 日常右侧状态面板
│   └── Toast.jsx                    # 全局提示
│
├── runtime/                         # 运行时引擎
│   ├── stabilityCompiler.js         # ⭐ 人格稳定编译器（pre-generation lock）
│   ├── antiSmoothingV2.js           # ⭐ 输出后修正（防变温柔/反对齐）
│   ├── personaStateEngine.js        # ⭐ Daily v3 人格状态引擎
│   ├── causalEngine.js              # ⭐ 因果叙事引擎（数值→故事）
│   ├── affectionRules.js            # v4 好感度规则（LLM-primary judge）
│   ├── affectionTrigger.js          # 好感度触发判断
│   ├── conflictPersistence.js       # CPS 冲突持续
│   ├── powerDynamics.js             # 权力动力学
│   ├── antiSmoothing.js             # EPI 极端人格稳定（v1 prompt侧）
│   ├── alignmentSuppression.js      # ASL 对齐泄露检测
│   ├── personaIntegrity.js          # 人设完整性盾
│   └── tokenBudget.js               # Token 预算
│
├── memory/                          # 记忆系统
│   ├── memoryInterpreter.js         # ⭐ 双视角解释引擎（同一事实/不同模式）
│   ├── memoryGraph.js               # 事件原生图
│   ├── contextBuilder.js            # 上下文构建
│   ├── workingMemory.js             # 工作记忆
│   └── episodeSummarizer.js         # 情节摘要
│
├── agents/                          # 智能体
│   ├── coordinator.js               # v3 每轮编排
│   └── npcAgent.js                  # NPC 意图决策（9种意图）
│
├── world/                           # 世界引擎
│   ├── worldEngine.js               # 世界状态模拟
│   └── eventBus.js                  # 事件总线
│
├── prompt/                          # 提示词
│   ├── cachePrefix.js               # 核心系统前缀（含反幻觉规则）
│   └── narratorPrompt.js            # 叙事者提示词（含反幻觉+禁止人设偏离）
│
├── utils/
│   ├── deepseek.js                  # DeepSeek API（含结构化压缩/日常prompt）
│   └── storage.js                   # localStorage 存取
│
└── hooks/
    └── useAutoMessage.js            # legacy 自动消息
```

---

## 4. CSS 设计系统

```css
:root {
  --bg: #ffffff;        --bg2: #f6f5f3;       --bg3: #ebeae6;
  --text: #2b2b2b;      --text2: #6b6b6b;      --text3: #a3a3a3;
  --border: #e3e2de;    --border2: rgba(0,0,0,0.05);
  --purple: #7F77DD;    --purple-l: #EEEDFE;   /* 好感度 */
  --teal: #1D9E75;      --teal-l: #E1F5EE;     /* 正面 */
  --coral: #D85A30;     --coral-l: #FAECE7;    /* 负面/张力 */
}
```

- 禁止 Tailwind class、暗黑模式、霓虹色、渐变、阴影
- 圆角：12-16px，字体：-apple-system, BlinkMacSystemFont, system-ui
- 所有页面在 430px 宽度手机壳内渲染

---

## 5. 数据模型

### Account → localStorage['jsjg_accounts'] + localStorage['jsjg_active_account']
### Folder → localStorage['jsjg_folders']（含 accountId 归属）
### Save → localStorage['jsjg_folder_saves_(id)']
### USK → localStorage['jsjg_folder_usk_(id)']
### Settings → localStorage['rp_settings']
### ~~PlayerProfile~~ → localStorage['jsjg_player_profile']（已废弃，首次加载自动迁移到 Account）

---

## 6. DRAMA/DAILY 隔离

- DRAMA：Save.dramaMessages[]，段落叙事+流式光标
- DAILY：Save.dailyMessages[]，微信气泡+burst流+人格驱动
- 好感度/USK 共享（同一 `jsjg_folder_usk_<id>`）
- MemoryInterpreter 提供双视角解释

---

## 7. 核心引擎 API

### InteractionKernel
```js
init(folderId, chars, mode)        // 初始化→state snapshot
executeTurn(text, apiKey, cb, char)// 完整一轮→result
getDecision()                      // 当前决策
getTokenUsage()                    // token统计
manualAffectionAdjust(name, delta) // 手动±好感
compressMessages()                 // 压缩
// 消息CRUD: getLastUserMessage/rollbackTo/deleteLastPair/
//           deleteMessageAtIndex/editMessageAtIndex/getUserMsgBefore
```

### AgentDecisionLayer
```js
decide({ uskState, messages, mode, turnCount, passiveTurns })
  → { type, intensity, burst, emotion, reason, urgency }
// types: normal_reply | interrupt | emotional_burst | initiate_chat | silent
```

### PersonaStateEngine (Daily v3)
```js
buildPersonaFromUSK(uskState) → persona
decideBehavior(persona) → 'cold_short_reply' | 'resist_or_push_back' | ...
composeBurst(intent, segments) → timed burst
getPersonaPromptSuffix(persona, behavior) → prompt injection
```

### StabilityCompiler
```js
compile(character) → { persona, constraints, invariants }
validate(runtimeState, compiled) → { valid, corrections }
buildPromptInjection(compiled) → LLM constraint block
```

### CausalEngine
```js
analyze(prevUSK, nextUSK, mode, context) → { diff, causes, narrative }
```

### MemoryInterpreter
```js
interpret(event, mode, context) → { meaning, weight, tension_delta, affection_delta }
// Drama View: conflict amplification
// Daily View: emotional amplification
```

---

## 8. DailyPage v3 特性

- **人格驱动**：PersonaStateEngine 根据 USK 状态选择 7 种行为策略
- **Burst 流**：`|||` 分隔多条气泡，人格驱动延迟（冷淡1200ms/依赖250ms）
- **自动消息**：Header "自动"开关，15-40s 间隔检查，概率=好感×0.5%+孤独×0.4%+张力×0.3%
- **反叙事污染**：parseCasualReply v2 强制拆分+剥离第三人称
- **角色侧边栏**：56px 宽，40px 圆形头像，紫色选中边框，未读角标

---

## 9. DramaPage v6 特性

- **每条消息悬停按钮**：✏️编辑（回输入栏）、🗑删除、🔄重刷
- **编辑非破坏性**：点编辑只回填文本，取消编辑恢复原样
- **压缩**：AI 结构化压缩（events/relationships/skeleton/last_scene）
- **好感度**：±2 手动按钮 + 数值显示
- **Token 显示**：进度条下方实时统计
- **决策指示器**：进度条下方显示当前角色行为决策

---

## 10. 好感度系统 v4

- **LLM-primary judge**：每3轮+高信号+关键词→LLM裁判裁决
- **规则兜底**：锚点压制场景锁死（不调LLM）
- **冷却机制**：中性回合跳过，不浪费API
- **手动±2**：进度条旁按钮，写入USK

---

## 11. 反幻觉规则

- **narratorPrompt.js**：🚫 禁止编造NPC/配角/地点/物品/事件
- **cachePrefix.js**：Priority 0 ANTI-HALLUCINATION 检查
- **AntiSmoothingV2**：输出后剥离30+种"变乖"语言模式

---

## 12. 已知问题与近期修复

### ✅ 已修复
- **好感度 0→50**：CreateFolder AI 提取 `||` 吃 0，已改 `??`
- **Coordinator 状态泄漏**：切换文件夹旧好感度残留，`resetAgentTurn()` 归零
- **日常消息闪烁**：新消息 reveal 前显示 0 条气泡
- **思考层移除**：CharacterEditor/CreateFolder UI 已删，API 不再请求 thinking
- **反幻觉硬约束**：禁止编造 NPC/地点/物品/事件

### ⚠️ 已知问题
- CharacterEditor 与 CreateFolder 内编辑器代码重复
- DailyPage 好感度变化未接入 LLM judge（`delta: 0` 硬编码）
- Settings 部分旧 UI 残留

### ✅ v6.4 修复
- **玩家→角色链路**：PlayerProfile 数据现在通过 `character._playerProfile` 注入 AI prompt，角色能认识玩家
- **多账户系统**：支持多个玩家身份，每个身份有独立的世界列表，切换身份 = 换手机
- **PlayerProfile 重写**：支持账户 CRUD，设定 textarea 已绑定
- **角色编辑器清理**：移除 protagonist 字段（改为账户级管理）

---

## 13. 开发规则

- **引擎层**：runtime/ agents/ memory/ world/ prompt/ — 不可动
- **新建引擎**：interactionKernel/ agentDecisionLayer/ stabilityCompiler/ antiSmoothingV2/ personaStateEngine/ causalEngine/ memoryInterpreter — 可扩展
- **状态层**：state/ — 谨慎改动
- **UI 层**：pages/ components/ — 随意改（遵循CSS变量）
- **数值输入**：safeInt()/safeFloat()，禁止 parseInt||50（0是falsy）
- **禁止复用 legacy 组件**
- **消息隔离**：getSaveMessages(id, folderId, mode) / saveSaveMessages()
- **Debug**：alert() 不用 console.log
