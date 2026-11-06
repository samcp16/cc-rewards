# 未决事项登记册（OPEN-DECISIONS）

> 纪律：只追加 + 就地关闭。每次 Phase 开始时，本文件未决项自动复现到工作上下文最前面。
> 关闭时补 Resolution 字段，可升格为 ADR 时写明 ADR 编号。

| Date | Source | Open Item | Related Constraints | Current Leaning | Blocked By | Resolves When | Status |
|------|--------|-----------|---------------------|-----------------|------------|---------------|--------|
| 2026-10-31 | Phase 1 / PM Q2 | 门槛/上限的初始状态：MVP 不做已用额录入时，门槛恒判「未达」还是按最高档算 | F5 上限与门槛建模；F9 已用额录入被降为 P1 | **保守算 + 双档净收益展示**（架构师 ADR-005 方案 C）：同时输出 netOptimistic / netRealistic，UI 明示「本月累计未填，按基础档估算」 | 需用户在 Phase 1 确认三文档时一并拍板 | 用户确认 | RESOLVED |
| 2026-10-31 | Phase 1 / PM Q6 | DCC（动态货币转换）是否允许一句常驻提示：商户按本国货币结算会加价 3%–8%，连免 FTF 的卡也中招 | Phase 0 锁定「不建模汇率成本」 | **允许常驻提示，但不进计算**。措辞：「付款时永远选当地货币」。归入 Out-of-Scope 的说明项，不参与排序 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 1 / PM Q8 | 埋点方案偏离：本产品无账号、数据不上送，与服务端埋点本质矛盾 | 单人自用、无后端 | **接受偏离**，以「本地状态记忆」替代埋点，不做任何网络上报 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 1 / Architect | 香港发卡 FTF 默认值：PRD F2-AC3 写 0%，实测主流港卡 Visa/MC 为 1.95% | F2-AC3；FTF 是产品价值支点 | 采纳架构师建议：改为 `issuerRegion + network` 二维带出。已回改 PRD F2-AC3 与 §2.1 坑 3 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 1 / Designer | **渠道是否参与返现计算**——决定对比表的「行」是「卡」还是「卡+渠道」组合，属 IA 层面 | 渠道参与排序（ADR-007 已定渠道费进主链路）；对比表行定义 | 已裁定：**渠道必填且参与计算**，对比表以「卡」为行、渠道作为当前场景的全局选择 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 1 / Designer | 主题范围：MVP 仅深色是否接受 | 单人自用、无主题切换需求 | **用户确认仅深色**，token 按可扩展双主题结构写 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 1 / Designer | 是否为中文字形首屏加载 Noto Sans SC（≥1MB） | 「3 秒出结果」第一优先级 | **MVP 走系统 PingFang，不加载 webfont**，已写入 SPEC §8 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 1 / Architect | iOS Safari 7 天未交互清除 IndexedDB，需把「安装到主屏幕」提为 P0 引导 | 用户手输卡库与账本能否存活 | 采纳：**F11 已定为 P0**，验收标准 AC-F11-01~03 已写入 SPEC §9 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 1 / Architect | 数字舍入口径 | F4 算式展示；净回报率精度 | **金额与回报率均展示 2 位小数，计算过程全精度**，已写入 SPEC §8 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 2 / Designer | **`EarnTrack` 缺本外币双档费率**：渣打「本地 1.5% / 外币 2.0%」单值模型会让 MOP 消费算出 −0.45%（实为 +0.05%） | 数据模型；38 张卡中 12 张有此结构 | 已裁定：`rates: {local, foreign}` 双档 + 新增「结算路由判定」为引擎第 0 步。卡库 92 个类别条目已转换 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 2 / Designer | **跨币种上限**：Chill 上限 HK$150 而消费 MOP，不折算则上限失效 | O4「不做汇率建模」与 F5 上限功能冲突 | 已裁定：区分「汇率成本」（不做）与「汇率折算」（必须做）。静态参考表 HKD 1 = MOP 1.03，UI 显式标注，用户可调 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 2 / Designer | EarnMORE 的 cap 口径三源冲突，是否按错误口径算 | EarnMORE period 按年/半年，口径未定 | 已裁定：保留 `period: year` 建模，但该卡 `confidence: low`，UI 显示「上限口径待核对」，不静默按错误口径出精确假数字 | 无 | - | RESOLVED |
| 2026-10-31 | Phase 4 / QA B1 | **门槛档位 `ThresholdTier.earn` 全库 0/12 覆盖**：`earn.ts:101` 的 `?? []` 兜底 + `loadCards` 不校验 `earn`，两层各让一步导致定档结果对收益零影响（wewa 未达门槛高估 10 倍） | SPEC AC-F5-02、§6.2 第 1 步；数据契约 | 已裁定：**方案 A + C 组合**——12 个 tier 全部显式声明 `earn`，引擎在「有 tier 无 earn」时返回 unknown 进 unranked，加载期校验空数组。禁止引擎解析中文 note（方案 B） | 无 | ✅ 已关闭 | RESOLVED |
| 2026-10-31 | Phase 4 / Architect | `aggregate.ts:52-56` 门槛累计恒按自然月归集，不读 `ThresholdDefinition.period`。当前 6 张卡全为 `month` 故不触发，出现 `year`/`half_year` 门槛即算错 | ADR-009 未覆盖项 | 按 `definition.period` 取对应账本键（yearKey / halfYearKey），与 cap 归集逻辑对齐 | 无 | 下一次涉及年度门槛的卡入预置 | OPEN |
| 2026-10-31 | Phase 4 / Architect | 门槛 `countsCategories: 'all'` + 单一 tiers 结构无法表达「类别 A 仅在达标时给高档，类别 B 恒给低档」（Chill 的 5% 只在月实体签满 HK$1,500 时生效） | SPEC AC-F5-02、ADR-009 未覆盖项 | 已裁定：**`categoryBindings` 按类别绑定 + `categories` 为费率唯一事实来源**（ADR-011）。`tier.earn` 与 `ThresholdTier` 整体删除；门槛只声明增量（`gain`）与未达标绝对值（`fallback`）。`countsCategories` 改名 `accrualCategories`（字面即语义） | 无 | ✅ 已关闭 | RESOLVED |
| 2026-10-31 | Phase 4 / Backend | `SpendRegion` 只有 `'MO' \| 'CN'`，没有 `'HK'`。港卡在港消费只能填 `'MO'` 或 `'CN'`，两者都错：填 MO 会走 `local` 路由（对港卡而言是错的），填 CN 会触发 `dcc_risk` 告警。当前 `region` 只参与 `dcc_risk` 与 `waivedWhen.regions`，尚无卡声明 `regions`，故未产生可见错误 | SPEC §5 `SpendRegion` 联合类型；`resolveFx` 的 `waivedWhen.regions` | 扩为 `'MO' \| 'HK' \| 'CN'`，并同步 UI 录入项与 `resolveFx` 的路由判定（港卡 + HK 应走 `local`）。需确认是否引入「卡币种 == 结算币种但跨境」的第三种场景 | 无 | 出现「港卡在港消费」需要精确建模时 | OPEN |
| 2026-10-31 | Phase 4 / Architect | `wewa-unionpay` 的 4% 官方口径是「两类别**合计** 4%」（4 个 4% 类别中用户实际只享两个），当前按「各自 4%」建模，上限 HK$200 部分缓解但不完全等价 | ADR-011 §4d 明确列为不修项 | 需 `SpendInput` 增加「本期已用其它类别」维度，属输入契约扩张，本轮不做。已在 binding 与卡 note 中写明该口径缺陷 | 无 | `SpendInput` 需要表达「类别间共享额度」时 | OPEN |
| 2026-10-31 | Phase 4 / Architect | **收益轨道无法表达渠道前提**：`tai-fung-unionpay-dual` 7 类别 `rates.local: 0.05` 全带「仅限云闪付/丰付宝/微信/支付宝，实体刷卡不适用」前提，但 `EarnTrackBase` 无渠道字段、`channelBonus` 引擎零引用 → physical 渠道下照样给 5%，380 小额档排第一 | SPEC §6.2 第 2 步、§5 契约 | 已裁定：**`EarnTrackBase.channelScope?: PaymentChannel[]`**（筛选语义，非加成）+ 非适用渠道返回 `channel_gated` 进 unranked + 加载期校验空数组/枚举。删除 `ChannelBonus`（从未进 SPEC、无 UI 录入、不可表达门控）。tai-fung 实体刷卡费率官方未公开，标 unknown 不给数字 | 无 | ✅ 已关闭 | RESOLVED |
| 2026-10-31 | Phase 4 / Architect | tai-fung 实体刷卡档费率未核实（官方只公开 5% 移动支付档），该卡在 physical 场景 `confidence` 实际已非 high，但 `confidence` 是卡级字段 | ADR-010 未覆盖项 | 取得官方收费表/条款原件后补一条无 `channelScope` 的兜底轨道，`channel_gated` 自动消失（无需改引擎） | 官方原件 | 取得 tai-fung 官方实体刷卡费率 | OPEN |
| 2026-10-31 | Phase 4 / Architect | `ocbc-mo-premier` dining/grocery 的 3% 是「周末限定」，`SpendInput` 无 `dayOfWeek` 维度，平日被高估 2 个百分点。`aeon-wakuwaku` flight 的「日本境内商户」前提同理 | ADR-010 未覆盖项（同属「轨道前提」家族，但需要扩大输入契约） | 按 `channelScope` 的谓词形态扩展第二个筛选维度；需先改 `SpendInput` 与 UI 录入 | 无 | 时点/商户国别前提需要参与排序时 | OPEN |
| 2026-10-31 | Phase 2 / Designer | design-tokens.json 与 .css 同源双写，改色需同步两处 | 维护成本；声明与实际不符风险 | 采纳建议：Phase 3 加 `npm run tokens` 脚本从 json 生成 css | 前端实现 | Phase 3 门禁 | OPEN |
| 2026-10-31 | Phase 2 / Designer | 对比表卡名列 127px 硬约束，需写入前端验收 | 卡名换行会导致四列对齐崩塌 | 采纳：写入前端验收标准「卡名 clamp 1 行 + 省略号」 | 无 | Phase 3 | OPEN |

