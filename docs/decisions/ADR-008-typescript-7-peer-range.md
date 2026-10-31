# ADR-008: TypeScript 7.0.2 与 typescript-eslint 8.72.1 的共存方案

## Status: Accepted (2026-10-31)

## Background

SPEC §4 锁定 TypeScript 7.0.2（原生编译器，tsc 速度提升一个量级）。但 typescript-eslint 8.72.1 存在两层不兼容：

1. **peer range**：`typescript >=4.8.4 <6.1.0`。npm install 会报 ERESOLVE。
2. **运行时硬断言**：`@typescript-eslint/parser/dist/index.js` 与 `typescript-eslint/dist/index.js` 都写了
   `if (versionMajor >= 7) throw new Error('typescript-eslint does not support TS 7.0.')`。
   它读的是 `require('typescript').versionMajorMinor`，不看 peer range。

第二层意味着「放宽 peer range」（npm overrides 或 --legacy-peer-deps）只能骗过 install，骗不过 lint 的第一次运行。typescript-eslint 官方在 TS 7.0 发布说明中给出的兼容路径是双版本并存（side-by-side）：类型检查用 TS 7，lint 用 TS 6，等 typescript-eslint 适配 TS ≥7.1（跟踪 issue 10940）。

## Decision

1. **项目编译与类型检查全部用 typescript@7.0.2**（`tsc --noEmit` 串在 `npm run build` 里），不动。
2. **lint 用 typescript 6.0.3 副本**，以别名包安装：
   `npm install --save-dev typescript6@npm:typescript@6.0.3`
3. **不使用 `typescript-eslint` umbrella 包**（import 即抛异常），直接加载
   `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`。
4. **模块劫持**：`scripts/run-eslint.mjs` 在加载 ESLint 前覆写 `Module._resolveFilename`，
   把所有对 `typescript` / `typescript/*` 的 require 重定向到 `typescript6` 目录。
   劫持后立即断言 `require('typescript').version` 以 `6.` 开头，静默失败会在该处显式报错。
5. `npm run lint` = `node scripts/run-eslint.mjs`，用 ESLint 的 Node API 而非 CLI 子进程
   （子进程会重新走模块解析，劫持不继承）。

## Consequences

### 正面

- TS 7 的编译速度收益完整保留（引擎 2055 模块的 tsc --noEmit 在亚秒级）。
- lint 的全部 P0 门禁（emoji / hex / 紫粉 / 分层 / toFixed）正常工作，且**已用故意违规的探针文件逐条验证会拦**。
- 升级路径清晰：typescript-eslint 支持 TS 7 后，删 run-eslint.mjs 与 typescript6 依赖、`lint` 脚本改回 `eslint .`，本 ADR 标记 Superseded。

### 负面（诚实记录）

- lint 所用的类型信息来自 TS 6 而非 7。**对本项目可接受**：lint 拦的是 API 用法与字面量内容，
  与 TS 7 的新语义无交集；真正的类型错误由 TS 7 的 tsc 拦住，且在 build 链上先于 lint 提交。
- `Module._resolveFilename` 是 Node 未正式文档化的内部 API。Node 22 稳定可用；
  若未来 Node 移除它，`npm run lint` 会在启动断言处显式失败（不会静默漏检），届时按同样的思路换 `--import` register hook 即可。
- 依赖树里同时存在两份 TypeScript（~50MB 磁盘）。单人项目可忽略。

## Related ADRs

- ADR-001-stack（TS 版本锚定的原始决策）
