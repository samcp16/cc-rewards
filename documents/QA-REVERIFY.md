# QA 复验报告 — 刷卡决策器 v1.0（B1/B2/B3/B4 修复复验）

- 复验人：严过关（质量工程师，与 Phase 3 开发上下文解耦）
- 复验日期：2026-10-31
- 复验依据：`docs/SPEC.md` + ADR-009 + ADR-010 + 官方条款（独立联网核实）
- 验证方式：**不运行开发者写的测试作为证据**。自写独立黑盒探针（`/tmp/qa-reverify.ts`、`/tmp/probe-*.ts`），期望值全部按官方条款手算；对 1295 条回归基线做**变异验证**判断其真实防护力；真实 Chromium 走查 UI。

---

## verdict

```
verdict: fail
blocking_resolved: 3 / 4（B1 部分、B2 是、B3 否、B4 是）
new_blocking: 2
new_issues: 3
advisory: 4
```

**一句话**：B1 的「补数据 + 补守卫」做对了，但**同一处修复引入了比原缺陷更严重的类别串味**；B3 数据补了但**被既有的 `waivedWhen` 规则短路，一行都没生效**；B2、B4 是真修好了。`npm run verify` 401 测试全绿，但绿的原因不是修对了，是**没有一条测试站在「用户手里只剩一张没达标的卡」的立场上**。

---

## blocking_resolved（逐条独立验证）

### B1 门槛机制 —— **部分修复（守卫成立，门控语义破坏）**

独立验证方式：绕开 `threshold-earn.test.ts`，自建探针对 5 张卡做「同卡同类别、账本空 vs 累计超门槛」黑盒对比，期望值按官方低档/高档手算。

| 卡 | 未达 gross（手算） | 实测 | 达标 gross（手算） | 实测 | 结论 |
|---|---|---|---|---|---|
| wewa-unionpay | 2 (500×0.4%) | 2 | 20 (500×4%) | 20 | 成立，比值恰 10 倍 |
| boc-hk-chill | 2 (500×0.4%) | 2 | 50 (500×10%) | 50 | 成立 |
| boc-hk-cheers | 2 | 2 | 20 (500×4%) | 20 | 成立 |
| bea-world-mc | 2 | 2 | 25 (500×5%) | 25 | 成立 |
| dbs-black-world | points 2.5 | 2.5 | points 5 | 5 | 成立，严格 2 倍 |

方案 C 守卫独立验证（手工构造 tier 无 earn 的卡，直接调 `computeEarn`）：
```
tier picked minSpend=0  tier.earn=undefined
computeEarn => {"candidates":0,"hasUnknown":true,"unknownReasons":["threshold_tier_incomplete"]}
ranked 0 / unranked 1 / status unknown / warnings [low_confidence, threshold_tier_incomplete]
```
**守卫本身是真的。** `hsbc-everymile` 伪门槛已删（`thresholds.length === 0`）。全库 `tier 缺 earn` = 0，`channelScope 空数组` = 0。

**但（见 new_blocking-N1）**：修复把「档位 earn 整体替换类别基础轨道」的语义放大了。`countsCategories: 'all'` + 单一 tiers 结构下，门槛档的 earn 会**无条件替换该卡全部 7 个类别**，包括官方与门槛完全无关的类别。这不是 ADR-009 §4.1 的杀手断言能覆盖的——它只测「门槛卡 × 门槛对应类别」，恰好避开了被污染的类别。

---

### B2 EarnMORE 半年上限 —— **修复成立**

独立验证：不看 `limit-period.test.ts`，自己按官方口径「每半年首 HK$80,000 签账享 2%，其后 1%」逐段手算并比对。

官方口径核实（三源一致，非采用开发者单方面引用）：
- Sun Finance：「2026年改了上限計法:由全年HK$150,000封頂,改為每半年首HK$80,000享2%、其後1%」
- points852：「回贈結構(2026 起):每半年首 HK$80,000 簽賬享 2%,超出後回落至 1%」
- KongGok：「每半年合資格簽賬上限 港幣 $80,000(即每半年最多回贈 港幣 $1,600)」

**开发者的数据裁定正确**（`half_year` / `basis: spend` / `80000`）。逐段实测：

