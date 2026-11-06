# 信用卡返现决策工具 技术架构（Phase 1）

| 项 | 内容 |
|---|---|
| 项目 | cc-rewards（港澳美三地发卡 · 澳门与内地消费返现决策） |
| 文档版本 | v1.0 |
| 调研与核实日期 | 2026-10-31 |
| 作者 | 高见远（首席架构师） |
| 状态 | Phase 1 完成，待 Phase 2 契约冻结 |
| 对应 PRD | `docs/PRD.md` v1.0（许清楚） |
| 对应 UI/UX | `docs/UIUX.md`（方向稿） |
| Phase 0 锁定 | 单人自用 / 无登录 / 无后端 / 不建模汇率成本 / 必须计外币手续费 |

> **阅读顺序提示**：§1-§9 是选型与设计主体；**§12 是与 PRD 的逐条对账表，含 2 项必须回传产品经理修正的差异**，请勿跳过。

---

## 0. 一句话结论

**纯前端离线 PWA，React 19 + Vite 8 + TypeScript 7 + Dexie 4 + Tailwind 4，图标锁定 Lucide 1.65，无后端。** 计算引擎是纯函数，月度上限靠"本地账本 + 双档净收益"解决，**iOS 上必须安装到主屏幕否则 7 天内数据会被 Safari 清空**——这是本项目最大的落地风险，已用四道防线处理。

**口径变更**（相对本骨架初稿，因 PRD 要求而修正）：核心输出指标从"净收益金额"改为 PRD 定义的**净回报率**，并把**渠道服务费**提升为一等扣减项、新增**门槛（threshold）**分层建模。详见 §12。

---

## 1. 选型结论表

> 版本号均于 2026-10-31 通过 `npm view <pkg> version` 与 `npm view <pkg> dist-tags` 实际查询，非记忆值。TypeScript 的 `latest` 标签当前为 7.0.2（原生 Go 编译器版本），本项目锁定 7.0.2。

| 层 | 技术 | 锁定版本 | 锁定原因 |
|---|---|---|---|
| 语言 | TypeScript | **7.0.2** | 计算引擎是金额运算，`number` 与 `Money` 混淆会导致沉默逻辑错误；类型系统是唯一能在编译期拦住「把百分比当金额」的防线 |
| 运行时 | Node.js | **22.13.1 LTS** | Vite 8 要求 `^20.19.0 \|\| >=22.12.0`（已核 `engines`）；本机已装 22.13.1，不升级 |
| 包管理 | pnpm | **10.x**（跟随 Corepack） | 锁文件确定性强，安装快；单人项目不需要 workspaces |
| 构建 | Vite | **8.3.5** | 冷启动 <300ms，产出单页静态包，部署即 `dist/` 静态托管；无需 SSR（本产品首屏不需要 SEO，也不需要服务端数据） |
| 框架 | React | **19.3.1** | 生态最厚（Dexie hooks、Lucide、Testing Library 全部一等支持）；单人自维护时"出问题能搜到答案"的价值高于一切性能优势 |
| React DOM | react-dom | **19.3.1** | 与 React 严格同版本 |
| React 构建插件 | @vitejs/plugin-react | **6.1.2** | peer 要求 `vite: ^8.0.0`（已核），与 Vite 8.3.5 兼容 |
| 类型定义 | @types/react / @types/react-dom | **19.3.0 / 19.3.0** | 与 React 19.3.1 对齐 |
| 样式 | Tailwind CSS | **4.3.3** | 见 §1.3；v4 用 CSS-first `@theme` 声明 Design Token，天然满足 P0「禁止硬编码颜色」 |
| Tailwind 构建插件 | @tailwindcss/vite | **4.3.3**（与 tailwindcss 同版本发布） | v4 官方推荐路径，替代废弃的 PostCSS 插件链 |
| 数据持久化 | Dexie | **4.4.7** | 见 §1.2；IndexedDB 的类型化封装 + 版本化迁移 + 事务 |
| React 数据绑定 | dexie-react-hooks | **4.4.0** | `useLiveQuery` 让「账本变更自动刷新 UI」，省掉自建状态层 |
| 图标库（**锁定**） | lucide-react | **1.65.0** | 见 §1.4 |
| 单元测试 | Vitest | **5.0.5** | 与 Vite 共享 transform 管线，零额外配置；计算引擎必须有测试（防沉默逻辑错误） |
| DOM 环境 | jsdom | **30.1.3** | Vitest 浏览器环境模拟 |
| 组件测试 | @testing-library/react | **16.3.3** | 只测行为不测实现 |
| PWA | vite-plugin-pwa | **2.0.0** | peer 已核支持 `vite ^8.0.0`；内部用 Workbox |
| Workbox 运行时 | workbox-window | **7.4.1** | 与 vite-plugin-pwa 2.0.0 依赖对齐 |
| Lint | typescript-eslint | **8.72.1** | 拦住漏 import / 未处理 Promise（生成式代码失效模式第 5 类） |
| 状态管理 | **不引入** | — | 见 §1.5 |
| 后端 | **不做** | — | 见 §1.6 |
| 路由 | 不引入 react-router | — | 只有 4 个视图，用 `useState` 切换即可；引路由是过度设计 |

### 1.1 前端框架对比

评分口径（1-5，越高越好）：针对「单人自用 / 无后端 / 3 秒出结果 / 要能自己维护」。

| 方案 | 学习与维护成本 | 3 秒内可交互 | 生态与排错 | 计算引擎承载 | 加权得分 | 判定 |
|---|---|---|---|---|---|---|
| 原生 HTML + 原生 JS | 5 | 5 | 2 | 1（无类型，金额运算易错） | 3.4 | 淘汰：卡规则结构复杂，无类型必然算错 |
| **React 19.3.1 + Vite 8.3.5** | 4 | 5 | 5 | 5 | **4.7** | **选中** |
| Vue 3.5 + Vite 8 | 4 | 5 | 4 | 5 | 4.4 | 次选：同样可行，但 Dexie/图标/测试的 React 侧示例更多 |
| Svelte 5 + Vite 8 | 3 | 5 | 3 | 4 | 3.8 | 淘汰：单人排错时社区答案量不足 |
| Next.js 15 | 2 | 3（RSC 与 hydration 成本） | 4 | 4 | 2.9 | 淘汰：需要 SSR 的理由（SEO、服务端数据）本产品一个都没有；静态导出还多一层配置 |

**判定依据**：本产品零 SSR 需求、零 SEO 需求、零服务端数据。Next.js 的全部溢价能力都用不上，却要付出 App Router 的心智成本。Vue 与 React 等价可行，React 胜在配套库覆盖面（`dexie-react-hooks`、`lucide-react`、Testing Library 的 React 适配最成熟）。

### 1.2 数据持久化对比

数据规模实测估算：30 张卡 × 平均 8 条规则 = 240 条规则；账本 12 个月 × 每月 200 笔 = 2400 条记录。总量 < 1 MB。

| 方案 | 容量 | 同步 API 阻塞 | 结构化查询 | 版本迁移 | 判定 |
|---|---|---|---|---|---|
| localStorage | ~5 MB，但**同步阻塞主线程** | 是（违反 3 秒出结果） | 无（只能整串 JSON.parse） | 手工 | 淘汰：每次读写都要 parse 全量 JSON |
| **IndexedDB + Dexie 4.4.7** | 配额为磁盘 60%（Chromium） | 否（全异步） | 有（索引、复合索引、范围查询） | 内建 `version().stores()` | **选中** |
| localStorage 存配置 + IndexedDB 存账本 | 混合 | 部分阻塞 | 部分 | 两套 | 淘汰：双写一致性成本不值得 |
| SQLite WASM | 大 | 否 | 有 | 需自管 | 淘汰：产物体积 +2-3 MB，为 1 MB 数据引入 WASM 数据库是过度设计 |

**结论**：Dexie 4.4.7 承担全部结构化数据（卡库、规则、账本、参数）。localStorage 只存**一个**用途：UI 偏好（上次选的地区、上次选的渠道）+ 一个 `storage-probe` 标记用于检测数据被清空（§4.2.3）。

### 1.3 样式方案对比

| 方案 | Design Token 落地方式 | 禁止硬编码颜色的可执行性 | 产物体积 | 判定 |
|---|---|---|---|---|
| 手写 CSS + CSS 变量 | 手写 `:root` 变量 | 靠自觉，无 lint 拦截 | 最小 | 次选 |
| **Tailwind 4.3.3（`@theme`）** | `@theme` 块声明 token，生成 `--color-*` 变量与工具类 | **强**：`bg-[#a855f7]` 这类任意值可被 lint 规则禁掉；语义类 `bg-surface` 只能来自 token | ~10 KB gzip（v4 按需生成） | **选中** |
| CSS-in-JS（styled-components / emotion） | JS 对象 | 弱：颜色字符串散落在组件里 | +15 KB 运行时 | 淘汰：运行时开销与本产品「3 秒出结果」冲突 |
| Tailwind 3.4.19（v3-lts） | `tailwind.config.js` | 强 | 略大 | 淘汰：v4 已是 `latest`，v3 是 LTS 维护态；新项目无理由选旧版 |

**P0 规则落地**：`@theme` 内定义全部颜色、间距、字号、圆角 token；**禁止**任何 `#hex`、`rgb()` 出现在 `src/` 下（ESLint `no-restricted-syntax` + CI `grep` 双门禁）。**禁用紫色到粉色渐变**：token 中不提供任何 purple/pink 色阶，从源头断掉该可能性。

### 1.4 图标库对比（P0 锁定项）

| 库 | 图标数 | SVG 原生 | Tree-shaking | 风格一致性 | 许可 | 判定 |
|---|---|---|---|---|---|---|
| **Lucide 1.65.0** | 1600+ | 是（stroke 24×24，`currentColor`） | 是（每个图标独立入口） | 极强（统一 2px stroke） | ISC | **锁定** |
| Heroicons | ~600 | 是 | 是 | 强，但分 outline/solid 两套，混用易不一致 | MIT | 淘汰：类目覆盖不足以表达「超市/加油/机票/酒店」全部类别 |
| Tabler Icons | 5700+ | 是 | 是 | 中（1.5px stroke，与常见 UI 略不协和） | MIT | 次选：数量最多，但风格偏细 |
| Phosphor | 9000+ | 是 | 是 | 强，但 6 套字重易滥用 | MIT | 淘汰：字重选项太多，单人项目会失控 |

**锁定结论**：**全项目唯一图标来源 = `lucide-react@1.65.0`**。

使用纪律（写入 Phase 2 契约）：
1. 只允许 `import { Utensils, ShoppingCart, Fuel, Plane, Hotel, ShoppingBag, MoreHorizontal, CreditCard, Wallet, Smartphone, QrCode } from 'lucide-react'` 白名单内的图标。
2. 禁止 emoji 作为功能图标（P0）。类别、渠道、卡组织全部走 Lucide。
3. 禁止引入第二个图标库；禁止内联手写 `<svg>`（唯一例外：`public/` 下的 PWA 应用图标与 favicon）。
4. 所有图标 `size` 只允许 `16 | 20 | 24`，颜色只允许 `currentColor`。

### 1.5 状态管理：不需要

**判断：不引入 Zustand / Redux / Jotai。**

理由：
- 真正的"共享状态"只有两类：**卡库与规则**（来自 IndexedDB）与**账本**（来自 IndexedDB）。两者都是持久化数据，`dexie-react-hooks@4.4.0` 的 `useLiveQuery` 已经把「查询 + 订阅 + 变更后自动重渲染」做完了。
- 纯 UI 状态（当前选的地区、类别、金额输入框）是**单视图局部状态**，`useState` 足够。
- 引入 Zustand 5.0.16 会形成"IndexedDB + Store 双份真相"，需要手写同步逻辑——这是典型的过度设计，且会引入"两份数据不一致"这类最难查的 bug。

