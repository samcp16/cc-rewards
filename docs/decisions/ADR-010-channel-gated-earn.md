# ADR-010: 渠道门控的建模 —— 收益轨道的 `channelScope` 谓词 + 非适用渠道拒绝计算

## Status

Accepted (2026-10-31，Phase 4 缺陷修复，blocking)。本 ADR 关闭 `OPEN-DECISIONS.md` 中「收益轨道无法表达渠道前提」一项，并明确否决 `ChannelBonus` 字段参与计算。它不关闭「类别 × 门槛」缺口（Chill 的 flight/hotel/online 5%），该缺口另案处理，理由见 Decision §5。

## Background

### 缺陷事实（Phase 4 复核，blocking）

`tai-fung-unionpay-dual` 的 7 个类别全部是 `rates: {local: 0.05}`，每个类别的 `note` 写着「仅限经云闪付 / 丰付宝 / 微信 / 支付宝渠道之交易，实体刷卡不适用 5%」，卡 `notes` 进一步写明「只有走指定移动支付渠道才有 5%，实体刷卡不是 5%」。

引擎在 `physical` 渠道下照样给 5%：

```
$ npx tsx probe（2026-10-31，账本为空，MOP 结算，餐饮，澳门商户）
### 2000 MOP dining / physical
  R boc-hk-chill          net 5.866%  gross 156.32
  R tai-fung-unionpay-dual net 5.000%  gross 100.00   <- 错，实体刷卡应为基本费率
  R wewa-unionpay          net 4.000%  gross 80.00
### 380 MOP dining / physical
  R tai-fung-unionpay-dual net 5.000%  gross 19.00    <- 错，且是第一名
  R bcm-world-mc           net 1.000%  gross 3.80
### 同一输入改 unionpay_qr：tai-fung 仍是 5.000%，与 physical 完全相同
```

> **勘误（2026-10-31，施工期实测修正）**：上面 380 档只列了 tai-fung 与 bcm 两行，
> 是当时探针的输出范围，不是完整榜单。修复后实测的完整前三名是
> `ocbc-mo-premier 3.000% / earnmore-unionpay 2.000% / bcm-world-mc 1.000%`。
> 影响：`Consequences` 一节原先写的「380 档变为 bcm 第一名」不成立 —— bcm 是第三名。
> 这与本 ADR 的裁决无关（tai-fung 无论排第几都必须退出 physical 排序），
> 但读榜时不能把「bcm 第三」误读成「榜单只有两张卡」。ocbc 的 3% 本身带周末前提
> （本 ADR 已列为移交项），所以它排第一同样不代表用户平日真能拿到 3%。

也就是说：**渠道这个输入对 tai-fung 的收益没有任何影响**。用户带着手机去餐厅刷卡，工具告诉他 tai-fung 5% 排第一/第二，实际只能拿基本费率。同一个数字在「走云闪付」时是对的，在「实体刷卡」时是错的，两者在结果上不可区分。

### 影响面：全库扫描结论

扫描 38 张卡的 **141 个类别条目** + 卡级 `notes` + 门槛 `note`，按「费率的前提条件类型」分类：

| 前提类型 | 卡 | 条目数 | 是否本次修复 |
|---|---|---|---|
| **渠道前提** | `tai-fung-unionpay-dual` | 7（7 个类别全覆盖） | **本次修复** |
| 交易所渠道（网上/感应式手机支付） | `boc-hk-icard` online | 1 | 不修（渠道枚举无 `online` 值，数据实际把费率记在类别上，当前分类无错） |
| 时点前提（周末） | `ocbc-mo-premier` dining/grocery | 2 | 移交（见 §5） |
| 商户国别前提 | `aeon-wakuwaku` flight（日本境内） | 1 | 移交（数据已保守填 0.4%，不会高估） |
| 年度上限 | `earnmore-unionpay` dining/other | 2 | 已由 `cap.period: year` 覆盖 |
| 门槛前提 | chill / chefs / bea / dbs / wewa | 多个 | 已由 ADR-009 处理，残留缺口见 §5 |