| 同半年已用 | + 本笔 20000 | 实测 gross | 手算 | 结论 |
|---|---|---|---|---|
| 0 | 20000 | 400 | 400 (2%) | 对 |
| 60000 | 20000 | 400 | 400 | 对 |
| 79999 | 20000 | 200.01 | 200.01 (1×2% + 19999×1%) | 对，边界精确 |
| 80000 | 20000 | 200 | 200 (1%) | 对 |
| 上一半年用满，本笔在新半年 | 20000 | 400 | 400（重置） | 对 |
| 上一**年**同期用满，本笔在 2026-H2 | 20000 | 400 | 400（`2025-H2` ≠ `2026-H2`） | 对 |

全年总额：H1 刷满 80000 → 1600；H2 刷满 80000 → 1600；合计 3200 = 官方「每半年最多 1600」× 2。**口径完全正确。**

> 附带发现（不阻断，见 advisory-2）：`capsNote` 里「2026-10-31 依 ADR-009 decision_2 更正」的引用是错的——ADR-009 全文没有 `decision_2`，且其「未覆盖」一节明确写着「`thresholds[].period` 的归集口径……移交独立决策，不在本次范围」。这是一处伪造的决策编号引用。

---

### B3 BCM splitRates —— **数据补了，引擎一行没用上（未修复）**

独立验证：对 BCM 跑 local / foreign / crossBorder 三条真实路由。

| 路由构造 | 引擎判定 route | 实测 fxFee | 官方口径手算 | 结论 |
|---|---|---|---|---|
| MOP 卡 / MOP 结算 / 澳门商户 | local | 0 | 0 | 对 |
| MOP 卡 / **HKD 结算** / 澳门商户 | foreign | 50 | 0.5% = 50 | **对（splitRates.foreign 生效）** |
| MOP 卡 / **CNY 结算** / 澳门商户 | foreign | 50 | 0.5% = 50 | **对** |
| MOP 卡 / **MOP 结算** / **内地商户** | crossBorder | **0** | **1% = 100** | **错，差 100（1pp）** |

根因不在 `resolveFx.ts`（它的 splitRates 分支写得对），在数据层的 `waivedWhen` 与路由判定打架：

```
fxFee.waivedWhen = { settlementCurrencyIn: ["MOP"] }
fxFee.source.note = "…foreign 路由取 0.5%，crossBorder 路由取 1%…"
```

`resolveFxFee` 先按 splitRates 取到 `crossBorder → 0.01`，然后走到 `waivedWhen` 判定：`settlementCurrencyIn` 含 MOP 且本笔结算币种是 MOP → **豁免整条规则，rate 置 0**。数据注释里自己写的「crossBorder 取 1%」永远不会发生。

全库扫描：`waivedWhen 含 MOP` 的卡有 14 张，但同时带 `splitRates.crossBorder` 的**只有 bcm-world-mc 这一张**——所以这是 BCM 独有的、恰好被自己的豁免声明吃掉的缺陷。

**方向性**：内地商户 MOP 结算场景下 fxFee 少算 1pp，BCM 净回报被**高估** 1pp。我上一轮写的是「低估最多 1pp」，这里我上一轮是错的，但错的理由不是架构师说的那条。

#### 架构师 vs 我：谁对 —— **都只对了一半，架构师的结论与他的理由不匹配**

架构师的说法：「该卡是 MOP 卡，MOP 结算走 local 免手续费，不存在外币签账仅 0.5% 的场景」。

- **前提对**：MOP 结算 + 澳门商户确实走 local（`dualCurrencyLocal` 不适用，但 `cardCurrency === settlementCurrency` 且非跨境 → local），fxFee = 0。实测确认。
- **推论错**：MOP 卡**完全可以**以 HKD 或 CNY 结算。这是 MOP 卡在澳门/香港被 DCC 或以外币结算的常见场景。实测 `resolveSettlementRoute(BCM, 'HKD', 'MO') → { route: 'foreign' }`、`(BCM, 'CNY', 'MO') → { route: 'foreign' }`，fxFee = 50。**「不存在 foreign 0.5% 场景」是错的。**
- **他真正命中的是另一件事**：MOP 结算**且内地商户**时路由是 `crossBorder`（不是 local，因为 `issuerRegion=MO ≠ region=CN`），本该收 1%，实测被 `waivedWhen` 吃成 0。他说的「crossBorder 场景高估成本 0.5pp」方向也不对——实测是**少收 1pp（高估收益）**，不是高估成本。

