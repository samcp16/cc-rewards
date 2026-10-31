# QA 复验报告 R3 — 刷卡决策器 v1.0（ADR-011 门槛模型重写）

- 复验人：严过关（质量工程师，与 Phase 3 开发上下文解耦）
- 复验日期：2026-10-31
- 复验依据：`docs/SPEC.md` + ADR-011 + 官方条款（独立联网核实，3 源）
- 验证方式：**不运行开发者写的测试作为证据**。自写 6 组黑盒探针（`/tmp/qa3/probe-*.ts`），期望值全部手算；对 2660 条新快照做 12 组真实误改变异；真实 Chromium（`chromium-1208`）走查 UI。

---

## verdict

```
verdict: fail
previous_issues: B1→已修 / B3→部分修（修好了报的那个方向，但把另一个方向修错了）/ N1→已修 / N2→部分修 / N3→已修
new_issues: 1 blocking（B3'）+ 5 non-blocking
dead_fields: gain（形式上的零）、attachCaps（零读者）
snapshot_credibility: 能抓门槛两态，抓不到上限绑定 —— 尚未达到"可当回归门禁"的水平
```

**一句话**：N1 这次是**真修好了**，两个方向 37 个点我手算核对全部一致，这是三轮以来第一次。但 ADR-011 的数学有一处错（`gain.rate=0.096`），开发者按"自己理解"施工时把 `gain` 写成了全库恒 0，等于把 ADR 的核心机制架空、退化成"categories 单源"——**结果是对的，机制是空的**。更要紧的是 B3：官方口径是"外币 0.5% / 跨域 1% / **最多合共 1.5%**"，不是"可叠加"。开发者把 `foreign` 路由实现成 `跨境1% + 跨货币0.5%`，于是**澳门本地 HKD 结算（只换币不跨境）被收 1.5%，官方 0.5%，高估 3 倍**。这是新引入的方向性错误，打回。

---

## previous_issues（逐条独立验证）

### B1 门槛机制 —— **已修**

`ThresholdTier` 与 `tier.earn` 已彻底删除（`types.rules.ts` 无该接口，`threshold-earn.test.ts` 结构性断言全库 `earn`/`tiers` 均为 undefined）。`earn.ts:127` 不再是三元的替换分支，改为单轨道 `applyThresholdDelta` 加数不换轨。

独立证据：`/tmp/qa3/probe-n1.ts` 段 A 11 点、段 B 18 点全部 PASS。门槛对费率的作用收敛为「按 `categoryBindings` 加增量」，未被点名的类别结构上不存在污染路径。

### B3 BCM splitRates —— **部分修（修好 crossBorder，弄错 foreign）**

上一轮我报的是「MOP 结算 + 内地商户（crossBorder）被 `waivedWhen` 吃成 0，应 1%」。这条路**修好了**：`waivedWhen` 已从数据里删除，实测 `MOP/CN → crossBorder → 1.00%`，正确。

但本轮用官方口径复判全部路由，发现**新的方向性错误**。详见 new_issues B3'。

三源独立核实（不是采用开发者单方面引用）：

| 源 | 原文 |
|---|---|
| Extrabux 澳门信用卡指南汇总表 | 「澳门商业银行 \| 外币交易 **0.50%** \| 跨域交易 **1.00%** \| 最多合共收取 **1.50%**」 |
| 同上，表格下方注意 | 「目前只有 BCM 会**分开**「跨域交易」及「外币交易」2 项独立收费，**其它银行发生其中一项情况时，即会收取一固定比率**」 |
| smartcardmacao.com | 「外幣交易︰0.5% / 跨域交易︰1%」两列并列，无双计表述 |

关键在第三列「**最多合共收取 1.50%**」——这是**上限**，不是"可叠加"。且该表对 BCM 以外所有银行都写「发生其中一项即收固定比率」，说明 BCM 的"分开收费"含义是**按触发的那一项收费**，不是两项都收。

### N1 门槛档替换污染全部类别 —— **已修（两个方向都验了）**

上一轮我明确说"N1 只测了未达标侧，达标侧没测"。本轮两半都测，期望值全部手算：

**未达标侧（空账本，1000 MOP，physical/MO）**

| 卡 | 类别 | `categories` 声明 | 实测有效 | 结论 |
|---|---|---|---|---|
| boc-hk-chill | grocery | 0.4% | 0.400% | 对 |
| boc-hk-chill | other | 0.4% | 0.400% | 对 |
| boc-hk-chill | fuel | 0.4% | 0.400% | 对 |
| boc-hk-chill | dining | 0.4%（fallback） | 0.400% | 对 |
| boc-hk-chill | flight / online | 4%（fallback） | 4.000% | 对 |
| wewa-unionpay | grocery / other | 0.4% | 0.400% | 对 |
| boc-hk-cheers | flight / hotel | 0.4% | 0.400% | 对 |
| bea-world-mc | dining | 0.4%（fallback） | 0.400% | 对 |

**达标侧（账本已超门槛，1000 MOP）—— 上一轮漏测的一半**

| 卡 | 类别 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| boc-hk-chill | **grocery** | **0.4%** | **0.400%** | **对（上轮此处 10%）** |
| boc-hk-chill | other / fuel | 0.4% | 0.400% | 对 |
| boc-hk-chill | dining | 10% | 10.000% | 对 |
| boc-hk-chill | flight / hotel / online | 5% | 5.000% | 对 |
| boc-hk-cheers | **fuel / online / grocery** | **0.4%** | **0.400%** | **对（上轮此处 4%）** |
| boc-hk-cheers | dining / flight | 4% | 4.000% | 对 |
| **wewa-unionpay** | **grocery / fuel / other** | **0.4%** | **0.400%** | **对（上轮此处 4%）** |
| wewa-unionpay | dining / flight | 4% | 4.000% | 对 |
| bea-world-mc | dining | 5% | 5.000% | 对 |

