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

## 剧情模式指令架构（单模型直出）

### 管线概览
```
用户输入 → Writer(主模型,stream) → 直出最终回复
```
- **Writer**: 用户选择的模型（如 deepseek-chat），负责完整的叙事输出
- 不再使用 Reviewer 二次强化——Reviewer 造成了细节堆砌和过度细腻，阅读负担重

### Writer System Prompt 结构（`buildGMPrompt`）
0. **创作自由基线** — 成人向黑暗叙事授权 + 性/暴力/黑暗描写具体化指令
1. **角色核心人设** — 每角色背景/性格/行为准则/禁止词 + **当前阶段行为锁**（coreState/playerStrategy/languageSamples/forbiddenBehaviors/stageDetails/emotionalTraits/stageExplosion）+ 语言风格强制校准 + 反温和一行警告（已合并进行为锁，不再独立注入）
2. **GM身份 + 玩家铁律** — 禁控主角
3. **世界观**
4. **可攻略角色** — 仅好感度阶段精简（背景/性格/风格/禁词等已在 Section 1，此处去重）
5. **NPC设定**
6. **GM角色调度规则** — 角色自主生命线、冲突与屈服、调度原则 + **修罗场强制规则**（仅当 `affectionEnabled >= 2` 时条件注入）
7. **思考指令**（`<think>...</think>`）
8. **写作底线——四条红线**:
   1. 角色声音不能漂移：每句对话对照语言样本
   2. 结尾不能圆满
   3. 心理不能缺失：每300字至少一处心理层
   4. 细节不能堆砌：每个情节点只写最有效的一句，写完就停，不铺陈不展开
   白描/比喻/标点节奏见【写作技法】章节

**缓存优化**: System prompt 为纯静态（好感度数值/故事时间已移出至 user wrapper），前缀不变以匹配 DeepSeek 自动前缀缓存。

### 每条用户消息注入（`buildUserWrapper`）
- 动态内容（为缓存从 system prompt 移入）：故事时间 + 好感度当前数值 + 阶段校准 + 四条底线
- 语言样本截断至 80 字符
- 反温和硬核框架 / 暖色系低好感度规范按需条件触发

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
- 角色核心人设之后，GM 身份声明 + 铁律紧随其后
- **可控范围**: NPC、可攻略角色、环境和场景
- **不可控范围**: 玩家台词、动作、心理/情绪、表情/身体反应
- **具体禁止**: 替玩家说话、描写玩家动作、用"你感到""你心想""你不禁"等描写内心、用"你下意识地""你忍不住"等替玩家反应、在玩家无输入时推进玩家行为
- **允许写法**: NPC/攻略角色视角观察和解读玩家（可错误解读）、环境对玩家的客观影响、以"等待你的回应"结尾
- 违反=任务失败，必须重写回复

## 好感度独立裁判系统
- 好感度变化不再由主回复 AI 判断，改为独立 API 调用
- **调用时机**: 主回复完成后，在 `ChatRoom.doSend` 中异步调用，不阻塞 UI
- **函数**: `judgeAffectionDelta(character, affections, userInput, aiReply, apiKey)` in `deepseek.js`
- **模型**: `deepseek-v4-flash`（轻量模型，固定，不使用用户选择的模型）
- **参数**: max_tokens=30, temperature=0.3, stream=false
- **System message**: "你是好感度裁判，只输出数字，不输出任何其他内容。每个角色一行，格式为'角色名:数字'，数字是-3到+3的整数。"
- **User message**: 包含每个可攻略角色的当前好感度/阶段、上涨触发条件/侵蚀条件/压制场景、用户输入、AI 回复（前500字）
- **判断规则**: 上涨双路径——被善待（+1~+2）和预期被打破（最高+3）、每次最多±3、触发侵蚀给负分、触发压制给0、拿不准给0
- **返回值**: `{ changes: [{ name, delta }], error: string|null }`，delta 范围 -3 到 +3
- **失败处理**: 静默跳过，显示"本轮好感度无变化"，不影响主回复流程
- **状态更新**: `clampAffection` 越界保护 → `setAffections` 更新 state → 触发 progress bar 重渲染，同时写入 archive localStorage
- **进度条**: 实时读取 `affections?.[rc.name]` state，百分比基于阶段 min/max 实际范围计算；正数绿色闪烁+上浮+N，负数红色闪烁+上浮-N
- `USER_WRAPPER` 七步框架第一步末尾追加"只分析用户已输入内容，不推断替代用户未说出的反应"

## 写作风格核心（Writer 直出）

所有写作技法由 Writer system prompt 中的【写作技法】章节统一管理，精准使用，不过度：

### 心理层
- **碎片意识** — 一闪而过的念头，不完整/不连贯/自相矛盾
- **潜台词裂缝** — "随你。"——他没有说：别走。全文最多1处
- **身体背叛** — 生理反应泄露不肯承认的情绪
- **意识流独白** — 3-5行碎片句子，短句+重复+截断+戛然而止，仅最高潮时用

### 情绪爆发
- **四层公式**: 身体先行→行动越界→语言残缺→残留未平。仅关键高潮使用全部四层，普通节点一层足够

### 白描优先体系
- 封杀：文艺比喻/抒情排比/诗意留白/抽象情绪词/哲学感叹/唯美意象
- 比喻整段最多两个/不超过半句，破折号每段最多两个
- 每个情绪节点最多一个感官细节，写完就停
- 细节不能堆砌——每个情节点一句就停，不铺陈不展开

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
- **Prompt 缓存架构**: Writer system prompt 为纯静态（动态好感度数值/故事时间移入 user wrapper），每轮前缀不变以匹配 DeepSeek 自动前缀缓存。所有写作技法（创作自由基线+四条红线+写作技法）均在 system prompt 中，享受完全缓存命中。
- **白描优先体系**: Writer 第四条红线禁止细节堆砌（每情节点一句就停，不铺陈），写作技法统一管控比喻/破折号/感官细节密度/心理描写限制

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