**唯一例外**：`useReducer` 承载"本次查询表单"的复合状态（地区 + 类别 + 金额 + 渠道 + 商户币种），因为 5 个字段联动，用 5 个 `useState` 会散。

### 1.6 是否需要后端：不需要（附代价）

**结论：不做后端。纯静态托管。**

论证（逐条对照 PRD 已锁定约束）：

| 需要后端的典型理由 | 本产品是否成立 |
|---|---|
| 多用户数据隔离 | 不成立。单人自用，无用户体系（Phase 0 已锁定） |
| 跨设备同步 | 不成立。用户场景是「付款前在手机上打开」，单设备 |
| 敏感数据不出本机 | **反向成立**。不做后端是更强的隐私保证：卡号不存、数据不出设备、无外部上报 |
| 需要服务端计算 | 不成立。计算是 O(卡数 × 规则数) ≈ 30 × 8 = 240 次算术，手机 <5ms |
| 需要实时更新卡规则库 | 不成立。用户自助维护卡库，规则跟着自己的卡走 |
| 需要鉴权/计费/风控 | 不成立 |

**明确不做的代价（必须让用户知道，不是隐藏成本）**：

1. **数据只活在这台设备这个浏览器里**。换手机、换浏览器、清缓存 = 卡库和账本全丢。**缓解**：内建 JSON 导出/导入（这是"用户的备份方案"，必须在一期就做，不是二期）。
2. **iOS 上不安装到主屏幕，7 天内不打开就会被清空**。见 §4.2，这是本项目第一风险。
3. **无法跨设备查看**。用户如果又要用 Mac 又要用 iPhone，需要手动导出导入。可接受：场景是"掏手机付款前看一眼"。
4. **卡规则不会自动更新**。银行改条款需用户自己改。**缓解**：每条费率字段强制带 `sourceUrl` + `verifiedAt`，界面上显示"费率核实日期"，过期（>180 天）显示提醒。
5. **没有崩溃上报**。出了问题我看不到。**缓解**：计算引擎 100% 纯函数 + 单元测试锁定；所有运行时异常在 UI 上显示可复制的错误详情，用户自己发给我。

**结论：不做后端是正解，但必须把"导出/导入"和"数据存这里"的显式提示作为 P0 功能，不是 nice-to-have。**

---

## 2. 系统架构

### 2.1 分层（单向依赖，严格向下）

```
┌──────────────────────────────────────────────────────────────┐
│  表现层 Presentation                                          │
│  pages/ · components/                                        │
│  只做：渲染、接收用户输入、调用 hooks、展示结果               │
│  禁止：算钱、算返现、直接开 IndexedDB                         │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
┌───────────────────────────▼──────────────────────────────────┐
│  应用层 Application                                           │
│  hooks/ （useLiveQuery 包装、表单状态机、Toast）              │
│  只做：把数据层的数据和业务层的计算粘到 React 生命周期        │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
┌───────────────────────────▼──────────────────────────────────┐
│  业务层 Domain（纯函数，零 IO，零 React，零浏览器 API）        │
│  domain/engine/  ·  domain/rules/  ·  domain/ledger/          │
│  只做：给定 (卡库, 账本, 本次消费) 算出排序后的候选方案        │
│  特性：全部纯函数，可 100% 单元测试，无副作作                  │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
┌───────────────────────────▼──────────────────────────────────┐
│  数据层 Data                                                  │
│  data/db.ts（Dexie schema）· data/repositories/*.ts           │
│  只做：读写 IndexedDB、schema 迁移、序列化                     │
│  禁止：含业务判断（"如果超额就……"这类不得出现）               │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
┌───────────────────────────▼──────────────────────────────────┐
│  基础设施 Infrastructure                                      │
│  platform/（navigator.storage、service worker 注册、导出下载） │
│  types/（全局类型）· lib/（纯工具，无业务）                    │
└──────────────────────────────────────────────────────────────┘
```

**铁律**（写入 Phase 3 门禁）：
- `domain/` **禁止** import `react`、`dexie`、`window`、`document`。违反即不合格。
- `data/` **禁止** import `domain/`（数据层不知道业务存在）。
- `domain/` 只允许依赖 `types/` 与 `lib/`。
- 反向 import 一律 ESLint `no-restricted-imports` 报错。

### 2.2 运行时数据流

```
用户操作                         数据流
────────────────────────────────────────────────────────────────
1. 打开页面
   └─> platform/storage.ts: requestPersist()
       └─> data/repositories/cardRepo.ts: listCards()
           └─> useLiveQuery 拿到卡库 + 账本

2. 输入「澳门 / 餐饮 / MOP 380 / Apple Pay」
   └─> hooks/useDecisionForm.ts (useReducer 管理 5 字段)
       └─> domain/engine/rankCards(input)
           ├─ domain/rules/matchRule(card, context)     ← 命中哪条规则
           ├─ domain/engine/applyCap(rule, ledgerSpent) ← 月度上限扣减
           ├─ domain/engine/computeFxFee(card, ctx)     ← 外币手续费
           └─ domain/engine/netValue(parts)             ← 净收益
           └─> 返回 Scheme[] 按净收益降序

3. 展示 Top 1 大字 + 其余列表
   └─> components/ResultList.tsx + VerdictCard.tsx

4. 用户点「记下这笔」
   └─> domain/ledger/buildEntry(scheme, input)
       └─> data/repositories/ledgerRepo.ts: add(entry)
           └─> useLiveQuery 感知变更 → 结果区重新计算（上限实时更新）

5. 用户点「不算了」/ 关页面
   └─> 不写账本。上限保持原样（这是设计取舍，见 §3.3）
```

### 2.3 计算引擎在架构中的位置（关键）

计算引擎是**唯一**允许做金额运算的地方。它不读数据库，不改数据库。输入是内存里的快照，输出是纯数据。

```ts
// domain/engine/rankCards.ts —— 唯一对外入口
export function rankCards(
  cards: Card[],
  rules: CardRule[],
  ledger: LedgerEntry[],
  params: ValueParams,
  input: SpendInput,
): Scheme[]
```

这个签名是**契约**：给它同样的输入，永远得到同样的输出。这让「同一笔消费为什么昨天算出来不一样」这类问题变成不可能。

---

## 3. 计算引擎设计

### 3.1 核心难点拆解

用户提出的三个难点，实际是四个（第三个是隐藏的）：

| # | 难点 | 本章节 |
|---|---|---|
| 1 | 返现 + 积分 + 渠道加成如何不重复计算 | §3.4 |
| 2 | 月度上限跨多次查询累计 | §3.5 |
| 3 | 外币手续费建模（**含隐藏难点：结算币种**） | §3.6 |
| 4 | 多规则叠加的次序与边界（超出上限后降级） | §3.7 |

### 3.2 净收益定义

对每张卡，在给定消费上下文下，计算**单笔净收益**（一律折算为同一种展示货币，且明确**不做汇率换算**——用消费币种直接报数）：

```
净收益 = 返现价值 + 积分价值 + 活动价值 − 外币手续费 − 其他固定费
```

所有分项均为同一币种（输入消费币种），且**每一项都带来源标记**，便于 UI 展示"这 12 块是怎么来的"。

### 3.3 月度上限账本：核心决策（用户最关心的一点）

#### 问题的本质

月度上限是**跨查询的状态**。用户在超市刷了 500，30 分钟后想知道餐厅刷哪张卡——此时餐饮卡的额度是否已被占用，取决于那张卡的「超市」和「餐饮」是否共享同一个额度池，以及用户有没有告诉工具"我刚刷了 500"。

#### 三种方案

| 方案 | 机制 | 上限准确度 | 操作成本 | 判定 |
|---|---|---|---|---|
| A. 不记录 | 上限永远按"剩余满额"算 | **0 分**，越用越离谱 | 0 | 淘汰：上限形同虚设 |
| B. 强制记录 | 每查一笔必须先"确认已刷"才出结果 | 100 分 | **每笔多 1-2 步，违反"3 秒出结果"** | 淘汰 |
| C. **默认不记 + 一键记账 + 显式余额** | 出结果时**同时给出两档净收益**：假设额度充足 / 假设额度已用尽；用户刷完点「记下」写账本 | 用户愿意记就是 100 分，不愿记也不会骗他 | 0（不记）或 1 次点击（记） | **选中** |

#### 方案 C 的具体设计（这是最终决策）

**关键洞察：让"记不记"不影响用户被误导。**

每张卡的每个候选方案，输出**两个净收益**：

- `netOptimistic`：假设该卡对应额度池**完全没用过**
- `netRealistic`：按账本里的真实已用额度计算

两者相等时只显示一个数（绝大多数情况）；两者不等时，UI 显示 `netRealistic` 为大字，并在下方一行小字 `额度用尽后降为 MOP X`。

这样：
- 用户不记账 → 看到的是 `netRealistic`（按已知已用算），但能看到"额度用尽后降为多少"，**知道自己的数字可信度**。
- 用户点了「记下」→ 账本变准 → 下次 `netRealistic` 就准了。

**账本数据结构**（写进 IndexedDB）：

```ts
interface LedgerEntry {
  id: string;              // uuid
  cardId: string;
  occurredAt: string;      // ISO 8601，用户可改（补记昨天）
  periodKey: string;       // 'YYYY-MM'，由 occurredAt 派生，用于上限归集
  amount: number;          // 消费金额，原始币种
  currency: CurrencyCode;
  category: SpendCategory;
  channel: PaymentChannel;
  // 本笔实际消耗了哪些额度池，以及各消耗多少（金额币种）
  capConsumption: Record<string, number>;  // capId -> consumedAmount
  // 本笔实际拿到的返现/积分（用于复盘，不参与下次计算）
  earnedCashback: number;
  earnedPoints: number;
  note?: string;
  createdAt: string;
}
```

**为什么不"自动记账"**：工具无法知道用户到底刷了没有、刷了多少（实际刷卡金额可能和输入不同、可能付失败）。自动记账会造成**账本污染**——比不准更糟。所以默认不写，只在用户点「记下」时写。

**补记与改错**：账本列表页支持编辑/删除条目。删除后 `useLiveQuery` 自动重算，上限立即回滚。这是方案 C 能成立的关键——错了要能改。

**周期定义**：`periodKey = 'YYYY-MM'`，按**自然月**。不做账单周期（statement cycle），因为：
1. 各卡的账单日不同，建模成本高；
2. 用户自查时也是按自然月想"这个月还剩多少"；
3. MVP 阶段的精度损失可接受，且 UI 上会写明"按自然月估算"。

**上限池抽象**：上限不一定按卡，可能按「卡 + 类别组合」。所以引入 `CapPool` 概念，`capId` 的构造规则：

```
capId = `${cardId}:${capGroupKey}`
// capGroupKey 来自规则定义，例如：
//   'dining'        —— 只有餐饮共享
//   'all'           —— 全类别共享
//   'dining+grocery'—— 餐饮与超市共享同一池
```

一条规则可以引用 0..n 个 cap；账本累计时按 `capId` 归集。

### 3.4 不重复计算：返现 / 积分 / 渠道加成

**核心原则：一个「返现轨道（earn track）」只能被消费一次。**

一张卡命中某条规则后，规则可能同时声明「2% 返现」+「4x 积分」——这在真实世界里**几乎不存在同时给**。真实情况是二选一（或按支付方式二选一，如 Apple Card 的 2% vs 1%）。

所以引擎的模型是：**规则声明一个 `earn` 数组，每个元素是一条"轨道"，每条轨道有 `exclusivityGroup`。同一 `exclusivityGroup` 内最多只有一条轨道生效，取价值最高的那条。**

```ts
type EarnTrack =
  | { kind: 'cashback'; rate: number; group: string; capIds: string[] }
  | { kind: 'points';   multiplier: number; pointCurrencyId: string; group: string; capIds: string[] }
  | { kind: 'statement_credit'; amount: number; group: string; capIds: string[] };
```