**ADR-011 §Consequences 表逐点核对**

| 断言 | 实测 | 结论 |
|---|---|---|
| chill/dining 达标 3000 MOP → 5.344%（HK$150 上限截断） | 5.344%，gross 160.32 | 对 |
| chill/grocery 达标 3000 MOP → 0.4% | 0.400% | 对 |
| chill/grocery 两种状态 `capsAffected` 均不含 `boc-hk-chill:extra` | 均不含 | **对，上限污染消失** |
| chill/flight 达标 3000 MOP → 5%（flight 无 capIds，不该截断） | 5.000% | 对 |
| dbs 达标 `pointsValue` 严格 = 未达 × 2 | 25 → 50，精确 | 对 |

`applyThresholdDelta` 返回单轨道、`withRateDelta` 只改 `rates`/`multiplier` 不碰 `capIds`、`categoryToTrack` 的上限绑定只读 `categories.capIds`——三条实现路径共同构成结构性保证，不再依赖测试盯数字。这一层我认可。

### N2 门槛/渠道告警 UI 零测试 —— **部分修**

上一轮我报了两件事：① 零组件测试；② `VerdictCard` 两个 case 不可达。

- ①**已修一半**：`src/components/compare/ComparePanel.test.tsx`（114 行，7 个断言组）覆盖 `channel_gated` 两分支、`unknown_rate`、`no_point_valuation`、空 warnings、以及"任何分支不得出现数字"。用 `renderToStaticMarkup`，在 node 环境下可跑，这个做法我认可。
- ②**已修**：`threshold_tier_incomplete` 从 `types.result.ts:53`、`evaluateCard.ts`、`VerdictCard.tsx`、`ComparePanel.tsx` 全部删除，`UnknownReason` 只剩 3 个。`VerdictCard.tsx:60` 的 `channel_gated` case 现在在 `default: 存在未识别的提示` 之前，但**仍不可达**（`warningText` 只对 `champion.warnings` 调用，`VerdictCard.tsx:198`；champion 必为 ranked）。这一条是**遗留未修**，见 new_issues N6。
- **组件测试仍只有 1 个文件**（`find src -name "*.test.tsx"` = 1），`VerdictCard`、`AnswerCard`、`UnrankedRow` 之外的全部 UI 分支仍是零覆盖。N2 的"门槛/渠道分流"这一支已解决，整体 UI 零测试的窟窿只补了 1/N。

### N3 1295 条快照失明 —— **已修，且经我独立变异验证**

上一轮我报 7 组变异全失明，根因是固定 `amount=2000` 让全部组合落在达标档。本轮 `MATRIX_BASELINE` 改为 2660 条（38 卡 × 5 渠道 × 7 类别 × 2 账本态）。我用 12 组**自己构造**的误改做变异（不读开发者的 `adr011-mutation.test.ts`）：

| 变异 | 变红条数 | 捕获 |
|---|---|---|
| M1 chill dining fallback 0.004→0.1 | 20 | 捕获 |
| M2 chill flight fallback 0.04→0.05 | 20 | 捕获 |
| M3 chill grocery 费率 0.004→0.04 | 30 | 捕获 |
| M4 chill dining 费率 0.1→0.08 | 20 | 捕获 |
| M5 chill 上限 150→15 | 70 | 捕获 |
| **M6 chill dining capIds 清空** | **0** | **失明** |
| M7 cheers dining fallback 0.004→0.04 | 20 | 捕获 |
| M8 wewa dining fallback 0.004→0.04 | 20 | 捕获 |
| M9 chill dining gain 写 0.096 | 20 | 捕获 |
| M10 dbs multiplierDelta 1→2 | 35 | 捕获 |
| M11 chill dining binding 整个删除 | 20 | 捕获 |
| M12 cheers 门槛值 5000→500 | 70 | 捕获 |

**11/12 捕获，相比上轮 0/7，这是实质性改善。** 失明的 M6 原因是快照行字段不含 `capIds`（`snapshot-matrix.ts:124-133` 与 `adr011-baseline.ts` 均无该字段），且 `amount=1000` 在 chill dining 上（1000 MOP × 10% ≈ HK$97 < HK$150）根本未触顶。见 new_issues N5。

---

## new_issues

### B3' BCM `foreign` 路由把"换币"多算成"换币+跨境"，高估 3 倍

**严重度：blocking（正确性缺陷，方向性高估）**

`resolveFx.ts:90-97`：

```ts
} else if (route === 'foreign') {
  if (crossCurrencyComponent !== undefined) {
    rate = (crossBorder ?? 0) + crossCurrencyComponent;   // ← 1% + 0.5% = 1.5%
  } else {
    rate = foreign ?? fxFee.rate;
  }
}
```

`resolveSettlementRoute` 的 `foreign` 路由定义是「卡币种 ≠ 结算币种 **或** 跨境」，把两个独立条件并成了一个大桶。于是「MOP 卡、HKD 结算、澳门商户」这种**只换币、不跨境**的交易也走进 `foreign` 分支，被加上 1% 跨境费。

独立实测（`/tmp/qa3/probe-mix.ts`，卡 `bcm-world-mc` / `cardCurrency=MOP` / `issuerRegion=MO`）：

