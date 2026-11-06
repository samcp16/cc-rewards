# ADR-011: 门槛按类别绑定 —— 门槛回答「哪些类别的哪个费率档」，`categories` 是费率的唯一事实来源

## Status

Accepted (2026-10-31，Phase 4 第三次架构裁决)。

## Errata（第四轮裁决追加，不改动正文历史）

第四轮 QA 发现本 ADR 三处错误，按现状更正；正文以下内容以本节为准：

1. **§2「其二」的公式算术错误，删除。** 原文「`categories 0.1` 与 `gain.rate 0.096` 相加为 10%」不成立（0.1 + 0.096 = 0.196）。实际落地的模型是 §1a 的另一半：**`categories` 记达标档（主档 = 达标档），`fallback` 记未达标绝对值，binding 侧 `gain` 恒为 0**。开发者选 `gain: 0` 数值全对；本 ADR §2 与 §4a–4d 表中所有 `gain` 列作废。
2. **`ThresholdCategoryBinding.gain` 字段删除（死字段）。** 全库 14 处 binding `gain` 全部为 `{rate: 0}`，删除后 532 个基线点零差异。保留 `bonusTiers.gain`（DBS `multiplierDelta: 1` 在用，非死字段）。§3 第 2 条中「gain 与 fallback 二选一」对 binding 不再适用。
3. **`ThresholdCategoryBinding.attachCaps` 字段删除（N6，死字段）。** 引擎零读者；上限绑定已由 `categories.capIds`（含显式空数组）与 `cap.categories` 推断单源决定，`withRateDelta` 按设计永不引入上限，故 `attachCaps` 的 true/false 均无效果。§1c 中「`binding.attachCaps === false` 时门槛增益不引入任何上限」一句由「`withRateDelta` 一律不引入上限」取代；§3 第 6 条校验随之删除；数据层 8 处 `attachCaps: true` 删除；`tracks.ts` 中声称「达标时叠加」的注释更正。
4. **加载期校验修订（N8）。** §3 只拦「有 gain 无 fallback」是不完整的：**空 binding（gain 与 fallback 均缺）当时可合法加载**，未达标时静默沿用 `categories` 的达标值（chill dining 高估 25 倍、零告警）。新校验：**binding 必须且只能声明 `fallback`（对象形状校验保留）；binding 声明的类别必须显式 `isBaseTierRate: false` 且 `fallback` 必填**——binding 存在即声明「本类别受门槛约束」，缺失任一侧都是红灯。空 binding 与「不出现」语义等价，后者已存在，不允许第三种表达。
5. **§2 其三与 DBS 相关内容不受影响**；`bonusTiers` 的 `gain` 语义（增量加法）维持原文。

FX 侧「决策 1：成分可加」的缺陷（`foreign` 同时承载「只换币」与「换币 + 跨境」）不在本 ADR 范围内修订，见 ADR-012。

本 ADR 取代 ADR-009 的两处判断（其 Consequences「未覆盖」一节的定性、以及「tier.earn 整体替换」的建模前提），并把 ADR-010「残留高估」一节里关于 Chill flight/hotel/online 的表述一并更正。关闭 `OPEN-DECISIONS.md` 中「门槛 `countsCategories: 'all'` + 单一 tiers 结构无法表达类别差异」一项。

## Background

### 缺陷事实（QA 复验 N1，架构师独立复现）

`src/domain/engine/earn.ts:127-132` 把门槛档的 `earn` **无条件**用于替换该笔的类别基础轨道：

```ts
const fromThreshold: EarnTrack[] = threshold.tier?.earn ?? [];
const tracks: EarnTrack[] =
  fromThreshold.length > 0
    ? fromThreshold.map((t) => ({ ...t, exclusivityGroup: `base.${category}` }))
    : [baseTrack];
```

而 5 张门槛卡的 `countsCategories` 全是 `'all'`。架构师探针（账本空、MOP 3000、physical，`/tmp/arch/probe.ts`）：

