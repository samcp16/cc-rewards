# Phase 状态

## Phase 3 — 并行开发 + 自检修复：已完成

完成时间：2026-10-31

### 门禁结果（全部机械证据）

| 门禁 | 命令 | 结果 |
|------|------|------|
| P0-1 emoji | `npm run gate:emoji` | 通过，扫描 107 文件零命中 |
| P0-2/3 紫粉渐变 + 硬编码色 | `npm run gate:color` | 通过，106 文件零命中 |
| 类型检查 | `tsc --noEmit` | 通过，零错误 |
| Lint | `eslint .` | 通过，零问题 |
| 单元 + 集成测试 | `vitest run` | 345 通过 / 20 文件 |
| 覆盖率 | `vitest run --coverage` | 语句 98.19% / 分支 91.75% / 函数 99.23% / 行 99.15%，全部门槛达标 |
| 构建 | `vite build` | 通过，PWA 预缓存 19 项 |
| 单文件 ≤300 行 | `wc -l` | 全项目合规 |

### 本轮修复的问题

1. **端到端集成测试用假数据绕开被测代码**
   测试手写账本条目，缺少 `capConsumption`，归集扫不到占用，导致
   「记账后收益下降」断言无法成立。改为走真实链路
   `rankCards → buildLedgerEntry → db.ledger.put`，并断言快照落在本月、
   快照非空。7/7 通过。这个修法的意义在于：原来那条断言即使通过也证明不了任何
   事，因为它验证的是一条引擎永远不会读到的记录。

2. **P0 门禁脚本只有 npm script 声明，文件从未创建**
   `npm run gate:emoji` / `gate:color` 报 MODULE_NOT_FOUND。
   此前 P0 零命中是靠人工 grep 得出的，不可复现。现已写出两个脚本，
   并用探针文件验证其拦截能力（插入违规代码 → 三类违规全部命中并定位行号 →
   删除探针 → 恢复通过）。

3. **两个文件超出 300 行门禁**
   - `types.ts` 311 行 → 规则层类型拆到 `types.rules.ts`（194 + 165 行），
     `types.ts` 保留再导出，所有 import 路径不受影响
   - `index.test.ts` 489 行 → 拆为 `index.test.ts`（273，SPEC §12 断言 1~6）+
     `reverse.test.ts`（115，反向验证）+ `ranking.test.ts`（115，排序与费用机制），
     共享辅助抽到 `__fixtures__/engineHelpers.ts`，52 个用例一个不少

4. **覆盖率跌破 90% 门槛**
   `cardFacts.ts` / `format.ts` / `labels.ts` 零覆盖（UI 层纯函数，无测试）。
   补齐 57 个用例，三个文件现均 100%。没有调低阈值。

### 新增门禁入口

`npm run verify` = gate → typecheck → lint → test:coverage → build

### 遗留（转入 Phase 4 / 后续版本）

- 积分估值编辑 sheet（前端标记）
- 卡详情页完整多轨道编辑表单
- 豁免条件编辑 UI
- 沙箱 headless Chromium 不提供 IndexedDB，浏览器内 E2E 无法运行，
  已用 fake-indexeddb 集成测试覆盖同等链路

## Phase 4 — 测试与交付：进行中

## Phase 4 — 测试与交付：已完成

### QA 四轮循环摘要

| 轮次 | verdict | 抓到的关键问题 |
|------|---------|----------------|
| R1 | fail | B1 门槛机制整体失效（12 tier 零 earn）、B2 EarnMORE 上限周期错、B3 splitRates 零存在 |
| R2 | fail | N1 比 B1 更严重（earn 无条件替换全部类别，chill grocery 高估 13 倍，双向错误）|
| R3 | fail | B3 修出新错（只换币场景收 1.5% 应 0.5%）、N6/N8 死字段与空 binding |
| R4 | **pass** | 无 blocking，生产就绪 Silver |

### 最终修复架构

- ADR-009~012 四个决策记录，含 ADR-011 勘误（架构师自纠 §2 算术错误）
- 门槛模型：`categories` 唯一费率源 + `categoryBindings.fallback` 单向下调 + `bonusTiers` 累计增量
- 路由模型：`route` 枚举保留 + `crossCurrency`/`crossBorder` 两个正交布尔（ADR-012）
- 渠道门控：`channelScope` 筛选语义，非适用渠道进 unranked
- 回归基线：7980 行逐值快照（8 字段含 capsAffected），变异测试固化

### 最终指标

- 测试：466 个 / 29 文件，全绿
- 覆盖率：语句 96.91% / 分支 90.52% / 函数 99.33% / 行 98.34%
- P0 三铁律：零命中（机械门禁脚本，探针验证过拦截能力）
- 构建产物：gzip 约 184 kB，PWA 完整，CSP connect-src 'none' 实测生效
- 运行时：零 console 错误、零外部请求、默认推荐即出


---

## Phase 5 — 安卓平台适配（用户追加请求）：已完成

触发：用户问「我是安卓手机，能跑吗？」。审查后发现两处真实缺口，非体验优化。

### 缺口与修复

| 缺口 | 证据 | 修复 |
|------|------|------|
| 安卓安装事件从未接线 | `grep beforeinstallprompt src/` 只命中 2 处注释，零实现；`canPromptInstall()` 恒 false | `installGuide.ts` 实现 `initInstallPrompt` / `canPromptInstall` / `promptInstall` / `subscribeInstallPrompt` |
| 安卓用户拿到 iOS 操作说明 | `InstallGuide` 4 步全是「点底部分享按钮」，安卓无此入口 | 新增 `platform` prop 与安卓分支：有事件给真按钮，无事件给 3 步菜单 |
| 事件监听未挂载到入口 | — | `main.tsx` 调用 `initInstallPrompt()`（放组件里会永远收不到） |
| 平台信息未下传 | 两个调用点只传 `isSafari` | `SettingsPage` 传 `platform`；`useInstallPrompt` 暴露 `platform` 供 `DecidePage` 使用 |

### 验证证据

- `npm run verify` exit=0：**478 测试 / 30 文件全绿**（新增 12），覆盖率门槛达标，构建成功
- 新增 `src/platform/installGuide.test.ts`：12 用例，其中 3 个变异被捕获
  （删 `preventDefault` → 1 fail；init 改空实现 → 4 fail；prompt 后不清空 → 2 fail）
- Playwright 真机 UA 实测：
  - 安卓 UA → 标题「装成 App，用时更快」+ 3 步菜单（无事件情形）
  - 注入 `beforeinstallprompt` → 出现「安装到桌面」真按钮，点击后 `prompt()` 调用 1 次、弹窗自动关闭
  - iPhone UA → 标题「装到主屏幕，卡库才不会丢」+ 原 4 步，未被破坏
  - 360×640 小屏：弹窗占视口 54%，主按钮完全可见
  - 全程零 console 错误
- P0 门禁：125 文件 emoji 零命中、122 文件紫粉渐变与硬编码色零命中

### 决策记录

ADR-013：安装引导按平台分叉（iOS 给步骤，安卓给真按钮）。核心原则「宁可不给按钮，也不给假按钮」。
