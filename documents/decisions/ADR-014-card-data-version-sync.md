# ADR-014: 卡库数据版本升级（让补好的数据真的到达老用户）

## Status
Accepted (2026-11-06)

## Background

卡库 `data/cards-hk-mo.json` 在构建时被内联进 JS bundle，首次启动由
`seedCardsIfNeeded()` 写入 IndexedDB，之后永久返回 `false`。

这个设计本身是对的（防止用户删掉的卡在下次启动时复活），但它带来一个
此前没人注意到的后果：

> **补数据 = 白补。** 我们改多少、重新发布多少次，老用户手机上的
> IndexedDB 永远是第一次安装那天的快照。

用户提出的「软件自己上网抓数据」在这个前提下也无法用「我们代为核实 +
发布」来替代 —— 数据根本送不到他手上。这是必须先修的地基。

## Decision

引入 `CARDS_DATA_VERSION`（`src/db/cardsRepository.ts`），启动时比对本地
库里的版本号，落后则执行 `syncPresetCardsIfOutdated()`。

**三条保护，缺一条都会伤到用户：**

| 保护 | 机制 | 防的是什么 |
|------|------|-----------|
| 用户改过的行不覆盖 | `CardRow.editedByUser`，由 `putCard` 打标 | 我们一改官方数据就把用户调过的值改回去 |
| 用户删掉的卡不加回 | `deletedPresetCards` 名单，`deleteCard` 时记录 | 「删除」变成假的 —— 比卡库为空更伤信任 |
| 用户自建的副本不碰 | 按 `cardId` 逐条比对，`-copy` 后缀天然不匹配 | 覆盖用户的个人化卡 |

`editedByUser` 的可靠性来自一个结构性事实：**播种走 `bulkPut` 绕开
`putCard`**，所以只有用户在详情页点过保存的行才会带这个标记。

## Consequences

正面：
- 数据修正终于能落地。补一张卡 = 改 JSON + 版本号 +1 + 发布，用户零操作。
- 保护分支全部有单测锁死（`cardsRepository.sync.test.ts`，6 用例，
  三个变异均被捕获）。

负面 / 已知边界：
- 版本号要人手维护。「改了 JSON 忘了 +1」会让更新静默失效 —— 这是这套
  机制唯一的软肋，靠代码注释和本 ADR 提示。
- `editedByUser` 一旦置位就永久避让。用户如果只是手滑点了保存，
  那张卡此后就不再接收官方修正，且没有「恢复官方数据」入口。
  当前接受（单人自用、可手动改回），若日后有用户反馈再补。

## 为什么不选另外两条路

**「不做同步，让用户手动重装」** —— 要求用户清缓存重装才能拿到数据更新，
这不是产品，是折腾。

**「运行时从服务器拉 cards.json」** —— 会让应用从「零网络请求」变成
「启动要联网」，直接违反 SPEC O2 与 C9（lint 层有 `no-restricted-globals:
fetch` 硬拦）。而且离线可用是这个工具的核心卖点（付款前没网也要能算）。

## Related
- ADR-011（categories 唯一费率源）
- `src/db/cardsRepository.ts` / `src/platform/bootstrap.ts`
- SPEC O2（零网络请求）、C9（无 fetch）