| 卡 | 类别 | `categories` 声明 | 引擎实测有效费率 | 偏差 |
|---|---|---|---|---|
| `boc-hk-chill` | grocery | 0.4% | **5.344%** | 高估 13 倍 |
| `boc-hk-chill` | fuel | 0.4% | **5.344%** | 高估 13 倍 |
| `boc-hk-chill` | flight / hotel / online | 5% | **5.344%** | 受 `cap` 截断后残留 |
| `boc-hk-chill` | dining | 10% | 5.344% | 正确（10% 被 HK$150 上限截断） |
| `wewa-unionpay` | grocery / fuel / other | 0.4% | **4.000%** | 高估 10 倍 |
| `boc-hk-cheers` | flight / hotel / dining | 4% | **0.400%** | 低估 3.6pp |
| `bea-world-mc` | flight / hotel / dining | 5% | **0.400%** | 低估 4.6pp |

并且门槛档的 `capIds` 被带进了本不该受上限约束的类别：`grocery` 在 `tracks.ts:39-45` 的 `bindCapsForCategory` 下不挂任何上限，实测却消耗了 `boc-hk-chill:extra`。

### QA 与 ADR-009 都没抓到的第二半

QA 的 N1 表只覆盖了「账本空（未达门槛）」的 6 行。架构师另跑「已达标」一侧（`/tmp/arch/probe3.ts`），缺陷是**双向且同样严重**：

| 卡 | 类别 | 已达标时 `categories` 声明 | 已达标时实测 | 偏差 |
|---|---|---|---|---|
| `boc-hk-cheers` | fuel | 0.4% | **4.0%** | 高估 10 倍 |
| `boc-hk-cheers` | online | 0.4% | **4.0%** | 高估 10 倍 |
| `boc-hk-chill` | grocery | 0.4% | **10%**（受上限截断） | 高估 25 倍（上限前） |
| `boc-hk-chill` | flight / online | 5% | **10%**（受上限截断） | 高估 |

也就是说：**用户本月刷够门槛之后去超市刷 Chill，引擎告诉他 10%，官方只有 0.4%。** 这比未达标侧的高估更容易发生——用户达标后才是主力刷卡期。

结论：这不是「低估 3.6 个百分点」（ADR-009）也不是「只在未达门槛时高估」（QA N1），而是**门槛档被当成了整卡唯一费率**，与类别声明彻底脱钩，两个方向都错。

### 定性关键：正确信息早已完整存在于 `categories`

`categories` 里每个类别的费率本身是对的，`note` 甚至写明了门槛依赖：

```jsonc
"boc-hk-chill": {
  "dining":  { "rates": { "local": 0.1   }, "note": "Chill 商户 10%（需当月实体签账 HK$1,500）；未达门槛仅基本 0.4%" },
  "flight":  { "rates": { "local": 0.05  }, "note": "海外签账 5%（需月实体签账 HK$1,500；未达标 4%）" },
  "grocery": { "rates": { "local": 0.004 }, "note": "基本 0.4%，无上限" }
}
```

`tier.earn` 那个平铺数组**没有补充任何信息**，只是把两个标量（0.4% / 10%）抄了第二遍。抄两处必然漂移：`categories` 说 flight 是 5%，门槛档说全部类别是 0.4/10%，引擎只能听门槛档的。

**这是 B1 与 N1 的共同根因**：ADR-009 用「再抄一份」修 B1，于是 N1 必然发生。任何让 thresholds 复述类别费率的方案都不是修复。

### 第三方观察：`countsCategories` 是累计口径，不是享受口径

`thresholds.ts:42-44` 与 `db/ledgerRepository.ts:62-67`：

```ts
function countsToward(definition, category) {
  return definition.countsCategories === 'all' || definition.countsCategories.includes(category);
}
```

它只回答一个问题：**本笔金额是否计入该门槛的周期累计**。它从不参与费率决定。当前 5 张卡的 `'all'` 是正确的——Chill 的「月实体签账满 HK$1,500」确实由所有类别的签账累积，用餐饮还是超市累积都算。

QA N1 的短期建议 (a)「把 `countsCategories` 改成实际受门槛约束的类别列表」是**错的**：那样改会让 grocery 上的签账不再累积进 HK$1,500，用户刷超市就永远达不了标——用一个新缺陷换旧缺陷。方案 D 与方案 A 都建立在这个误读上，二者的区别只是「把哪个字段当成了类别作用域」。

## Decision

