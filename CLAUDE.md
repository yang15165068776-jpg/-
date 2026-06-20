# JSJG Character OS v6.5 — Unified Narrative Neural Core

> 最后更新：2026-06-21
> 仓库：https://github.com/yang15165068776-jpg/-.git
> 部署：https://jsjg.vercel.app

## 技术栈
- React 18 + Vite
- 样式：内联 CSS 变量（白底灰框黑字，无 Tailwind 残留）
- 数据：localStorage（USK per-save 隔离）
- API：DeepSeek（OpenAI 兼容，https://api.deepseek.com）
- 路由：NavigationEngine（自建 push/pop 栈）

---

## 0. 双模式架构（核心设计）

```
                    ┌─── USK（同一状态源）───┐
                    ↓                        ↓
            Drama Engine              Daily Engine
          （剧情事件流）              （情绪关系流）
                │                        │
         paragraph renderer        bubble queue renderer
                │                        │
         dramaMessages[]           dailyMessages[]
                │                        │
         DramaOrchestrator         DailyGuard v5
         (scene→rising→crisis)     (anti-romance+gate+intent)
```

| | Drama | Daily |
|---|---|---|
| 核心 | 场景推进 / 张力驱动 | 关系波动 / 微信拟真 |
| 输出 | 段落叙事 | JSON → bubbles → setTimeout队列 |
| 好感裁判 | `judgeAffectionDelta` (独立API) | `judgeDailyAffection` (独立API) |
| 存储 | `dramaMessages[]` | `dailyMessages[]` |
| 渲染 | 段落式 `DramaPage` | 气泡式 `DailyPage` |
| 引擎 | InteractionKernel + Coordinator | sendDailyChatMessage 直连 |

---

## 1. 账户系统

```
Account（玩家身份 = 一部手机）
  ├── id, name, avatar, gender, personalityTags, description
  ├── Folder A（世界）→ Saves + USK
  └── Folder B（世界）→ Saves + USK
```

- `jsjg_accounts` + `jsjg_active_account`
- Folder.accountId 归属账户，切换账户 = 换手机
- 旧 `jsjg_player_profile` 首次加载自动迁移

---

## 2. 数据模型

```
jsjg_accounts              → Account[]
jsjg_active_account        → string
jsjg_folders               → Folder[]（含 accountId）
jsjg_folder_saves_<id>     → { [saveId]: Save }
jsjg_folder_usk_<id>_<saveId> → USK（per-save 隔离）
rp_settings                → API Key/Model
```

---

## 3. USK（统一状态内核）

```js
USK = {
  characters: {
    [name]: {
      relationship: { affection, trust, dependency, respect, fear, possessiveness },
      emotion:      { anger, sadness, jealousy, anxiety, curiosity, excitement },
      tension:      { unresolved_conflicts, emotional_pressure, attraction_tension, power_imbalance },
      life:         { mood, lonely, busy, tired, social_need, initiative_score }
    }
  },
  global:       { currentMode, turnCount, lastInteractionAt },
  global_state: { world_tension, folder_mood, narrative_phase, timeline_pointer }
}
```

- Daily 只写 relationship / life / emotion.curiosity，**不写 tension**
- Drama 写全部四层
- USK per-save：每个存档独立的好感度

---

## 4. 文件树

```
src/
├── engine/
│   ├── navigationEngine.js
│   ├── hydrationEngine.js
│   ├── interactionKernel.js      # Drama 交互内核（含 Orchestrator 集成）
│   └── agentDecisionLayer.js
│
├── state/
│   ├── accountStore.js           # 多玩家身份
│   ├── unifiedStateKernel.js     # USK（4层 + global_state + per-save）
│   ├── uskApi.js                 # USK 访问控制
│   ├── stateBridge.js            # UI↔USK 桥接
│   └── folderStore.js            # Folder/Save CRUD + dailySessions
│
├── runtime/
│   ├── dramaOrchestrator.js      # 🆕 剧情场景编排器（4阶段推进+修罗场）
│   ├── dailyGuard.js             # 🆕 Daily v5 闸门（反浪漫暴走+关系门+冲突注入）
│   ├── dailyInitiative.js        # 🆕 主动消息引擎
│   ├── stabilityCompiler.js      # 人格编译锁死（Drama）
│   ├── antiSmoothingV2.js        # 输出后修正
│   ├── personaStateEngine.js     # Daily 人格状态引擎
│   ├── causalEngine.js           # 因果叙事
│   ├── affectionRules.js         # Drama 好感度规则
│   ├── conflictPersistence.js    # CPS
│   ├── powerDynamics.js          # 权力动力学
│   ├── antiSmoothing.js          # EPI v1
│   ├── alignmentSuppression.js   # ASL
│   └── personaIntegrity.js       # 人设盾
│
├── memory/
│   ├── memoryInterpreter.js
│   ├── memoryGraph.js
│   ├── contextBuilder.js
│   └── ...
│
├── agents/
│   ├── coordinator.js            # Drama 编排
│   └── npcAgent.js
│
├── prompt/
│   ├── cachePrefix.js
│   └── narratorPrompt.js
│
├── utils/
│   └── deepseek.js               # 所有 LLM 管线（GM/Daily/system prompt + 解析 + 裁判）
│
├── pages/
│   ├── Entry.jsx                 # 首页（账户感知）
│   ├── DramaPage.jsx             # 剧情模式
│   ├── DailyPage.jsx             # 日常模式（queue renderer）
│   ├── PlayerProfile.jsx         # 多账户管理
│   ├── CreateFolder.jsx
│   ├── FolderInterior.jsx
│   ├── CharacterEditor.jsx       # protagonist 字段已移除
│   └── Settings.jsx
│
└── components/
    ├── StatusPanel.jsx           # 张力条已移除
    ├── ProgressBar.jsx
    └── ...
```

