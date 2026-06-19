# JSJG Character OS v6

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

## 1. 完整导航路由树

```
App.jsx (430px 手机壳 + StatusBar + BottomSafeArea)
│
├── [page='entry']           → Entry.jsx              ← 默认首页
├── [page='profile']         → PlayerProfile.jsx
├── [page='createFolder']    → CreateFolder.jsx        ← AI生成 + 角色编辑
├── [page='folder']          → FolderInterior.jsx      ← 存档大厅（两级流程）
├── [page='dramaPage']       → DramaPage.jsx           ← 独立剧情页（段落叙事）
├── [page='dailyPage']       → DailyPage.jsx           ← 独立日常页（微信气泡）
├── [page='characterEditor'] → CharacterEditor.jsx     ← 角色编辑器
├── [page='settings']        → Settings.jsx            ← API Key 设置
│
├── [LEGACY, LEGACY_ENABLED=false, 均已封锁]
│   ├── page='list'     → StoryCharacterList / DailyCharacterList
│   ├── page='form'     → StoryCharacterForm / DailyCharacterForm
│   ├── page='character'→ CharacterHome → ChatRoom
│   └── page='direct'   → DirectChat
│
└── 全局组件
    ├── StatusBar.jsx         ← 手机顶栏（时间/信号/电池）
    ├── Toast.jsx             ← 自动消失提示
    └── BottomSafeArea        ← 内联在 App.jsx
```

### 导航流

```
Entry（三栏：左卡片/中头像/右按钮）
  ├── 👤 头像 → PlayerProfile
  ├── ⚙ 设置 → Settings
  ├── + 创建 → CreateFolder
  │     ├── 🤖 AI生成 → 自动填充全部角色字段
  │     ├── 手动编辑每个角色（可展开卡片）
  │     └── 创建 → FolderInterior
  └── 世界卡片 → FolderInterior（存档列表）
        ├── 点击存档 → 底部弹出模式选择
        │     ├── 📖 剧情 → DramaPage
        │     └── 💬 日常 → DailyPage
        └── ✎ 编辑 → CharacterEditor
```

---

## 2. 系统架构

```
src/
├── engine/                     ← v6 新建：导航 + 状态恢复
│   ├── navigationEngine.js     ← push/pop/back 路由栈，NAV_CHANGE 事件
│   └── hydrationEngine.js      ← 内存缓存 + 存档加载，save/get/hydrate
│
├── state/                      ← 状态层
│   ├── unifiedStateKernel.js   ← USK：4层20维 + global_state + 文件夹USK
│   ├── uskApi.js               ← USK 访问控制（init/read/write/patch/tick）
│   ├── stateBridge.js          ← UI↔USK 桥接（支持文件夹USK）
│   └── folderStore.js          ← Folder/Save/PlayerProfile CRUD
│
├── pages/                      ← 页面（全部 v6 新建，除 Settings）
│   ├── Entry.jsx               ← 开场页（三栏布局）
│   ├── PlayerProfile.jsx       ← 玩家设定
│   ├── CreateFolder.jsx        ← 创建世界（AI + 角色编辑器）
│   ├── FolderInterior.jsx      ← 存档大厅（两级流程）
│   ├── DramaPage.jsx           ← 剧情模式（段落叙事, 0气泡）
│   ├── DailyPage.jsx           ← 日常模式（微信气泡, 0叙事）
│   ├── CharacterEditor.jsx     ← 角色编辑器（全字段）
│   ├── CharacterHome.jsx       ← 旧角色主页（仅 legacy, 已封锁）
│   ├── ChatRoom.jsx            ← 旧聊天核心（仅 legacy, 已封锁）
│   ├── ArchiveList.jsx         ← 旧存档列表（仅 legacy, 已封锁）
│   ├── CharacterForm.jsx       ← 旧日常角色表单（仅 legacy）
│   ├── Settings.jsx            ← 设置页（API Key/Model）
│   ├── DirectChat.jsx          ← 直接对话（仅 legacy）
│   ├── story/
│   │   ├── StoryCharacterForm.jsx  ← 旧剧情角色表单
│   │   └── CharacterList.jsx       ← 旧剧情角色列表
│   └── daily/
│       ├── CharacterForm.jsx       ← 旧日常角色表单包装
│       └── CharacterList.jsx       ← 旧日常角色列表
│
├── components/                 ← UI 组件
│   ├── StatusBar.jsx           ← v6 手机顶栏
│   ├── ProgressBar.jsx         ← v6 进度条（好感/张力/信任）
│   ├── EventActionPanel.jsx    ← v6 剧情浮动面板（🎲✏️🗑）
│   ├── StatusPanel.jsx         ← v6 日常右侧状态面板
│   ├── ChatHeader.jsx          ← 旧聊天头部（仅 legacy）
│   ├── DailyRenderer.jsx       ← 旧气泡渲染（仅 legacy）
│   ├── DramaRenderer.jsx       ← 旧叙事渲染（仅 legacy）
│   ├── ChatInput.jsx           ← 旧输入框（仅 legacy）
│   ├── TypingIndicator.jsx     ← 旧 typing 动画（仅 legacy）
│   └── Toast.jsx               ← 全局提示
│
├── runtime/                    ← 引擎层（不可改动）
│   ├── alignmentSuppression.js ← ASL 对齐泄露检测
│   ├── antiSmoothing.js        ← EPI 极端人格稳定
│   ├── conflictPersistence.js  ← CPS 冲突持续
│   ├── powerDynamics.js        ← 权力动力学
│   ├── personaIntegrity.js     ← 人设完整性盾
│   ├── modeTranslator.js       ← 模式翻译器
│   ├── affectionRules.js       ← 好感度规则
│   ├── affectionTrigger.js     ← 好感度触发
│   ├── tokenBudget.js          ← Token 预算
│   └── llmState.js             ← LLM 运行时状态
│
├── agents/                     ← 智能体
│   ├── coordinator.js          ← v3 每轮编排
│   └── npcAgent.js             ← NPC 并行处理
│
├── memory/                     ← 记忆系统
│   ├── memoryGraph.js          ← 事件原生图存储
│   ├── contextBuilder.js       ← 上下文构建
│   ├── workingMemory.js        ← 工作记忆
│   ├── episodeSummarizer.js    ← 情节摘要
│   └── eventExtractor.js       ← 事件提取
│
├── world/                      ← 世界引擎
│   ├── worldEngine.js          ← 世界状态模拟
│   └── eventBus.js             ← 事件总线
│
├── persona/                    ← 人设核心
│   └── personaCore.js          ← 统一人设（双模式单人格）
│
├── prompt/                     ← 提示词
│   ├── cachePrefix.js
│   └── narratorPrompt.js
│
├── hooks/
│   └── useAutoMessage.js       ← USK 驱动自动消息
│
└── utils/
    ├── deepseek.js             ← API 调用（sendDailyChatMessage / sendStoryStageMessage / extractStoryFromText）
    └── storage.js              ← localStorage 存取（含 PlayerProfile + Legacy helpers）
```

