# ADR-002: 采用 Dexie 4 + IndexedDB 作为唯一持久化方案

## Status

Accepted (2026-10-31)

## Background

需要本地保存三类结构化数据：

- 卡库与规则：约 30 张卡 × 8 条规则 = 240 条规则，含嵌套的 `earn[]` 与 `capIds[]`
- 账本：12 个月 × 200 笔/月 = 2400 条
- 参数：积分估值、UI 偏好

总量估算 < 1 MB。但需要按 `cardId`、`periodKey`、`capId` 查询与归集。

候选：localStorage、IndexedDB + Dexie、localStorage 混合方案、SQLite WASM。

已核版本：dexie 4.4.7（`latest`）、dexie-react-hooks 4.4.0。

## Decision

**Dexie 4.4.7 + IndexedDB 承担全部结构化数据。localStorage 仅存 UI 偏好与一个 `storage-probe` 标记（用于检测数据被清空）。**

排除理由：

- **localStorage**：同步阻塞主线程，每次读写都要整串 `JSON.parse`/`stringify`。2400 条账本每次查询都 parse 一遍，直接违反"3 秒出结果"。且无索引，无法按 `periodKey` 范围查询。
- **混合方案（localStorage 存配置 + IndexedDB 存账本）**：双写一致性成本高，且会产生"两份真相"，是本项目最该避免的 bug 类型。
- **SQLite WASM**：产物 +2-3 MB，为 1 MB 数据引入完整数据库引擎，是过度设计。

## Consequences

正面：

- 全异步，不阻塞主线程
- 内建索引：`cardId`、`periodKey`、`[cardId+periodKey]` 复合索引
- `version().stores()` 提供版本化 schema 迁移路径
- `dexie-react-hooks@4.4.0` 的 `useLiveQuery` 让账本变更自动触发 UI 重算，省掉自建状态层（配合 ADR 中的"不引入状态管理"决策）
- 事务支持：写账本 + 更新上限归集可原子完成

负面：

- IndexedDB 是"best-effort"存储，会被浏览器回收。iOS Safari 对未安装站点有 7 天清除策略。此风险不由本 ADR 承担，由数据安全三道防线（见 ARCHITECTURE §4.3）与 ADR-004 的"无后端"代价声明共同应对
- Dexie 是额外依赖（含 Dexie 本体与 React 适配共 2 个包），但换来的是省掉自建 ORM 与状态层

## Related ADRs

ADR-001（技术栈）、ADR-004（不做后端）、ADR-005（上限账本）
