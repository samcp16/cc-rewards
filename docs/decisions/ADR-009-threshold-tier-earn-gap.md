# ADR-009: 门槛档位缺 `earn` 时的处理 —— 数据层显式声明 + 引擎拒绝计算 + 不可达档位断言

## Status

Accepted (2026-10-31，Phase 4 缺陷修复)。本 ADR 关闭 `OPEN-DECISIONS.md` 中「门槛档位未声明收益轨道」一项，并取代 SPEC §5 对 `ThresholdTier.earn` 可选性的默认解读。

## Background

### 缺陷事实（Phase 4 QA 定级 blocking B1，架构师独立复现）

卡库 6 张卡共 12 个 tier，`earn` 字段覆盖率 **0/12**，只有 `note` 中文字符串：

| cardId | tier 数 | `earn` | 官方口径（2026-10-31 核实） |
|---|---|---|---|
| `hsbc-everymile` | 2 | 无 | 按商户类别分档，非累计金额门槛（汇丰 T&C §2(a)/(b)） |
| `boc-hk-chill` | 2 | 无 | World 满 HK$1,500→10%；Platinum 满 HK$1,000→8%（Chill T&C 第 20/21 条） |
| `boc-hk-cheers` | 2 | 无 | 月零售满 HK$5,000→餐饮/旅游/宠物 10X = 4%（中银官网） |
| `bea-world-mc` | 2 | 无 | 月合格签账满 HK$4,000 + App 登记→12.5X = 5%（东亚官网） |
| `dbs-black-world` | 2 | 无 | 月累计满 HK$20,000 + 登记→海外 HK$2=1 里（DBS 推广页） |
| `wewa-unionpay` | 2 | 无 | 月合格零售满 HK$1,500→两类别合计 4%；未达仅 0.4%（WeWa 官网） |

`src/domain/engine/earn.ts:101-105`：

```ts
const fromThreshold: EarnTrack[] = threshold.tier?.earn ?? [];
const tracks: EarnTrack[] = fromThreshold.length > 0 ? … : [baseTrack];
```

`earn` 缺失 → 恒走 `[baseTrack]` → 定档结果对收益零影响。

实测（架构师探针，`rankCards` 前后对比，同卡 500 HKD 餐饮，账本分别空 / 累计 30,000）：

| cardId | 未达门槛 gross | 达门槛 gross | 差值 |
|---|---|---|---|
| wewa-unionpay | 20 | 20 | 0 |
| boc-hk-chill | 50 | 50 | 0 |
| bea-world-mc | 25 | 25 | 0 |
| boc-hk-cheers | 20 | 20 | 0 |
| dbs-black-world | 2.5（积分） | 2.5 | 0 |
| hsbc-everymile | 2.5（积分） | 2.5 | 0 |

**12 个 tier 全部零影响。** 而 `thresholdNote` 同时正确显示「未达 HK$1,500，加码不生效」——文案与数字互相打脸。

### 三个候选方案与它们的真实代价

| 方案 | 机制 | 消除「照着错答案刷卡」的程度 | 代价 |
|---|---|---|---|
| A 补数据 | 给 12 个 tier 写 `earn` 数组 | **完全消除**（引擎本就支持该字段，一行未用） | 6 张卡逐条对官方条款，其中 2 张要先修结构 |
| B 引擎按 note 回落 | 解析中文字符串推断低档费率 | **零消除** | 把数据缺陷转成代码里的字符串匹配 |
| C 拒绝计算 | tier 无 `earn` → 该卡标记不可算 | **完全消除**（不给数字就不会照着刷） | 若无差别套用，6 张卡在常用类别集体消失 |

方案的组合关系：

- **A 单独用**：修完 12 个 tier 后，「无 earn」状态理论上不存在 → C 永不触发 → 但也就没有守卫，下一次有人加卡漏写 `earn`，缺陷会以完全相同的形态回来。**这才是本次 B1 的根因**：`earn.ts:101` 的 `?? []` 兜底 + `loadCards.ts:149-151` 只校验 `minSpend` 是数字、**不校验 `earn` 是否存在**，两层各让一步，合起来静默算错。
- **A + C 组合**：A 让数据正确，C 让「未来漏写」在运行时立刻暴露成「这张卡不算」，而不是「这张卡按最高档算」。
- **B 单独用**：`note` 是给人看的自由文本，6 张卡的 note 结构互不相同（「Chill 商户 8%（需月实体签账满 HK$1,000）」/「未达 HK$1,500，加码不生效」/「海外 HK$4 = 1 里、本地 HK$6 = 1 里」）。要解析它，代码里必须出现 `if (note.includes('未达'))`、`if (note.match(/0\.4%/))` 之类的判断，且只对当前这 6 种措辞有效。数据层下一句措辞变化，引擎静默走错分支——**同一个静默错误换了个位置**。且引擎的注释原则（`thresholds.ts:4-8`「关键词是不可调换…是算错属性的分界线」）建立的前提是「数据声明语义」，不是「代码猜语义」。
- **B + C 组合**：B 完全多余，C 已消除风险，A 消除得更彻底。