**采纳方案 B 的语义：门槛只回答「本笔是否达标」，`categories` 独自决定费率与上限。新增按类别绑定表，用「收益增量」表达门槛。禁止让 thresholds 复述绝对费率。**

### 1. 数据模型变更

#### 1a. `ThresholdDefinition` 改名并重定义

`countsCategories` → `accrualCategories`（**累计口径**，语义与今日行为完全一致，只是不再被误读为「费率作用域」）。

```ts
export interface ThresholdDefinition {
  id: string;
  /** 累计口径：本笔是否计入该门槛的周期累计。与费率无关，不是「哪些类别享受升档」 */
  accrualCategories: SpendCategory[] | 'all';
  includeCurrentSpend: boolean;
  period: 'month' | 'year' | 'half_year';
  currency: CurrencyCode;
  /**
   * 按类别绑定：哪些类别在本门槛达标后升档，升多少。
   * 未列入映射的类别 = 不受本门槛约束，费率恒取 categories（不受达标状态影响）。
   * 一个门槛不绑定任何类别 = 它是「累计型」门槛（见 bonusTiers）。
   */
  categoryBindings?: Partial<Record<SpendCategory, ThresholdCategoryBinding>>;
  /** 累计型门槛的奖励档：达标后整卡不受类别约束的增益（如 DBS 里程翻倍） */
  bonusTiers?: ThresholdBonusTier[];
  note?: string;
  source?: SourceRef;
}

/**
 * 门槛对某个类别的效果，用「增量」表达，不抄绝对费率。
 *
 * 达标费率的唯一来源是 `categories[cat].rates`。本类型只声明「在其之上加什么」：
 * - gain.rate：加几个百分点的返现（Chill dining 的 +9.6%）
 * - gain.multiplierDelta：积分倍数加多少（DBS 的 +1）
 * 二选一，不得同时声明（加载期校验）。
 */
export interface ThresholdCategoryBinding {
  gain?: { rate?: number; multiplierDelta?: number };
  /**
   * 未达标时的附加费率。绝大多数类别不需要——`categories` 已写明基础值
   * （Chill grocery 恒 0.4%），此时本字段缺省，引擎直接用 `categories` 的费率。
   *
   * 只有「**未达标 ≠ categories 基础值**」的类别才需要它。当前全库只有一例：
   * Chill 的 flight/hotel/online —— `categories` 记的是达标值 5%，官方未达标是 4%。
   * （`categories.flight.note` 已写明「未达标 4%」，但 `rates.local` 只有 5% 一个数。）
   */
  fallback?: { rate?: number; multiplierDelta?: number };
  /** 达标后是否绑定该类别覆盖的上限池。缺省 false —— 上限绑定以 categories 层为准（见 1c） */
  attachCaps?: boolean;
  note?: string;
}

export interface ThresholdBonusTier {
  minSpend: number;
  /** 达标后整卡增益，与类别无关（DBS 的里程翻倍属此类：所有类别一起翻） */
  gain: { multiplierDelta?: number; rate?: number };
  note?: string;
}
```

#### 1b. 删除 `ThresholdTier`

`ThresholdTier`、`ThresholdTier.earn`、`ThresholdTier.minSpend` 作为「档位」的一等概念被删除。档位仍存在，但形状变了：

- 按类别绑定的门槛：只有「未达标 / 达标」两态，由 `binding` 是否存在 `gain` 自然表达，不需要 `tiers` 数组
- 累计型门槛：`bonusTiers[]` 保留多档（DBS 只有 2 档，未来若有 3 档也能表达）

这样才真正回答「达门槛 vs 未达门槛两个档位的类别费率都要能表达」：**不是把费率写进档位，而是档位只声明增量，费率始终在 `categories`。**

#### 1c. 上限绑定：`categories` 层增加 `capIds?`

`categories` 增加可选 `capIds?: string[]`，语义与 `EarnTrack.capIds` 相同。`bindCapsForCategory`（`tracks.ts:39-45`）改为：**类别层显式 `capIds` 优先（含显式空数组），否则按 `cap.categories` 覆盖关系推断**。`binding.attachCaps === false` 时，门槛增益不引入任何上限。

这条是 N1 连带污染的正面修复：`grocery` 的 `categories` 不挂 `capIds`，门槛增益 `attachCaps` 缺省 false，于是 grocery 无论如何都碰不到 `boc-hk-chill:extra`。