`group` 就是排他组。举例：

```ts
// Apple Card 真实条款：Apple Pay 2% / 实体卡 1%
earn: [
  { kind: 'cashback', rate: 0.02, group: 'payment_method', capIds: [] },  // 仅 channel=apple_pay 时激活
  { kind: 'cashback', rate: 0.01, group: 'payment_method', capIds: [] },  // 兜底
]
// 引擎同组只取最高 → 用 Apple Pay 时取 2%，实体卡时取 1%。不会加到 3%。
```

**渠道加成怎么处理**：渠道不是"额外加一条轨道"，而是**规则的激活条件**。一条规则的 `conditions.channels` 决定它是否激活。渠道加成写成一条**独立规则**（优先级更高、`exclusivityGroup` 与主规则不同），这样它是在主规则之外**额外叠加**的——这才是真实语义（例如"绑 AlipayHK 额外 0.5% 回赠"是叠加在主类别返现之上的）。

于是：
- **互斥**（同一 `exclusivityGroup`）= 取最优一条；
- **叠加**（不同 `exclusivityGroup`）= 相加。

这是把"重复计算"问题从"代码里靠 if 判断"变成"数据里声明"，可测试、可审阅。

### 3.5 外币手续费建模（含隐藏难点）

#### 已核实的典型费率（可溯源）

**查询日期：2026-10-31**

| 发卡地 | 卡组织 | 典型外币/跨境手续费 | 备注 | 来源 |
|---|---|---|---|---|
| 中国澳门 | Visa / Mastercard | **1.75% – 1.95%** | 大西洋银行 **1.90%**（官方收费表 2026-10 版第 18 页；旧值 1.75% 来自第三方汇总站，已废弃）；工银澳门 1.95%；大丰 1.95%；国际银行 1.75%；华侨永亨 1.75% | bnu.com.mo《BNU_PricingList_CN.pdf》；smartcardmacao.com《澳門地區信用卡外幣/跨域交易手續費及匯率查詢》（2026-10-26 更新版） |
| 中国澳门 | 银联（全币种卡） | **0%** | 中银澳门全币种卡「免收 1.95% 跨境交易手续费，优惠期至 2026-12-31」 | bankofchina.com/mo《BOC Bank Card Charges》；bocmacau.com《銀行卡各項服務收費表》 |
| 中国澳门 | 银联双币（汇丰 Pulse） | **0%**（港澳及中国内地）/ 其他 1% | — | smartcardmacao.com 同上 |
| 中国澳门 | 中银全币种航空卡（银联/Visa Signature） | **0%** | — | smartcardmacao.com《澳門2026年信用卡推介》 |
| 中国澳门 | 立桥银行 Visa | **0%** | — | 同上 |
| 中国澳门 | 澳门商业银行 BCM | 外币 0.5% + 跨域 1.0% = **最高 1.5%** | 唯一分开「外币」与「跨域」两项独立收费的机构 | smartcardmacao.com《澳門地區…手續費列表》 |
| 中国香港 | Visa / Mastercard | **1.95%**（汇丰、恒生、渣打、花旗、DBS 主流） | HSBC 官方费率表：港币个人卡 1.95% | hsbc.com.hk《Key Fact Statement》；jetsofind.com《Best HK Credit Cards 2026》 |
| 中国香港 | 银联双币 | **0%**（人民币/澳门币）；其他外币 1% | HSBC Pulse UnionPay Dual Currency Diamond | hsbc.com.hk《Key Fact Statement》 |
| 中国香港 | American Express | **2.00%** | 非美元外币先折美元再折港币（双重兑换） | smartcardmacao.com 手续费列表 |
| 中国香港 | AEON 信用卡 | **1.5%** | 市场最低之一 | comparecard.hk《港澳信用卡2026年外幣簽賬終極比較》 |
| 美国 | 多数返现卡（Chase Freedom 系列、Citi Double Cash、WF Active Cash 等） | **3%** | 行业标准值 | pointsplaybook.co / supapoints.com 2026 版；Chase 官方"no FTF"卡列表作为反证 |
| 美国 | 主流旅行卡（CSP/CSR、Capital One 全系、Discover、Amex Platinum/Gold） | **0%** | — | chase.com/preferred「No foreign transaction fees」；Chase 官方 No-FTF 卡列表 |

**是否收固定费**：信用卡**消费交易不收固定费**，只按比例。固定费只出现在**取现**（如中银澳门 ATM 取现 4%、最低 MOP/RMB 30）。本产品不建模取现，故 `fixedFee` 默认为 0，但字段保留以支持未来"少数卡按笔收费"的例外。

#### 隐藏难点：手续费取决于「结算币种」，不是「卡的发卡地」

这是最容易算错的地方。同样是「澳门餐饮刷香港卡」，可能：

- 商户以 MOP 结算 → 港币卡走「外币交易」→ 1.95%
- 商户以 HKD 结算（澳门很多商户支持港币）→ 港币卡走「跨境/跨域交易」→ 1.95%（部分卡此场景 0%）
- 商户/终端做 **DCC**（动态货币转换），把 MOP 折成 HKD 让用户确认 → 卡端不算外币，但 DCC 商含 3–5% 隐藏加点

所以 `SpendInput` 必须包含 **`settlementCurrency`（预计结算币种）**，而不是仅凭发卡地推断。

```ts
interface FxContext {
  issuerRegion: 'MO' | 'HK' | 'US';
  cardCurrency: CurrencyCode;       // 该卡的结算账户币种（MOP/HKD/USD）
  settlementCurrency: CurrencyCode; // 本次交易预计结算币种
  isCrossBorder: boolean;           // 商户注册地是否在发卡地之外
  dccAccepted: boolean;             // 用户是否在终端被要求 DCC（默认 false，并提示拒绝）
}
```

手续费查表优先级：**卡级覆盖 > 卡组织 + 发卡地默认值 > 全局兜底**。

**DCC 的处理**：不建模具体加点（加点由第三方决定，不可枚举），而是把它作为**警示**而非计算项——若用户表示"终端要求以 HKD 结算"，UI 显式警告「DCC 通常额外损失 3–5%，建议拒绝并要求按 MOP 结算」。因为建模一个范围值会让"3 秒出结果"变成一个不确定数字，反而降低信任。

### 3.6 完整数据结构（TypeScript，可编译）

```ts
// ============ 基础枚举 ============
export type CurrencyCode = 'MOP' | 'HKD' | 'CNY' | 'USD';
export type IssuerRegion = 'MO' | 'HK' | 'US';
export type CardNetwork = 'visa' | 'mastercard' | 'unionpay' | 'amex' | 'jcb';

export type SpendCategory =
  | 'dining' | 'grocery' | 'fuel' | 'flight'
  | 'hotel' | 'online' | 'other';

export type PaymentChannel =
  | 'physical' | 'alipay' | 'wechat' | 'unionpay_qr' | 'apple_pay';

export type SpendRegion = 'MO' | 'CN'; // 仅澳门与中国内地（Phase 0 锁定）
```

```ts
// ============ 费率溯源 ============
export interface SourceRef {
  url: string;
  /** 核实日期 ISO 8601，UI 必展示，>180 天提示过期 */
  verifiedAt: string;
  note?: string;
}
```

```ts
// ============ 上限池 ============
export interface CapDefinition {
  /** 全局唯一，构造规则 `${cardId}:${groupKey}` */
  id: string;
  /** 共享此上限的类别；'all' 表示全类别共用 */
  categories: SpendCategory[] | 'all';
  /** 上限金额，以 limitCurrency 计 */
  limitAmount: number;
  limitCurrency: CurrencyCode;
  /** 周期。MVP 支持自然月；year / half_year 为卡库数据实测需求（如 EarnMORE 上限按年计） */
  period: 'month' | 'year' | 'half_year';
  /** 超额后的降级费率（缺省则超额部分不计收益） */
  overLimitFallback?: EarnTrack;
}

// ============ 收益轨道 ============
export interface EarnTrackBase {
  /** 排他组：同组内只取价值最高的一条，不同组叠加 */
  exclusivityGroup: string;
  /** 本轨道受哪些上限池约束 */
  capIds: string[];
  /** 值乘数的分母，便于阅读：2 表示 2x 积分，0.04 表示 4% */
  label?: string;
}

export interface CashbackTrack extends EarnTrackBase {
  kind: 'cashback';
  /** 0.04 = 4% */
  rate: number;
}

export interface PointsTrack extends EarnTrackBase {
  kind: 'points';
  /** 每计价单位的积分倍数 */
  multiplier: number;
  /** 积分计划标识，指向 ValueParams.pointValuations 的 key */
  pointProgramId: string;
}

export interface CreditTrack extends EarnTrackBase {
  kind: 'statement_credit';
  /** 固定金额账单抵扣，一次性 */
  amount: number;
  currency: CurrencyCode;
}

export type EarnTrack = CashbackTrack | PointsTrack | CreditTrack;
```

```ts
// ============ 规则 ============
export interface RuleConditions {
  categories?: SpendCategory[];
  channels?: PaymentChannel[];
  regions?: SpendRegion[];
  /** 仅当结算币种不是卡币种时激活（外币加成场景） */
  foreignCurrencyOnly?: boolean;
  /** 单笔最低消费 */
  minAmount?: number;
  /** 单笔最高有效金额（超出部分不享此费率） */
  maxAmount?: number;
}

export interface CardRule {
  id: string;
  cardId: string;
  /** 人类可读名，展示用："餐饮 4x 积分" */
  name: string;
  /** 优先级，冲突时高者先匹配；默认 0 */
  priority: number;
  conditions: RuleConditions;
  earn: EarnTrack[];
  /** 该规则是否只对特定积分计划生效 */
  activeFrom?: string;   // ISO date
  activeTo?: string;     // ISO date
  source?: SourceRef;
}

// ============ 卡 ============
export interface Card {
  id: string;
  /** 用户起的昵称，如"中银淘宝卡" */
  nickname: string;
  issuerName: string;
  issuerRegion: IssuerRegion;
  network: CardNetwork;
  /** 卡账户结算币种 */
  currency: CurrencyCode;
  /** 卡片主色调，仅用于 UI 区分，走 Design Token 键名不存 hex */
  accentToken?: string;
  /** 本卡外币手续费（覆盖默认表） */
  fxFeeOverride?: FxFeeRule;
  /** 积分计划，若本卡积分类收益 */
  pointProgramId?: string;
  /** 卡是否在用（停用卡不参与排序但保留账本历史） */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```

```ts
// ============ 外币手续费 ============
export interface FxFeeRule {
  /** 百分比费率，0.0195 = 1.95% */
  rate: number;
  /**
   * 分项费率（澳门商业银行 BCM 是唯一分开「外币」与「跨域」两项收费的机构）。
   * 存在时优先于 rate 使用：按本次交易的结算路由择一。
   * 实测来源：BCM 外币 0.5% + 跨域 1.0%
   */
  splitRates?: {
    /** 外币交易（结算币种 != 卡币种，且非跨境） */
    foreign?: number;
    /** 跨境/跨域交易（商户注册地在发卡地之外） */
    crossBorder?: number;
  };
  /** 固定费（多数卡为 0） */
  fixedFee: number;
  fixedFeeCurrency?: CurrencyCode;
  /** 免收条件 */
  waivedWhen?: {
    settlementCurrencyIn?: CurrencyCode[];
    /** 银联双币卡的港澳/内地豁免等 */
    regions?: SpendRegion[];
    /**
     * 豁免截止日，如中银澳门优惠期至 2026-12-31。
     * 处理策略：不等到过期才报错 —— 距截止日 <= 60 天即进入「即将到期」倒计时警示状态，
     * 避免用户在到期前两个月内拿到「假设永久豁免」的错误答案且毫无察觉。
     */
    validUntil?: string;
  };
  source: SourceRef;
}
```

