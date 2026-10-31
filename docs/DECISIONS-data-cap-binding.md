# 数据决策：上限绑定（cap binding）的推断规则与迁移手册

> 状态：Accepted（2026-10-31，Phase 3）
> 影响范围：`data/cards-hk-mo.json` 的 `caps[].categories` 与 `categoryRules[].tracks[].capIds`
> 实现位置：`src/domain/engine/tracks.ts` 的 `bindCapsForCategory` / `capCoversCategory`

## 1. 问题

卡库 38 张卡里，大量「高额返现类别」存在数据缺口：

```jsonc
// Chill 卡的简化示例
{
  "categoryRules": [
    {
      "category": "dining",
      "kind": "cashback",
      "rates": { "local": 0.08, "foreign": 0.08 }
      // 注意：没有 capIds —— 但这张卡的餐饮返现有月上限 HK$150
    }
  ],
  "caps": [
    {
      "id": "cap:chill:dining:monthly",
      "categories": ["dining"],
      "period": "month",
      "limit": 150,
      "currency": "HKD"
      // 有上限定义，但没有任何轨道引用它
    }
  ]
}
```

照抄数据的后果：上限永远不被触发，Chill 餐饮会算出 8.05% 的实际回报率——
而它的上限折合 MOP 154.50，超过部分只剩 0.4% 的 fallback。
SPEC §6.5 记录的「Chill 被高估 45%」就是这个缺口。

## 2. 决策：引擎侧推断，而非要求 Phase 3 修数据

`bindCapsForCategory` 的规则（保守方向）：

1. **类别规则已显式带 `capIds` 时以其为准**，不做任何推断（`inferred: false`）；
2. **否则挂上该卡所有 `categories` 覆盖此类别的上限池**（`inferred: true`）。

保守的含义：宁可低估收益，也不让用户刷一张实际已超额的卡。
漏挂上限只会把 8% 错算成 8%，挂错上限最多把收益算低——两个错误的代价不对称。

`inferred: true` 会随 `TrackBinding` 上传，前端应在 UI 标注「上限绑定待核对」，
提示这层绑定是推断的不是数据声明的。

## 3. 数据迁移（Phase 4 前完成，非阻塞）

目标状态：所有上限关系由数据显式声明，推断只作为新增用户自建卡的兜底。

迁移步骤（对每张卡）：

1. 找出该卡所有 `caps[]` 条目；
2. 对每个 `categoryRules[]` 条目，人工核对该卡条款，把适用的 `cap.id` 写进轨道的 `capIds`；
3. 运行 `npm run test` —— `tracks.test.ts` 里有对 `inferred: false` 路径的断言，
   显式绑定后这些断言会验证迁移没写错；
4. 抽查 3 张迁移过的卡（建议 Chill / PULSE / EarnMORE），在决策页对比迁移前后的净额：
   **迁移后净额不得高于迁移前**（高了说明漏挂了上限，保守方向被破坏）。

## 4. 校验钩子

`loadCards.ts` 的运行时校验会拒绝以下数据，迁移时不会踩到静默错误：

- cap 声明了不存在的 `period`（只接受 `month | year | half_year`）；
- 重复的 `cardId`；
- `fxFee.source.url` 缺失。

上限与 capId 的引用一致性由引擎在计算时兜底（`applyCap` 对找不到的 capId 静默跳过并保持 0 削减），
但 `tracks.test.ts` 的显式绑定断言会在 CI 阶段暴露引用错误。

## 5. 为什么不是 Phase 3 阻塞项

- 推断规则已让计算结果**方向正确**（不会高估），只可能保守低估；
- 迁移需要逐卡核对条款原文，是数据工作而非代码工作，与 Phase 4 的卡库编辑功能同批做成本最低；
- `inferred` 标记已把「哪些绑定是推断的」暴露给 UI 与测试，迁移进度可度量。