**结论：`channelBonus` 非空的卡全库仅 1 张（tai-fung），费率带渠道前提的类别条目全库 7 个（全在 tai-fung）。** 这不是「一类数据缺陷」，但也不是「一张卡的偶然笔误」——它是**数据模型缺少表达维度**的唯一暴露点：数据层当时只能用 `note` 文字写清前提、用 `channelBonus` 数组留下线索，而这两个载体引擎都读不到。

### `ChannelBonus` 这个字段的来历与它为什么不能用来修

`src/domain/types.ts:87-91`：

```ts
export interface ChannelBonus {
  channel: PaymentChannel;
  detail: string;
  source?: SourceRef;
}
```

`ChannelBonus` 在全库的引用只有三处：类型定义（`types.ts:106`）、新建卡默认值（`cardsRepository.ts:99`）、预置数据（`cards-hk-mo.json:658` 起）。**`docs/SPEC.md` 与 `docs/ARCHITECTURE.md` 中零次出现该字段名**——它不在 SPEC §5 的锁定契约里，违反了 `types.ts` 头部自己写的「任何字段改动必须先改 docs/SPEC.md，再改这里（spec-as-contract）」。

`detail` 是自由文本，`channel` 是渠道枚举，**两者都表达不了「这条轨道只在这些渠道适用」**——因为 `channelBonus` 挂在卡级，不挂在 `CategoryRule` 或 `EarnTrack` 上，而 tai-fung 的 5% 是按类别声明的 7 条轨道。语义上它是「渠道加成」（叠加），不是「渠道门控」（前提）；后者是本次缺陷的性质。

对照 `docs/ARCHITECTURE.md:357-361` 早已给出的正确形态（Apple Card 例子）：

```ts
earn: [
  { kind: 'cashback', rate: 0.02, group: 'payment_method', capIds: [] },  // 仅 channel=apple_pay 时激活
  { kind: 'cashback', rate: 0.01, group: 'payment_method', capIds: [] },  // 兜底
]
```

架构文档定义了「轨道带渠道激活条件」，但 `EarnTrackBase`（`types.rules.ts:39-43`）只有 `exclusivityGroup` 与 `capIds`，**没有任何字段能承载这个条件**。ADR-010 补的就是这个缺口。

### 已知事实的边界（本次没有官方原件）

- `data/cards-hk-mo.json` 中 tai-fung 的 `source[0].note` 只核实了「云闪付/丰付宝/微信/支付宝交易 5% 现金回赠」，**没有核实实体刷卡的基础费率**。
- 卡 `notes` 与 `capsNote` 完整描述了 5% 侧的口径与上限（MOP 100 / 月，满 MOP 2,000 触发，超出按 0 计），但实体刷卡侧只有「不是 5%」这一句否定，没有给数字。
- 按港澳银联双币卡的市场通行口径，非移动支付渠道的基础回赠常见为 0.3%–0.5%。**这是行业惯例推断，不是本卡官方条款。**

因此本次修复**不写死 tai-fung 的实体刷卡费率**（写任何一个数字都是编造），改为承认「这一档算不出来」，见 Decision §2。

## Decision

**采纳方案 A 的语义（轨道级渠道作用域）+ 最小致命保护，即「渠道作用域谓词 + 非适用渠道进 unranked」；否决方案 B（一等 ChannelGateDefinition）与方案 C（track 级 channelIn 数组）；否决方案 D（只改数据）。**

核心机制一句话：**门槛是收益轨道的「加法」，渠道是收益轨道的「筛选」**——`ThresholdDefinition.earn` 按门槛决定加哪些轨道，`EarnTrack.channelScope` 决定哪些轨道对本笔有效。适配层落在一个新文件的纯函数里，不改门槛、上限、封顶、排他组任何既有语义。

### 1. 类型层：`EarnTrackBase` 增加可选字段 `channelScope`

