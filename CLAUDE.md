# JSJG Character OS v6

> 最后更新：2026-06-19 (UI 工程规范完成)

## 技术栈
- React 18 + Vite
- Tailwind CSS 3（逐渐迁移到内联 CSS 变量）
- 数据：localStorage
- API：DeepSeek（OpenAI 兼容，https://api.deepseek.com）
- 部署：Vercel https://jsjg.vercel.app

## 导航结构（v6 Phase 3 — 完整功能链路）

```
Entry（默认首页）
  ├── 👤 → PlayerProfile（玩家设定）
  ├── ⚙ → Settings
  ├── + → CreateFolder（AI生成/手动）
  │     └── 创建成功 → FolderInterior
  ├── 📁 世界卡片 → FolderInterior（存档大厅）
  │     ├── 📖 剧情模式 → CharacterHome/ChatRoom（文件夹USK驱动）
  │     └── 💬 日常模式 → CharacterHome/ChatRoom（文件夹USK驱动）
  └── "旧版角色列表" → CharacterList（legacy 兼容，依然可用）
```

## 数据流（v6 完整）

```
Folder（世界容器）
  ├── characterData[]（内联角色数据）
  ├── Save[]（时间点存档，仅存消息）
  └── Folder USK（jsjg_folder_usk_<folderId>）
        ├── characters: { [name]: { relationship, emotion, tension, life } }
        ├── global_state: { world_tension, folder_mood }
        └── event_memory: []

ChatRoom（检测 _v6FolderId）
  ├── 文件夹模式 → initBridgeForFolder() → 文件夹 USK
  │     ├── 消息存取 → folderStore.updateSaveMessages()
  │     └── 状态更新 → USK_API.write() → persist() → saveFolderUSK()
  └── Legacy 模式 → initBridge() → 角色 USK（不变）
```

## v6 Phase 1 新增：Folder 数据模型 + 文件夹级 USK

### Folder（世界容器）
```
Folder = {
  id, name, worldview, story_intro,
  characterIds[],     // 引用的 legacy 角色 ID
  characterData[],    // 文件夹内原生角色数据
  saveIds[],          // 存档 ID 列表
  createdAt, updatedAt,
}
```
- 存储 key: `jsjg_folders`（数组）
- 代码: `src/state/folderStore.js`

### Save（时间点存档 — 文件夹内）
```
Save = {
  id, folderId, name,
  messages[],         // 仅存消息，不含 affection
  createdAt, updatedAt,
}
```
- 存储 key: `jsjg_folder_saves_<folderId>`（对象）
- **关键规则：状态永远来自 USK，Save 不存储 affection**

### USK（v6 扩展 — 文件夹级 + global_state）
```
USK = {
  version, folderId,
  characters: { [charId]: { relationship, emotion, tension, life } },
  global_state: { world_tension, folder_mood },   // ← v6 新增
  global: { currentMode, turnCount, ... },
  event_memory: [],
  initiative: { score, ... },
}
```
- 存储 key: `jsjg_folder_usk_<folderId>`（v6 新）
- 旧 key `jsjg_usk_<characterId>` 保留兼容
- 代码: `src/state/unifiedStateKernel.js`

### PlayerProfile（v6 新增）
```
{ name, avatar, gender, personalityTags[] }
```
- 存储 key: `jsjg_player_profile`

## 数据迁移策略
- **新老并存**：旧 `story_characters` / `daily_characters` 继续可用
- **Folder 是新主系统**：legacy 角色可通过 `importLegacyCharacterToFolder()` 导入
- **不强制自动迁移**：用户手动选择导入哪些角色
- 导入函数: `folderStore.importLegacyCharacterToFolder(folderId, character, mode)`

## 系统分层

```
UI Layer         ← 只改这里
  CharacterHome, ChatRoom, CharacterList, ArchiveList
  Settings, CharacterForm, StoryCharacterForm
  Components: ChatHeader, DailyRenderer, DramaRenderer, ChatInput, TypingIndicator, Toast
Hooks            ← useAutoMessage
State Bridge     ← stateBridge.js, uskApi.js
Folder Store     ← folderStore.js（v6 新增 — Folder CRUD + Save + PlayerProfile）
USK v1.0         ← unifiedStateKernel.js（4 层 20 维 + global_state）
Persona          ← personaCore.js
Runtime Engines  ← ASL, CPS, PowerDynamics, ModeTranslator, AntiSmoothing, AffectionRules
Agents/World     ← Coordinator, NPC Agent, WorldEngine, EventBus
Memory           ← MemoryGraph, ContextBuilder, EventMemory
Prompt           ← cachePrefix.js, narratorPrompt.js
API/Storage      ← deepseek.js, storage.js
```

## 引擎层（绝对不要动）

```
src/state/      ← USK, USK_API, StateBridge, folderStore
src/agents/     ← Coordinator, NPC Agent
src/runtime/    ← ASL, CPS, Power, AntiSmoothing, ModeTranslator
src/memory/     ← MemoryGraph, ContextBuilder
src/prompt/     ← CORE_SYSTEM_PREFIX, NarratorPrompt
src/world/      ← WorldEngine, EventBus
src/utils/      ← deepseek.js, storage.js（API 调用可改，存储逻辑不动）
src/persona/    ← personaCore.js
```

## UI 层（可改）