---

## 3. 数据模型

### Folder（世界容器）
```js
Folder = {
  id, name, worldview, story_intro,
  characterIds: [],       // legacy 角色引用
  characterData: [        // 文件夹内原生角色
    {
      id, name, avatar,
      personality, background, speakingStyle,
      styleRules: [], forbiddenWords: [],
      protagonistName, protagonistGender, protagonistBackground, protagonistPersonality,
      worldSetting, openingScenario, storyTone,
      affectionEnabled, affectionInitial,
      affectionStages: [{ name, min, max, behavior, coreState, playerStrategy, ... }],
      transitionTriggers, irreversibleMoment, erosionCondition, anchorSuppression,
      thinkingEnabled, thinkingPrompt,
      activeMessageEnabled, activePrompt,
      nickname, contextWindow, showTimestamp, temperature, topP,
      npcs: [{ name, relationship, personality }],
    }
  ],
  saveIds: [],
  createdAt, updatedAt,
}
```
存储 key: `jsjg_folders`

### Save（时间点存档）
```js
Save = {
  id, folderId, name,
  dramaMessages: [],     // DRAMA 独占（完全隔离）
  dailyMessages: [],     // DAILY 独占（完全隔离）
  createdAt, updatedAt,
}
```
存储 key: `jsjg_folder_saves_<folderId>`

### USK（统一状态核心）
```js
USK = {
  version: 1, folderId,
  characters: {
    [name]: {
      relationship: { affection, trust, dependency, respect, fear, possessiveness },
      emotion: { anger, sadness, jealousy, anxiety, curiosity, excitement },
      tension: { unresolved_conflicts, emotional_pressure, attraction_tension, power_imbalance },
      life: { busy, tired, lonely, social_need, mood, initiative_score },
    }
  },
  global_state: { world_tension, folder_mood },
  global: { currentMode, lastModeSwitch, turnCount, lastInteractionAt },
  event_memory: [],
  initiative: { score, lastActiveMessageAt, consecutivePassiveTurns },
}
```
存储 key: `jsjg_folder_usk_<folderId>` (v6) / `jsjg_usk_<characterId>` (legacy)

### PlayerProfile
```js
{ name, avatar, gender, personalityTags: [] }
```
存储 key: `jsjg_player_profile`

---

## 4. 存储 Key 总览

| Key | 内容 | 系统 |
|---|---|---|
| `jsjg_folders` | Folder[] | v6 |
| `jsjg_folder_saves_<id>` | { [saveId]: Save } | v6 |
| `jsjg_folder_usk_<id>` | 文件夹 USK | v6 |
| `jsjg_player_profile` | PlayerProfile | v6 |
| `rp_settings` | { apiKey, model, userAvatar } | 共享 |
| `story_characters` | legacy 角色[] | legacy |
| `daily_characters` | legacy 角色[] | legacy |
| `story_chat_archives` | legacy 存档 | legacy |
| `daily_chat_archives` | legacy 存档 | legacy |
| `jsjg_usk_<characterId>` | legacy USK | legacy |