## Decision

**采纳 A + C 组合，禁止 B。**

### 1. 数据层：12 个 tier 全部显式声明 `earn`（方案 A）

写入 `data/cards-hk-mo.json` 的 `thresholds[].tiers[].earn`。轨道的 `exclusivityGroup` 统一写 `base`（引擎在 `earn.ts:104` 会改写成 `base.<category>`，数据层不必感知类别），`capIds` 写该档应受的上限。

逐卡裁定（顺序为 `tiers` 内按 `minSpend` 升序）：

**`wewa-unionpay`**（`wewa-unionpay:monthly`）

| tier | `minSpend` | `earn` |
|---|---|---|
| 未达 | 0 | `[{kind:'cashback', rates:{local:0.004}, exclusivityGroup:'base', capIds:[]}]` |
| 达标 | 1500 | `[{kind:'cashback', rates:{local:0.04}, exclusivityGroup:'base', capIds:['wewa-unionpay:extra']}]` |

依据：官网「其他签账类别 基本现金回赠 签賬 HK$250 可獲 HK$1（0.4%）」「每月合資格零售簽賬滿 HK$1,500…高達 4%」。

**`boc-hk-chill`**（`boc-hk-chill:physical-spend`）

| tier | `minSpend` | `earn` |
|---|---|---|
| 未达 | 0 | `[{kind:'cashback', rates:{local:0.004}, exclusivityGroup:'base', capIds:[]}]` |
| 达标 | 1500 | `[{kind:'cashback', rates:{local:0.1}, exclusivityGroup:'base', capIds:['boc-hk-chill:extra']}]` |

结构同步修正（与 QA advisory-2 合并处理）：现有两档是「8% 需满 HK$1,000」+「10% 需满 HK$1,500」，实际官方是两个产品（Chill World 10% 需 HK$1,500；Chill Platinum 8% 需 HK$1,000），不是同一张卡的两档。保留 World 口径（`cardName` 为 World Mastercard），把 `tiers[0].note` 改写为「未达 HK$1,500，仅基本 0.4%（8% 为 Chill Platinum 口径，非本卡）」，并把 8% 档从 tiers 中移除，同时在卡 `notes` 登记该卡为 World 版本。**其余类别（`flight`/`hotel`/`online` 的 5%）同属「满 HK$1,500」条件，需要一并在 `categories` 层标注依赖门槛**——本 ADR 不展开，由 SPEC 变更记录承接（见下「Consequences / 未覆盖」）。

**`boc-hk-cheers`**（`boc-hk-cheers:monthly-retail`）

| tier | `minSpend` | `earn` |
|---|---|---|
| 未达 | 0 | `[{kind:'cashback', rates:{local:0.004}, exclusivityGroup:'base', capIds:[]}]` |
| 达标 | 5000 | `[{kind:'cashback', rates:{local:0.04}, exclusivityGroup:'base', capIds:[]}]` |

依据：官网「餐饮、旅遊及寵物簽賬 10X 積分，相等於 HK$1.5/里或 4% 現金回贈」「基本積分率 $1=1 分，相等於 0.4% 現金回贈，無門檻」。

**`bea-world-mc`**（`bea-world-mc:qualified-spend`）

| tier | `minSpend` | `earn` |
|---|---|---|
| 未达 | 0 | `[{kind:'cashback', rates:{local:0.004}, exclusivityGroup:'base', capIds:[]}]` |
| 达标 | 4000 | `[{kind:'cashback', rates:{local:0.05}, exclusivityGroup:'base', capIds:['bea-world-mc:reward']}]` |

依据：官网「持卡人須每月累積基本獎賞合資格交易達 HK$4,000 或以上方可享指定類別簽賬高達 12.5X 獎分」；未达门槛为基本 0.4%（`pickcardrebate` 与 `debitbaba` 双源一致）。