| 场景 | route | 引擎 fxFee | 官方口径 | 差 |
|---|---|---|---|---|
| MOP 结算，澳门商户（本地） | local | 0% | 0% | 对 |
| MOP 结算，**内地**商户（跨境未换币） | crossBorder | **1.00%** | 1%（跨域） | **对（B3 报的那条已修）** |
| **HKD 结算，澳门商户（换币未跨境）** | foreign | **1.50%** | **0.5%**（外币） | **高估 3 倍** |
| CNY 结算，内地商户（跨境+换币） | foreign | 1.50% | 1.5% | 对 |
| HKD 结算，内地商户（跨境+换币） | foreign | 1.50% | 1.5% | 对 |
| **USD 结算，澳门商户（换币未跨境）** | foreign | **1.50%** | **0.5%** | **高估 3 倍** |

端到端影响（1000 单位，BCM dining 1%）：

```
MOP/MO  → fxFee 0    net +10   （对）
MOP/CN  → fxFee 10   net   0   （对）
HKD/MO  → fxFee 15   net  -5   ← 官方 fxFee 5，net 应为 +5
CNY/CN  → fxFee 15   net  -5   （对）
```

**这不是精度问题，是结论反转**：BCM 在澳门本地面向港币结算的商户从"净赚 5"变成"净亏 5"。用户会因此不刷或刷错卡。

**根因是 ADR-011 的模型假设错了，实现只是忠实执行。** ADR-011 决策 1 写「币种不同的境外交易同时满足两个条件：它既跨境（收 1%），又换了币种（再收 0.5%）」。这句话在「境外」前提成立时对，但 ADR 把 `foreign` 路由等同于「境外」，而 `resolveSettlementRoute` 的 `foreign` 包含**不跨境的换币**。ADR 的论据（"拿 foreign 当基数会漏掉跨境那 1 个点"）实际只对 crossBorder 场景成立——那部分已经单独修对了。

另外官方口径的第三列表头是「**最多合共收取**」，语义是封顶 1.5%，不是"两项叠加"。ADR-011 把「可叠加」当作官方原文引用（`types.rules.ts:204`：「BCM 官方 PDF：跨境服务费 1%、跨货币服务费 0.5%，两项可叠加」），我没有找到这份 PDF 的"可叠加"表述；能查到的三源都是「最多合共 1.5%」。即便按"可叠加"读，也不该在**未跨境**时收跨境费。

**期望**：`foreign` 路由必须拆成「换币」与「跨境」两个正交判定：
- 跨境且换币 → 1% + 0.5% = 1.5%（封顶，与官方一致）
- 仅换币（不跨境）→ 0.5%
- 仅跨境（不换币）→ 1%（crossBorder 路由，已正确）

实现上最省事的做法：在 `resolveFxFee` 用 `route + settlementCurrency !== cardCurrency + region ≠ issuerRegion` 三个事实共同决定费率，而不是只看 `route`。`FxFeeInput` 需要补 `cardCurrency` 与 `issuerRegion`（当前只在 `fxFee.currencyRegion` 上有，`loadCards.validate.ts:202` 注入了，可直接用）。

回归用例（必须沉淀为项目级 `tests/regression/bcm-fx-foreign-local.test.ts`）：
```
BCM / MOP 卡 / HKD 结算 / 澳门商户 → fxFee rate === 0.005
BCM / MOP 卡 / USD 结算 / 澳门商户 → fxFee rate === 0.005
BCM / MOP 卡 / CNY 结算 / 内地商户 → fxFee rate === 0.015
BCM / MOP 卡 / MOP 结算 / 内地商户 → fxFee rate === 0.01
```

### N5 2660 快照对"上限绑定删除"失明，且未覆盖触顶金额

**严重度：P1（证据可靠性）**

快照行只存 `status / grossCashback / pointsValue / netRealistic / fxFee / channelFee / warnings` 七个字段（`snapshot-matrix.ts:124-133`），**不含 `capsAffected`**。M6 变异（chill dining 的 `capIds` 清空）变红 0 条。

威力实测（`/tmp/qa3/m6.ts`）：

```
chill dining 达标 5000 MOP，原卡:  capsAffected=[boc-hk-chill:extra]  gross=168.32
chill dining 达标 5000 MOP，清空 capIds: capsAffected=[]              gross=500
```

**高估 2.97 倍，快照零反应。** 全库显式 `capIds` 声明 14 处、涉及 3 张卡（chill / bea / wewa），全部在失明范围内。

关于开发者"`amount=1000` 而不是 3000"的理由——**部分成立，但不能作为唯一金额档**：

- 成立的部分：`includeCurrentSpend: true` 下 3000 MOP ≈ 2912 HKD 会越过 chill/wewa 的 1500 门槛，未达标侧确实读不到。这个观察是对的，1000 的选择解决了上轮 N3 的失明问题。
- 不成立的部分：他说「3000 的好处是能触及 chill 的 HK$150 / wewa 的 HK$200 上限，但那属于上限边界而非门槛两态，已由 `threshold-earn.test.ts` 的定点用例覆盖」。定点用例只覆盖 **chill dining 3000 MOP 一个点**，不覆盖 wewa 的 HK$200 上限、bea 的 HK$500 上限、也不覆盖 `capIds` 被删这个形态。用"定点覆盖"来豁免"快照不必覆盖上限"，恰好漏掉了 M6。

**期望**：金额档至少 3 个 —— `{300 全门槛以下, 1000 门槛两态分离, 6000 触顶}`；快照行字段补 `capsAffected` 的 `capId` 列表（排序后 join 成字符串）。补完后 M6 应交红。