`src/domain/types.rules.ts`：

```ts
export interface EarnTrackBase {
  exclusivityGroup: string;
  capIds: string[];
  /**
   * 本轨道的渠道适用域。缺省 = 全渠道适用（保持既有 38 张卡的语义不变）。
   *
   * 语义是「筛选」而非「加成」：声明 ['unionpay_qr','wechat'] 时，本轨道
   * 只在用户选择这两个渠道时进入候选；其余渠道下它连候选都不是，
   * 不会以「取 0 值」的形态参与排他组比较。
   *
   * 为什么用「黑名单语义」：声明了 channelScope 的轨道，等于同时声明
   * 「不在列表内的渠道不适用本轨道」。引擎据此判定「该渠道下本卡能否算出收益」。
   */
  channelScope?: PaymentChannel[];
}
```

**不新增 `ChannelGateDefinition` 类型、不新增 `CategoryRule` 字段。** 理由是 `categoryToTrack`（`tracks.ts:54`）已经把 `CategoryRule` 映射为 `EarnTrack`，在 `CategoryRule` 上加字段等于在映射的输入端加维度，却要在映射的输出端再表达一遍；而 `EarnTrack` 已经是收益的唯一中间表示，加在那里是单点。

### 2. 引擎层：非适用渠道 → `channel_gated` → 进 unranked

新增 `src/domain/engine/channelGate.ts`（新文件，约 40 行，纯函数，无副作用）：

```ts
/**
 * 渠道门控：把「本轨道的渠道适用域」变成候选级与卡级两级结论。
 *
 * 为什么单独成文件而不写进 earn.ts：earn.ts 已到 235 行（门禁 300 行），
 * 且「渠道是否适用」与「这一笔值多少」是两个判断 —— 前者决定有没有候选，
 * 后者决定候选值多少。混在一个函数里会让 earn.ts 同时承担筛选与估值。
 */

import type { EarnTrack, PaymentChannel } from '../types';

/** 轨道是否适用于该渠道。缺省 scope = 全渠道适用。 */
export function trackAppliesToChannel(track: EarnTrack, channel: PaymentChannel): boolean {
  return track.channelScope === undefined || track.channelScope.includes(channel);
}

/** 卡在该渠道是否有任何可用轨道。空数组 = 全部轨道都被渠道挡掉。 */
export function filterByChannel(tracks: EarnTrack[], channel: PaymentChannel): EarnTrack[] {
  return tracks.filter((t) => trackAppliesToChannel(t, channel));
}
```

`src/domain/engine/earn.ts` 的 `computeEarn` 在构造完 `tracks` 之后、估值之前插入筛选，并新增第四种 `UnknownReason`：

```ts
// 渠道筛选：不在 scope 内的轨道不是「值 0」，是「本笔不适用」。
// 若按 0 进入排他组，同组会取到 0 值那条，等于告诉用户「这张卡这笔不赚钱」——
// 而事实是「这张卡这笔的费率我们不知道」。两者的用户动作完全不同。
const applicable = filterByChannel(tracks, ctx.channel);
if (applicable.length === 0) {
  return { candidates: [], hasUnknown: true, unknownReasons: ['channel_gated'] };
}
```

`EarnContext` 增加 `channel: PaymentChannel`（由 `evaluateCard` 从 `input.channel` 传入，`evaluateCard.ts:52-60` 的 `computeEarn` 调用点补一个字段）。

`UnknownReason` 联合类型（`earn.ts:58`）与 `SchemeWarning`（`types.result.ts`）各加一项：

```ts
export type UnknownReason = 'unknown_rate' | 'no_point_valuation' | 'threshold_tier_incomplete' | 'channel_gated';

// types.result.ts
| { code: 'channel_gated'; category: SpendCategory; channel: PaymentChannel; applicableChannels: PaymentChannel[] }
```