所以：**B3 的 blocking 不因架构师的反驳而撤销**，反而多出一个他没看到的实现层短路。

---

### B4 tai-fung 渠道门控 —— **修复成立**

独立验证：不看 `channel-gate.test.ts`，对 5 渠道 × 7 类别全矩阵跑。

| 渠道 | status | ranked | gross(2000 MOP dining) | warnings |
|---|---|---|---|---|
| physical | unknown | 0 | 0 | channel_gated |
| apple_pay | unknown | 0 | 0 | channel_gated |
| unionpay_qr | ranked | 1 | 100 | — |
| wechat | ranked | 1 | 100 | — |
| alipay | ranked | 1 | 100 | — |

7 类别 × 3 移动渠道 gross 全部 = 50（1000×5%），不一致 0 条；7 类别在 physical 全部进 unranked，异常 0 条。

告警载荷完整可执行：
```json
{"code":"channel_gated","category":"dining","channel":"physical",
 "applicableChannels":["alipay","wechat","unionpay_qr"]}
```

`channelBonus` 全库残留 = 0（`grep -rn channelBonus src/` 仅命中 SPEC 变更记录一处说明文字，代码与数据零引用）。加载期校验 `validateChannelScope` 拒绝空数组与枚举外渠道名，独立构造确认生效。

**渠道筛选语义正确**：`filterByChannel` 在 `computeEarn` 中于估值前执行，被挡轨道不进候选、不进排他组、不消耗上限，不是「按 0 计」。

---

## new_blocking（本轮修复引入 / 修复不彻底）

### N1 门槛档收益替换污染全部类别（比原 B1 更严重）

**严重度：blocking（正确性缺陷，方向性高估 + 低估并存）**

`earn.ts:127-132`：
```ts
const fromThreshold: EarnTrack[] = threshold.tier?.earn ?? [];
const tracks: EarnTrack[] =
  fromThreshold.length > 0
    ? fromThreshold.map((t) => ({ ...t, exclusivityGroup: `base.${category}` }))
    : [baseTrack];
```
「替换」是无条件的、按类别的、不看该类别是否受门槛约束。而 5 张门槛卡全部 `countsCategories: 'all'`。ADR-009 §「未覆盖」自己承认了这个缺口，但把它定为「低估约 3.6pp，不是照着错答案刷卡」而移交。**实测该定性是错的——它同时产生高估。**

账本空（未达门槛）、800 / 3000 MOP 餐饮/超市/其他，实测有效费率：

| 卡 | 类别 | 数据声明 | 实测有效 | 偏差方向 |
|---|---|---|---|---|
| boc-hk-chill | grocery | 0.40% 无上限 | **5.344%** | **高估 4.9pp（13 倍）** |
| boc-hk-chill | other | 0.40% 无上限 | **5.344%** | **高估 4.9pp** |
| boc-hk-chill | dining | 10%（需门槛） | 5.344% | — |
| wewa-unionpay | grocery | 0.40% | **4.000%** | **高估 3.6pp（10 倍）** |
| wewa-unionpay | other | 0.40% | **4.000%** | **高估 3.6pp** |
| boc-hk-cheers | flight/hotel | 4%（需门槛） | 0.400% | 低估 3.6pp |

具体到「用户只有一个用户」这个真实场景：用户本月没刷够、账本空，去超市刷 3000 MOP。
```
grocery 3000 MOP（官方基础 0.4%，与门槛无关）: gross=160.32  有效=5.344%  capsAffected=["boc-hk-chill:extra"]
```
官方应得 3000×0.4% ≈ 12，引擎给 160.32，**高估 13 倍**，并且**错误消耗了 Chill 的 MOP150 额外回赠上限**。

更严重的是：`grocery` 这条轨道本不带 `capIds`（`bindCapsForCategory` 对 grocery 返回空），是门槛档的 `earn` 把 `capIds: ['boc-hk-chill:extra']` 带了进来。也就是说，**门槛卡的 earn 声明不仅污染费率，还污染上限绑定**。

