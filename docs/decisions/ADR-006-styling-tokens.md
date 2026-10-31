# ADR-006: 样式采用 Tailwind CSS 4 `@theme` Design Token

## Status

Accepted (2026-10-31)。本 ADR 落实团队 P0 规则：禁止硬编码颜色，全部走 Design Token；禁止紫色到粉色渐变方案。

## Background

需要一套能**从机制上**保证"不存在硬编码颜色"的样式方案，而不是靠"大家自觉别写 hex"。

候选：手写 CSS + CSS 变量、Tailwind 4（`@theme`）、CSS-in-JS（styled-components / emotion）、Tailwind 3.4（v3-lts）。

已核版本：tailwindcss 4.3.3（`latest`）、`@tailwindcss/vite` 4.3.3。dist-tags 显示 `v3-lts: 3.4.19`，v4 为当前主线。

## Decision

**Tailwind CSS 4.3.3 + `@tailwindcss/vite` 4.3.3，所有颜色、间距、字号、圆角在 `src/index.css` 的 `@theme` 块中声明。**

排除理由：

- **手写 CSS + CSS 变量**：token 存在，但无 lint 拦截。任何人都能随手写 `color: #a855f7`，P0 规则变成口号。
- **CSS-in-JS**：颜色字符串散落在组件 JS 里，无法集中治理；且 +15 KB 运行时开销，与"3 秒出结果"冲突。
- **Tailwind 3.4（v3-lts）**：v4 已是 `latest`，v3 是 LTS 维护态。新项目无理由选旧版；且 v4 的 `@theme` 是 CSS-first，比 v3 的 JS config 更契合 token 治理。

## Consequences

### 正面

- `@theme` 生成 `--color-*` CSS 变量与对应工具类，**颜色只有一个来源**
- 语义类如 `bg-surface` / `text-primary` 只能来自 token；配合 ESLint `no-restricted-syntax` 禁掉 `bg-[#...]` 任意值，机制上堵死硬编码
- 产物体积小（v4 按需生成，约 10 KB gzip）
- 深色模式只改 token 值即可，不用改任何组件
- `currentColor` 联动 Lucide 图标（见 ADR-003）

### 负面

- Tailwind 4 的 `@theme` 语法与 v3 的 `tailwind.config.js` 不兼容，网上大量 v3 教程不适用。本项目自有文档记录，不构成风险
- 需要额外的 `@tailwindcss/vite` 插件（1 个依赖）

## Token 设计约束（写入 CI 门禁）

1. `@theme` 中**不定义任何 purple / pink 色阶**——从源头断掉"紫色到粉色渐变"方案的可能性（P0 规则第 2 条）。
2. 主色采用中性 + 单一强调色的方案，避免渐变依赖。
3. 禁止 `src/` 下出现：`#` 开头的 hex、`rgb(`、`hsl(`、`bg-[`（任意值颜色）。
4. 禁止内联 `style={{ color: ... }}` 传颜色。
5. 间距只用 4px 基准倍数（Tailwind 默认 scale）。

## 门禁命令

```bash
# 硬编码颜色（必须为空）
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|bg-\[' src/ --include=*.tsx --include=*.ts
```

## Related ADRs

ADR-003（图标，依赖 `currentColor`）
