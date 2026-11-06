# ADR-001: 采用 React 19 + Vite 8 + TypeScript 7 作为前端技术栈

## Status

Accepted (2026-10-31)

## Background

本产品是单人自用的信用卡返现决策工具，运行在手机浏览器，无后端、无用户体系。核心诉求按优先级：

1. 3 秒内出结果（打开即用）
2. 单人可维护（出问题能自己修、能搜到答案）
3. 金额运算必须正确（算错比没有更糟）
4. 交付越快越好

候选方案：原生 HTML + 原生 JS、React + Vite、Vue 3 + Vite、Svelte 5 + Vite、Next.js 15。

已通过 `npm view` 核实候选版本（2026-10-31）：react 19.3.1、vite 8.3.5、typescript 7.0.2（`latest` 标签）、vue 最新、svelte 最新、next 最新。Vite 8 的 `engines` 要求 `^20.19.0 || >=22.12.0`，本机 Node 22.13.1 满足。

## Decision

锁定：

| 包 | 版本 |
|---|---|
| react / react-dom | 19.3.1 |
| vite | 8.3.5 |
| typescript | 7.0.2 |
| @vitejs/plugin-react | 6.1.2（peer 要求 vite ^8.0.0，已核） |
| @types/react / @types/react-dom | 19.3.0 |

排除理由：

- **原生 JS**：卡规则是嵌套结构（条件 + 多轨道收益 + 上限池引用），无类型系统时"把百分比当金额"这类错误无法在编译期拦住。违反诉求 3。
- **Next.js**：本产品零 SSR 需求、零 SEO 需求、零服务端数据。RSC 与 hydration 的成本换来的是完全用不上的能力。违反诉求 1。
- **Svelte**：单人排错时社区答案量不足，违反诉求 2。
- **Vue**：与 React 等价可行，但 `dexie-react-hooks`、`lucide-react`、Testing Library 的 React 适配成熟度更高。

## Consequences

正面：

- 静态构建产物（`dist/`），部署即静态托管，零运维
- Vite 8 冷启动 <300ms，热更新即时，开发迭代快
- TypeScript 7 在编译期拦住金额/百分比类型混用
- 生态最厚：Dexie hooks、Lucide、Vitest、Testing Library 全部一等支持

负面：

- React 19 + Vite 8 均为较新版本，极少数第三方库可能尚未跟进（已核本项目全部依赖的 peer 声明，均兼容）
- TypeScript 7 是原生 Go 编译器重写版本，个别旧插件可能不兼容（本项目只用 `typescript-eslint` 8.72.1，已核支持）

## Related ADRs

ADR-002（持久化）、ADR-006（样式）