为什么和原 B1 同源却更危险：
1. 原 B1 是「一律按最高档」，至少方向单一（高估）。现在同时存在高估（grocery/other）与低估（cheers flight/hotel）。
2. 原 B1 在 2000 MOP 这个主场景上因为封顶而看不出差别，容易漏测。现在 grocery 这类**无上限类别**会直接线性放大，3000 MOP 就放大 13 倍。
3. 修复后 `thresholdNote` 依然显示正确文案（「未达 HK$1,500，仅基本 0.4%」），而数字是 5.344%——**文案与数字再次互相打脸，和 B1 的原始症状一模一样。**

**期望**：门槛档的 `earn` 只能替换「门槛所约束的那部分类别」。两条路：
- (a) 短期：5 张门槛卡的 `countsCategories` 从 `'all'` 改为实际受门槛约束的类别列表，并验证未列入的类别仍走 `baseTrack`；
- (b) 中期：`tier.earn` 升级为按类别映射（ADR-010 已预告的建模重构）。

无论走哪条，都必须补一条断言：「门槛卡在**非门槛类别**上、未达门槛时，有效费率 = `categories.<cat>.rates.local`」。现有 401 条测试里**一条都没有**。

---

### N2 `threshold_tier_incomplete` / `channel_gated` 的 UI 分支无任何测试覆盖，且其中一条是热路径死代码

**严重度：blocking（需求未满足：ADR-009 §2 与 ADR-010 §3 明确要求 UI 分流）**

ADR-009 §2 与 ADR-010 §3 都把「UI 按 code 分流三种缺口」写成决策的一部分，理由写得很清楚（「用户补救动作不同」）。实现确实写了：

- `VerdictCard.tsx:58-65`：`threshold_tier_incomplete` 与 `channel_gated` 两个 `case` 分支都在；
- `ComparePanel.tsx:134-148`：`UnrankedRow` 按 `warnings[0].code` 三分流。

但：
1. **仓里零组件测试**（`find src -name "*.test.*"` 24 个文件，全部是 domain/db/lib，无一个 `.test.tsx`，`grep -rln "render(" src --include="*.test.*"` 空）。这两处 UI 分支**没有任何测试断言**。
2. `VerdictCard` 的两个新分支是**不可达的**：`warningText` 只在渲染 `champion.warnings` 时被调用（`VerdictCard.tsx:198-212`），而 `champion = result.ranked[0]`。带 `threshold_tier_incomplete` / `channel_gated` 的卡**必然在 `unranked`**（`status='unknown'`）。冠军不可能是 unknown 卡，所以这两个 `case` 永远不执行。真正生效的只有 `ComparePanel` 的 `UnrankedRow`。
3. 浏览器实测：`channel_gated` 那条**确实展示给用户了**（正确）——
   ```
   不推荐 · 1 张
   大丰银联双币钻石卡（大湾区卡）
   换成支付宝 / 微信 / 云闪付可用
   渠道不适用
   ```
   但 `threshold_tier_incomplete` 在当前数据下**无法触发**（全库 tier 都有 earn），所以这条路径**从未被任何人肉眼或测试验证过**。

`channel_gated` 是好的；`threshold_tier_incomplete` 属于「写了但没验过、且主展示位是死代码」。ADR 把 UI 分流写成决策要求，就应按需求未满足处理——**要么给这两条分支补组件测试（含 `UnrankedRow` 三分流的快照/文本断言），要么从 `VerdictCard` 删掉不可达分支并在 ADR 里说明只有 `UnrankedRow` 承载该职责。**

---

## new_issues（不阻断，但必须记录）

### N3 1295 条回归基线对 B1/B2 回归**完全失明**，不能作为「37 张卡没被影响」的证据

**严重度：P1（证据可靠性）**

我先确认它是诚实的：独立重算 1295 条，与快照**0 处不一致**；再把它自己的修复全撤（删掉全部 `tier.earn` + earnmore cap 回滚 month/3000/value），它**变红 155 条**。所以它不是「从改坏的代码跑出来的」。

**但它抓不到真正会发生的回归。** 我对它做了 7 组贴近真实误改的变异：

| 变异 | 变红条数 | 捕获 |
|---|---|---|
| chill 未达档 earn 误写为 10%（沉默高估） | 0 | **未捕获** |
| wewa 未达档 earn 误写为 4%（沉默高估） | 0 | **未捕获** |
| bea 达标档 earn 误写为 4%（少估） | 0 | **未捕获** |
| chill flight 类别费率 5%→0.4% | 0 | **未捕获** |
| earnmore cap 80000→8000（额度缩小 10 倍） | 0 | **未捕获** |
| earnmore `basis` spend→value（口径错） | 0 | **未捕获** |
| earnmore `period` half_year→month（B2 原缺陷） | 0 | **未捕获** |