```ts
/** 豁免/优惠的时效状态，由引擎统一判定并驱动 UI 提示 */
export type ValidityState =
  | { state: 'permanent' }
  | { state: 'active'; validUntil: string; daysLeft: number }
  | { state: 'expiring_soon'; validUntil: string; daysLeft: number } // daysLeft <= 60
  | { state: 'expired'; validUntil: string };
```

```ts
// ============ 积分估值参数 ============
export interface PointValuation {
  programId: string;
  /** 每积分价值，以 currency 计 */
  valuePerPoint: number;
  currency: CurrencyCode;
  /** 用户可改，默认给保守值 */
  source: SourceRef;
}

export interface ValueParams {
  pointValuations: Record<string, PointValuation>;
  /** 是否把积分计入净收益（用户可能只想看现金） */
  includePoints: boolean;
  /** 展示货币（不做汇率换算，仅决定符号） */
  displayCurrency: CurrencyCode;
}
```

```ts
// ============ 输入 ============
export interface SpendInput {
  region: SpendRegion;
  category: SpendCategory;
  amount: number;
  currency: CurrencyCode;          // 用户实际要付的币种
  channel: PaymentChannel;
  /** 预计结算币种，默认等于 currency */
  settlementCurrency?: CurrencyCode;
  /** 是否已知会被 DCC */
  dccAccepted?: boolean;
  occurredAt: string;              // ISO 8601
}
```

```ts
// ============ 输出 ============
export interface SchemeBreakdownItem {
  label: string;
  /** 对净收益的贡献，可为负 */
  amount: number;
  kind: 'cashback' | 'points' | 'credit' | 'fx_fee' | 'fixed_fee';
  sourceRuleId?: string;
  /** 因上限被削减的金额（>0 表示打了折扣） */
  cappedBy?: number;
}

export interface Scheme {
  cardId: string;
  cardNickname: string;
  ruleId: string;
  /** 按账本真实已用额度计算的净收益 */
  netRealistic: number;
  /** 假设额度完全未用的净收益 */
  netOptimistic: number;
  breakdown: SchemeBreakdownItem[];
  /** 命中的上限池剩余情况，用于 UI 提示 */
  capsAffected: Array<{ capId: string; remaining: number; currency: CurrencyCode }>;
  /** 警示：DCC、额度将满、费率过期等 */
  warnings: SchemeWarning[];
}

export type SchemeWarning =
  | { code: 'dcc_risk' }
  | { code: 'cap_nearly_exhausted'; capId: string; remaining: number }
  | { code: 'cap_exhausted'; capId: string }
  | { code: 'stale_rate'; verifiedAt: string }
  | { code: 'fx_fee_exempt_expired'; validUntil: string };
```

#### 可编译性验证记录（已执行，非声明）

上述全部类型已抽取为独立文件，用 **TypeScript 7.0.2 `--strict`** 实际编译：

```
$ npx typescript@7.0.2 --noEmit --strict --target ES2022 \
    --moduleResolution bundler --module esnext types.ts check.ts
（无输出，exit 0）
```

`check.ts` 内含三个真实场景的实例化，验证类型可用而非仅可声明：

1. Apple Card「Apple Pay 2% / 实体卡 1%」——同 `exclusivityGroup` 两条轨道，验证互斥建模
2. 中银澳门全币种银联——`waivedWhen.settlementCurrencyIn` + `validUntil` 豁免期
3. Chase Freedom Flex 餐饮 4x 积分 + 每月 5000 USD 上限池引用

**反向验证**（确认这个检查真的能拦错，而不是永远绿）：故意注入 `rate: '2%'`（字符串冒充费率）与 `code: 'not_a_real_warning'`（拼错警告码），编译器如期报错：

```
bad.ts(5,30): error TS2322: Type 'string' is not assignable to type 'number'.
bad.ts(7,28): error TS2322: Type '"not_a_real_warning"' is not assignable to type
  '"cap_exhausted" | "cap_nearly_exhausted" | "dcc_risk" | "fx_fee_exempt_expired" | "stale_rate"'.
```

这条反向验证是「生成式代码失效模式」第 1 类（幻觉依赖/接口）与第 2 类（沉默逻辑错误）的防线证据：类型系统能在编译期拦住"把百分比写成字符串"这类错误。

#### §12.2 新增类型的验证记录

`ChannelFeeRule` / `ChannelFeeTier` / `ThresholdDefinition` / `ThresholdTier` / 修正后的 `LedgerEntry` 同样以 `--strict` 实编译通过（exit 0），并用两个真实场景实例化：

1. AlipayHK + Visa/MC 渠道费：每月 HKD 3,000 免额 + 超出 2.5% 单档
2. 澳门卡月签 MOP 15,000 门槛：0 档 1.5% / 1,500,000 分档 3.0%

> **注（ADR-011）**：上面的 `ThresholdTier` 已于 Phase 4 第三轮删除，`ThresholdDefinition` 改为「按类别绑定 + 增量」模型。本节保留为历史验证记录（当时的编译证据），当前类型见 §3.6 的门槛定义块。


```
$ npx typescript@7.0.2 --noEmit --strict --target ES2022 \
    --moduleResolution bundler --module esnext types.ts extra.ts
（无输出，exit 0）
```

### 3.7 计算伪代码（含边界）

```
FUNCTION rankCards(cards, rules, ledger, params, input) -> Scheme[]

  # ---- 0. 预处理：账本归集（O(n)，一次算完）----
  periodKey ← toPeriodKey(input.occurredAt)          # 'YYYY-MM'
  spentByCap ← EMPTY MAP                              # capId -> 已用金额（cap 币种）
  FOR EACH entry IN ledger WHERE entry.periodKey = periodKey:
      FOR EACH (capId, consumed) IN entry.capConsumption:
          spentByCap[capId] ← spentByCap[capId] + consumed

  schemes ← EMPTY LIST

  FOR EACH card IN cards WHERE card.active = TRUE:

      # ---- 1. 计算本卡外币手续费 ----
      fx ← resolveFxFee(card, input)                  # 见 resolveFxFee
      fxFeeAmount ← round2(input.amount * fx.rate + fx.fixedFee)

      # ---- 2. 找出所有激活的规则 ----
      activeRules ← rules
          WHERE rule.cardId = card.id
            AND isRuleActive(rule, input)             # 日期、类别、渠道、币种、金额门槛
          ORDER BY rule.priority DESC

      IF activeRules IS EMPTY:
          # 无规则命中：仍要给出"裸刷"方案（净收益 = -手续费），
          # 否则用户会以为这张卡不存在。这是边界条件，不是优化。
          EMIT scheme(card, ruleId=NIL, parts=[−fxFeeAmount])
          CONTINUE

      # ---- 3. 对每条候选规则计算收益 ----
      #    一张卡可能命中多条规则（如主类别规则 + 渠道加成规则），
      #    但它们分属不同 exclusivityGroup 时才叠加。
      groups ← MAP<groupKey, LIST<candidate>>
      FOR EACH rule IN activeRules:
          FOR EACH track IN rule.earn:
              IF NOT isTrackActive(track, input): CONTINUE
              candidate ← evaluateTrack(track, card, input, params,
                                        spentByCap, fx)
              groups[track.exclusivityGroup].APPEND(candidate)

      # ---- 4. 每个排他组取价值最高的一条（解决"不重复计算"）----
      chosen ← EMPTY LIST
      FOR EACH (groupKey, candidates) IN groups:
          IF groupKey STARTS WITH 'additive.':       # 显式叠加组
              chosen.EXTEND(candidates)              # 全部保留
          ELSE:
              chosen.APPEND(MAX_BY(candidates, c => c.value))

      # ---- 5. 汇总 ----
      grossValue ← SUM(chosen.value)
      netRealistic  ← grossValue − fxFeeAmount
      netOptimistic ← recomputeWithEmptyLedger(chosen) − fxFeeAmount
      # netOptimistic 不重跑全部计算，只需把"被上限削减的部分"还原：
      #   netOptimistic = netRealistic + SUM(candidate.cappedBy)

      EMIT scheme(card, chosen, netRealistic, netOptimistic, warnings)

  # ---- 6. 排序 ----
  # 主键 netRealistic 降序；并列时按 netOptimistic 降序（更宽松者优先，
  # 因为额度没用完时它就是真答案）；再并列按卡昵称稳定排序（保证确定性）
  SORT schemes BY (netRealistic DESC, netOptimistic DESC, cardNickname ASC)
  RETURN schemes
```

```
FUNCTION evaluateTrack(track, card, input, params, spentByCap, fx) -> Candidate

  # ---- 边界 1：单笔金额上限（maxAmount）----
  # 只有 maxAmount 以内的部分享此费率，超出部分不享
  effectiveAmount ← input.amount
  IF track/rule.maxAmount IS SET:
      effectiveAmount ← MIN(input.amount, rule.maxAmount)

  # ---- 边界 2：上限池剩余额度 ----
  # 关键：一个 track 可能挂在多个 cap 上（如"餐饮每月 5000，且全类别每月 20000"）
  # 取所有相关 cap 中【剩余最少】的那个作为约束（木桶原理）
  capRemaining ← INFINITY
  capCurrencyMismatch ← FALSE
  FOR EACH capId IN track.capIds:
      cap ← lookupCap(capId)
      remaining ← cap.limitAmount − (spentByCap[capId] ?? 0)
      IF remaining < capRemaining: capRemaining ← remaining
      IF cap.limitCurrency ≠ input.currency:
          # 不建模汇率成本 → 不做换算，按 1:1 保守估算并打标
          capCurrencyMismatch ← TRUE
          WARN('cap_currency_assumed_parity', capId, input.currency, cap.limitCurrency)

  IF capCurrencyMismatch:
      # 保守策略：按 1:1 视为同币种，并显式警告用户
      # 理由：宁可低估收益，也不要给用户一个虚高的数字去刷错卡
      PASS

  eligibleAmount ← MIN(effectiveAmount, MAX(capRemaining, 0))
  overAmount     ← effectiveAmount − eligibleAmount

  # ---- 边界 3：超额后的降级 ----
  value ← 0
  cappedBy ← 0
  IF track.kind = 'cashback':
      value ← eligibleAmount * track.rate
      IF overAmount > 0:
          IF cap.overLimitFallback EXISTS:
              value ← value + evaluateFallback(cap.overLimitFallback, overAmount)
          # 无 fallback → 超额部分收益为 0（不是负）
      cappedBy ← (effectiveAmount * track.rate) − eligibleAmountValue

  ELIF track.kind = 'points':
      IF params.includePoints = FALSE:
          value ← 0                             # 用户选择只看现金
      ELSE:
          points ← eligibleAmount * track.multiplier
          valuation ← params.pointValuations[track.pointProgramId]
          IF valuation IS MISSING:
              # 边界：卡配了点数倍率但没配估值 → 不能让整个计算崩
              value ← 0
              WARN('missing_point_valuation', track.pointProgramId)
          ELSE:
              value ← points * valuation.valuePerPoint
      cappedBy ← ...

  ELIF track.kind = 'statement_credit':
      # 固定抵扣：一次性，不随金额缩放
      value ← track.amount
      cappedBy ← 0

  # ---- 边界 4：上限即将用尽提示 ----
  IF capRemaining > 0 AND capRemaining < effectiveAmount:
      WARN('cap_nearly_exhausted')
  IF capRemaining <= 0:
      WARN('cap_exhausted')

  RETURN Candidate(value, cappedBy, warnings)
```