`applicableChannels` 取该卡所有被挡掉轨道的 `channelScope` 并集，用于 UI 文案「本卡此类别仅在云闪付/微信/支付宝渠道适用」。

`evaluateCard.ts:80-100` 的缺口分支补映射，与既有三种缺口并列：

```ts
if (earnOutcome.unknownReasons.includes('channel_gated')) {
  reasons.push({
    code: 'channel_gated',
    category: input.category,
    channel: input.channel,
    applicableChannels: collectApplicableChannels(card, input.category),
  });
}
```

### 3. UI 层：三种缺口的文案必须分流

`src/components/result/VerdictCard.tsx:39-68` 的 `warningText` 增加分支：

```ts
case 'channel_gated':
  return `本卡此类别仅在${warning.applicableChannels.map(channelLabel).join(' / ')}渠道适用，${channelLabel(warning.channel)} 下费率未知，不参与排序`;
```

`src/components/compare/ComparePanel.tsx:129-143` 的 `UnrankedRow` 当前只分流 `threshold_tier_incomplete` 与「返现未知」两种，需按 `warnings[0].code` 扩展为三类：

| warning.code | 行内文案 | 用户补救动作 |
|---|---|---|
| `channel_gated` | 渠道不适用 | 换渠道（切到云闪付/微信/支付宝再看） |
| `threshold_tier_incomplete` | 门槛配置不完整 | 补门槛档位收益规则 |
| `unknown_rate` / `no_point_valuation` | 返现未知 | 补类别费率 / 补积分估值 |

这是本次修复的用户价值落点：**「渠道不适用」必须携带「换成哪个渠道就好了」这个可执行动作**，否则用户只知道这张卡没了。

### 4. 数据层：给 tai-fung 的 7 条轨道写 `channelScope`，实体刷卡费率标 unknown

`data/cards-hk-mo.json` 的 `tai-fung-unionpay-dual.categories`，7 个类别各自的 `rates` 拆成「移动支付档（已知 5%）」与「实体刷卡档（未知）」两条轨道，用 `exclusivityGroup` 保持二者互斥：

```json
"dining": {
  "kind": "cashback",
  "note": "5% 仅限云闪付 / 丰付宝 / 微信 / 支付宝渠道；实体刷卡费率官方未公开，标 unknown 不参与排序",
  "rates": { "local": 0.05 },
  "channelScope": ["unionpay_qr", "wechat", "alipay"]
}
```

同时**把 `channelBonus` 数组清空并删除该字段**（`cards-hk-mo.json` 全部 38 张卡的 `channelBonus: []` 空数组一并删除，`ChannelBonus` 类型与 `cardsRepository.ts:99` 的默认值一并删除）。理由见 §6「为什么删除而不是保留」。

> 关键点：`channelScope` 的语义是「这条 5% 轨道只在三个渠道适用」，因此 `physical` 与 `apple_pay` 下该卡 7 个类别全部 `channel_gated` → 进 unranked。这**不是**把 5% 降到 0.4%（会低估云闪付场景），也**不是**把卡删掉（掩盖问题），这是「承认这一档算不出来」。

**`apple_pay` 必须被挡掉**，理由：tai-fung 的条款枚举的是云闪付/丰付宝/微信/支付宝四个渠道，`channelFees.ts:68-76` 现有规则写的是「Apple Pay 视同实体刷卡」，与「指定移动支付渠道」是两回事。数据层不放 `apple_pay` 到 `channelScope`，`apple_pay` 走「视同实体刷卡」的未知档。

**待核实事项（写进数据 `notes`，不阻塞本次修复）：** 实体刷卡档的实际费率。取得官方原件后，把 `channelScope` 轨道之外补一条 `{"kind":"cashback","rates":{"local":<官方值>},"exclusivityGroup":"base.dining","capIds":[]}` 的兜底轨道，`channel_gated` 即自动消失，无需改引擎。**这是本方案的结构优势：补数据即可关闭缺口，不需要二次改代码。**

### 5. 加载期校验：防止「声明了 scope 却写错渠道名」

