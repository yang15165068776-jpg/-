# 角色扮演对话 App

## 技术栈
- React 18 + Vite
- Tailwind CSS 3
- 数据全部 localStorage
- DeepSeek API（OpenAI 兼容格式，base URL: https://api.deepseek.com）
- 部署在 Vercel: https://jsjg.vercel.app

## 双模式架构
- **日常模式（daily）**: `chatStyle: 'casual'`，微信风格气泡，`|||`分隔多条消息，`ACTION:`/`THOUGHT:` 前缀表示动作/心理
- **剧情模式（story）**: `chatStyle: 'story'`，GM 第三人称全知叙事，小说文体，`buildGMPrompt` 组装 GM 系统提示
- 角色创建：日常用 `CharacterForm.jsx`，剧情用 `story/StoryCharacterForm.jsx`，改动需双向同步
- `ChatRoom.jsx` 根据 `character.chatStyle` 走不同渲染分支

## 项目结构
```
src/
├── main.jsx              # 入口
├── index.css              # Tailwind + 动画
├── App.jsx                # 状态路由（模式+页面切换）
├── utils/
│   ├── storage.js         # localStorage CRUD + QuotaExceeded 保护
│   └── deepseek.js        # API 调用，system prompt 组装，违规检测重试
└── pages/
    ├── CharacterList.jsx  # 角色库
    ├── CharacterForm.jsx  # 日常角色创建/编辑
    ├── ChatRoom.jsx       # 通用对话页（双模式渲染）
    ├── Settings.jsx       # API Key、模型选择、用户头像
    ├── story/
    │   ├── StoryCharacterForm.jsx  # 剧情角色创建（含可攻略角色）
    │   └── StoryChat.jsx           # 剧情模式入口（传 mode="story"）
    └── daily/
        └── DailyChat.jsx           # 日常模式入口（传 mode="daily"）
```

## 角色 JSON 结构
- id, name, avatar(base64), background, nickname
- chatStyle: 'casual' | 'story'
- styleRules[] - 文风规则
- forbiddenWords[] - 禁止行为词，命中后自动重试（最多3次）
- affectionEnabled, affectionInitial, affectionStages[]
- thinkingEnabled, thinkingPrompt
- activeMessageEnabled, activeInterval, activeCondition, activePrompt
- autonomyBehavior - AI 生成的自主行为总结
- **剧情模式专属**: protagonistName/Background/Personality, worldSetting, storyTone, romanceCharacters[], npcs[]

## System Prompt 组装

### 剧情模式（buildGMPrompt）
1. GM 身份 + 主角设定（强调禁止控制主角）
2. 世界观
3. 可攻略角色（含好感度阶段/行为规则/增减规则）
4. NPC 设定
5. 角色调度规则
6. 对话标注格式（【角色名】前缀）
7. 思考指令（强制 `<think>...</think>`）
8. 写作风格（300-500字，小说文体）
9. 好感度结算（`<affection>` 标签）

### 日常模式（buildSystemPrompt）
1. 强制性框架 + 格式警告
2. background
3. autonomyBehavior（如有）
4. 文风规则
5. 好感度阶段/增减规则
6. 思考指令（如有，`<think>...</think>`）
7. 日常流派规则（ACTION:/THOUGHT: 前缀，||| 分隔）
8. 强制性框架收尾

## 思考层（Think）处理
- **System prompt**: 要求 AI 用 `<think>...</think>` 标签包裹思考（禁止【思考】【分析】等文字标题）
- **解析（`parseThinkBlock`）**: 三层正则兜底匹配
  1. `<think>...</think>` — 主格式
  2. `【思考】...【/思考】` — 闭合格式兜底
  3. `【思考】...` — 裸标题兜底（到下一段非空行或文末）
- **渲染**: `ThinkToggle` 组件用原生 HTML `<details>`/`<summary>` 元素（不用 React state + CSS transition），移动端折叠可靠
- **清洗**: `cleanAndSplitResponse` 和 fallback 都支持三种格式的移除

## GM 主角约束
- `buildGMPrompt` 开头有 `【极重要约束——主角行为控制权】` 段落
- 禁止 AI 描写主角动作、替主角说话、描写主角心理、替主角做决定
- 只能写到其他角色说完话/做完动作，然后停止等待用户输入

## 关键设计决策
- API 调用用 fetch，不用任何第三方库
- 流式回复：SSE 解析 + 逐 token 回调 + 完成后再做违规检测
- 违规重试：告知模型具体命中的违禁词
- 头像：选图自动压缩到200px、JPEG 70%质量转base64
- 路由：App.jsx 用 useState 实现简单状态路由，无 react-router
- 主动消息定时器在 ChatRoom 挂载时启动，卸载时清理
- **60s AbortController 超时**: `streamCompletion` 和 `sendCasualReply` 都有超时保护
- **流式错误处理**: 中途断开保留部分内容（`isPartial: true`），完全失败显示红色重试气泡（`isRetry: true`）
- **好感度越界保护**: `clampAffection` 基于阶段 min/max 限制，进度条百分比用实际范围计算
- **localStorage 保护**: `safeSetItem` 捕获 QuotaExceededError → `cleanOldMessages` 截断旧消息（保留最近20条）→ 重试一次 → alert 提示