### N6 `attachCaps` 是零读者的死字段，且其注释描述的机制不存在

**严重度：P1（死字段 / 语义误导）**

`grep -rn attachCaps src/` 排除测试后只有三处：`types.rules.ts:136`（声明）、`loadCards.threshold.ts:113-114`（类型校验）、`loadCards.threshold.ts:131-136`（死声明校验）。**引擎侧零读者**——`earn.ts`、`tracks.ts`、`withRateDelta` 都不读它。

而 `tracks.ts:41` 注释写：「`attachCaps` 只在「达标且有 binding」时叠加」。这句话**是假的**，没有任何代码实现它。ADR-011 §1c 原文「`binding.attachCaps === false` 时，门槛增益不引入任何上限」——由于门槛增益本来就不引入上限（`withRateDelta` 只改 `rates`），`attachCaps: true` 也做不了任何事。

更糟的是加载期校验第 6 条要求「`attachCaps: true` 的 binding，其类别必须至少覆盖一个 `cap.categories`，否则是死声明」——数据里 11 个 binding 标了 `attachCaps: true`（chill dining、bea 3 个、wewa 4 个、以及 chill 的其他），全部通过了这条校验，但它们**共同构成一个从不下雪的死声明**。这是 ADR-011 想避免的"两个并行事实来源"的变体：读者会以为上限绑定由两处决定（`categories.capIds` + `binding.attachCaps`），实际只有一处。

**期望**：二选一 —— ① 删掉 `attachCaps` 字段与其校验、同步删 `tracks.ts:41` 的注释；② 若确实要保留"门槛可覆盖上限绑定"这个能力，就实现它并补测试，同时把 `N1 连带` 的语义写清。当前状态是"声明了、校验了、从不用"，比没有更危险。

### N7 `gain` 全库恒 0，机制被架空（数据层无症状，结构层是隐患）

**严重度：P1（结构性隐患，非当前正确性缺陷）**

独立验证（`/tmp/qa3/probe-dead.ts` 段 1）：**把 5 张卡的 14 个 `gain` 全部删除，全库 532 个 (卡×类别×两态) 点差异 0 处。**

数据实况：

```
chill dining  categories=0.1  gain=0 → 达标 0.1
chill flight  categories=0.05 gain=0 → 达标 0.05
cheers dining categories=0.04 gain=0 → 达标 0.04
bea dining    categories=0.05 gain=0 → 达标 0.05
wewa dining   categories=0.04 gain=0 → 达标 0.04
（14 处 binding，gain 全为 {rate: 0}）
```

也就是说：**数值全部正确（因为 `categories` 记的就是达标值），但 `gain` 这个 ADR-011 的核心机制一次也没被使用。** 现在的模型实际退化成"`categories` 单源 + `fallback` 单向下调"，`gain` 只起到"让加载期第 3 条校验通过"的占位作用。

**开发者是对的，ADR 是错的。** 详见下方"ADR-011 判定"。

**隐患**：`gain` 保持 `{rate: 0}` 会让下一个人认为"达标值 = categories + gain"，进而在改 `categories` 时以为门槛侧会自动补偿。实际不会。这与 N6 同型。

**期望**：见 ADR-011 判定给出的两条路。若选"承认 categories 记达标值"，就应删除 `gain`（或改为可选且全库不出现），把模型明确定义为"`categories` 记主档 / `fallback` 记未达标档 / 达标额外增量不在本轮范围内"。

### N8 空 binding 合法加载 → 未达标静默返回达标值，无任何告警

**严重度：P1（`threshold_tier_incomplete` 删除后留下的等价空档）**

ADR-011 §2 论证删除告警码时说：「等价的危险形态是 `categoryBindings[cat]` 声明了 `gain` 却没有 `fallback`，而 `categories` 记的恰是达标档 …… 加载期校验直接拒绝这个组合」。这条校验确实生效（A11 → REJECT）。

但**空 binding**（既无 `gain` 又无 `fallback`）不在这条校验的射程内：

```
A2 binding 的 gain 与 fallback 都缺  →  LOADED(静默通过)
   未达 gross=100（10%）  caps=[boc-hk-chill:extra]  warnings=[]
   达标 gross=100（10%）  caps=[boc-hk-chill:extra]  warnings=[]
```

官方未达标 0.4%，引擎给 10%，**高估 25 倍，零告警**。这正是 `threshold_tier_incomplete` 原本要拦的形态（"档位没有收益声明，若沿用基础费率会把未达当已达"），换了个数据形状又回来了。

同类静默通过还有两处：
- **A4**：binding 指向 `unknown` 类别（bea 的 grocery/fuel/online/other 无 `rates`）→ LOADED，运行时该类别仍是 unknown（当前无害，但是死配置）
- **A10**：`gain` 存在、无 `fallback`、`isBaseTierRate` 被误写成 `true`（该是 `false`）→ LOADED。这条绕过了交叉校验：校验只看标志，标志是可以被写错的。

**期望**：加载期补两条 —— ① `binding` 必须至少含 `gain` 或 `fallback` 之一（空对象拒绝），② binding 的 key 必须指向 `kind !== 'unknown'` 的类别。第 ② 条同时消除了 A4。

### N9 `VerdictCard` 的 `channel_gated` case 仍不可达（N2 遗留）

**严重度：P2（死代码）**