---

## 5. DRAMA/DAILY 隔离设计

```
DRAMA 模式：
  ├── 数据流：Save.dramaMessages[]（独占，不可读 dailyMessages）
  ├── UI：段落叙事 + 左边框 + 角色标注 + 流式光标
  ├── 禁止：气泡 · 时间戳 · 微信样式 · 短消息
  └── 页面：DramaPage.jsx（独立，0 旧代码）

DAILY 模式：
  ├── 数据流：Save.dailyMessages[]（独占，不可读 dramaMessages）
  ├── UI：微信气泡 + typing 动画 + message burst + 时间戳
  ├── 禁止：长段文本 · 叙事 · 旁白
  └── 页面：DailyPage.jsx（独立，0 旧代码）

隔离保证：
  ├── folderStore: getSaveMessages(saveId, folderId, mode)
  ├── folderStore: saveSaveMessages(saveId, folderId, mode, messages)
  └── 物理隔离：两个独立的 page 组件，无共享 UI
```

---

## 6. CSS 设计系统（锁定）

```css
:root {
  --bg: #ffffff;
  --bg2: #f5f4f0;
  --bg3: #ebebeb;
  --card: #f5f5f5;
  --text: #222222;
  --text2: #666666;
  --text3: #999999;
  --border: #e6e6e6;
  --border2: rgba(0,0,0,0.06);
  --purple: #7F77DD;    --purple-l: #EEEDFE;
  --teal: #1D9E75;      --teal-l: #E1F5EE;
  --coral: #D85A30;     --coral-l: #FAECE7;
}
```
- 暗黑模式已禁用
- 圆角：8-14px
- 无霓虹色、无渐变、无阴影（仅极轻 box-shadow）
- 字体：-apple-system, BlinkMacSystemFont, system-ui

---

## 7. Kill Switch v2

```js
V6_ROUTES = ['entry', 'profile', 'createFolder', 'folder', 'dramaPage', 'dailyPage', 'characterEditor', 'settings']
LEGACY_ENABLED = false  // ChatRoom/CharacterHome/DirectChat 永不挂载
window.__LEGACY_LOCK__ = true

// 安全路由：safeSetPage → 所有非 v6 路由 → bounce to entry
// CSS 封锁：.legacy-ui, .chat-room, .character-home → display:none !important
```

---

## 8. 引擎层

### NavigationEngine (`src/engine/navigationEngine.js`)
```js
NavigationEngine.push(page, params)   // 推入栈 + 导航
NavigationEngine.back()               // 出栈 + 返回上一页
NavigationEngine.replace(page)        // 替换当前，不改栈
NavigationEngine.peekBack()           // 查看栈顶
NavigationEngine.current              // 当前页面名
NavigationEngine.currentParams        // 当前参数
```
事件：`NAV_CHANGE` (CustomEvent)，App.jsx 监听并同步 React state

### HydrationEngine (`src/engine/hydrationEngine.js`)
```js
HydrationEngine.save(folderId, mode, messages, usk)    // 缓存当前状态
HydrationEngine.get(folderId, mode)                     // 取缓存
HydrationEngine.hydrate(folderId, saveId, mode)         // 从存档加载
HydrationEngine.has(folderId, mode)                     // 检查缓存
HydrationEngine.clear()                                  // 清空
```

---

## 9. 已知问题

1. **ChatRoom USK 状态覆盖**：`dailyTurnEnd` 返回单角色 flat snapshot，覆盖完整 USK → 下一轮 LLM 缺少 state snapshot。不影响功能（状态持久化正常），仅影响 LLM prompt 中的状态摘要。

2. **Settings 页面为旧 UI**：Settings.jsx 仍使用部分 Tailwind 类名，与 v6 CSS 变量风格不完全一致。

3. **CharacterEditor 独立页面与 CreateFolder 内编辑器并存**：两个地方都可以编辑角色，存在代码重复。

---

## 10. 开发规则

- **引擎层不可动**：`src/runtime/`、`src/agents/`、`src/memory/`、`src/world/`、`src/persona/`、`src/prompt/`
- **状态层谨慎改动**：`src/state/`（USK/USK_API/StateBridge 改动需测试）
- **UI 层随意改**：`src/pages/`、`src/components/`（遵循 CSS 变量系统）
- **数值输入**：必须用 `safeInt()`/`safeFloat()`，禁止 `parseInt || fallback`（0 是 falsy）
- **禁止复用 legacy 组件**：新页面不允许 import ChatRoom/CharacterHome/DirectChat/DailyRenderer/DramaRenderer
- **DRAMA/DAILY 消息隔离**：用 `getSaveMessages(id, folderId, mode)` / `saveSaveMessages()`，不直接读写 messages 数组
- **Debug**：用 `alert()` 不用 `console.log`（用户偏好）