`src/domain/data/loadCards.ts` 的 `validateTrack`（第 63 行起）在 `capIds` 校验之后追加：

```ts
if (t.channelScope !== undefined) {
  const scope = assertArray(t.channelScope, `${path}.channelScope`);
  if (scope.length === 0) {
    throw new CardDataError(`${path}.channelScope 不得为空数组（表达「全渠道适用」应省略该字段）`);
  }
  scope.forEach((ch, i) =>
    assertOneOf(ch, PAYMENT_CHANNELS, `${path}.channelScope[${i}]`),
  );
}
```

`PAYMENT_CHANNELS` 常量从 `types.ts:31-36` 的 `PaymentChannel` 枚举同步定义（与 `CATEGORIES`/`NETWORKS` 同一写法）。

**空数组必须拒绝**，理由与 ADR-009 对 `earn: []` 的判断同源：空数组看起来声明了作用域、实际一个渠道都没有，会让该卡在所有渠道静默进 unranked，而数据作者以为自己在写「全渠道」。

### 6. 为什么删除 `ChannelBonus` 而不是保留

保留它有四种结局，全部不可接受：

1. **不改它**：它继续是一个「存下来但没人读」的字段，下一个加卡的人会以为渠道门控已被建模，把渠道条件写进 `channelBonus` 而忘了 `channelScope`——缺陷以今天的形态原样回归。这正是 ADR-009 记录的 B1 根因（「漏写没有任何一层会报错」）。
2. **让它参与计算**：它是叠加语义（`detail` 自由文本、无费率字段、卡级挂载），无法表达「5% 只在三个渠道生效、其余渠道不适用」。用它算会得到「实体刷卡 = 5% + 渠道加成」这类更糟的错。
3. **两者并存**：同一语义两个数据载体，必然不一致，且不一致时没有优先级规则能证明是对的。
4. **留着当文档**：`note` 已经承担人读说明，`channelScope` 承担机读语义，`channelBonus` 没有第三个职责。

删除范围与顺序（顺序重要，否则 TS 编译会红）：

| 顺序 | 文件 | 改动 |
|---|---|---|
| 1 | `src/domain/types.rules.ts` | `EarnTrackBase` 增加 `channelScope?`；顶部 `import type` 补 `PaymentChannel` |
| 2 | `src/domain/types.ts` | 删除 `ChannelBonus` 接口（87-91）与 `Card.channelBonus` 字段（106）；`PaymentChannel` 保持（被 `SpendInput`/`channelScope` 使用） |
| 3 | `data/cards-hk-mo.json` | 38 张卡删除 `"channelBonus": [...]`（37 个空数组 + tai-fung 的 3 条）；tai-fung 7 类别增加 `channelScope` 并改 `note` |
| 4 | `src/db/cardsRepository.ts` | 删除第 99 行 `channelBonus: []` |
| 5 | `src/domain/data/loadCards.ts` | 增加 `channelScope` 校验与 `PAYMENT_CHANNELS` 常量 |
| 6 | `docs/SPEC.md` §5 | 契约同步：`EarnTrack` 增加 `channelScope`；登记 `ChannelBonus` 移除（该字段从未进入 SPEC，属追认） |

## Alternatives considered

### 方案 B：把渠道门控升格为与门槛同级的一等概念（`ChannelGateDefinition`）（否决）

形态是新增卡级数组 `channelGates: ChannelGateDefinition[]`，每个 gate 声明 `channels` + `appliesTo` + 「不满足时用哪条轨道」。

否决理由三条，每条都能单独成立：

