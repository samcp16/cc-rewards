# ADR-012: 结算路由新增正交布尔字段 —— `foreign` 不再同时承载「只换币」与「换币 + 跨境」

## Status

Accepted (2026-XX-XX，Phase 4 第四次架构裁决，修正 ADR-011 决策 1 的 FX 部分)。

## Background

ADR-011 决策 1 把 `resolveFxFee` 的 `foreign` 路由实现为 `crossBorder + crossCurrencyComponent`（成分可加）。QA 第三轮实测发现：澳门商户 + HKD 结算（BCM MOP 卡）被判入 `foreign`，收到 1.5%，官方只应收跨货币 0.5%。

根因：官方收费表第三列「最多合共 1.5%」是**封顶**，不是「两项必收」。两项是否各收，取决于交易是否**真的同时**满足「跨境」与「换币」两个事实。而 `SettlementRoute` 是单值枚举（local / foreign / crossBorder），`foreign` 在路由判定那一刻就把「只换币」与「换币 + 跨境」压扁成同一个值，信息已丢失——`resolveFxFee` 拿到的输入不足以算对成分，这不是费率表数据错，是**模型表达力缺口**。

实测矩阵（BCM，`splitRates: { foreign: 0.005, crossBorder: 0.01, crossCurrencyComponent: 0.005 }`）：

| 场景 | 跨币 | 跨境 | 官方 | 修复前 | 修复后 |
|---|---|---|---|---|---|
| 澳门商户 + MOP 结算 | 否 | 否 | 0 | 0 | 0 |
| 澳门商户 + HKD 结算 | 是 | 否 | 0.5% | 1.5% | **0.5%** |
| 内地商户 + MOP 结算 | 否 | 是 | 1% | 1% | 1% |
| 内地商户 + USD 结算 | 是 | 是 | 1.5%（封顶） | 1.5% | 1.5% |

## Decision

**采纳方案 B：`RouteDecision` 增加两个布尔字段 `crossCurrency` / `crossBorder`，`route` 枚举原样保留。**

### 字段语义

两个布尔是**生效事实**（经银联双币卡视同 local 条款覆盖之后的事实）：

- `crossCurrency = cardCurrency !== settlementCurrency`
- `crossBorder = issuerRegion !== region`
- `dualCurrencyLocal === true` 时两者强制为 `false`（官方豁免条款优先，与 `route: 'local'` 一致）

不变量（`assertRouteConsistency` 扩充两条断言）：

- `crossCurrency === false && crossBorder === false` 当且仅当 `route === 'local'`
- `crossCurrency === true` 当且仅当 `route === 'foreign'`
- `rateSide` 取值逻辑**一行不改**（见 Alternatives 问题 1）

### `resolveFxFee` 成分选择改为按布尔组合

```
crossBorder && crossCurrency → crossBorder费 + crossCurrencyComponent（两项之和，天然 ≤ 1.5% 封顶）
crossBorder && !crossCurrency → crossBorder ?? foreign ?? rate
!crossBorder && crossCurrency → crossCurrencyComponent ?? foreign ?? rate
两者皆否（且非豁免）→ 不适用（走 local 早退）
```

只声明单值 `foreign` 的旧数据形态不受影响（`rate` 保持 `fxFee.rate`）。「封顶 1.5%」不需要额外 max 逻辑：0.01 + 0.005 恰为 1.5%，组合枚举天然不产生更高值。

### 影响面

- `settlementRoute.ts`：`RouteDecision` + 2 字段，判定函数内部赋值，约 +10 行
- `resolveFx.ts`：成分选择分支由 `switch(route)` 改为布尔组合，约 ±15 行
- `fees.ts` / `evaluateHelpers.ts` / `evaluateCard.ts`：透传 `RouteDecision`，签名不变则零改动
- 数据：**零改动**（splitRates 三个值全部保留，语义不变）

影响卡数：仅 BCM 1 张（唯一声明 splitRates 的卡）。

## Alternatives considered

### 方案 A：`resolveFxFee` 不依赖 route，用原始输入重判两个事实

**拒绝。** 第 0 步存在的唯一理由（`settlementRoute.ts` 头注）就是「返现与手续费依赖同一个判定，两处各判一次会出现结果里看不出的矛盾」。方案 A 让 FX 自己再判一次 `cardCurrency !== settlementCurrency` 与 `issuerRegion !== region`，制造了第二个事实源；且 FX 现有入参里根本没有 `cardCurrency` / `issuerRegion`，还得扩签名。方向倒退。

### 方案 C：`SettlementRoute` 扩成四值组合枚举

**拒绝，两个理由。**

1. **与银联双币卡规则冲突。** 「双币卡 + 豁免币种视同 local」会把 `crossCurrencyOnly`、`crossBorderAndCurrency`、`crossBorderOnly` 三种组合全部塌回 `local`——四值枚举必须再加第五个 `dualCurrencyLocal` 值才能表达，而第五个值又一次同时承载多种真实组合，与今天 `foreign` 的过载是同一个缺陷换了个名字。
2. **波及 `rateSide`。** `assertRouteConsistency` 与 `crossBorder`（同币跨境）分支的 `rateSide: 'foreign'` 都以今天的枚举值为前提，四值化要重写档位映射。第三轮修复，不值得为表达力重写已验证的路由层。

### 方案 D：`resolveFxFee` 增加「商户地」入参，在 FX 内判断是否叠加跨境成分

方案 A 的变体，同样制造第二个事实源，且商户地判断逻辑（含双币卡覆盖）会在路由层与 FX 层各存在一份。拒绝。

## Consequences

正面：澳门 HKD 场景修正为 0.5%；两个事实只判一次；route 枚举、rateSide、双币卡规则零改动；数据零改动。

负面：`RouteDecision` 的三个展示字段变成五个，读者需理解「route 是档位与展示、布尔是计费成分」的分工——Errata 与本 ADR 的不变量断言是防混淆的机制。

## Verification plan

见 `tests_required`（裁决输出）：5 场景 FX 矩阵 + 双币卡布尔归零断言 + 不变量断言 + adr011 基线 532 点回归。