### 2. 引擎变更

`computeEarn` 不再有「替换」分支。改为：

```
1. 取 categoryRule = card.categories[category]
2. gain 的解析（三条路，互斥）：
   a. binding = threshold.definition?.categoryBindings?.[category]
      → 未达标：rate = binding.fallback?.rate ?? categoryRule.rates（原地不动）
                 若有 fallback 且 fallback 声明了值，则用它
      → 达标：  rate = categories 的费率 + binding.gain.rate    (cashback)
                multiplier = categories 的倍数 + binding.gain.multiplierDelta (points)
   b. bonusDelta = threshold.definition?.bonusTiers 里本笔达标档的 gain
      → rate/multiplier 在 categories 之上加 bonusDelta
   c. 无 binding 且无 bonusDelta → 完全沿用 categoryRule，达标状态对费率零影响
3. capIds = categoryRule 层绑定 ∪ (达标 && binding.attachCaps ? 该类别覆盖的上限池 : ∅)
4. 渠道筛选（ADR-010）不变
```

三处必须写对的细节：

**其一，「未达标 ≠ categories 基础值」的方向。** `categories` 记的是该类别的主档费率。对 Chill flight 记 5%（达标档），未达标是 4%。此时 `binding.fallback.rate = 0.04` 显式声明未达标值，达标值是 `categories 的 0.05 + gain.rate 0 = 0.05`（`gain` 可缺省）。反过来若某类别 `categories` 记的是基础值（Chill grocery 0.004，恒不变），则 `categoryBindings` 里根本不出现 grocery，引擎全程取 0.004。

这个「主档落在哪一侧」的选择不需要统一——因为两个值都必须能从数据里读出，引擎不猜。**关键是不再有第二个字段复述同一个数字。**

**其二，`gain.rate` 是加法而不是替换，且必须可对账。** Chill dining：`categories 0.1`（官方 10%）与 `gain.rate 0.096`（额外 9.6%）相加为 10%，与官方条款一致；未达标时 `fallback.rate = 0.004`。这里 `gain.rate = 0.096` 与 `caps.ts:106-110` 注释里「10% 由基础 0.4% + 额外 9.6% 构成」是同一个数，不再有第三份抄写。

**其三，累计型门槛不绑定类别时，`gain` 一律为增量。** DBS 的 `bonusTiers` 只有 `multiplierDelta: 1`（1x → 2x），不再有 `multiplier: 2` 的绝对值。这消除了 ADR-009 自陈的脆弱点：「若将来有人把 `categories` 改成绝对 3x，`thresholds` 的 2 会变成 6x」。改成增量后，`categories` 怎么改，门槛都只是 +1。

**未知收益的语义保留。** 原 `threshold_tier_incomplete` 守卫的正当性来自「档位没有收益声明，若沿用基础费率会把未达当已达」。新模型下这个形态不存在（费率永远来自 `categories`），但**等价的新缺口存在**：`categoryBindings[cat]` 声明了 `gain` 却没有 `fallback`，而 `categories` 记的恰是达标档 → 未达标时引擎被迫沿用达标值，正是方向性高估。加载期校验直接拒绝这个组合（见 3），比运行时返回 unknown 更早、更便宜，因此**删除 `threshold_tier_incomplete`**（见 4c）。

### 3. 加载期校验（`loadCards.ts`）

在现有 thresholds 校验块（`loadCards.ts:169-192`）替换为：

1. `accrualCategories` 必须是 `'all'` 或非空 `SpendCategory[]`（今天的 `countsCategories` 校验原样迁过来）
2. `categoryBindings` 的每个 key 必须是合法类别；`gain` 与 `fallback` 内 `rate` 与 `multiplierDelta` 二选一，不得同时出现
3. **关键交叉校验**：每个声明了 `gain` 的 binding，必须满足「有 `fallback`」或「`categories[cat].isBaseTierRate === true`」之一。两者皆无 → 拒绝加载。理由：categories 记的若是达标档，缺 `fallback` 就等于让未达标笔沿用达标值，方向性高估。**不做中文 note 的文本解析**（ADR-009 已否决该路线，此处不复活）。
4. `bonusTiers` 的 `minSpend` 最低档必须为 0（原 `pickTier` 的断言迁到这里，`pickTier` 保留给 `bonusTiers`）
5. `categoryBindings` 与 `bonusTiers` 不得同时声明（一个门槛不能既按类别又整卡——若有卡真的两者都要，数据层应拆成两个门槛，而 `resolveThreshold` 已禁止多门槛，故必须先解决多门槛才能表达；记为限制）
6. `attachCaps: true` 的 binding，其类别必须至少覆盖一个 `cap.categories`，否则是死声明