```
src/App.jsx                     — 手机壳容器（StatusBar + 主内容 + BottomSafeArea）+ Toast + 路由
src/pages/
  Entry.jsx                     — v6 开场页（大头像 + 横滑世界卡片 + 创建按钮）
  PlayerProfile.jsx             — v6 玩家设定（头像/名字/性别/性格标签）
  CreateFolder.jsx              — v6 创建世界（AI 生成 + 手动表单 + 角色预览）
  FolderInterior.jsx            — v6 存档大厅（FAB + 模式按钮组 + long-press 删除）
  CharacterList.jsx             — 首页角色列表（CSS 变量风格，legacy）
  CharacterHome.jsx             — 角色主页（支持 v6 文件夹 USK + legacy）
  ChatRoom.jsx                  — 对话核心（支持 v6 文件夹模式 + legacy）
  ArchiveList.jsx               — 存档列表（支持 v6 文件夹存档 + legacy）
  CharacterForm.jsx             — 日常角色表单（部分 Tailwind 残留）
  StoryCharacterForm.jsx        — 剧情角色表单（部分 Tailwind 残留）
  Settings.jsx                  — 设置页
  ModeSelect.jsx                — 旧首页（已废弃但保留）
src/components/
  StatusBar.jsx                 — v6 手机状态栏（时间/信号/电池）
  ProgressBar.jsx               — v6 进度条（好感/张力/信任等，支持 flash 动画）
  EventActionPanel.jsx          — v6 剧情浮动操作面板（骰子/编辑/删除 + 张力指示器）
  StatusPanel.jsx               — v6 日常右侧状态面板（关系/张力/状态/情绪）
  ChatHeader.jsx               — 顶部信息栏 + 好感度条
  DailyRenderer.jsx            — 微信气泡列表
  DramaRenderer.jsx            — 小说叙事 + 流式光标
  ChatInput.jsx                — 自动伸缩输入框
  TypingIndicator.jsx          — 跳动圆点
  Toast.jsx                    — 自动消失提示
src/hooks/
  useAutoMessage.js            — USK 驱动自动消息
```

## 已知问题

1. **ChatRoom USK 状态覆盖**：`dailyTurnEnd`/`dramaTurnEnd` 返回单角色 flat snapshot，会覆盖 ChatRoom 的 `usk` 状态（从完整 USK 变为单角色 slice）。下一轮 LLM 调用时 `buildStateSnapshot` 检测 `usk.characters` 缺失，跳过 USK prompt 注入。不影响功能但状态摘要会缺失。修复方向：Bridge 返回完整 USK snapshot 而非单角色 slice。

2. **CharacterForm / StoryCharacterForm**：部分字段仍使用旧 Tailwind 类名（深色主题）。
   修复方式：逐个替换 `className="bg-gray-800..."` → `style={{...}}`。
   已有 `inputStyle`/`labelStyle`/`sectionStyle` 内联样式可用，旧的 `inputClass`/`labelClass`/`sectionClass` 是空字符串别名（防崩溃）。

2. **DramaRenderer 流式输出**：已支持 `streamingText` prop + blink 光标。

3. **主动消息**：`useAutoMessage` hook 已挂入 ChatRoom。仅 DAILY 模式触发。
   pendingMessage 是 string，显示在 ChatHeader 下方的滑入提示条。

## 设计系统（CSS 变量）

```css
--bg, --bg2, --bg3       # 背景（白→浅灰→更浅）
--text, --text2, --text3  # 文字（黑→中灰→浅灰）
--border, --border2       # 边框
--purple, --purple-l      # 主色 + 浅底
--teal, --teal-l          # 绿色 + 浅底
--coral, --coral-l        # 红色 + 浅底
```

暗黑模式通过 `@media (prefers-color-scheme: dark)` 自动切换。
所有新建组件已使用 CSS 变量，不再硬编码颜色。

## 组件数据格式

**DailyRenderer**：`messages` 数组，每条 `{ role:'user'|'assistant', content:string }`。
内部解析 `|||` 分隔符为多个气泡。

**DramaRenderer**：同上 messages 格式。`streamingText` prop 额外支持流式文字。

**ChatRoom 关键 props**：
- `mode: 'daily'|'drama'`
- `onAffectionChange: (val) => void` — 好感度变化回调
- `archiveId: string|null` — 可选存档 ID
- `onBack: fn|null` — 返回回调（null = 嵌入 CharacterHome 中）

## 表单文件注意事项

- CharacterForm.jsx：`form.affectionStages` 数组，每项 `{ name, min, max, behavior }`
- StoryCharacterForm.jsx：`form.romanceCharacters` 数组 + `form.npcs` 数组
- 两个表单都有 `expandedCards` 展开/收起功能
- 改样式用 `inputStyle`/`labelStyle`/`sectionStyle`（内联对象），不要用 className
- 两个文件都定义了 `const inputClass=''` 等空别名，防止旧代码崩溃

## App.jsx 路由（v6 Phase 2）

```
page: 'entry' | 'profile' | 'createFolder' | 'folder' | 'list' | 'character' | 'form' | 'settings' | 'direct'
mode: 'story' | 'daily'
selectedCharacter: object | null
selectedFolder: object | null     ← v6 新增
```

**默认首页**：`page='entry'`（Entry 页面）

**新页面导航流**：
- Entry → Profile / CreateFolder / FolderInterior / Settings / LegacyList
- CreateFolder → (AI生成或手动) → FolderInterior
- FolderInterior → Drama/Daily → CharacterHome/ChatRoom（复用旧组件，`_v6FolderId` 标记）
- CharacterHome 返回 → 若有 `_v6FolderId` 则回 FolderInterior，否则回 LegacyList

Toast 全局状态通过 `showToast(message, type)` 在 App 层管理。