1. **它会与 `ThresholdDefinition` 冲突且无法定义优先级。** tai-fung 是「渠道门控」、Chill 是「金额门槛」，一旦将来出现「满 HK$1,500 **且** 走云闪付才有 10%」的卡（港澳市场这类条款很常见），两个一等概念必须回答「gate 不满足但 tier 满足时用哪条」。这个优先级规则没有任何官方条款能给出普适答案，只能变成代码里的一张 if 表——**把数据缺陷原样搬进代码，与 ADR-009 否决方案 B 的理由完全相同**。而 `channelScope` 是筛选语义，天然与门槛的加法语义正交，不需要优先级规则。
2. **工程量 3 倍以上。** 需要：新类型、新加载期校验、定档之后新增第 1.5 步（引擎次序从 7 步变 8 步，`index.ts` 头部注释、SPEC §6.2、ARCHITECTURE 的流程图三处同步）、新账本归集键（门控命中要不要与 cap 归集联动）、`ThresholdOutcome` 同级新增 `ChannelOutcome` 并让 `computeEarn` 消费两个 outcome、5 处测试夹具改写。代价集中在一个 Phase 4 缺陷修复窗口里完全不合适。
3. **它解决不了 ADR-009 的残留缺口。** 见 §5。

### 方案 C：track 级 `channelIn` 数组（本次采用的形态，只是字段名不同）（采纳）

`channelIn` 与 `channelScope` 是同一设计。选 `channelScope` 的理由只是命名：`channelIn` 容易被读成「同时满足这些渠道」（交集），而实际语义是「本轨道在这些渠道下适用」（成员判定）。字段名对下一次改数据的人是唯一的防错提示，值得多花一行。

**采纳的类型是「谓词 + 筛选」，不是「数组 + 匹配」。** 差别在于：谓词形态让引擎在「全部轨道被挡」时能明确返回 `channel_gated`，而不是返回一个空候选数组让下游各自猜。这是本方案能给出「不参与排序」而不只是「算 0」的前提。

### 方案 D：只改数据，把 5% 降到基本费率（否决）

- 违反本次边界约束的直接原文：tai-fung 走云闪付确实是 5%，降下来会让云闪付场景被低估约 4.6 个百分点，**方向从高估变低估，错误性质不变**。
- 而且降成多少没有依据：官方未公开实体刷卡费率，0.4% 是照抄其他卡的惯例值（见 Background「已知事实的边界」）。**编造一个数字比承认算不出来更危险**——用户会照着这个编造数字去刷卡，而 `channel_gated` 会明确告诉他「这张卡这笔我们算不出来，去用卡片详情页查」。
- 它完全不改数据模型，下一个渠道门控卡（tai-fung-visa 若出现同类条款、或用户自建卡）会以同一形态回归。

### 方案 E：引擎读 `channelBonus`，非声明渠道按 0 计（否决）

- `channelBonus` 是卡级、无费率、`detail` 自由文本，读它只能得出「这张卡有渠道要求」这一布尔结论，得不出「哪个类别受影响」「非适用时用哪条轨道」。用它兜底只能是 `rate = 0`。
- 按 0 计会让 tai-fung 在 `physical` 下以 0% 进排序，排在所有卡最后。用户看到的是「大丰这张卡完全不返现」，而事实是「有返利但费率未知」。**这与 ADR-009 否决「引擎解析中文 note」是同一类错误**：用一个语义不完整的载体硬凑一个数字。
- 且它不解决「未来漏写」。字段既然已有，没人会去加校验。

### 方案 F（额外考虑后否决）：把 `channelScope` 直接写在 `CategoryRule` 上

`CategoryRule` 加 `channelScope?` 也能表达 tai-fung。否决理由：`CategoryRule` 是「数据文件里的用户输入形态」，`EarnTrack` 是「引擎消费的中间表示」，`categoryToTrack` 负责前者到后者的映射。在输入端加维度意味着映射函数必须知道这个维度，而 `categoryToTrack` 已经被 `earn.ts` 与 `evaluateCard.ts` 共用（`tracks.ts:5`）。加在 `EarnTrack` 上，映射层不需要任何改动（字段直接透传），引擎只有 `computeEarn` 一个新调用点。

## Consequences

### 正面