---

## 汇总

- 未决：7 项（design-tokens 双写、对比表卡名列、门槛 period 归集、`SpendRegion` 缺 'HK'、wewa 两类别合计口径、tai-fung 实体刷卡费率、时点/商户国别前提）
- 已决：17 项（含 2026-10-31 Phase 4 关闭的门槛 earn 缺口 → ADR-009、渠道门控缺口 → ADR-010、门槛按类别适用范围 → ADR-011）

---

## 关闭记录

### 2026-10-31 门槛无法按类别声明适用范围 → RESOLVED（ADR-011）

**Resolution**：`ThresholdTier` 与 `tier.earn` **整体删除**。新模型三层：

- `ThresholdDefinition.accrualCategories`（原 `countsCategories` 改名）：只回答「本笔是否计入周期累计」，**与费率无关**。
- `categoryBindings[cat]`：达标时加 `gain`（**增量**，不是替换），未达标时用 `fallback`（**绝对值**，仅当它与 `categories` 不同才需要）。
- `bonusTiers`：累计型门槛（与类别正交），`gain` 一律为增量。
- 三者都不涉及的类别：**完全沿用 `categories`，达标状态对费率零影响**。

`CategoryRule` 同时新增 `capIds?: string[]`（显式上限绑定，空数组 = 不受任何上限约束）与 `isBaseTierRate?: boolean`（仅参与加载期校验）。