第 3 条依赖 `CategoryRule` 新增的 `isBaseTierRate?: boolean`（缺省 `true`）。当某类别的 `categories.rates` 存的是**达标档**（Chill flight 的 5%）时，必须写 `isBaseTierRate: false`，此时 `binding.fallback` 变成必填。这一条把「引擎会不会静默用达标值充当未达标值」变成加载期红灯，而不是运行时算错。

注意 `isBaseTierRate` 只影响校验，不参与计算：计算永远「未达标取 `fallback`，达标取 `categories + gain`」，与这个标志无关。标志的唯一作用是让「哪一侧是主档」这件事无法被省略。

### 4. 逐卡数据裁定

数据层 `categories` 的费率**一个数字都不改**（除 4d 一处口径澄清）。只改 `thresholds` 形状，并补 4 个字段。

#### 4a. `boc-hk-chill`（`boc-hk-chill:physical-spend`）

`accrualCategories: 'all'`（不动，语义正确：任何签账都累积）。

| 类别 | `categories`（不动） | `categoryBindings` | 说明 |
|---|---|---|---|
| dining | `0.1`，`isBaseTierRate: false` | `{ gain: { rate: 0.096 }, fallback: { rate: 0.004 }, attachCaps: true }` | 达标 10% 受 HK$150 上限；未达标 0.4% |
| flight | `0.05`，`isBaseTierRate: false` | `{ gain: { rate: 0.01 }, fallback: { rate: 0.04 } }` | 达标 5%；未达标 4%（note 原文） |
| hotel | `0.05`，`isBaseTierRate: false` | 同上 | |
| online | `0.05`，`isBaseTierRate: false` | 同上 | |
| grocery / fuel / other | `0.004` | **不出现**（不受本门槛约束） | 恒 0.4%，达标与否则同 |

`categories.dining.capIds = ['boc-hk-chill:extra']`；`grocery/fuel/other` 不写 `capIds`。

**`categories.flight.note` 的「未达标 4%」从注记升级为机读值。** 这是 ADR-009 里唯一一处「信息存在但机器读不到」的地方，现在它进了 `fallback.rate`，note 保留作人读。

#### 4b. `boc-hk-cheers`（`boc-hk-cheers:monthly-retail`）

`accrualCategories: 'all'`。

| 类别 | `categories` | `categoryBindings` |
|---|---|---|
| dining / flight / hotel | `0.04`，`isBaseTierRate: false` | `{ gain: { rate: 0.036 }, fallback: { rate: 0.004 } }` |
| grocery / fuel / online / other | `0.004` | 不出现 → 恒 0.4% |

官方「餐飲、旅遊及寵物簽賬 10X = 4%」「基本 0.4% 無門檻」——未达标 0.4%，达标 4%，增量 3.6%。

#### 4c. `bea-world-mc`（`bea-world-mc:qualified-spend`）

`accrualCategories: 'all'`。

| 类别 | `categories` | `categoryBindings` |
|---|---|---|
| dining / flight / hotel | `0.05`，`isBaseTierRate: false` | `{ gain: { rate: 0.046 }, fallback: { rate: 0.004 }, attachCaps: true }` |
| grocery / fuel / online / other | `unknown`（不动） | 不出现 |

bea 的 3 个 unknown 类别在新模型下**不受门槛影响**——它们本来就没有费率，与达标状态无关。原模型下它们被门槛档的 0.4%/5% 强行赋值过（`probe.ts` 显示未达标时 `other` 反而是 `unknown`，达标时会被赋 5%），现在不可能。

#### 4d. `wewa-unionpay`（`wewa-unionpay:monthly`）

`accrualCategories: 'all'`。