**`dbs-black-world`**（`dbs-black-world:monthly-spend`）

| tier | `minSpend` | `earn` |
|---|---|---|
| 未达 | 0 | `[{kind:'points', multiplier:1, pointProgramId:'dbs-miles', exclusivityGroup:'base', capIds:[]}]` |
| 达标 | 20000 | `[{kind:'points', multiplier:2, pointProgramId:'dbs-miles', exclusivityGroup:'base', capIds:[]}]` |

依据：DBS 推广页「累積合資格零售簽賬達 HK$20,000 或以上 ► 合資格海外簽賬享低至 HK$2 = 1 里數（DBS$基本及額外獎賞合共 6X DBS$）」，未登记/未达标为 3X（海外 HK$4=1 里）。**`multiplier` 沿用本卡现有标注口径**（现有 `categories` 已把海外写成 `multiplier:1` 映射 `dbs-miles` 估值，达标档按同一比例取 2，与 3X→6X 的两倍关系一致）。落地时须同步核对 `categories.flight/hotel` 的 note 与新的 2x 档是否一致。

**`hsbc-everymile`**（`hsbc-everymile:daily-category`）—— **不补 `earn`，改为显式声明门槛不适用**

该卡的 2 个 tier 是「HK$5=1 里」与「HK$2=1 里」，但官方分档依据是**商户类别**（汇丰 T&C §2(a) 指定日常及旅游消费 vs §2(b) 本地及海外消费），不是累计金额。现有 `minSpend: 1` 是一个占位值，语义错误：它会让引擎在「本笔 > HK$1」时恒判达标，从而恒取高档。数据层自己的 `note` 已写明「此处 tiers 结构无法精确表达，已标为待架构侧确认建模方式」。

裁定：**删除该卡 `thresholds` 整块**（置空数组）。理由——商户类别路由在 MVP 中已由 `categories` + `settlementRoute`（第 0 步）承担，本卡只需 `categories` 正确即可；`thresholds` 里的 2 个 tier 不表达任何累计金额条件，保留它只会制造「假门槛」。删除后该卡在 `food/flight/hotel/online` 走类别基础费率，`dining/grocery` 取 `categories` 的 `multiplier:1`（hk$2=1里 已体现在现有 note 与估值里）。**必须同时改 `src/domain/types.rules.ts` 与 SPEC §5：`ThresholdDefinition` 的 `note` 追加一句「本卡门槛是商户类别路由，不是金额门槛，故不建 thresholds」。**

### 2. 引擎层：tier 无 `earn` 时拒绝计算（方案 C）

新增判据，落在 `src/domain/engine/earn.ts` 的 `computeEarn` 入口，**不在 `thresholds.ts`**——因为「算不出来」是收益侧的事实，`pickTier` 本身没错（它选对了档，问题在于档位没有可用的收益声明）。

```ts
// earn.ts，computeEarn 内，baseTrack 判空之后
// 定档成功但档位没有 earn 声明 → 这一笔的收益无法确定。
// 若沿用基础费率，等于把「未达门槛」当「已达门槛」算，方向性高估（最多 10 倍）。
// 唯一诚实的处理是不给数字：进 unranked，UI 显示「门槛配置不完整」。
if (threshold.tier && (!threshold.tier.earn || threshold.tier.earn.length === 0)) {
  return { candidates: [], hasUnknown: true, unknownReasons: ['threshold_tier_incomplete'] };
}
```

配套类型变更：

- `src/domain/engine/earn.ts`：`EarnCandidate.unknownReason` 与 `EarnOutcome.unknownReasons` 的联合类型加入 `'threshold_tier_incomplete'`；`hasUnknown` 置 true。
- `src/domain/types.result.ts`：`SchemeWarning` 新增 `{ code: 'threshold_tier_incomplete'; thresholdId: string; tierMinSpend: number }`。
- `src/domain/engine/evaluateCard.ts:70-90`：`earnOutcome.hasUnknown` 分支里，为 `threshold_tier_incomplete` 追加对应 warning（现有分支只映射 `unknown_rate` 与 `no_point_valuation`，不改这里新告警会被吞掉）。
- `src/components/result/VerdictCard.tsx:39-67` 的 `warningText`：新增文案「该卡门槛档位未配置收益规则，不参与排序（门槛：{thresholdId}，累计 ≥ {minSpend} 档）」。
- `src/components/compare/ComparePanel.tsx:136`：`UnrankedRow` 现在硬编码「返现未知」，需按 `warnings[0].code` 分流，门槛配置不完整的卡显示「门槛配置不完整」，不能和「返现未知」混为一谈——两者的用户补救动作不同（前者去填门槛，后者去补类别费率）。