根因是快照的**参数选取**，不是快照本身造假：
- 全部 1295 条固定 `amount = 2000`。而 2000 MOP > 所有门槛（最严的 dbs 是 20000，但 2000 也足以让 chill/wewa/cheers/bea 的 `includeCurrentSpend` 判达标）→ 全部落在「已达门槛」档，未达档的 `earn` 值从未被读取。
- EarnMORE 2000 远小于 80000，也小于原 3000，且 `basis` 在 2% 未超额时对结果无影响 → B2 的任何口径错误都测不出来。
- tai-fung 被整张剔除 → 渠道门控的 37 卡影响面本来就不在覆盖范围。

**结论**：这份基线能证明「37 张卡在 2000 MOP 这一个点上没变」，不能证明「修复没引入回归」。它被写在 `channel-gate-baseline.test.ts` 里、注释声称「任何一项变化就说明影响面超出渠道筛选」——**这句话与实测不符，属于过度声明。**

期望：基线矩阵至少加 3 个金额档（`300` 低于所有门槛 / `2000` / `90000` 超过 earnmore 半年上限），并**必须包含 5 张门槛卡自身的未达标行**，否则它对 B1 永远失明。

### N4 门控缺口只在「全部轨道被挡」时触发，部分被挡时静默用剩余轨道

**严重度：P2（当前数据不触发，但是下一次加卡的结构性坑）**

`earn.ts:138-141` 的判据是 `applicable.length === 0`。若某张卡同时声明「移动支付 5%（channelScope）」与「实体 0.4%（无 scope）」两条轨道，用户在 `physical` 下会静默拿到 0.4% 并**进入 ranked**——语义上正确，但如果那条 0.4% 是未核实值，就会重演 B4（实体刷卡拿到不该有的排名），只是不再 `channel_gated`。

ADR-010 §4 恰好把这种「补一条无 scope 的兜底轨道」写成关闭缺口的官方手段。也就是说 **ADR 推荐的做法会关掉告警机制**。当前 tai-fung 未补兜底轨道，故不触发；但这是一条被写进决策的、会埋雷的迁移路径。

期望：ADR 里补一句「兜底轨道必须带 `source` 与 `verifiedAt`，且加载期对『同类别同时存在 scoped 与 unscoped 轨道』给出显式提示」。

### N5 `earn.ts` 的注释把「补数据」写成「补守卫」，与实际修复不一致

**严重度：P2（可维护性，误导下一个人）**

`earn.ts:119-122` 注释：「若沿用类别基础费率，等于把『未达门槛』当『已达门槛』算，方向性高估（最多 10 倍）」。

实际修复后，`threshold.tier` 在 `includeCurrentSpend: true` 且本笔金额过门槛时恒非空，这条守卫只对「tier 存在但 earn 缺失」生效。而修复的真正效力来自**数据层补 earn**。注释把守卫描述成 B1 的解法，会让下一个读代码的人以为「有守卫就够了」，从而在加新卡时跳过 earn（这正是 ADR-009 §A 单独使用的反对理由）。建议改成与 ADR-009 一致的表述。

---

## advisory

1. **`capsNote` 引用了不存在的 `ADR-009 decision_2`**。earnmore 与 bcm 的 `capsNote` / `notes` 都写了「依 ADR-009 decision_2 更正」，ADR-009 无此锚点，且其「未覆盖」节明确把 period 归集移交独立决策。建议改为引用 ADR 的 `## Decision` 节或直接引官方源，避免下一个人顺着编号找不到依据。

2. **Chill 「8% 属 Platinum」的裁定正确，但需要同步 `PRESET_CARD_IDS` 注释**。ADR-009 移除了 8% 档并在 `notes` 登记为 World 版本，处理是对的（官方 Chill World 10% / Platinum 8% 确为两款产品）。但 `SPEC.md` §3 预置表里 chill 仍标 `0/7`、`boc-hk-chill` 的 `confidence` 未调整，建议在 SPEC 变更记录补一行「chill 8% 档移除，仅覆盖 World 版本」。

