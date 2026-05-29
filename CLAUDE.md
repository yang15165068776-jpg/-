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
1. GM 身份声明
2. **玩家角色铁律**（最高优先级，紧随 GM 声明之后）
3. 主角设定（如有 protagonistName）
4. 世界观
5. 可攻略角色（含好感度阶段/核心状态/玩家策略/上涨条件/语言样本/阶段禁止行为/自驱行为/动态冷却状态）
6. NPC 设定
7. 次要 NPC 规则
8. GM 角色调度规则
9. 思考指令（强制 `<think>...</think>`）
10. 写作风格（300-500字，小说文体）
11. 好感度结算（`<affection>` 标签）

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

## 玩家角色铁律（buildGMPrompt）
- 放在 GM 身份声明之后，优先级仅次于最高指令
- **可控范围**: NPC、可攻略角色、环境和场景
- **不可控范围**: 玩家台词、动作、心理/情绪、表情/身体反应
- **具体禁止**: 替玩家说话、描写玩家动作、用"你感到""你心想""你不禁"等描写内心、用"你下意识地""你忍不住"等替玩家反应、在玩家无输入时推进玩家行为
- **允许写法**: NPC/攻略角色视角观察和解读玩家（可错误解读）、环境对玩家的客观影响、以"等待你的回应"结尾
- 违反=任务失败，必须重写回复

## 好感度结算解析
- `<affection>` 标签格式: `<affection>角色名:+N</affection>` / `<affection>角色名:-N</affection>` / `<affection>角色名:0</affection>` / `<affection>无</affection>`
- 多个角色用逗号分隔: `<affection>林晚:+3,苏晨:-2</affection>`
- **`parseAffectionTags` 正则**: 同时匹配半角 `:` 和全角 `：` 冒号（`/^(.+?)\s*[:：]\s*([+-]?\d+)$/`），delta 为 0 时视为确认无变化
- **状态更新**: 解析后通过 `setAffections` 更新 state → 触发 progress bar 重渲染，同时写入 archive localStorage
- **进度条**: 实时读取 `affections?.[rc.name]` state，百分比基于阶段 min/max 实际范围计算，`clampAffection` 越界保护

## 轮次与冷却系统
- **轮次定义**: 一轮 = 用户发一条消息 + AI 返回完整回复
- **roundCount**: 存入 archive localStorage，每次完整回复后 +1
- **lastRiseRound**: `{ [角色名]: 上涨时的 roundCount }`，好感度发生非零变化时记录，存入 archive
- **冷却检查**: `roundCount - lastRiseRound[角色名] >= cooldownRounds` → 解锁上涨
- **动态注入**: `buildGMPrompt` 根据当前 roundCount/lastRiseRound/cooldownRounds 动态输出冷却状态（已解锁 ✓ / 锁定中 ✗）
- **数据流**: ChatRoom.doSend → sendMessageStream → buildSystemPrompt → buildGMPrompt，全链路透传 roundCount + lastRiseRound
- `USER_WRAPPER` 七步框架第一步末尾追加"只分析用户已输入内容，不推断替代用户未说出的反应"

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

## AI 一键提取（extractCharacterFromText / extractStoryFromText）
- 两个提取函数分别服务日常模式和剧情模式，prompt 覆盖所有新增字段
- **日常模式 prompt**: 返回 name/background/userTitle/styleRules/forbiddenBehaviors/thinking/affection（含阶段 coreState/playerStrategy/riseCondition/languageSamples/forbiddenBehaviors/autonomousBehaviors）+ transitionTriggers/irreversibleMoment/cooldownRounds/erosionCondition/anchorSuppression/autonomyBehavior/openingScene
- **剧情模式 prompt**: 返回故事名称/世界观/开场剧情/故事基调/可攻略角色（含完整好感度阶段+自驱行为+转折锚点+铁律字段）/主要NPC
- `handleExtract` 数据映射: AI 返回的 `behavior` → 表单的 `description`（自驱行为），`openingScene` → `openingScenario`，阶段丰富字段合并到日常模式简化结构
- 找不到的字段: 数组→[]，字符串→""，数字→0，布尔值→false

## AI 生成自驱行为（generateStageBehaviors）
- StoryCharacterForm 底部按钮，读取当前已填写的角色设定
- 为每个好感度阶段生成 3-5 条自驱行为（behavior + trigger）
- trigger 四选一: 超过N轮用户没主动互动 / 场景出现特定元素 / 好感度刚进入本阶段 / AI判断局面对自己不利
- 返回 `{stages: [{label, behaviors: [{behavior, trigger}]}]}` → 自动填入对应阶段的 selfDriveBehaviors 列表
- 遍历所有 romanceCharacters，逐个调用 API 填充