### 3. 数据层：不可达档位由加载期校验拦住

`src/domain/data/loadCards.ts:139-152` 的 thresholds 校验块，在 `minSpend` 断言之后追加：

```ts
const earn = (tierRaw as Record<string, unknown>).earn;
if (earn !== undefined) {
  const list = assertArray(earn, `${path}(${cardId}).thresholds[${i}].tiers[${j}].earn`);
  if (list.length === 0) {
    throw new CardDataError(`${path}(${cardId}).thresholds[${i}].tiers[${j}].earn 不得为空数组`);
  }
  list.forEach((t, k) => validateTrack(t, `${path}(${cardId}).thresholds[${i}].tiers[${j}].earn[${k}]`));
}
```

不加「earn 必填」的硬校验：`hsbc-everymile` 那类「门槛不适用」的卡本来就不该有 tiers；而「有 tier 但缺 earn」应被运行时方案 C 捕获为 unknown，而不是让整个卡库加载失败（一张坏卡不该让 37 张好卡都打不开）。

### 4. 测试：三条断言，缺一不可

落到 `src/domain/engine/thresholds.test.ts` 或新建 `threshold-earn.test.ts`：

1. **杀手断言（5 张卡各一条）**：同卡同类别，账本空 vs 累计超门槛，`aboveGross > belowGross` 严格成立。变异验证：把 `earn.ts` 的方案 C 判据注释掉、并把数据层 `earn` 撤掉，5 条必红。
2. **结构断言**：`CARDS.flatMap(c => c.thresholds).flatMap(t => t.tiers).filter(t => !t.earn).length === 0`，并断言 `hsbc-everymile.thresholds.length === 0`。这条是防回归的地基——它让「下次加卡漏写 earn」在 CI 红，而不是在用户刷卡后红。
3. **方案 C 有效性断言**：构造一张 tier 无 `earn` 的卡，`rankSingleCard` 返回 `status === 'unknown'` 且 warnings 含 `threshold_tier_incomplete`。这条保证守卫本身没被写坏。

## Alternatives considered

### 方案 B：引擎解析 `note` 回落低档费率（拒绝）

- 把数据缺陷转成代码里的字符串匹配。6 张卡 note 措辞互不相同，代码必须按措辞分支，且只对当前措辞有效。
- 「低档」在 6 张卡里语义不一致：wewa/chill/cheers/bea 的低档是「基本 0.4%」，dbs 的低档是「3X 而非 6X」，everymile 的低档是「HK$5=1里」。引擎无从判断该回落哪一个，除非再写 6 个特判。
- 沉默错误性质不变：仍然是「用户看不到错」，只是错的数字换了。而 B1 的定级理由正是「沉默逻辑错误」。
- 抗变化能力为零：数据层改一个字符，引擎静默走错分支，测试也无从覆盖（要覆盖就得穷举措辞）。

### 方案 C 单独使用（拒绝）

- 若不补数据，「5 张卡在餐饮/旅游等常用类别直接进 unranked」。用户感知不是「这张卡没算」，是「我明明有这张卡，工具说它没了」。`VerdictCard.tsx:120-121` 的兜底文案是「卡库中有 N 张卡缺少该类别数据」——当 N=5 且都是用户主力卡时，这句话等于产品在常用场景上承认无能。
- 更糟的是它会**掩盖 B1 的真实修复状态**：卡消失是「明显的不对」，用户会去补数据；而补数据时若不知道官方口径，仍可能填错。A 的补数据动作本身才是修复的实质。

### 方案 A 单独使用（拒绝）

- 修完 12 个 tier 后缺陷消失，但 `earn.ts:101` 的 `?? []` 兜底还在，`loadCards.ts` 仍不校验 `earn`。**下一次加卡漏写 `earn`，缺陷以完全相同形态回归，且同样静默。**
- B1 的根因不是「有人忘了写 earn」，是「忘了写 earn 没有任何一层会报错」。只补数据不补守卫，等于只修症状。
- 且 `hsbc-everymile` 那 2 个 tier 在方案 A 下无法正确补 `earn`（它根本不是金额门槛），必须由 C 或结构修正兜住。