- tai-fung 在 `physical` / `apple_pay` 渠道下不再给出 5%，也不再进排序列表。2000 MOP 餐饮主场景的排名从「chill 5.866% / **tai-fung 5.000%** / wewa 4.000%」变为「chill 5.866% / wewa 4.000% / ...」，380 小额档从「**tai-fung 5.000%（第一名）**」变为「ocbc-mo-premier 3.000% / earnmore-unionpay 2.000% / bcm-world-mc 1.000%」（见上文勘误：bcm 是第三名，不是第一名）。**这是本次修复唯一可接受的方向：要么算对，要么明说算不出。**
- 用户的补救动作从「无」变成「切渠道」。`channel_gated` 携带 `applicableChannels`，UI 能直接说「本卡此类别仅在云闪付/微信/支付宝适用」。这是产品价值：用户从「照着错答案刷卡」变成「知道该怎么刷」。
- 数据模型第一次能表达「渠道前提」。`docs/ARCHITECTURE.md:357-361` 早已画出这个形态（Apple Card 例子），但 `EarnTrackBase` 从未实现它——本次把这个文档与代码之间的缺口补上。
- 补上 `channelScope` 校验（空数组拒绝、枚举校验）后，「渠道名写错」在加载期即炸，与 ADR-009 的 `earn` 校验构成同一层次的守卫。
- 补数据即可关闭缺口：官方公布实体刷卡费率后，只需在 tai-fung 增加一条无 `channelScope` 的兜底轨道，`channel_gated` 自动消失，**不需要改引擎、不需要新 ADR**。

### 负面

- **tai-fung 在 `physical` 渠道下从排名中消失，这是用户可感知的功能退化。** 它是 SPEC §3 的 12 张预置卡之一（`SPEC.md:103`，标注 `0/7` 缺口、`high` 置信度、「澳门本地高置信度双币卡」）。用户在澳门实体刷卡场景下会少一个选项。取舍：给出 5% 是错的，给出 0.4% 是编的，两种都不能接受。**唯一诚实的处理是不给数字，并在 UI 说明原因与补救动作。**
- tai-fung 的 `confidence: high` 需要重新审视。实体刷卡档费率未核实，按 SPEC §6.6 的缺口处理原则，该卡在 `physical` 场景的数据完整性不再是 `high`。本次不改 `confidence`（它是卡级字段，改它会影响 `low_confidence` 告警的语义与 12 张预置卡的横向可比性），改为在卡 `notes` 与 `categories.*.note` 写明「实体刷卡费率未核实」。**登记为遗留项，见下。**
- `channelScope` 是「黑名单语义」（声明了 scope 就等于声明「不在列表内的不适用」）。若未来出现「某轨道适用于除 X 以外的所有渠道」的条款，需要写全枚举，不能写 `exclude`。当前卡库无此形态；登记为已知限制。
- 本次只覆盖 `channel` 一个维度。`ocbc-mo-premier` 的周末前提、`aeon-wakuwaku` 的日本境内前提同属「轨道前提」，`channelScope` 的谓词形态可以为它们提供参照，但**本次不实现**（`SpendInput` 无 `dayOfWeek` 与商户国别字段，需要扩大输入契约）。
- 删除 `ChannelBonus` 是一次破坏性类型变更。`ChannelBonus` 从未进入 SPEC 契约、全库只有 3 处引用、无 UI 录入、无测试断言，实际影响为零；但 `src/db` 里已持久化的卡行（IndexedDB，用户自建卡）可能残留该字段。**Dexie 的宽松写入会保留未知字段，读取时 `Card` 类型不再声明它——运行时无害，但需在 `cardsRepository` 的读取路径确认没有 `Object.keys` 全量展开的用法。** 已核查：`putCard` 走整体覆盖写入，无字段白名单，残留字段不会被放大。

### 未覆盖（明确移交）