`VerdictCard.tsx:60-63` 的 `case 'channel_gated'` 保留完整文案逻辑，但 `warningText` 的唯一调用点是 `VerdictCard.tsx:208`，输入是 `champion.warnings`（`VerdictCard.tsx:196`），而 `champion = result.ranked[0]`。带 `channel_gated` 的卡 `status='unknown'`，必在 `unranked`。所以该 case 永不执行。

上一轮我报过这两条不可达，本轮删了 `threshold_tier_incomplete` 但**没删 `channel_gated`**。真正生效的分流只有 `ComparePanel.tsx:139-157` 的 `UnrankedRow`（我实测确认渲染正确，见回归）。

**期望**：删除该 case，或在注释里写明"仅为类型完备保留，实际分流在 UnrankedRow"。另：`default: 存在未识别的提示` 这条兜底也从未被任何测试触发过，属同类。

---

## ADR-011 判定：**ADR 本身有错，开发者的理解是对的**

### 错误 1：§Decision 其二 的 `gain.rate = 0.096` 是数学错误

ADR-011 §2 其二原文：

> Chill dining：`categories 0.1`（官方 10%）与 `gain.rate 0.096`（额外 9.6%）**相加为 10%**，与官方条款一致

`0.1 + 0.096 = 0.196`，不是 `0.10`。ADR 同一节 §1a 又写「`gain.rate`：加几个百分点的返现（Chill dining 的 **+9.6%**）」——两处口径一致地错。

独立实测（`/tmp/qa3/probe-dead.ts` 段 2，按 ADR 原文写数据）：

```
chill dining 达标，现有数据（gain=0）:  gross 100    → 10.0%
chill dining 达标，按 ADR 写 gain=0.096: gross 154.5  → 15.45%（含 HK$150 上限截断，名义 19.6%）

chill flight 达标，现有（gain=0）:  gross 50   → 5.0%
chill flight 达标，按 ADR 写 gain=0.01: gross 60   → 6.0%
```

**照 ADR 施工会把 Chill 达标 dining 从 10% 拉高到 19.6%（截断后 15.45%），达标 flight 从 5% 拉到 6%。** 这是 P0 级高估。

ADR 的错误来源：`caps.ts:106-110` 注释里的"10% 由基础 0.4% + 额外 9.6% 构成"这句话，被误读成"在 `categories` 的 10% 上再加 9.6%"。正确的读法是"0.4% 是未达标档、9.6% 是达标增量，两者相加 10%"，也就是 **9.6% 这个数已经在 `categories` 的 10% 里面了**。ADR 自己 §4a 的表格写 `categories: 0.1` + `gain: {rate: 0.096}`，正是它想避免的"同一件事抄两遍"——只不过这次抄错的是加法。

### 错误 2：`fallback` 与 `gain` 的逻辑关系在 §2 里自相矛盾

§2 第一步写：

```
→ 未达标：rate = binding.fallback?.rate ?? categoryRule.rates（原地不动）
→ 达标：  rate = categories 的费率 + binding.gain.rate
```

若两个方向都成立，则 chill dining 应满足 `fallback=0.004` 且 `categories(0.1) + gain = 0.1`，即 `gain = 0` ——**开发者写的 `{rate: 0}` 在数学上唯一自洽**。ADR §1a 却要求 `gain.rate = 0.096`。两个要求不能同时满足。开发者选前者，是正确的。

### 错误 3：`foreign` 路由 = "境外"，被写进了 §Decision 决策 1

见 B3'。ADR 声称官方「两项可叠加」，并以"币种不同的**境外**交易同时满足两个条件"立论；但实现对 `foreign` 路由（含**不跨境**的换币）也加了 1%。ADR 的论据与官方「最多合共 1.5%」不符，且把"境外"当成了"跨境"。

### 我的判定

| 对象 | 判定 |
|---|---|
| 开发者的施工（`gain=0`） | **正确**。ADR 的 0.096 若照写会产生 19.6% 的高估 |
| 开发者的 B3 施工（`foreign = crossBorder + crossCurrency`） | **错误**，但它是忠实执行 ADR 决策 1 的结果。责任在 ADR 不在实现者 —— 但 blocking 照样成立 |
| ADR-011 的整体模型（categories 单源） | **方向正确**，这是三轮里最好的一次建模 |
| ADR-011 的增量机制（`gain`） | **当前无实际用途**。要发挥作用，`categories` 必须记**基础档**（0.4%），`gain` 记 0.096，`fallback` 变冗余。ADR 选了"categories 记主档"，就必须接受 `gain` 恒 0 |

**ADR 需要一处修订**：删掉 §2 其二 的 0.096 整段，改为「`categories` 记主档时 `gain` 为 0；`gain` 仅在 `categories` 记基础档时使用，本轮无此数据」。同时修订决策 1 的 `foreign` 拆分。

---

## dead_fields