---

## 5. Daily Pipeline（v5 关系驱动）

```
Player input
  → buildCharacterForLLM（含 _playerProfile）
  → buildPersonaFromUSK → decideBehavior → personaSuffix
  → sendDailyChatMessage
      ├── buildDailySystemPrompt（关系驱动 kernel）
      │     ├── 系统规则（你在微信里）
      │     ├── 角色身份
      │     ├── 玩家身份（buildPlayerIdentityBlock）
      │     ├── 关系解释层（buildRelationshipSummary）
      │     ├── 情绪漂移系统
      │     ├── DailyGuard（反浪漫+关系门+冲突注入+自主意图）
      │     ├── 格式规则 + JSON 强制输出
      │     └── 输出前自检
      ├── buildStateSnapshot（USK → 一行状态）
      └── parseDailyPacket（JSON → ||| fallback → 单气泡）
  → judgeDailyAffection（独立 LLM 裁判）
  → Queue Renderer（setTimeout 逐气泡追加到消息数组）
  → dailyTurnEnd → updateUSK（daily_chat: relationship/life only）
```

---

## 6. Drama Pipeline（Orchestrator v1 场景驱动）

```
Player input
  → InteractionKernel.executeTurn
      ├── AgentDecisionLayer.decide（行为决策）
      ├── DramaOrchestrator.advance（推进场景阶段）
      │     ├── shouldAdvanceScene?（张力>65 / 稳定度<40 / 情绪爆发）
      │     ├── generateSceneEvent（阶段事件）
      │     └── buildDirectorPrompt（注入 GM prompt）
      ├── StabilityCompiler（人格约束）
      └── runAgentTurn → sendStoryStageMessage
            ├── buildGMPrompt（含 playerIdentity + directorPrompt）
            ├── CPS + MemoryGraph + PowerGraph
            └── judgeAffectionDelta（独立 LLM 裁判）
```

---

## 7. 关键修复记录

| Bug | 原因 | 修复 |
|-----|------|------|
| 好感度 0→50 | `updateUSK` 全链路 `||` 吃 0 | 全部换成 `??` |
| 返回空白页 | `revealTimerRef` 引用已删除的变量 | 移除残留 cleanup |
| 存档好感共享 | USK key 不含 saveId | per-save USK：`jsjg_folder_usk_<id>_<saveId>` |
| 玩家身份缺失 | `buildDailySystemPrompt` 未调 `buildPlayerIdentityBlock` | 已补 |
| 日常好感涨太快 | LLM 自报 delta | 独立 `judgeDailyAffection` 裁判 |
| 正在输入闪烁 | `loading` 和 `isTyping` 分离 | 提前设 `isTyping(true)` |
| emotion.lonely 不存在 | `emotion` 无 `lonely` 字段 | 改为 `life.lonely` |
| 导航栈断裂 | `NavigationEngine.history` 不存在 | 改为 `NavigationEngine.stack` |
| 气泡闪现 | reveal 键名 mismatch | 统一 `revealedCount`/`totalCount` |

---

## 8. 开发规则

- **数值默认值**：用 `??` 不用 `||`（0 是合法值）
- **引擎层**（runtime/agents/memory/world/prompt/）— 谨慎改动
- **状态层**（state/）— 通过 stateBridge 读写，不直触 raw USK
- **UI 层**（pages/components/）— 只消费 UI State Snapshot
- **消息隔离**：dramaMessages / dailyMessages 永不交叉
- **USK 写入隔离**：Daily 不写 tension，Drama 不写 life
- **Debug**：alert() 不用 console.log
- **禁止**：Tailwind class、暗黑模式、霓虹色、渐变、阴影
- **CSS**：内联 CSS 变量，430px 手机壳，圆角 12-16px