1. **「类别 × 门槛」缺口（ADR-009 移交项，`OPEN-DECISIONS` 第 22 行）本次不修。**
   缺口事实：`boc-hk-chill` 的 `thresholds[0]` 是 `countsCategories: 'all'`，两个 tier 的 `earn` 分别给 0.4% 与 10%，`computeEarn`（`earn.ts:115-120`）在档位有 `earn` 时**整体替换**类别基础轨道。因此 chill 的 `flight`/`hotel`/`online` 的 5% 在达标前会被替换成 0.4%（数据本意是「未达标 4%」，见 `chill.flight.note`）——低估约 3.6 个百分点。**这是低估，不是「照着错答案刷卡」，且 `chill.flight.note` 已写明「未达标 4%」。**
   这不修的理由：它与渠道门控**不是同一个结构缺口**。渠道门控缺的是「轨道的适用域」（筛选），门槛缺的是「档位收益按类别分派」（映射）。把两者合并成「二维条件矩阵」需要把 `tier.earn` 从 `EarnTrack[]` 改成 `Partial<Record<SpendCategory, EarnTrack[]>>`，那是 6 张卡 12 个 tier 的数据重写 + `earn.ts` 的轨道选择逻辑重写 + 全部门槛测试断言重写。**这是建模重构，不是缺陷修复，必须另开 ADR，且应在 Phase 5 有独立窗口时做。**
   本次唯一接受的连带收益：`channelScope` 是可选字段，将来 `tier.earn` 升级为按类别映射时，每条映射内的轨道可以继续带 `channelScope`，两者不冲突。**这证明本次的字段位置选对了——它不会成为下一次建模的障碍。**
2. **`ocbc-mo-premier` 的周末前提**（2 个类别，`confidence: low`）。数据 `notes` 已明写「周末限定无法用当前 categories 字段表达，建议架构侧评估是否需要 dayOfWeek 条件」。当前该卡 `dining`/`grocery` 填的是 3%，**平日会被高估 2 个百分点**。移交独立决策（「时点前提是否建模」），本次不动。**这是本次修复后仍然存在的一处已知高估，明确列出，不假装已全覆盖。**
3. **`aeon-wakuwaku` 的日本境内前提**（1 个类别）。`flight` 已保守填 0.4%，不会高估。移交同上。
4. **`apple_pay` 与「指定移动支付渠道」的关系**是逐卡条款，不是全局规则。本次 tai-fung 按条款枚举处理（不含 `apple_pay`）；若出现「Apple Pay 也算指定渠道」的卡，在该卡 `channelScope` 里加 `apple_pay` 即可，无需改 `channelFees.ts`。`channelFees.ts` 的「Apple Pay 视同实体刷卡」是**手续费口径**，与收益口径无关，两者不冲突，但**必须在 SPEC 里写清这两个口径是独立的**，否则下一个人会把它们混为一谈。
5. **`channelScope` 不参与 `netOptimistic` 的计算。** 被渠道挡掉的轨道不是「额度被削减」，是「本笔不适用」，没有「乐观还原」的语义。`netOptimistic` 的既有语义（只还原被上限削减的部分，`evaluateCard.ts:201-203`）保持不变。

## Related ADRs

- ADR-009（门槛档位缺 earn）：本次沿用其方法论——数据层显式声明、引擎拒绝给出错误数字、加载期校验 + 结构断言双层守卫。本次的 `channel_gated` 与 ADR-009 的 `threshold_tier_incomplete` 是同一处理哲学的两个实例：**「算不出来」必须是一个可被 UI 分流的显式状态，不能是一个 0**。
- ADR-007（净回报率口径、门槛与上限分离建模）：本次不改变净回报率公式与计算次序，`channelScope` 的筛选发生在第 2 步（毛返现）内部，不新增引擎步骤。
- ADR-005（月度上限账本）：`channelScope` 与 `capIds` 正交——被渠道挡掉的轨道不进候选，因此也不消耗上限。tai-fung 的 `cap: mobile-pay`（MOP 100 / 月）仅在移动支付渠道下被消耗，与条款一致。