3. **`grocery` / `other` 类别的 `capIds` 绑定语义在门槛卡上与门槛档冲突**。N1 的连带效应：门槛档的 `earn` 把 `capIds` 带进了本不该受上限约束的类别。修 N1 时需同时确认「上限绑定应以 `categories` 层为准，而不是门槛档的 `earn`」。

4. **`netOptimistic` 在门槛场景下的语义边界未验证**。ADR-009 Related ADRs 提到「`netOptimistic` 只还原被上限削减的部分，不还原因未达门槛而少拿的部分」。N1 修复后门槛档会引入新的 capIds 来源，建议补一条断言：门槛卡在未达门槛且封顶时，`netOptimistic - netRealistic` 恰等于 `cappedBy` 之和。

---

## 回归与门禁实跑记录

| 项目 | 结果 | 证据 |
|---|---|---|
| `npm run verify` | **exit 0**，24 文件 / **401 测试**全通过，语句 98.01% / 分支 91.73% / 函数 100% / 行 99.2% | 本机独立运行 `/tmp/verify.log` |
| `npm run gate:emoji` | 通过（114 文件零命中） | verify 输出 |
| `npm run gate:color` | 通过（112 文件，紫粉 0、硬编码色 0） | verify 输出 |
| 独立 emoji grep（非项目脚本） | src/ 零命中 | 自跑 `grep -rP` |
| 独立紫粉 / 模板味 grep | 零命中 | 自跑 |
| `tsc --noEmit` | 通过（注意：我的探针首次放在 `scripts/` 下直接让 typecheck 失败，说明 `tsc` 覆盖 scripts/，探针必须放仓外） | `/tmp` 迁移后通过 |
| 真实 Chromium（`chromium-1208`）390×844 | 页面正常，**IndexedDB = ok**，console 错误 0，**外部网络请求 0** | `/tmp/e2e/run.cjs` |
| 上一轮「沙箱 Chromium 有 IndexedDB，E2E 能跑」结论 | **本轮复现成立**。`indexedDB.open` 返回 `ok`，Dexie 正常初始化 | 同上 |
| 首页主场景（500 MOP 餐饮 / 澳门 / 刷卡） | 冠军 EarnMORE 银联钻石卡 +MOP 10.00（2.00%），与引擎一致 | 浏览器正文抓取 |
| 对比面板 | 12 张卡，3 张 ranked + 展开，`不推荐 · 1 张` 为大丰，行内文案「换成支付宝 / 微信 / 云闪付可用 / 渠道不适用」 | `/tmp/e2e/ui2.cjs` |

---

## 失效模式核对（6 类）

| 失效模式 | 结果 | 详情 |
|---|---|---|
| Happy-path 偏差 | **命中（N1）** | 主场景 2000 MOP 因封顶看不出差别，3000 MOP 无上限类别放大 13 倍 |
| 沉默逻辑错误 | **命中（N1 + B3）** | 门槛档静默替换全部类别；BCM crossBorder 被 waivedWhen 静默吃成 0 |
| 幻觉依赖接口 | **命中（N3 轻）** | `capsNote` 引用不存在的 `ADR-009 decision_2` |
| 缺失系统上下文 | 通过 | CSP 零外部请求实测，storage 正常 |
| 性能盲区 | 通过 | 全库 38 卡单次排序仍 <5ms |
| 静默缺失 | **命中（N2）** | 两条新 UI 分支零测试，其中 VerdictCard 两条不可达 |

---

## 生产就绪评级（7 维 × 3 档）

| 维度 | 档位 | 证据 |
|---|---|---|
| 测试 + 回归 | **Bronze** | 401 测试全绿但 N1/N2/N3 证明关键路径零覆盖；回归基线对 B1/B2 失明 |
| 契约 | **Bronze** | SPEC 声称的 splitRates 分支实际被 waivedWhen 短路；门槛类别作用域契约与数据不符 |
| 安全 | Silver | CSP、零网络、无敏感数据实测达标（本轮未回归破坏） |
| 无障碍 | Bronze | 无屏幕阅读走查、无对比度审计（维持上一轮） |
| 性能 | Silver | 引擎全库排序 <5ms |
| 可观测 | Bronze | 无结构化日志（单人工具，记档） |
| 发布安全 | Bronze | 无导出提醒等发布前检查链 |
| **总档** | **Bronze** | 未达 Silver |

---

## 上线建议

**不通过（fail）**