**为什么必须删而不是修**：`tier.earn` 里存的是**绝对费率**，与 `categories[cat].rates` 重复。两份值必然漂移，而漂移方向由「谁最后被读到」决定——本轮实测就是两个方向同时错（chill grocery 高估 13 倍、cheers flight 低估 3.6pp）。关键洞察是 **`categories` 里每个类别的费率本来就已经写对了**，`tier.earn` 没补充任何信息，只把正确信息覆盖坏了。

**为什么 `countsCategories` 只改名而不改语义**：QA N1 的短期建议是「把它改成实际受门槛约束的类别列表」。那样改会让 grocery 上的签账不再累积进 HK$1,500，用户刷超市就永远达不了标——用一个新缺陷换旧缺陷。5 张卡的 `'all'` 是正确的。

**加载期硬约束（比运行时 unknown 更早、更便宜）**：声明了 `gain` 的 binding 必须满足「有 `fallback`」或「`categories[cat].isBaseTierRate === true`」之一，否则拒绝加载。这让「未达标笔沿用达标值」这类方向性高估在启动时就红灯。

**为什么删除 `threshold_tier_incomplete`**：新模型下费率永远来自 `categories`，「档位没有收益声明」这个状态不存在。保留它会留下一条永远不执行的运行时分支（正是 N2 批评的死代码），并在 UI 上多一个用户无法自行修复的状态。

**残留（明确列出，未修）**：`wewa` 的「两类别合计 4%」口径（需 `SpendInput` 增维度）、`ocbc-mo-premier` 周末前提、`aeon-wakuwaku` 日本境内前提。

### 2026-10-31 收益轨道无法表达渠道前提 → RESOLVED（ADR-010）

**Resolution**：`EarnTrackBase` 增加可选 `channelScope?: PaymentChannel[]`（缺省 = 全渠道适用，38 张卡语义不变）。语义是**筛选**而非加成：声明 `['unionpay_qr','wechat','alipay']` 的轨道，在 `physical`/`apple_pay` 下连候选都不是，不会被按 0 值取用。`computeEarn` 在估值前做 `filterByChannel`，全部轨道被挡时返回 `channel_gated` 进 unranked（不参与排序，UI 必须说明「本卡此类别仅在 X/Y/Z 渠道适用」并给出换渠道动作）。