| 类别 | `categories` | `categoryBindings` |
|---|---|---|
| dining / flight / hotel / online | `0.04`，`isBaseTierRate: false` | `{ gain: { rate: 0.036 }, fallback: { rate: 0.004 }, attachCaps: true }` |
| grocery / fuel / other | `0.004` | 不出现 → 恒 0.4% |

**口径澄清（唯一一处数字改动）**：`categories.hotel` 与 `online` 现为 `0.04` 且 note 写明「海外签账预设类别 / 线上娱乐类别可选」。wewa 是「两类别合计 4%」，即用户实际只能选两个类别。现有数据把 4 个类别都标 4% 是**已知高估**（任何时刻只有两个生效）。本次**不改**，因为「用户选了哪两个」属于 `SpendInput` 缺维度，与 N1 无关；在 `categories` 的 4 个类别 note 里补一句「与另一自选类别合计 4%，非各自 4%」，并登记 `OPEN-DECISIONS`。这属口径缺陷，不属本次 N1 范围，明确记录而非移交。

#### 4e. `dbs-black-world`（`dbs-black-world:monthly-spend`）

`accrualCategories: 'all'`，`categoryBindings` 缺省，`bonusTiers`：

```jsonc
[
  { "minSpend": 0,     "gain": {},                    "note": "未达 HK$20,000，海外 HK$4 = 1 里、本地 HK$6 = 1 里（3X）" },
  { "minSpend": 20000, "gain": { "multiplierDelta": 1 }, "note": "月签满 HK$20,000 并登记，海外低至 HK$2 = 1 里（6X）" }
]
```

`categories` 的 `multiplier: 1` 不动。达标后 `1 + 1 = 2`，与今日一致，但不再依赖「门槛里的 2 是相对倍数」这个口头约定——它是加法，`categories` 改成任何基数都成立。

**这是泛化度检验点**：DBS 是积分轨道且门槛与类别正交，`bonusTiers` 正好表达；若把它塞进 `categoryBindings` 就必须把 7 个类别各写一遍 `multiplierDelta: 1`，那又是抄。

### 5. 迁移与回溯

- `countsCategories` → `accrualCategories`：字段重命名，值不变，5 张卡 5 处
- 删除 `thresholds[].tiers[]`：5 张卡共 10 个 tier 删除
- 新增 `categoryBindings`：chill 4 项、cheers 3 项、bea 3 项、wewa 4 项
- 新增 `bonusTiers`：dbs 1 张
- `categories` 新增 `capIds`：chill `dining` 1 处、wewa 4 处、bea 3 处
- `categories` 新增 `isBaseTierRate: false`：chill 4 处、cheers 3 处、bea 3 处、wewa 4 处
- `hsbc-everymile`：`thresholds` 已是空数组，不动

影响卡数：**5 张**（chill / cheers / bea / wewa / dbs）。其余 33 张零改动。

### 6. UI / 告警变更

- 删除 `SchemeWarning` 的 `threshold_tier_incomplete`（连同 `types.result.ts:52`、`evaluateCard.ts` 的映射分支、`VerdictCard.tsx:58-59`、`ComparePanel.tsx:135` 与三分流里的这一支）
- `ComparePanel.UnrankedRow` 从三分流降为**二分流**：`channel_gated` / 其余（「返现未知」）
- 保留 `channel_gated` 的 `applicableChannels` 载荷与文案（ADR-010，本轮不动）

## Alternatives considered

### 方案 A：`tier.earn` 改成按类别映射 `Partial<Record<SpendCategory, EarnTrack[]>>`

**部分正确，但保留了两份事实。** 它确实把「哪些类别升档」这一维度建了出来，且未声明的类别会沿用 `categories` 基础费率。问题在两处：

1. `tier.earn[cat].rates` 仍是**绝对费率**，与 `categories[cat].rates` 重复。Chill dining 的 10% 会同时存在于 `categories.dining.rates.local` 与 `tiers[1].earn.dining[0].rates.local`。两份值的漂移监测只能靠测试，不能靠结构——这正是 B1 → N1 的机制。
2. 「未达标 4%」无处安放。`tier.earn` 只描述达标档；未达标档仍是 `tiers[0].earn`，若它按类别映射，那 Chill flight 的 4% 会出现在 `tiers[0].earn.flight.rates.local`，于是 flight 的一个费率有三个落点（categories 的 5%、tiers[0] 的 4%、tiers[1] 的 5%）。