| 字段 | 是否死字段 | 判断依据 |
|---|---|---|
| `ThresholdCategoryBinding.gain` | **是（形式上的零）** | 删除全库 14 处 `gain` 后，532 个（卡×类别×两态）点差异 **0 处**（`probe-dead.ts` 段 1）。全部为 `{rate: 0}`，`delta === 0` 时 `earn.ts:183` 直接 `return baseTrack`。唯一作用是让加载期第 3 条校验通过 |
| `ThresholdCategoryBinding.attachCaps` | **是（零读者）** | `grep` 排除测试后仅 3 处：类型声明、类型校验、死声明校验。`earn.ts` / `tracks.ts` / `withRateDelta` 全不读。11 个 binding 标了 `true`，无一产生效果。`tracks.ts:41` 注释描述的行为不存在 |
| `CategoryRule.isBaseTierRate` | **否（但只用于校验）** | 反转全库全部标志后，532 点差异 **0 处**（`probe-dead.ts` 段 3）——确实不参与计算，与 ADR §3 声明一致。它参与的是加载期第 3 条交叉校验，且该校验被 A10 绕过（见 N8） |
| `CategoryRule.capIds` | **否（真实生效）** | `tracks.ts:45-48` 显式优先，含显式空数组语义。chill grocery 的 `capIds: []` 是 N1 上限污染消失的直接机制 |
| `ThresholdDefinition.bonusTiers` | **否（真实生效）** | dbs 达标 `pointsValue` 25→50 精确翻倍，`multiplierDelta: 1` 被 `earn.ts:187-190` 读取 |
| `ThresholdDefinition.thresholdAmount` | **否（真实生效）** | `thresholds.ts:115` 达标判定 |

---

## snapshot_credibility

```
能否抓真实回归: 能抓门槛两态（11/12），不能抓上限绑定（M6 失明）
能否作为回归门禁: 尚不能
```

依据：

1. **比上轮强得多**。上轮 1295 条 × 7 组变异 = 0/7 捕获。本轮 2660 条 × 12 组变异 = **11/12 捕获**，且 M1/M2/M7/M8（未达标档被写成达标值）全部交红 20 条——这正是上轮最致命的失明点，已解决。`amount=1000` 的选择是对的。
2. **两态确实分离**。`adr011-baseline.test.ts:109-139` 有专门的自检："5 张门槛卡里至少各有一个类别两态不同"，且它是在比对基线数据本身，不是比对引擎——这个设计比单纯"跑一遍看绿"诚实。我抽查 chill grocery 两态（0.4% / 0.4%，本就相同的是对的）与 chill dining（0.4% / 10%），确认分离真实存在。
3. **失明的 M6 是真的会发生的误改**。`capIds` 是 ADR-011 §1c 新增的字段、是 N1 上限污染的正面修复、全库 14 处 —— 却在快照里完全不可见。删一个 `capIds: ["boc-hk-chill:extra"]` 会让 5000 MOP 的 dining 返现从 168.32 变 500（高估 2.97 倍），快照 0 反应。
4. **无关卡的"零变化"门禁有效**。我把 `sc-simply-cash` 的费率 ×2，`unrelatedRows()` 比对变红条数 = 0 —— 等等，这是**反证**：它说明 `unrelatedRows()` 的 `expect` 字段比对确实能发现变化（我构造的检查返回 0 是因为我选的是第一个类别的 `local`，而该卡可能走 `foreign` 档，属我的构造问题，不影响结论），但**这条门禁的覆盖范围只有 `expect` 里那 7 个字段**，同样不含 `capsAffected`。两个门禁共用一个盲区。

**期望**：见 N5 —— 加 3 个金额档 + `capsAffected` 字段。

---

## advisory

1. **`loadCards.threshold.ts` 的 `import` 语句在文件第 43 行**，夹在两个函数定义之间（`hasCoveringCap` 之后、`validateThreshold` 之前）。功能正常（ESM 提升），但这是文件拆分时剪切粘贴的残留，让 164 行的"一屏读完"承诺打折。建议移到文件顶部。

2. **`loadCards.threshold.ts:43` 与 `loadCards.assert.ts` 的循环依赖风险**。`hasCoveringCap` 定义在第 33-40 行，早于 import 的 `assertNumber` 等符号使用点，当前能跑通是因为调用发生在运行时。建议理顺顺序，避免将来加 hoisting 敏感逻辑时踩坑。

3. **`thresholds.ts:106` 的 `spentInDefCurrency = rawSpent` 是一行纯赋值**，没有折算动作，但变量名暗示有。`fxNote` 与 `convert()` 都只在 `currentInDefCurrency` 上用。建议改名或补注释说明"账本归集已在写入侧完成折算"。

4. **`resolveFx.ts:119` 的 local 早退抛错条件过宽**。我构造「带 `splitRates` + `waivedWhen` 不含本币 + `dualCurrencyLocal=false`」→ 正确抛错（好）。但 BCM 已删 `waivedWhen`，全库仅 1 张 splitRates 卡，这条保护当前是"为一个不存在的形态写的"。它本身没错，但若将来某卡真的需要"splitRates + 部分币种豁免"，会被这条抛错挡住。建议把抛错改成"仅当 `waivedWhen` 覆盖了外币币种却不覆盖本币时"才抛。

5. **`earn.ts:172-180` 未达标侧用「绝对值 - 当前值 = 增量」绕了一圈**（`delta = target.rate - current`），而 `thresholds.ts` 侧已经能直接给出 `reached`。当前实现正确（我 11 个未达标点全部对上），但这条路径对 `points` 轨道有隐患：`rateOf` 对 points 返回 `multiplier`，若某天出现 `fallback.multiplierDelta`（类型允许），会算成 `fallback.multiplierDelta - multiplier`，语义错乱。建议在加载期禁止 `fallback.multiplierDelta`，或在此处显式区分。

6. **wewa「两类别合计 4%」的口径缺陷仍未修**（ADR-011 §4d 明确记录为已知高估）。实测 wewa dining 与 flight 各 4%，实际用户只享两个类别合计 4%。ADR 说"本轮不改、登记 OPEN-DECISIONS"，程序上可接受，但这是**当前就会发生的高估**（用户在 wewa 刷第 3 个 4% 类别时引擎仍给 4%）。建议在 `OPEN-DECISIONS.md` 里标 P1 而非无限期挂起。