```
FUNCTION resolveFxFee(card, input) -> { rate, fixedFee, exempt, source }

  settlement ← input.settlementCurrency ?? input.currency

  # 边界 1：同币种交易不收费（含"港币卡刷澳门商户按 HKD 结算"的场景）
  IF settlement = card.currency:
      RETURN { rate: 0, fixedFee: 0 }

  # 优先级 1：卡级覆盖（用户自己填的，最权威）
  IF card.fxFeeOverride EXISTS:
      rule ← card.fxFeeOverride
      # 边界 2：豁免条件（如银联双币卡港澳/内地 0%）
      IF rule.waivedWhen EXISTS:
          IF settlement IN rule.waivedWhen.settlementCurrencyIn: RETURN 0
          IF input.region IN rule.waivedWhen.regions:
              IF rule.waivedWhen.validUntil IS SET
                 AND today() > rule.waivedWhen.validUntil:
                  WARN('fx_fee_exempt_expired')     # 优惠期已过，按原费率收
              ELSE:
                  RETURN 0
      RETURN { rate: rule.rate, fixedFee: rule.fixedFee, source: rule.source }

  # 优先级 2：发卡地 + 卡组织默认表（内置，带 source）
  RETURN lookupDefaultFxTable(card.issuerRegion, card.network, settlement)

  # 边界 3：查不到 → 用该发卡地最保守值（最高费率）并警告，
  # 绝不默认 0（默认 0 会让用户以为一张 3% 手续费的卡很好）
```

```
FUNCTION isRuleActive(rule, input) -> BOOLEAN
  IF rule.activeFrom SET AND input.occurredAt < rule.activeFrom: RETURN FALSE
  IF rule.activeTo   SET AND input.occurredAt > rule.activeTo:   RETURN FALSE
  IF rule.conditions.categories SET AND input.category NOT IN:   RETURN FALSE
  IF rule.conditions.channels   SET AND input.channel  NOT IN:   RETURN FALSE
  IF rule.conditions.regions    SET AND input.region   NOT IN:   RETURN FALSE
  IF rule.conditions.minAmount  SET AND input.amount <  minAmount: RETURN FALSE
  IF rule.conditions.foreignCurrencyOnly = TRUE:
      settlement ← input.settlementCurrency ?? input.currency
      IF settlement = card.currency: RETURN FALSE
  RETURN TRUE
```

### 3.8 金额舍入规则（沉默逻辑错误高发区）

**统一用整数「分」做运算，只在展示时转小数。**

- 所有 `number` 金额字段语义为「最小货币单位整数」（MOP 分、USD 分）；命名后缀 `Cents` 以示区分，但为 API 简洁保留 `amount` 并在此文档钉死语义。
- 积分不舍入（可为小数），最终价值 `round2` 到分。
- `round2` 用 `Math.round(x * 100) / 100`，**禁止** `toFixed` 参与运算（`toFixed` 返回值是字符串，隐式转换是经典幻觉源）。
- 排序必须**稳定**：并列时按 `cardNickname` 兜底，否则同一输入两次刷新顺序不同，用户会以为 bug。

---

## 4. 离线能力与 PWA

### 4.1 是否需要：需要，但不能作为"数据安全"的承诺

| 维度 | 结论 |
|---|---|
| 离线可用 | **需要**。用户场景是"在澳门餐厅里信号差"或"内地漫游无网"。壳缓存后离线可用，代价极小 |
| 添加到桌面 | **必须做**，但在 iOS 上它是数据存活的前提（§4.2） |
| 后台同步 | 不做（无后端） |
| Push 通知 | 不做（无意义，且 iOS 需后端） |

### 4.2 iOS Safari 7 天存储清除（本项目第一风险）

**已核实事实**（来源：openpwa.net《Eviction and best-effort storage》、browser-storage.com《The iOS Safari 7-Day Storage Eviction Workaround》、synthetixis.com《PWA on iOS 2026》、ymlogy.xyz《Building a PWA That Actually Keeps Its Data》）：

1. WebKit 的 ITP 会清除「脚本可写存储」（IndexedDB / Cache API / localStorage / sessionStorage）中**7 天未交互**的站点数据。
2. 计数按"Safari 有使用的天数"，不是日历天。
3. **添加到主屏幕的 Web App 不受此限**——它是独立存储分区，有自己的使用天数计数器，打开即重置。
4. `navigator.storage.persist()` 在 iOS 上**不被实现**（resolves false 或 no-op），`navigator.storage.persisted()` 也不可信。在 Chromium 上有效且通常自动授予（尤其已安装 PWA）。
5. 删除主屏幕图标 = 删除该存储分区，无二次确认。
6. iOS 设置里的「清除历史记录与网站数据」会连带清掉已安装 PWA 的数据。
7. iOS 26 起，任何加到主屏幕的站点都以 Web App 形式打开（不再要求 manifest 可安装性）。

**结论：在 iOS 上，「不安装到主屏幕」=「数据 7 天后自动消失」。** 这直接威胁本产品的核心资产（用户手输的卡库与账本）。

### 4.3 三道防线（必须全部实现）

| 防线 | 实现 | 优先级 |
|---|---|---|
| 1. 强制引导安装 | 首次进入且非 standalone 模式时，弹出**不可跳过**（可暂缓一次）的 iOS 引导：图示「分享 → 添加到主屏幕」。检测 `window.matchMedia('(display-mode: standalone)').matches` 与 `navigator.standalone` | P0 |
| 2. 请求持久化（Android/Chromium） | 库打开后调 `navigator.storage.persist()`，feature-detect 包裹；首个 `pointerdown` 重试一次（部分浏览器要求用户手势）。iOS 上静默 no-op，无害 | P0 |
| 3. 导出 / 导入 | 首页常驻「导出数据」入口（JSON 下载）+ 导入（版本校验 + id 冲突策略 = keep-newer）。这是**用户的实际备份方案**，不是附加功能 | P0 |
| 4. 静默清空检测 | 在 localStorage 写 `storage-probe=v1`；启动时若 IndexedDB 为空但 probe 存在 → 判定「数据被清空」，显示明确恢复引导（导入备份）。见 openpwa.net 的 eviction 探测方案 | P1 |
| 5. 周期性打开提醒 | 首页顶部常驻一行「本工具数据存在此设备，建议每月打开一次并导出备份」。诚实告知，比隐藏更可信 | P1 |

**代价评估**：防线 1/2/4 合计约 120 行代码；防线 3 约 150 行（含版本迁移）。这 270 行是本项目**最值得写的代码**，优先级高于任何 UI 打磨。

### 4.4 PWA 配置要点

```ts
// vite.config.ts 关键片段（不是完整配置）
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,woff2}'],
    // HTML 用 network-first + 3s 超时回退缓存：
    // 弱网（澳门室内/内地漫游）下 fetch 可能挂起数十秒，
    // 无限等待会让用户以为 App 挂了
    runtimeCaching: [{
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: { networkTimeoutSeconds: 3 },
    }],
  },
})
```

**纪律**：预缓存不要用 `cache.addAll`——一个图标 404 会让整个安装失败、用户连离线壳都没有。`vite-plugin-pwa` 默认逐项 add 并容错，符合此要求，不得手写覆盖。

---

## 5. 目录结构规划

符合 `references/01-standards/code-organization.md`：依赖只向下、单文件 ≤300 行、按资源分包、入口只装配、类型独立成文件、utils 只放纯函数。

```
cc-rewards/
├── docs/
│   ├── ARCHITECTURE.md              # 本文档
│   ├── api-contract.md              # Phase 2：领域接口契约（函数签名 + 数据形状）
│   └── decisions/
│       ├── ADR-001-stack.md
│       ├── ADR-002-persistence.md
│       ├── ADR-003-icon-library.md
│       ├── ADR-004-no-backend.md
│       ├── ADR-005-cap-ledger.md
│       └── ADR-006-styling-tokens.md
│
├── public/
│   ├── icons/                       # PWA 图标 PNG/SVG（唯一允许手写 svg 的地方）
│   └── manifest.webmanifest
│
├── src/
│   ├── main.tsx                     # 入口：只装配（挂 Provider、挂 App、注册 SW）
│   ├── App.tsx                      # 视图切换（≤80 行）
│   ├── index.css                    # Tailwind 入口 + @theme Design Token（唯一颜色来源）
│   │
│   ├── types/                       # 类型单独成文件，零运行时
│   │   ├── domain.ts                # Card / CardRule / EarnTrack / CapDefinition
│   │   ├── spend.ts                 # SpendInput / SpendCategory / PaymentChannel
│   │   ├── scheme.ts                # Scheme / SchemeBreakdownItem / SchemeWarning
│   │   ├── ledger.ts                # LedgerEntry
│   │   └── params.ts                # ValueParams / PointValuation / FxFeeRule
│   │
│   ├── lib/                         # 纯函数工具，无业务、无副作用
│   │   ├── money.ts                 # round2 / sumCents / formatMoney
│   │   ├── period.ts                # toPeriodKey / isSameMonth
│   │   ├── id.ts                    # uuid
│   │   └── cn.ts                    # className 合并（clsx）
│   │
│   ├── domain/                      # 业务层：纯函数，禁止 import react / dexie / window
│   │   ├── engine/
│   │   │   ├── rankCards.ts         # 对外唯一入口（≤150 行）
│   │   │   ├── evaluateTrack.ts     # 单条轨道估值（≤200 行）
│   │   │   ├── resolveFxFee.ts      # 外币手续费解析
│   │   │   ├── applyCap.ts          # 上限扣减（木桶原理）
│   │   │   ├── applyThreshold.ts    # 门槛定档（先定档、再封顶）
│   │   │   ├── resolveChannelFee.ts # 渠道服务费（渠道×卡组织×金额档）
│   │   │   └── rankSort.ts          # 稳定排序 + 基本持平判定
│   │   ├── rules/
│   │   │   ├── isRuleActive.ts      # 规则激活判定
│   │   │   ├── isTrackActive.ts     # 轨道激活判定
│   │   │   └── ruleValidation.ts    # 规则合法性校验（保存前跑）
│   │   ├── ledger/
│   │   │   ├── buildEntry.ts        # 由 Scheme + input 生成 LedgerEntry
│   │   │   └── aggregateCaps.ts     # 账本按 capId 归集
│   │   └── fx/
│   │       └── defaultFxTable.ts    # 内置费率默认表（含 SourceRef，见 §3.5）
│   │
│   ├── data/                        # 数据层：禁止 import domain
│   │   ├── db.ts                    # Dexie 实例 + schema 版本迁移（≤150 行）
│   │   ├── repositories/
│   │   │   ├── cardRepo.ts
│   │   │   ├── ruleRepo.ts
│   │   │   ├── ledgerRepo.ts
│   │   │   └── paramsRepo.ts
│   │   └── seed/
│   │       └── cardTemplates.ts     # 预置卡模板（一键带出规则）
│   │
│   ├── platform/                    # 基础设施：浏览器 API 适配
│   │   ├── storagePersistence.ts    # persist() / persisted() / 清空检测
│   │   ├── installPrompt.ts         # standalone 检测 + iOS 引导
│   │   └── exportImport.ts          # JSON 导出下载 / 导入（版本校验）
│   │
│   ├── hooks/                       # 应用层：粘合 domain + data + React
│   │   ├── useCards.ts              # useLiveQuery 包装
│   │   ├── useLedger.ts
│   │   ├── useDecisionForm.ts       # useReducer 管理 5 字段表单
│   │   ├── useRankedSchemes.ts      # 调 rankCards 并 memo
│   │   └── useExportImport.ts
│   │
│   ├── components/                  # 表现层：只渲染，不算钱
│   │   ├── ui/                      # 原子组件
│   │   │   ├── Button.tsx
│   │   │   ├── Sheet.tsx
│   │   │   ├── AmountInput.tsx
│   │   │   ├── CategoryPicker.tsx   # 用 Lucide 图标
│   │   │   ├── ChannelPicker.tsx    # 用 Lucide 图标
│   │   │   ├── RegionPicker.tsx
│   │   │   └── WarningBanner.tsx
│   │   ├── result/
│   │   │   ├── VerdictCard.tsx      # Top1 大字结论
│   │   │   ├── ResultList.tsx
│   │   │   └── BreakdownList.tsx    # 分项明细（"这 12 块怎么来的"）
│   │   ├── cards/
│   │   │   ├── CardList.tsx
│   │   │   ├── CardForm.tsx
│   │   │   ├── RuleEditor.tsx
│   │   │   └── CapEditor.tsx
│   │   └── common/
│   │       ├── AppHeader.tsx
│   │       ├── InstallGuide.tsx     # iOS 添加到主屏幕引导
│   │       └── DataSafetyNote.tsx   # "数据存在此设备"告知
│   │
│   └── pages/                       # 视图：只组装
│       ├── DecidePage.tsx           # 主页面（3 秒出结果）
│       ├── LedgerPage.tsx           # 本月已用额度 + 条目管理
│       ├── CardsPage.tsx            # 卡库增删改
│       └── SettingsPage.tsx         # 积分估值 / 导出导入 / 关于
│
├── tests/
│   ├── engine/
│   │   ├── rankCards.test.ts        # 核心：多卡排序、边界
│   │   ├── exclusivity.test.ts      # 不重复计算（同组取最高）
│   │   ├── applyCap.test.ts         # 上限：部分超额、全超额、跨月归零
│   │   ├── resolveFxFee.test.ts     # 手续费：同币种0、豁免期过、查不到兜底
│   │   └── rounding.test.ts         # 舍入与稳定排序
│   ├── rules/isRuleActive.test.ts
│   └── setup.ts
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── eslint.config.js
├── package.json
└── pnpm-lock.yaml
```