方案 A 能修好 N1 的数值，但把「抄两遍」从 1 层扩到 2 层。**拒绝。**

### 方案 C：`tier.earnCategories?: SpendCategory[]`，升到多少从 categories 取

**方向对，表达力不足。** 它正确意识到「费率从 categories 取」，但只能表达「达标 → 用 categories 的值」，无法表达：

- Chill flight 的「达标 5% / 未达标 4%」（未达标不等于 categories 的值）
- 任何形式的「达标后在 categories 之上再加一点」（Chill dining 的 categories 记的是 10%，不是 0.4%；若 `earnCategories` 含 dining，未达标就只能拿 10%）

它也丢掉了 `bonusTiers` 能表达的多档累计增益。**拒绝作为唯一方案，采纳其「费率只从 categories 取」的内核。**

### 方案 D：`countsCategories` 改成具体类别列表

**语义错位，会造新坑。** `countsToward`（`thresholds.ts:42-44`）与 `buildThresholdContribution`（`db/ledgerRepository.ts:62-67`）都只在**累计**侧使用它。把 Chill 改成 `['dining','flight','hotel','online']` 会有两个后果：

1. 用户在 grocery 刷 HK$5,000，`thresholdContribution` 不记这笔 → 永远达不了 HK$1,500 → dining 永远 0.4%。官方条款是「任何签账累计」，这是引入了一个新的沉默错误。
2. 它依然不解决「达标时 grocery 被错算成 10%」——因为替换逻辑取决于 `tier.earn` 有无，不取决于 `countsCategories`。QA 的 N1 表只测了未达标一侧，所以看起来像能修好。

**拒绝。** 改名 `accrualCategories` 并禁止它承担费率作用域，是本 ADR 对这条路的正面回应。

### 方案 E：让 `tier.earn` 只声明「升档倍数/增量」，升到多少从 categories 取

这是本 ADR 采纳的内核（`gain.rate` / `gain.multiplierDelta`），但**单独使用不足以覆盖全库**：Chill 三个类别的未达标档（4%）与 categories 主档（5%）不同，必须有 `fallback` 这一侧；DBS 的积分翻倍与类别正交，必须有 `bonusTiers` 这一侧。本 ADR 是「E + fallback + bonusTiers」，即把三条路的表达力一次配齐，避免下次又为了一个类别改结构。

### 保留 `threshold_tier_incomplete` 运行时守卫（拒绝）

新模型下费率永远来自 `categories`，不存在「档位没有收益声明」。等价的危险形态是「binding 有 gain 无 fallback，而 categories 记的是达标值」。它在加载期可被静态判出（`isBaseTierRate`），让一张坏卡直接加载失败，比让整卡在运行时进 unranked 更好：**卡库是编译期资产，坏数据应该在加载时报错，而不是在用户付款前一刻静默降级。** 保留守卫会留下一条永远不执行的运行时分支（正是 N2 批评的死代码），并在 UI 上多一个用户无法自行修复的状态（用户改不了 JSON 里的 binding）。

## Consequences

### 正面

- **`categories` 成为费率的唯一事实来源。** 门槛侧不再出现任何绝对费率，只剩 `gain.rate` / `gain.multiplierDelta` 两个增量。结构化地消除了「抄两遍必然漂移」这一类缺陷，而不是靠测试盯着。
- N1 的双向错误同时消失。新模型的预期值（由 `probe.ts` / `probe3.ts` 的同一组输入给出）：

  | 卡 | 类别 | 未达标 | 达标 |
  |---|---|---|---|
  | chill | grocery | 0.4% | 0.4% |
  | chill | dining | 0.4% | 10%（受 HK$150 上限，3000 MOP 下折算 5.344%） |
  | chill | flight | 4% | 5% |
  | cheers | fuel | 0.4% | 0.4% |
  | cheers | dining | 0.4% | 4% |
  | wewa | grocery | 0.4% | 0.4% |
  | dbs | 任一 | 1x | 2x |

