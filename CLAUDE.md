# 角色扮演对话 App

## 技术栈
- React 18 + Vite
- Tailwind CSS 3
- 数据全部 localStorage
- DeepSeek API（OpenAI 兼容格式，base URL: https://api.deepseek.com）
- 部署在 Vercel: https://jsjg.vercel.app

## 项目结构
```
src/
├── main.jsx              # 入口
├── index.css              # Tailwind + 动画
├── App.jsx                # 状态路由（4页面切换）
├── utils/
│   ├── storage.js         # localStorage CRUD（角色/对话/设置）
│   └── deepseek.js        # API 调用（流式/非流式），system prompt 组装，违规检测重试
└── pages/
    ├── CharacterList.jsx  # 角色库
    ├── CharacterForm.jsx  # 创建/编辑角色
    ├── ChatRoom.jsx       # 对话页（WeChat风格头像+流式打字机+主动消息+Web Notification）
    └── Settings.jsx       # API Key、模型选择、用户头像
```

## 角色 JSON 结构
- id, name, avatar(base64), background, nickname
- styleRules[] - 文风规则
- forbiddenWords[] - 禁止行为词，命中后自动重试（最多3次）
- affectionEnabled, affectionInitial, affectionStages[]
- thinkingEnabled, thinkingPrompt
- activeMessageEnabled, activeInterval, activeCondition, activePrompt
- autonomyBehavior - AI 生成的自主行为总结

## System Prompt 组装顺序（deepseek.js buildSystemPrompt）
1. 强制性框架（"你现在是[角色名]..."）
2. background
3. autonomyBehavior（如有）
4. 文风规则
5. 当前好感度阶段（如有）
6. 思考指令（如有）
7. 强制性框架收尾

## 关键设计决策
- API 调用用 fetch，不用任何第三方库
- 流式回复：SSE 解析 + 逐 token 回调 + 完成后再做违规检测
- 违规重试：告知模型具体命中的违禁词
- 头像：选图自动压缩到200px、JPEG 70%质量转base64
- 路由：App.jsx 用 useState 实现简单状态路由，无 react-router
- 主动消息定时器在 ChatRoom 挂载时启动，卸载时清理