### 文件规模预算（对照 ≤300 行硬规则）

| 文件 | 预估行数 | 风险 |
|---|---|---|
| `domain/engine/evaluateTrack.ts` | ~180 | 中（上限 + 三种轨道 + 边界），若超 250 拆 `evaluateCashback.ts` / `evaluatePoints.ts` |
| `domain/fx/defaultFxTable.ts` | ~200 | 数据表，天然长；超 300 则拆 `defaultFxTableMO.ts` / `HK.ts` / `US.ts` |
| `components/cards/RuleEditor.tsx` | ~220 | 高（表单最易膨胀），超 250 拆 `conditions/Actions.tsx` |
| `main.tsx` | <40 | 只装配 |
| `App.tsx` | <80 | 视图切换 |

---

## 6. 技术约束与不可行警告

### 6.1 硬约束（违反即不合格）

| # | 约束 | 检查方式 |
|---|---|---|
| C1 | `domain/` 下禁止出现 `react` / `dexie` / `window` / `document` / `localStorage` | ESLint `no-restricted-imports` + `no-restricted-globals` |
| C2 | `data/` 下禁止 import `domain/` | ESLint |
| C3 | 全部颜色只能来自 `index.css` 的 `@theme` token；`src/` 下 grep 不到 `#` 开头的 hex、`rgb(`、`hsl(` | ESLint `no-restricted-syntax` + CI grep |
| C4 | 图标只允许 `lucide-react`；禁止 emoji 作功能图标 | CI grep emoji 区间 + 只允许 Lucide 白名单 |
| C5 | 金额运算只用 `lib/money.ts`；禁止直接 `toFixed` 参与运算 | ESLint |
| C6 | 单文件 ≤300 行 | `wc -l` 门禁 |
| C7 | 每条费率必须带 `source: { url, verifiedAt }` | 类型系统强制（`source` 非可选时） |
| C8 | 禁止 inline 手写 `<svg>`（除 `public/`） | CI grep |
| C9 | 禁止任何网络请求（无 `fetch` 数据上报、无第三方统计） | CI grep `fetch(` / `XMLHttpRequest` / `navigator.sendBeacon` |

### 6.2 不可行 / 高风险的明确声明

| 项 | 结论 | 说明 |
|---|---|---|
| **精确汇率成本建模** | **不可行** | Phase 0 已明确不建模。本工具的所有金额都是「消费币种」口径，不做跨币种换算。用户看到的是"哪张卡在这笔上净赚更多"，不是"折回 MOP 多少钱"。这是刻意的精度取舍。 |
| **上限池币种不一致** | **不精确** | 卡的上限是 5000 USD，用户刷 MOP——不换算就会错。本工具按 1:1 保守估算并显式警告。**不做汇率查询**（那需要联网，破坏离线与隐私）。用户被要求自己保证上限币种与消费币种一致，规则编辑器里会提示。 |
| **DCC 加点建模** | **不建模** | 加点由第三方收单机构决定，不可枚举，且是范围值。改为显式警告"拒绝 DCC"。 |
| **自动识别商户 MCC** | **不可行** | 需联网查 MCC 库 + 需 POS 信息。用户手动选类别。 |
| **账单周期精确对齐** | **不做** | 按自然月估算，UI 明示。各卡账单日建模成本高、收益低。 |
| **积分价值客观化** | **不可行** | 积分价值取决于用户怎么用（换里程 vs 换现金差 3-5 倍）。做成**用户可调的参数**，默认给保守值，并显示"此值由你设定"。 |
| **iOS 数据持久性保证** | **无法保证** | 见 §4.2。只能靠"引导安装 + 导出备份"。**这不是技术缺陷，是平台约束**，必须对用户说明。 |
| **活动叠加的完整建模** | **部分可行** | 只支持"固定金额抵扣"和"分类别加成"两类活动。不支持"满 3 笔返 50""新户首刷"这类序列依赖活动——建模成本远超收益，且用户自用场景下记不住。 |
| **多币种账户卡（一卡多币种余额）** | **简化处理** | 每张卡只有一个 `currency`。多币种卡（如银联双币）请建成两条卡记录或使用 `fxFeeOverride.waivedWhen` 表达豁免。 |

### 6.3 与 PRD 的可行性核对（逐条）

| Phase 0 需求 | 可实现性 | 落点 |
|---|---|---|
| 无需注册登录、无后端用户体系 | 完全可行 | 无后端 |
| 澳门 + 内地消费 | 完全可行 | `SpendRegion = 'MO' \| 'CN'` |
| 澳门/香港/美国发卡 | 完全可行 | `IssuerRegion` |
| 返现 + 积分 + 渠道差异 + 简单活动叠加 | 可行（活动限于两类） | §3.4 `EarnTrack` |
| 必须计入外币手续费 | 可行，已核典型值 | §3.5 `defaultFxTable` |
| 不建模汇率成本 | 可行（刻意不做） | §6.2 |
| 卡库自助增删改 + 模板一键带出 | 可行 | `data/seed/cardTemplates.ts` + `RuleEditor` |
| 7 类别 / 5 渠道 | 可行 | 枚举锁定 |
| 3 秒出结果、手机浏览器、可加桌面 | 可行（首屏 <300ms，计算 <5ms） | Vite 8 静态包 + PWA |
| 交付越快越好 | 见 §7 工作量 | — |

---

## 7. 工作量估算

参考 `references/cost-models/development-costs.md`：工具类 Web MVP 传统 3-5 周 / 2-3 人月；AI 辅助交付 2-3x 提速。

| 模块 | 人日（AI 辅助） | 说明 |
|---|---|---|
| 脚手架 + Design Token + PWA 骨架 | 1.0 | Vite 8 + Tailwind 4 + vite-plugin-pwa |
| 类型定义 + 数据层（Dexie schema + repos） | 1.0 | 含 schema 迁移 |
| 计算引擎 + 单元测试 | 2.5 | **最重**。含 5 个测试文件，边界必须覆盖 |
| 主决策页（输入 + 结果 + 明细） | 1.5 | 核心体验 |
| 卡库 / 规则编辑器 | 2.0 | 表单最费时 |
| 账本页 + 记账流 | 1.0 | |
| 设置（积分估值 / 导出导入 / 数据安全） | 1.0 | |
| 预置卡模板（10-15 张典型卡） | 1.0 | 数据录入，需核实费率 |
| 端到端验证 + 真机（iOS/Android）测试 | 1.0 | **不可省**，iOS 存储行为必须真机验 |
| **合计** | **12 人日** | 约 2.5 周单人（含缓冲） |

**关键路径**：计算引擎 → 主决策页。这两个不通，产品不成立。其余可并行/后置。

---

## 8. 性能与安全 Checklist

### 8.1 性能

| # | 检查项 | 目标 | 验证方式 |
|---|---|---|---|
| P1 | 首屏可交互（4G，冷缓存） | < 1.5s | Lighthouse mobile |
| P2 | 首屏可交互（已安装，缓存命中） | < 300ms | 真机 DevTools |
| P3 | 从输入完成到结果渲染 | < 50ms | `performance.mark` 打点（本地 console，不上报） |
| P4 | 单次计算复杂度 | O(卡数 × 规则数) ≈ 240 次算术 | 代码审查；`rankCards` 内无循环内 IO |
| P5 | 账本归集复杂度 | O(月内条目) ≈ 200 | 一次循环建 Map，禁止在卡循环内重算 |
| P6 | 产物体积（JS + CSS gzip） | < 120 KB | `vite build` 后 gzip 统计 |
| P7 | 图标 tree-shaking 生效 | 只打包用到的图标 | 产物中 grep 未用图标名 |
| P8 | 禁止循环内 IndexedDB 读取 | 0 处 | 代码审查（`data/` 只在 hook 层调用一次） |
| P9 | 30 卡 × 8 规则 × 2400 账本条目下仍 < 50ms | 满足 | 单元测试中用生成数据 benchmark |

### 8.2 安全与隐私（本产品最高优先）

| # | 检查项 | 要求 | 验证方式 |
|---|---|---|---|
| S1 | **不存卡号** | 数据结构中**不存在**卡号字段；UI 不提供卡号输入 | 类型定义审查：`Card` 无 `number` / `pan` / `cvv` / `expiry` 字段 |
| S2 | **数据仅存本地** | 全部数据在 IndexedDB；零网络请求 | CI grep `fetch(` / `XMLHttpRequest` / `sendBeacon` / `<form action` |
| S3 | **无外部上报** | 无统计 SDK、无错误上报、无字体 CDN | `package.json` 依赖审查；CSP 限制 `connect-src 'none'` |
| S4 | 不引用第三方 CDN 资源 | 全部资源本地打包 | 产物中无 `https://` 外链（除 `source.url` 这类纯展示字符串） |
| S5 | CSP | `default-src 'self'; connect-src 'none'; img-src 'self' data:` | `index.html` meta 或托管配置 |
| S6 | 导出文件不含敏感信息 | 仅卡昵称、发卡行、规则；无卡号（本来就没有） | 导出 JSON 人工审查 |
| S7 | 数据可彻底删除 | 设置页提供「清空全部数据」+ 二次确认 | 手动测试 |
| S8 | 不请求多余权限 | 不用地理位置、不用摄像头、不请求通知 | `manifest` permissions 审查 |
| S9 | 依赖供应链 | 依赖数 < 25；锁定精确版本；`pnpm audit` 通过 | `pnpm audit`；`package.json` 无 `^` 范围（锁死） |
| S10 | 无 localStorage 存业务数据 | localStorage 只存 UI 偏好 + storage-probe | 代码审查 `localStorage.setItem` 调用点 ≤ 3 处 |

### 8.3 正确性（防沉默逻辑错误）

| # | 检查项 | 要求 |
|---|---|---|
| Q1 | `rankCards` 有单元测试 | 覆盖：无规则命中、单卡、多卡排序、并列稳定 |
| Q2 | 排他组测试 | 断言 Apple Pay 2% 场景**不会**得出 3%（同组不叠加） |
| Q3 | 上限测试 | 覆盖：未超、部分超（降级）、全超（收益 0 非负）、跨月归零 |
| Q4 | 手续费测试 | 覆盖：同币种 0、豁免期内 0、豁免期过恢复、查不到用最保守值 |
| Q5 | 舍入测试 | `0.1 + 0.2` 类场景；断言用整数分运算 |
| Q6 | 排序确定性 | 同输入跑 100 次结果顺序完全一致 |
| Q7 | 变异测试（手工） | 注入 3 个最怕的算错方式，确认测试变红：①同组取和而非取最大 ②上限不扣已用 ③手续费默认 0 |
| Q8 | 集成验证 | 真机 iPhone Safari 安装 → 录入 2 张卡 → 查询 → 记账 → 重查，结果符合手算 |