### 在 `thresholds.ts` 里返回 unknown tier 而非在 `earn.ts` 拦截（拒绝）

`pickTier` 的职责是「按累计额选出满足条件的最高档」，它做得对。让它返回 `null` 表示「选到了但没配置」，会把「档位选择」与「档位可用性」两个关注点塞进同一个返回值，且 `resolveThreshold` 的 `ThresholdOutcome.tier` 语义会变成三态（无门槛 / 有门槛已选档 / 有门槛选不到档），下游所有消费点都要跟着改。在 `earn.ts` 拦截最小、最贴合「算不出收益」这个事实。

## Consequences

### 正面

- B1 从「沉默算错」变成「要么算对，要么明说算不出」。这是本次修复唯一可接受的状态。
- 6 张卡的收益数字重新与 `thresholdNote` 文案一致。wewa 未达门槛从 4% 回到 0.4%（10 倍虚高消除）；chill 从 10% 回到 0.4%；bea 从 5% 回到 0.4%；cheers 从 4% 回到 0.4%。
- 门槛机制第一次有真实数据覆盖。此前 12 个 tier 的 `earn` 覆盖率是 0%，有 `earn` 后 `earn.ts:101-105` 的 5 行代码才第一次被执行到（此前一直是死代码路径的另一侧）。
- 加载期校验 + 结构断言构成双层守卫，「漏写 earn」在 CI 与运行时都会炸。
- `hsbc-everymile` 的伪门槛（`minSpend: 1`）被清除，消除了一个「恒判达标」的错误建模。

### 负面

- `bea-world-mc` 达标档 5% 依赖「每月 BEA Mall App 登记」这一用户动作，代码无法验证。补 `earn` 后，若用户未登记，工具会按 5% 算而实际只得 0.4%——**这是 B1 修完后残留的最大假设，且方向上仍是高估**。缓解：在该卡 `notes` 与 `categories.dining.note` 保留「需 App 登记」字样，由 UI 的 `low_confidence`/`medium` 标签承接；如需彻底解决，应作为独立决策（「登记类前置条件是否建模」）另行 ADR，不在本次范围。
- `dbs-black-world` 的 2x 档用 `multiplier: 2` 表达 3X→6X 的两倍关系，是「相对倍数」而非「绝对倍数」，语义上依赖 `categories` 当前的 1x 标注。若将来有人把 `categories` 改成绝对 3x，`thresholds` 的 2 会变成 6x 而不是 6X。缓解：在该卡 `thresholds[].note` 写死「相对本卡 `categories` 的基础倍数翻倍」，并在测试里加一条断言锁住达标后 `pointsValue` 恰为基础档的 2 倍。
- 方案 C 会让「tier 无 earn」从「静默高估」变成「卡消失」。这是有意的取舍，但必须靠方案 A 把 12 个 tier 全部补齐，否则就是拿 C 当挡箭牌掩盖没补完的数据。
- `boc-hk-chill` 的 8% 档被移除（属 Chill Platinum 口径），意味着若用户实际持有 Platinum，本卡数据不再覆盖。这是数据准确性的必要代价，已在 `notes` 登记。

### 未覆盖（明确移交）

- **Chill 的 `flight`/`hotel`/`online` 5% 同属「月实体签账满 HK$1,500」条件**，但门槛 `countsCategories: 'all'` + 单一 tiers 结构无法表达「类别 A 只在达标时给 5%，类别 B 恒给 0.4%」。本次修复只解决「档位有没有 earn」，不解决「哪些类别受门槛约束」。SPEC §13 需登记该缺口，归入 `OPEN-DECISIONS`。
- **`thresholds[].period` 的归集口径**：`aggregate.ts:52-56` 的门槛累计恒按自然月归集，不读 `definition.period`。当前 6 张卡全为 `month`，故不触发错误；一旦出现 `year`/`half_year` 门槛会算错。移交独立决策，不在本次范围。

## Related ADRs

- ADR-005（月度上限账本）：门槛与上限共用账本，`netOptimistic` 只还原「被上限削减的部分」、不还原「因未达门槛而少拿的部分」。本 ADR 的修复不改变该口径，但需注意 `netOptimistic` 的语义边界。
- ADR-007（净回报率口径、门槛与上限分离建模）：本 ADR 落实其「先定档再封顶」的执行次序，并补上「定档后档位必须带收益声明」这一此前缺失的前提。