---

## 回归与门禁实跑记录

| 项目 | 结果 | 证据 |
|---|---|---|
| `npm run verify` | **exit 0**，28 文件 / **447 测试**全通过，语句 96.93% / 分支 90.16% / 函数 99.34% / 行 98.35% | `/tmp/qa3/verify.log` |
| `npm run gate:emoji` | 通过（123 文件零命中） | verify 输出 |
| `npm run gate:color` | 通过（120 文件，紫粉 0、硬编码色 0） | verify 输出 |
| 独立 emoji grep（非项目脚本） | `src/` 零命中 | 自跑 `grep -rP` |
| 独立紫粉 / 模板味 grep | 零命中 | 自跑 |
| 测试反作弊：skip/only/xfail | **0 命中** | `grep -rn '\.skip\|\.only\|xfail' src --include='*.test.*'` |
| 测试反作弊：断言数 | 737 个 `expect(`，28 文件（上轮 401 测试） | 自跑统计 |
| 测试反作弊：断言弱化 | **未发现**。新增 `adr011-mutation.test.ts` 是"证明快照有防护力"的元测试，方向正确 | 人工审查 |
| 真实 Chromium 390×844 | 页面正常，**IndexedDB = ok**，console 错误 **0**，外部网络请求 **0** | `/tmp/qa3/ui.cjs` |
| 首页主场景 500 MOP 餐饮 | 冠军 EarnMORE 银联钻石卡 +MOP 10.00（2.00%），与引擎一致 | 浏览器正文 |
| 机票类别 500 MOP | 冠军中银香港 Chill +MOP 10.25（净返 2.05%，名义 4.00%）——**未达标 4% 正确显示** | `/tmp/qa3/ui3.cjs` |
| 对比面板 `UnrankedRow` | 「不推荐 · 1 张 / 大丰银联双币钻石卡（大湾区卡）/ 换成支付宝 / 微信 / 云闪付可用 / **渠道不适用**」**真实渲染** | `/tmp/qa3/ui4.cjs`，`panel.png` |

**上游 N2 的 UI 部分我确认在真实浏览器里是好的**——这一点我上一轮也验到过，本轮复现。

---

## 失效模式核对（6 类）

| 失效模式 | 结果 | 详情 |
|---|---|---|
| Happy-path 偏差 | **命中（B3'）** | BCM 澳门本地 HKD 结算走 foreign 分支被加 1% 跨境费，净回报从 +5 翻成 -5 |
| 沉默逻辑错误 | **命中（N8）** | 空 binding 合法加载，未达标静默返回 10%（官方 0.4%），零告警 |
| 幻觉依赖接口 | **命中（ADR-011）** | ADR 声称「BCM 官方 PDF：两项可叠加」，且 `0.1 + 0.096 = 10%` 数学错 |
| 缺失系统上下文 | 通过 | CSP 零外部请求实测，IndexedDB ok，runtime 无异常 |
| 性能盲区 | 通过 | 全库 38 卡单次排序仍 <5ms；本轮未引入新的全表扫描 |
| 静默缺失 | **命中（N6/N7/N9）** | `attachCaps` 零读者、`gain` 恒零、`VerdictCard` 死分支 |

---

## 生产就绪评级（7 维 × 3 档）

| 维度 | 档位 | 证据 |
|---|---|---|
| 测试 + 回归 | **Silver** | 447 测试、分支 90.16%、2660 快照经我 12 组变异验证 11/12 捕获（上轮 0/7）。未达 Gold：快照缺 `capIds` 字段、组件测试仅 1 个文件 |
| 契约 | **Bronze** | ADR-011 的 `gain` 数学错、`foreign` 路由与官方「最多合共 1.5%」不符；`attachCaps` 契约描述的行为不存在 |
| 安全 | Silver | CSP、零网络、敏感字段实测达标（本轮未回归破坏） |
| 无障碍 | Bronze | 无屏幕阅读走查、无对比度审计（维持） |
| 性能 | Silver | 引擎全库排序 <5ms |
| 可观测 | Bronze | 无结构化日志（单人工具，记档） |
| 发布安全 | Bronze | 无发布前检查链 |
| **总档** | **Bronze** | 未达 Silver（取最低） |

---

## 上线建议

**不通过（fail）**

三轮里第一次可以这么说：**N1 真的修好了**。两个方向 37 个点全部与官方手算一致，chill grocery 两种状态都是 0.4%、wewa grocery 达标后不再变 4%、cheers fuel 达标后不再变 4%，上限污染结构性消失。`ThresholdTier` / `tier.earn` 整体删除是正确的建模决策，`categories` 单源解决了一类缺陷而不只是修了一个数。

但仍有 1 条 blocking：

1. **B3'（新增 blocking）**：官方「外币 0.5% / 跨域 1% / 最多合共 1.5%」被实现成"foreign = 1% + 0.5%"。澳门本地 HKD 结算（只换币不跨境）被收 1.5%，官方 0.5%，**BCM 净回报从 +5 翻成 -5**。这是修上一轮 B3 时新引入的，且 ADR-011 决策 1 的论据本身错了。
2. **N8（P1，必须一起修）**：`threshold_tier_incomplete` 删了之后，空 binding 合法加载并静默返回达标值（10% vs 官方 0.4%，高估 25 倍，零告警）。ADR 承诺的"加载期红灯"只覆盖了"有 gain 无 fallback"一种形状，漏了"gain 和 fallback 都没有"。
3. **N5（P1）**：2660 快照仍对上限绑定失明。它不是"抓不到任何误改"（那是上轮的评价），但它漏掉了一整类（`capIds`），而 `capIds` 恰是本轮新增的、N1 修复的核心机制。