---

## 9. 端到端验证步骤（Phase 3 收尾必跑）

```bash
# 1. 构建与静态检查
pnpm install
pnpm typecheck          # tsc --noEmit，TypeScript 7.0.2
pnpm lint               # 含 C1-C9 全部约束
pnpm test               # Vitest 5.0.5，全部通过
pnpm build              # 产物 < 120 KB gzip

# 2. 文件规模门禁
find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn \
  | awk '$1>300 && $2!="total" {print "OVER LIMIT:", $0}'
wc -l src/main.tsx        # 必须 < 100

# 3. 硬约束门禁
grep -rnE '#[0-9a-fA-F]{3,8}\b' src/ --include=*.tsx --include=*.ts   # 必须为空
grep -rnE 'fetch\(|XMLHttpRequest|sendBeacon' src/                   # 必须为空
grep -rnE 'from .react.|from .dexie.' src/domain/                    # 必须为空
grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' src/              # 必须为空（无 emoji）

# 4. 真机验证（不可省）
#    iPhone Safari 打开 → 按引导「添加到主屏幕」→ 独立窗口打开
#    录入 2 张卡（1 张澳门银联 0% 手续费 + 1 张美国 3% 手续费）
#    查询「澳门 / 餐饮 / MOP 380 / Apple Pay」
#    期望：银联卡净收益 > 美国卡净收益，差额 > 0（手续费差异生效）
#    点「记下这笔」→ 账本页看到条目 → 上限剩余减少
#    再查同一笔 → 上限已用，若触顶则显示「额度用尽后降为 X」
#    飞行模式重开 → 应用仍可用（离线壳生效）
#    导出 JSON → 清空数据 → 导入 → 数据完整恢复
```

---

## 10. Phase 2 待冻结项（交主理人决策）

| # | 待决 | 我的建议 |
|---|---|---|
| 1 | 预置卡模板收录哪 10-15 张卡 | 按用户实际持有卡优先；先做数据结构，模板内容可增量填 |
| 2 | 积分估值默认值 | 建议：Asia Miles 0.08 HKD/里、UR 0.01 USD/pt、MR 0.01 USD/pt，全部标注「保守默认，可改」 |
| 3 | 「记下这笔」的默认行为 | 建议：**不自动记账**，但在结果卡片上给一个明显的「记下」按钮；若用户连续 3 次查询都没记，第一次提示"记账能让上限更准" |
| 4 | 是否需要「本月已用」在看板前置 | 建议：是。主页面顶部一行「本月已刷 MOP X / 剩余额度最少的是 Y 卡」 |
| 5 | 导出文件格式版本号 | `{ schemaVersion: 1, exportedAt, cards, rules, ledger, params }` |

---

## 11. 附：ADR 索引

| ADR | 标题 | 状态 |
|---|---|---|
| ADR-001 | 技术栈：React 19 + Vite 8 + TypeScript 7 | Accepted |
| ADR-002 | 持久化：Dexie 4 + IndexedDB | Accepted |
| ADR-003 | 图标库锁定 Lucide 1.65 | Accepted |
| ADR-004 | 不做后端 | Accepted |
| ADR-005 | 月度上限账本：默认不记 + 双档净收益 | Accepted |
| ADR-006 | 样式：Tailwind 4 `@theme` Design Token | Accepted |
| ADR-007 | 净回报率口径与渠道服务费建模 | Accepted |

---

## 12. 与 PRD 逐条对账（Phase 1 收尾必做）

> 依据 `spec-as-contract.md` §5「活规格」：实现与规格冲突时**先改规格再改代码**。本节记录架构对 PRD 的承接、修正与提请。

### 12.1 已承接的 PRD 要求（架构已覆盖）

| PRD 编号 | 要求 | 架构落点 | 状态 |
|---|---|---|---|
| F1-AC2/AC3 | 净额 = 返现 + 积分 − 外币手续费 − **渠道服务费**，负数如实展示 | §3.2 净收益定义 + §3.6 `SchemeBreakdownItem`（`kind: 'fx_fee' \| 'channel_fee'`） | 本期新增，见 §12.2 |
| F1-AC4 | 冠亚军差 < 0.1 个百分点标「基本持平」 | §3.7 排序后置判定，输出 `Scheme.tieWithNext: boolean` | 本期新增 |
| F1-AC5 | 费率改动 300ms 内重算 | `useLiveQuery`（Dexie 4.4.7 变更推送）+ `rankCards` 纯函数 <5ms | 满足 |
| F2-AC3 | 外币手续费按发卡地区带默认值（US 3% / HK 0% / MO 0%） | `domain/fx/defaultFxTable.ts` + `CardForm` 预填 | 满足（注：HK 默认应为 1.95% 而非 0%，见 §12.3 差异 D1） |
| F2-AC4 | 里数型返现须同时显示原始单位与折算率 | `PointsTrack.pointProgramId` + `ValueParams.pointValuations` 双向绑定表单 | 满足 |
| F2-AC5 | 删卡软删除、可恢复 | `Card.active: boolean` | 满足 |
| F5-AC1 | 上限用尽后按**基础费率**计 | `CapDefinition.overLimitFallback` + §3.7 边界 3 | 满足 |
| F5-AC2/AC3 | 月度累计**门槛**决定费率档 | §12.2 新增 `Threshold` 模型 | 本期新增 |
| F5-AC5 | 上限/门槛为空按「无约束」处理，**不得视为 0** | 全部字段 `?: optional`，`undefined` 分支明确跳过而非代入 0 | 满足（类型系统强制，`tsc --strict` 下 `undefined` 不可直接参与算术） |
| F6-AC1~AC5 | 每卡「上次确认日期」+ 90 天过期提示 + 「标记为已确认」 | `Card.lastVerifiedAt` + `SchemeWarning.stale_rate` | 满足（阈值 90 天，对齐 PRD F6-AC3） |
| F7-AC2~AC5 | 导出/导入 + 结构校验 + 同名冲突三选（覆盖/保留两者/取消） | `platform/exportImport.ts` | 满足（冲突策略见 §12.4） |
| F3-AC2 | 打开即聚焦金额框并唤起数字键盘 | `AmountInput` 用 `inputMode="decimal"` + `autoFocus`；**iOS 限制见 §12.5 风险 R3** | 满足（有限制） |

### 12.2 本期新增的两个建模项（骨架初稿遗漏，PRD 要求）

#### (a) 渠道服务费 ChannelFeeRule

PRD D2 明确「支付宝/微信对境外卡的 3% 平台费使渠道成为与卡同量级的变量」。已核实事实：

- AlipayHK：自 2023-09-01 起，以 Visa/Mastercard 信用卡在 AlipayHK 线下/网店付款，每月 HKD 3,000 内免手续费，**超出部分收 2.5%**；余额/银行账户/指定银行信用卡（中银香港、恒生、渣打）免费
  （来源：alipayhk.com FAQ「跨境付款會否收取手續費」，核实日期 2026-10-31）
- 跨境钱包链港卡：AlipayHK / WeChat Pay HK 约 **1.5%–2%** 跨境手续费，视发卡行而定
  （来源：comparecard.hk《香港信用卡電子錢包綁定攻略 2026》，核实日期 2026-10-31）
- 内地微信/支付宝直接绑境外 Visa/Mastercard：**200 元以上收 3%**
  （来源：longbridge.com《港卡里的錢，在內地到底怎麼花最划算》，核实日期 2026-10-31）
- 云闪付绑港银联卡走银联通道：**0 手续费**
  （来源：同上 + evision.news《內地消費信用卡比較 2026》）

**建模结论：渠道服务费是「渠道 × 卡组织 × 金额区间」的三维函数，不是常数。**

```ts
export interface ChannelFeeTier {
  /** 该档适用的单笔金额区间（半开区间，金额以 accountCurrency 计） */
  fromAmount: number;
  toAmount: number | null;   // null = 无上限
  /** 该档内收费比例，0.025 = 2.5% */
  rate: number;
  /** 该档内固定费 */
  fixedFee: number;
}

export interface ChannelFeeRule {
  id: string;
  channel: PaymentChannel;
  /** 仅对特定卡组织生效（如内地支付宝对 Visa/MC 收 3%，银联 0%） */
  networkIn?: CardNetwork[];
  /** 仅对特定发卡地区生效 */
  issuerRegionIn?: IssuerRegion[];
  /** 月度免费额度（如 AlipayHK 每月 HKD 3,000 免手续费） */
  monthlyFreeAllowance?: { amount: number; currency: CurrencyCode };
  tiers: ChannelFeeTier[];
  source: SourceRef;
}
```

复用 §3.5 的"手续费查表优先级"：卡级覆盖 > `(渠道, 卡组织, 发卡地)` 匹配 > 全局兜底（兜底 = 0 且标注"未知渠道费"）。

**每月免手续费额度**与月度上限同源问题——同样进账本累计（`capId: 'channel:${channelId}:free'`），复用 §3.3 的账本机制，不另立一套。

#### (b) 门槛 Threshold（与上限 Cap 是相反方向）

| | 上限 Cap | 门槛 Threshold |
|---|---|---|
| 语义 | 用得多 → 收益**减少** | 用得多 → 收益**增加** |
| 判定 | 已用 > 上限 → 降级 | 已用 < 门槛 → 用低档；已用 ≥ 门槛 → 用高档 |
| PRD 例 | 美国卡季度 5x 上限 $1,500 | 澳门卡当月累计 MOP15,000 后餐饮自 1.5% 升至 3% |

```ts
/**
 * 门槛按类别绑定：只声明「增量」，费率永远来自 `categories`（ADR-011）。
 *
 * 曾经有 `ThresholdTier { minSpend, earn: EarnTrack[] }`，`earn` 是**绝对费率**。
 * 它与 `categories[cat]` 重复，两份值必然漂移；而引擎「无条件用 earn 替换类别轨道」
 * 又让门槛档费率被套到所有类别（chill grocery 声明 0.4% 实测 5.344%）。整体删除。
 */
export interface ThresholdCategoryBinding {
  /**
   * 未达标时的**绝对值**；binding 存在即必填（加载期校验）。
   * categories 记达标档，达标时不叠加 —— 原 gain 字段全库恒 0，已删除
   * （ADR-011 第四轮勘误第 1-2 条：0.1 + 0.096 = 0.196 的算术错误）。
   */
  fallback?: { rate?: number; multiplierDelta?: number };
  note?: string;
}

/** 累计型门槛（与类别正交），gain 一律为增量 */
export interface ThresholdBonusTier {
  minSpend: number;
  gain: { multiplierDelta?: number; rate?: number };
  note?: string;
}

export interface ThresholdDefinition {
  id: string;
  /** 累计口径：哪些类别的签账推进累计。**不决定费率作用域**（旧名 countsCategories 被误读，已改名） */
  accrualCategories: SpendCategory[] | 'all';
  includeCurrentSpend: boolean;
  period: 'month' | 'year' | 'half_year';
  currency: CurrencyCode;
  /** 达标线（门槛金额） */
  thresholdAmount: number;
  /** 二选一：按类别绑定 */
  categoryBindings?: Partial<Record<SpendCategory, ThresholdCategoryBinding>>;
  /** 二选一：累计型奖励档 */
  bonusTiers?: ThresholdBonusTier[];
  note?: string;
  source?: SourceRef;
}
```

引擎是三条**互斥**路径（ADR-011 §2）：

1. `categoryBindings[cat]` 存在 → 未达标取 `fallback`（绝对值换算成 delta），达标取 `categories` 原值（gain 字段已删除，ADR-011 第四轮勘误）
2. `bonusTiers` 存在 → 取本笔命中档的 `gain`，加在 `categories` 之上
3. 两者都不存在 → **完全沿用 `categories`，达标状态对费率零影响**