- 上限污染消失：`grocery` 在 chill 下不再消耗 `boc-hk-chill:extra`。上限绑定回到 `categories` 层（`capIds`）与 `cap.categories` 推断两个来源，门槛不再参与。
- `countsCategories` 更名为 `accrualCategories`，字面即语义，下一个读代码的人不会再把它当作用域字段。
- `categories` 里 4 类 note 的「未达标 X%」从人读注记升级为机读的 `fallback.rate`，`isBaseTierRate` 把「哪一侧是主档」变成必填声明。
- DBS 的「相对倍数」脆弱点消失（`multiplierDelta` 加法）。

### 负面

- **`isBaseTierRate` 是一个新增的必填心智负担。** 加一张新门槛卡时，若忘了标 `false`，引擎会把达标值当作未达标值，方向性高估。缓解：加载期要求「声明 `gain` 的 binding 必须提供 `fallback` 或 `categories[cat].isBaseTierRate === true` 之一」；两者都没有则拒绝加载。这条断言在 `loadCards` 里，不在引擎里，因此不会随数据增长而漏。
- **`gain.rate` 的加法语义要求数据核对者做一次减法。** Chill dining 要写 0.096 而不是 0.1，需要先知道 categories 是 0.1。这比抄 0.1 多一步思考，但那一步正是防漂移的机制——它强迫数据层回答「这 10% 由什么构成」。对账口径已写在 binding 的 `note` 里（`caps.ts` 的注释与官方条款一致：0.4% 基础 + 9.6% 额外）。
- `bonusTiers` 与 `categoryBindings` 不能同时声明。当前 5 张卡都不需要同时用；将来若有卡两者都要（例如「满额后餐饮 6%、且所有类别里程翻倍」），必须先解决 `resolveThreshold` 的多门槛限制（它现在直接抛错）。这是**明确的建模限制**，不是移交——它会在第 6 张门槛卡出现时立刻暴露，且抛错而非静默。
- 删除 `ThresholdTier` 会让 `assign` 与 SPEC §5 的类型定义、`ARCHITECTURE.md:1355` 的类型草图、`loadCards` 的校验块都要改。这是「改对模型」的既有成本。
- `wewa` 的「两类别合计 4%」口径缺陷**本次未修**，只补 note 与登记。理由与验证方式见 4d——它需要 `SpendInput` 增加「用户选了哪两个类别」，与 N1 不是同一个缺陷。这不是「移交未来 ADR」式的回避：它的触发条件（用户在 wewa 上真的只选两个类别）今天就会发生，因此本轮必须让 UI 至少不宣称 4 个类别各自 4%。

## Related ADRs

- **ADR-009**（门槛档缺 `earn`）：本 ADR 取代其建模前提（`ThresholdTier.earn`）与其「未覆盖」节的定性。ADR-009 的**取向**（不许引擎解析中文 note、坏数据必须报错）被完整继承；它的**机制**（补 12 个 tier 的 earn）被本 ADR 取代，因为那正是 N1 的成因。
- **ADR-010**（渠道门控）：`channelScope` 的筛选语义与本 ADR 正交，不动。其「残留高估」一节里「Chill flight/hotel/online 低估 3.6pp」的表述由本 ADR 更正（实测双向错误，见 Background）。
- **ADR-005**（月度上限账本）：`netOptimistic` 只还原被上限削减的部分。本 ADR 改变了 `capIds` 的来源（从门槛档改为 `categories` 层），需补一条断言：chill grocery 的 `netOptimistic === netRealistic`（无上限可还原）。
- **ADR-007**（净回报率口径、门槛与上限分离）：本 ADR 把「分离」推到底——门槛连费率都不持有，只持有增量。

## Verification plan

见 `docs/QA-REVERIFY.md` 将追加的本轮修复验证节。必须由独立探针（不复用 `threshold-earn.test.ts`）覆盖的两张矩阵：

1. **5 卡 × 7 类别 × {未达标, 达标}** = 70 个点，逐点与 `categories` 声明的手算值比对
2. **上限污染**：chill 的 grocery/fuel/other 在两种达标状态下 `capsAffected` 均不含 `boc-hk-chill:extra`

矩阵 1 的第 3 列必须手算（不接受把引擎输出当期望值）。当前 `threshold-earn.test.ts` 的 15 条断言只覆盖 5 张卡的 1 个类别 × 2 状态 = 10 个点，且金额固定 500（刻意小于所有门槛），恰好避开达标侧污染。