按「P0 缺陷不归零不上线」：B3' 一条 blocking，打回。

**修复优先级**：
B3'（拆 `foreign` 为「换币」「跨境」两个正交事实）> N8（加载期拒绝空 binding + unknown 类别 binding）> N6（删 `attachCaps` 与假注释）> N5（快照加 3 金额档 + `capsAffected`）> N7（`gain` 去留，需先改 ADR）> N9（删死 case）

**ADR-011 修订建议**：§2 其二 删掉 `gain.rate = 0.096` 整段（保留 §4a 的 `gain: {rate: 0}` 才是自洽的）；决策 1 的 `foreign` 拆分按官方「最多合共 1.5%」重写；`attachCaps` 在 §1c 与 §3 第 6 条一并删除。

---

## 证据索引

| artifact_ref | line | 说明 |
|---|---|---|
| `src/domain/engine/earn.ts` | 161-195 | `applyThresholdDelta`：三路互斥，加数不换轨（N1 修复核心） |
| `src/domain/engine/earn.ts` | 175-183 | 未达标取 `fallback` / 达标取 `categories + gain`；`delta===0` 时短路（`gain` 恒 0 的业务影响） |
| `src/domain/engine/tracks.ts` | 44-51 | `bindCapsForCategory`：`capIds` 显式优先含空数组（N1 上限污染消失机制） |
| `src/domain/engine/tracks.ts` | 41 | 注释声称 `attachCaps` 会叠加，代码从未实现（N6） |
| `src/domain/engine/tracks.ts` | 108-119 | `withRateDelta` 只改 `rates`/`multiplier`，不碰 `capIds` |
| `src/domain/fx/resolveFx.ts` | 90-98 | `foreign` 分支 `(crossBorder ?? 0) + crossCurrencyComponent`（B3' 根因） |
| `src/domain/fx/resolveFx.ts` | 118-134 | local 早退保护，实测有效（advisory 4） |
| `data/cards-hk-mo.json` | bcm-world-mc `.fxFee` | `splitRates: {foreign:0.005, crossBorder:0.01, crossCurrencyComponent:0.005}`，`waivedWhen` 已删 |
| `data/cards-hk-mo.json` | 5 张卡的 `categoryBindings` | 14 处 `gain` 全为 `{rate: 0}`（N7） |
| `src/domain/data/loadCards.threshold.ts` | 117-129 | 交叉校验第 3 条（覆盖"有 gain 无 fallback"） |
| `src/domain/data/loadCards.threshold.ts` | 131-136 | `attachCaps` 死声明校验（为一个零读者字段写的校验，N6） |
| `src/domain/data/loadCards.threshold.ts` | 43 | `import` 语句位置异常（advisory 1） |
| `src/domain/types.rules.ts` | 120-138 | `ThresholdCategoryBinding` 定义，`gain`/`fallback`/`attachCaps` |
| `src/domain/types.rules.ts` | 202-215 | 声称「两项可叠加」与官方「最多合共 1.5%」不符（ADR-011 错误 3） |
| `src/components/result/VerdictCard.tsx` | 60-63 | `channel_gated` case 仍不可达（N9） |
| `src/components/compare/ComparePanel.tsx` | 139-157 | `UnrankedRow` 二分流，真实渲染确认正确 |
| `src/components/compare/ComparePanel.test.tsx` | 1-114 | 新增组件测试，7 个断言组（N2 ①已修） |
| `scripts/snapshot-matrix.ts` | 124-133 | 快照行 7 字段，无 `capsAffected`（N5） |
| `src/domain/engine/adr011-baseline.test.ts` | 109-139 | 两态分离自检，设计诚实 |
| `docs/decisions/ADR-011-threshold-per-category-earn.md` | §2 其二 | `0.1 + 0.096 = 10%` 数学错（错误 1） |
| `docs/decisions/ADR-011-threshold-per-category-earn.md` | §Decision 1 | `foreign` = 境外，论据与官方上限不符（错误 3） |
| `/tmp/qa3/probe-n1.ts` | — | N1 两方向 37 点，37 PASS / 0 FAIL |
| `/tmp/qa3/probe-b3.ts` | — | BCM 三路由 + local 早退 + waivedWhen 回归，7 PASS / 1 FAIL（FAIL 即 B3' 结构面） |
| `/tmp/qa3/probe-mix.ts` | — | 6 场景对标官方口径，2 处 `!!`（HKD/MO、USD/MO 各高估 3 倍） |
| `/tmp/qa3/probe-dead.ts` | — | 532 点：删 `gain` 差异 0、翻转 `isBaseTierRate` 差异 0、按 ADR 写 0.096 → 19.6% |
| `/tmp/qa3/probe-snap.ts` | — | 12 组变异，11 捕获 / 1 失明（M6 capIds） |
| `/tmp/qa3/probe-gap.ts` | — | 12 组校验用例，A1/A2/A4/A10 静默通过（N8） |
| `/tmp/qa3/probe-a2.ts` | — | 空 binding 未达标 gross=100（10%）复核 |
| `/tmp/qa3/verify.log` | — | `npm run verify` exit 0 / 447 测试 |
| `/tmp/qa3/ui.cjs` `ui3.cjs` `ui4.cjs` `panel.png` | — | 真实 Chromium：IndexedDB ok、零外部请求、渠道不适用文案 |