**为什么不选一等 `ChannelGateDefinition`**：它会与 `ThresholdDefinition` 争夺优先级——一旦出现「满 HK$1,500 **且** 走云闪付才有 10%」的卡，两个一等概念必须回答「gate 不满足但 tier 满足时用哪条」，这个规则没有官方普适答案，只能变成代码里的一张 if 表。而筛选语义天然与门槛的加法语义正交，不需要优先级规则。工程量也是 3 倍以上（新引擎步骤、新账本键、三处文档流程图同步、5 处夹具改写）。

**为什么不选「把 5% 降到 0.4%」**：tai-fung 走云闪付确实是 5%，降下来会让云闪付场景低估 4.6 个百分点，方向从高估变低估，错误性质不变；且官方未公开实体刷卡费率，0.4% 是照抄其他卡的惯例值，编数字比承认算不出来更危险。

**为什么删除 `ChannelBonus`**：它从未出现在 SPEC 与 ARCHITECTURE（违反 spec-as-contract），`detail` 是自由文本、卡级挂载、无费率字段，无法表达「某个类别在三个渠道下是 5%」。保留它等于给下一个加卡的人一个「渠道门控已建模」的错觉，缺陷会以今天形态原样回归（与 ADR-009 B1 的根因同源：漏写没有任何一层报错）。

**残留高估（明确列出，未修）**：`ocbc-mo-premier` 的周末前提（平日高估 2 个百分点）、`aeon-wakuwaku` 的日本境内前提（数据已保守填 0.4%）、Chill 的 flight/hotel/online 5% 受门槛约束（低估 3.6 个百分点，属 ADR-009 移交的门槛缺口，不是渠道缺口）。

### 2026-10-31 门槛/上限初始状态 → RESOLVED

**Resolution**：采用架构师 ADR-005「方案 C：默认不记 + 一键记账 + 双档净收益」。
每张卡输出两个数：`netRealistic`（按账本真实已用，账本为空时等于基础档）与 `netOptimistic`（假设额度满额）。两者不等时，大字显示 `netRealistic`，下方小字「额度用尽后降为 X」。用户不记账也不会被误导，愿意记就点一下。

选它的理由：方案 A（完全不记录）会让上限形同虚设；方案 B（强制记录）违反「3 秒出结果」第一优先级。方案 C 的关键洞察是**让"记不记"不影响用户是否被误导**。

### 2026-10-31 DCC 常驻提示 → RESOLVED

**Resolution**：允许一句常驻提示，文案「付款时永远选当地货币」，不进计算、不建模。理由：DCC 加点不可枚举且是范围值（3%–8%），建模成本高于价值；但它是真实存在的隐形亏损，一句提示的成本近乎为零。归属于 Out-of-Scope 说明项。

### 2026-10-31 埋点偏离 → RESOLVED

**Resolution**：接受偏离。本产品无后端、无账号、无转化目标，服务端埋点在架构上不可行且与「数据不出设备」的产品承诺冲突。以本地状态记忆替代。

### 2026-10-31 香港 FTF 默认值 → RESOLVED

**Resolution**：采纳架构师结论，PRD F2-AC3 与 §2.1 坑 3 已回改。改为 `issuerRegion + network` 二维带出：香港 Visa/MC = 1.95%，银联双币 = 0%（人民币/澳门币），Amex = 2.0%，AEON = 1.5%。

### 2026-10-31 门槛档位缺 earn（QA B1） → RESOLVED（ADR-009）

**Resolution**：采纳 **A + C 组合**。A：`data/cards-hk-mo.json` 的 12 个 tier 全部写入 `earn` 数组（逐卡裁定见 ADR-009 Decision §1），`hsbc-everymile` 的伪门槛（2 个 tier 表达的是商户类别路由而非金额门槛）整块删除。C：`src/domain/engine/earn.ts` 在「有 tier 但 tier.earn 为空」时返回 `threshold_tier_incomplete` 进 unranked，UI 文案与「返现未知」分流；`loadCards.ts` 校验 `earn` 若出现不得为空数组。

**为什么禁止方案 B（引擎解析中文 note 回落低档）**：6 张卡 note 措辞互不相同，且「低档」语义不一致（4 张是基本 0.4%、dbs 是 3X 而非 6X、everymile 是 HK$5=1里）。解析中文等于把数据缺陷搬进代码，只对当前措辞有效，沉默错误性质不变。

**为什么必须 A + C 同时做**：B1 的根因不是「有人忘了写 earn」，是「忘了写 earn 没有任何一层会报错」——`earn.ts:101` 用 `?? []` 兜底、`loadCards.ts:149-151` 只校验 `minSpend` 是数字。只补数据不补守卫，同一个缺陷下次加卡会原样回归。
