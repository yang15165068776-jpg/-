# JSJG Character OS v6

> 最后更新：2026-06-19

## 技术栈
- React 18 + Vite
- Tailwind CSS 3（逐渐迁移到内联 CSS 变量）
- 数据：localStorage
- API：DeepSeek（OpenAI 兼容，https://api.deepseek.com）
- 部署：Vercel https://jsjg.vercel.app

## 导航结构（v6）

```
App 打开 → CharacterList（首页，剧情/日常切换）
  → 点击角色"对话" → CharacterHome（角色专属空间）
      ├── Tab 💬 日常 → ChatRoom (mode='daily')
      ├── Tab 📖 剧情 → ChatRoom (mode='drama')
      └── Tab 📁 存档 → ArchiveList（该角色的存档）
  → 右上角 ⚙ → Settings
```

## 系统分层

```
UI Layer         ← 只改这里
  CharacterHome, ChatRoom, CharacterList, ArchiveList
  Settings, CharacterForm, StoryCharacterForm
  Components: ChatHeader, DailyRenderer, DramaRenderer, ChatInput, TypingIndicator, Toast
Hooks            ← useAutoMessage
State Bridge     ← stateBridge.js, uskApi.js
USK v1.0         ← unifiedStateKernel.js（4 层 20 维状态）
Persona          ← personaCore.js
Runtime Engines  ← ASL, CPS, PowerDynamics, ModeTranslator, AntiSmoothing, AffectionRules
Agents/World     ← Coordinator, NPC Agent, WorldEngine, EventBus
Memory           ← MemoryGraph, ContextBuilder, EventMemory
Prompt           ← cachePrefix.js, narratorPrompt.js
API/Storage      ← deepseek.js, storage.js
```

## 引擎层（绝对不要动）

```
src/state/      ← USK, USK_API, StateBridge
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
src/App.jsx                     — 手机容器 + Toast + 路由
src/pages/
  CharacterList.jsx             — 首页角色列表（CSS 变量风格）
  CharacterHome.jsx             — 角色主页（顶部信息栏 + 底部 3 Tab）
  ChatRoom.jsx                  — 对话核心（ChatHeader 条件渲染）
  ArchiveList.jsx               — 存档列表（header 条件渲染）
  CharacterForm.jsx             — 日常角色表单（部分 Tailwind 残留）
  StoryCharacterForm.jsx        — 剧情角色表单（部分 Tailwind 残留）
  Settings.jsx                  — 设置页
  ModeSelect.jsx                — 旧首页（已废弃但保留）
src/components/
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

1. **CharacterForm / StoryCharacterForm**：部分字段仍使用旧 Tailwind 类名（深色主题）。
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

## App.jsx 路由

```
page: 'list' | 'character' | 'form' | 'settings' | 'direct'
mode: 'story' | 'daily'
selectedCharacter: object | null
characterId: string | null
```

Toast 全局状态通过 `showToast(message, type)` 在 App 层管理。