`CategoryRule` 同时获得两个字段：`capIds?: string[]`（显式上限绑定，**空数组表示不受任何上限约束**，优先于 `cap.categories` 推断）与 `isBaseTierRate?: boolean`（缺省 true；仅参与加载期校验，不参与计算）。


引擎改动（在 §3.7 第 2 步之后插入）：

```
# ---- 2.5 门槛：只算「达标了没有」，不产出费率 ----
FOR EACH threshold IN card.thresholds:
    accumulated ← aggregateSpend(ledger, threshold, periodKey)
    candidateSpend ← accumulated
    IF threshold.includeCurrentSpend: candidateSpend ← accumulated + input.amount
    reached ← candidateSpend >= threshold.thresholdAmount
    bonusTier ← LAST t IN threshold.bonusTiers WHERE t.minSpend <= candidateSpend  # 仅 bonusTiers 型

# ---- 2.6 把增量作用到类别轨道（ADR-011 §2，三条互斥路径）----
binding ← threshold.categoryBindings?[input.category]
IF binding IS NOT NULL:
    IF NOT reached AND binding.fallback IS NOT NULL:
        delta ← binding.fallback 的值 − 类别轨道当前值      # fallback 是绝对值
    ELSE IF reached:
        delta ← 0                                            # categories 记达标档，不叠加
    ELSE: delta ← 0
    track ← withRateDelta(baseTrack, delta)                  # 只加数，不换轨道、不改 capIds
ELSE IF threshold.bonusTiers IS NOT NULL:
    track ← withRateDelta(baseTrack, bonusTier.gain 的值)
ELSE:
    track ← baseTrack                                        # 达标状态对费率零影响
```

**关键：门槛与上限在同一张卡上可能同时存在**（如"月签 15,000 后升 3%，但餐饮 3% 每月上限 500"）。计算次序必须是**先定档（门槛）再封顶（上限）**——反过来会把用高档的额度错记到低档。

`withRateDelta` 的两条硬约束（违反即重新引入 N1）：
1. **不重新推导 `capIds`** —— 达标后仍用 `categories` 层的绑定。门槛只能「不参与」上限，不能「新增」上限。
2. **保留 `channelScope`** —— 增量轨道若丢了渠道作用域，就会凭空出现在不适用该渠道的候选里。

**F4-AC2 要求的可解释性**由 `SchemeBreakdownItem.label` 承载：
- `餐饮 10%（已达门槛：累计 HKD 2912.62，含本笔）`
- `餐饮 0.4%（未达门槛：累计 HKD 970.87，含本笔）`

### 12.3 必须回传产品经理的差异（2 项，需 PM 裁定）

#### 差异 D1：PRD F2-AC3 的香港发卡外币手续费默认值 0% 与事实不符

| 项 | 内容 |
|---|---|
| PRD 原文 | F2-AC3：「香港发卡 = 0%」 |
| 已核实事实 | 香港主流发卡行（汇丰、恒生、渣打、花旗、DBS）Visa/Mastercard 外币交易手续费为 **1.95%**；HSBC 官方费率表确认港币个人卡 1.95%；仅**银联双币卡**在人民币/澳门币场景为 0%，AEON 为 1.5%，Amex 为 2.0% |
| 证据 | hsbc.com.hk《Key Fact Statement》；comparecard.hk《港金信用卡2026年海外簽賬手續費比較》；smartcardmacao.com 手续费列表；jetsofind.com《Best HK Credit Cards 2026》 |
| 风险 | 按 PRD 默认 0%，用户新建一张香港 Visa 卡后，工具会**系统性高估该类卡收益 1.95%**。而这恰恰是 PRD §4.3 论证的"产品价值支点"（FTF 吃掉返现）——默认值错了，核心卖点就算错了 |
| 我的建议 | 改为「香港发卡 Visa/Mastercard = **1.95%**，银联双币 = **0%**（人民币/澳门币）/ 1%（其他外币），Amex = **2.0%**」；默认值按 `issuerRegion + network` 二维带出，而不是只按 `issuerRegion` |
| 影响面 | `CardForm` 预填逻辑、`defaultFxTable.ts` 数据、F2-AC3 验收标准 |

#### 差异 D2：PRD F5 「上限按季度」与架构「账本按自然月」不一致

| 项 | 内容 |
|---|---|
| PRD 原文 | F5-AC1：「月度或季度返现上限」 |
| 架构现状 | `LedgerEntry.periodKey = 'YYYY-MM'`（自然月） |
| 问题 | 季度上限需要 `'YYYY-Qn'` 口径。若只存月 key，季度上限无法归集 |
| 我的处理（不需 PM 裁定，但需 PM 知悉） | `LedgerEntry` 增加 `quarterKey: string`（`'YYYY-Qn'`），两个 key 同时写入。归集时按 cap 的 `period` 选对应 key。**数据模型已按此设计**，见下方修正后的 `LedgerEntry` |
| 代价 | 每条账本多一个约 7 字节字段，可忽略 |

### 12.4 导入冲突策略（对齐 F7-AC5）

PRD 要求「覆盖 / 保留两者 / 取消」三选，不静默覆盖。实现规则：

| 用户选择 | 行为 |
|---|---|
| 覆盖 | 同 `id` 或同 `nickname` 的卡以导入文件为准；账本按 `id` 合并去重 |
| 保留两者 | 导入的卡生成新 `id`，`nickname` 追加后缀 `（导入）`；账本条目一并重映射到新 `id` |
| 取消 | 事务回滚，现有数据不动 |

**判定"同名"的口径**：`nickname` 精确匹配（不做模糊匹配——模糊匹配会误判"中银Visa"与"中银Visa Signature"）。
**实现**：全部在 Dexie 单事务内完成，任一步失败整体回滚（对齐 F7-AC4「不得破坏现有卡库」）。
**结构校验失败**：先校验后写入，校验不通过时**不开启事务**，直接报错并列出缺失字段。

### 12.5 架构侧新增风险（PRD 未覆盖，需 PM/设计知悉）

| # | 风险 | 说明 | 建议 |
|---|---|---|---|
| R1 | **F9（已用额录入）被划到 P1，但 F5（上限/门槛）是 P0** | PRD §7 说「MVP 用默认计数 0 可跑通」。这在**门槛**场景下会产生方向性错误：门槛要求"累计 ≥ X 才升档"，默认 0 意味着一律按低档算——这属于**低估**，方向安全；但**上限**场景默认 0 意味着一律按"额度充足"算，属于**高估**，方向不安全（会让用户去刷一张已经超额、实际只剩基础费率的卡） | 我的 §3.3 方案用「双档净收益」解决：不记账时显示 `netRealistic`（按已知已用算）并附「额度用尽后降为 X」。**建议把 F9 降级的说法改为"用双档展示兜底"**，这样不必把 F9 提进 MVP 也能消除高估风险 |
| R2 | PRD §4.3 示例表的积分估值（1.5 分/点）与我的默认值（1 分/点 UR）不一致 | PRD 用 AmEx MR 按 1.5¢ 估值算出 AmEx Gold 6.00%。积分估值完全主观（换里程 vs 换现金差 3–5 倍） | 维持「用户可调 + 保守默认」；在 PRD §4.3 表下加注「按你设定的积分估值折算」，避免让用户以为 6.00% 是客观值 |
| R3 | F3-AC2「自动聚焦唤起数字键盘」在 iOS Safari 上不可靠 | iOS 禁止无用户手势的自动聚焦（`autoFocus` 会被忽略），键盘不弹 | 改为：首屏金额区做成大号可点区域，**任意位置点一下即聚焦**；或接受"需一次点击聚焦"。建议 PM 把 AC 改为「打开后金额输入为待输入态，一次点击内可开始输入」 |
| R4 | PRD 与 UIUX 均无「离线/安装引导」要求 | 但 iOS 不安装 = 数据 7 天内消失（§4.2） | **建议在 PRD 增加 F11：安装引导与数据安全告知（P0）**。这不是附加项，是数据存活的必要条件 |
| R5 | PRD F6 用 90 天过期阈值；我的费率溯源用 180 天 | 两处阈值不一致会给出矛盾提示 | 统一为 **90 天**（以 PRD 为准，更保守），`stale_rate` 判定改 90 天。**注意区分两个不同的计时器**：`stale_rate`（数据多久没核对，90 天）与 `validUntil`（优惠何时到期，提前 60 天警示）是两回事，不得混用同一个阈值 |
| R6 | 卡库实测发现 3 张卡的 0% 豁免在 **2026-12-31** 到期，距今仅 2 个月 | 若引擎当作永久 0%，2027-01 起会算出多 1.95% 的虚假收益且用户毫无察觉 | 引入 `ValidityState`，`daysLeft <= 60` 即进入 `expiring_soon` 状态，UI 常驻倒计时警示。见 §3.5 `FxFeeRule.waivedWhen.validUntil` |
| R7 | 卡库实测发现 BCM 分开收「外币 0.5% + 跨域 1.0%」，而 `FxFeeRule.rate` 是单值 | 单值存不下两条结算路由，而这正是核心场景（澳门消费、跨币种结算） | `FxFeeRule` 增加可选 `splitRates: { foreign?, crossBorder? }`，存在时优先于 `rate` |
| R8 | 卡库实测发现 EarnMORE 上限按「年」/「半年」计，而 `CapDefinition.period` 只有 `'month'` | 只能折算近似，口径失真 | `period` 扩为 `'month' \| 'year' \| 'half_year'` |
| R9 | 卡库实测发现 19 张卡的返现侧字段为空白 | 全量上线会让用户看到大量「净回报 0/负」，而那是「我们不知道」而非「卡不好」，会误判产品价值 | MVP 从 38 张精选 **12 张**（覆盖全部推荐逻辑分支），其余卡保留在库供用户手动添加。UI 上 `unknown` 必须与「确实不划算」严格区分，绝不静默按 0 计算 |
| R10 | 立桥 VISA 金卡 0% 推广期 2026-06-30 已过期 4 个月 | 卡库中唯一「已知可能错误」的数据点，且仅 0.5% 回赠，不值得承担风险 | 从 MVP 预置中剔除，保留在完整库并标注 `expired` |

### 12.6 修正后的 `LedgerEntry`（替代 §3.3 版本）

```ts
export interface LedgerEntry {
  id: string;
  cardId: string;
  occurredAt: string;       // ISO 8601，用户可改（补记）
  periodKey: string;        // 'YYYY-MM'  自然月（月上限归集）
  quarterKey: string;       // 'YYYY-Qn'  自然季（季度上限归集）
  amount: number;
  currency: CurrencyCode;
  category: SpendCategory;
  channel: PaymentChannel;
  capConsumption: Record<string, number>;      // capId -> 消耗额
  thresholdContribution: Record<string, number>; // thresholdId -> 计入累计额
  channelFreeConsumption: Record<string, number>; // 渠道免费额度消耗
  earnedCashback: number;
  earnedPoints: number;
  note?: string;
  createdAt: string;
}
```

**索引**：`id`（主键）、`cardId`、`periodKey`、`quarterKey`、`[cardId+periodKey]`（复合）。

### 12.7 交付前状态

| 检查 | 结果 |
|---|---|
| 架构是否覆盖 PRD 全部 P0（F1-F7） | 是，见 §12.1（F2-AC3 有事实性差异 D1 待 PM 裁定） |
| 是否有架构无法实现且无替代的 PRD 条目 | 无 |
| 是否有需 PM 裁定的差异 | 1 项（D1：香港卡外币手续费默认值） |
| 是否有需 PM 知悉的风险 | 10 项（R1-R10） |
| 是否有需补进 PRD 的功能 | 1 项（R4：安装引导与数据安全告知，建议升为 P0） |