B2、B4 确实修好了，B1 的守卫也真的建立了——这三项我认可。但：

1. **N1 是 B1 修复的副作用，性质比原 B1 更严重**：原 B1 是所有类别一律按高档（单一方向高估，且被上限掩盖）；现在是无上限类别按门槛档线性放大，3000 MOP 超市高估 13 倍，且同时存在低估。用户照着错答案刷卡的场景没有消失，换了个类别。
2. **B3 没有修好**：数据补对了，但被该卡自己的 `waivedWhen` 短路，crossBorder 一行都没生效。架构师的反驳在前提上对、在推论上错，不构成撤销 blocking 的理由。
3. **N3 说明「37 张卡未受影响」这个结论目前没有可信证据**：1295 条基线对 7 组真实误改全部失明。

按「P0 缺陷不归零不上线」：N1 + B3 两条 blocking，打回。

修复优先级：N1（改 `countsCategories` 或改 `tier.earn` 结构）> B3（去掉 crossBorder 的 MOP 豁免，或改 `waivedWhen` 语义为「仅豁免 foreign 路由」）> N2（补组件测试或删死分支）> N3（基线加金额档与门槛卡未达行）。

---

## 证据索引

| artifact_ref | line | 说明 |
|---|---|---|
| `src/domain/engine/earn.ts` | 127-132 | 门槛档无条件替换类别轨道的根源（N1） |
| `src/domain/engine/earn.ts` | 138-141 | `applicable.length === 0` 才报 channel_gated（N4） |
| `src/domain/engine/earn.ts` | 119-122 | 守卫注释与实际修复不符（N5） |
| `src/domain/fx/resolveFx.ts` | 69-74 | splitRates 分支（B3 数据侧生效） |
| `src/domain/fx/resolveFx.ts` | 98-107 | `waivedWhen` 短路，把 crossBorder 1% 吃成 0（B3 根因） |
| `data/cards-hk-mo.json` | bcm-world-mc `.fxFee` | `waivedWhen.settlementCurrencyIn=["MOP"]` + `splitRates.crossBorder=0.01` 自相矛盾 |
| `src/domain/engine/tracks.ts` | 39-45 | `bindCapsForCategory`：grocery 本无 capIds，被门槛档带入（N1 连带） |
| `src/components/result/VerdictCard.tsx` | 58-65 | 两个新 case 永不可达（champion 必为 ranked） |
| `src/components/result/VerdictCard.tsx` | 198-212 | 只在 champion.warnings 上调用 warningText |
| `src/components/compare/ComparePanel.tsx` | 134-148 | 唯一真正生效的缺口分流点 |
| `src/domain/engine/channel-gate-baseline.test.ts` | 44-91 | 1295 条基线，固定 amount=2000（N3） |
| `src/domain/__fixtures__/adr010-baseline.json` | — | 1295 条，37 卡，剔除 tai-fung |
| `src/domain/engine/threshold-earn.test.ts` | 52 | 注释自陈「金额取 500 刻意小于门槛」——恰好避开 N1 污染类别 |
| `src/domain/engine/channel-gate.test.ts` | 116-126 | 断言「剔除 ocbc/earnmore 后 bcm 第一」，属测试迁就实现，非 SPEC 要求 |
| `data/cards-hk-mo.json` | earnmore `capsNote` | 引用不存在的 `ADR-009 decision_2`（N3/N4 幻觉依赖） |
| `/tmp/qa-reverify.ts` | — | 独立探针，44 项断言 41 PASS（3 FAIL 均为我探针自身构造问题，已在正文用专项探针复核） |
| `/tmp/probe-bcm.ts` | — | BCM 三路由 + `resolveFxFee` 直调，证明 waivedWhen 短路 |
| `/tmp/probe-mut2.ts` | — | 7 组变异，1295 条基线全数未捕获（N3 核心证据） |
| `/tmp/probe-cat.ts` | — | 5 卡 × 7 类别实测有效费率表（N1 核心证据） |
| `/tmp/probe-final.ts` | — | 门槛档替换含普通类别的对照表 + chill grocery 上限误消耗 |
| `/tmp/verify.log` | — | `npm run verify` exit 0 / 401 测试 |
| `/tmp/e2e/run.cjs`、`/tmp/e2e/ui2.cjs` | — | 真实 Chromium：IndexedDB ok、零外部请求、对比面板渠道门控文案 |
