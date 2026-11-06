# ADR-003: 图标库锁定 lucide-react 1.65.0

## Status

Accepted (2026-10-31)。本 ADR 落实团队 P0 规则第 1 条：必须在 Spec 中锁定一套 SVG 图标库，全项目统一不混用。

## Background

团队 P0 绝对规则要求锁定唯一 SVG 图标库，且禁止 emoji 作功能图标。本产品需要图标表达：

- 7 个消费类别：餐饮、超市、加油、机票、酒店、网购、其他
- 5 个支付渠道：刷卡、支付宝、微信、云闪付、Apple Pay
- 卡组织：Visa、Mastercard、银联、Amex
- 通用 UI：返回、添加、编辑、删除、警告、设置、导出、导入

候选：Lucide、Heroicons、Tabler Icons、Phosphor。

已核版本：lucide-react 1.65.0（`latest`），peer 声明 `react: ^16.5.1 || ^17 || ^18 || ^19`，与 React 19.3.1 兼容。

## Decision

**锁定 `lucide-react@1.65.0` 为全项目唯一图标来源。** 禁止引入任何第二个图标库，禁止内联手写 `<svg>`（唯一例外：`public/` 下的 PWA 应用图标与 favicon）。

排除理由：

- **Heroicons**：约 600 个图标，且分 outline / solid 两套并行风格。类目覆盖不足以表达「超市 / 加油 / 机票 / 酒店」全部消费类别；两套风格混用极易造成视觉不一致。
- **Tabler Icons**：5700+，数量最多，但 1.5px stroke 与常见 iOS 风格 UI 略不协和。
- **Phosphor**：9000+ 且提供 6 套字重（thin/light/regular/bold/fill/duotone）。字重选项过多在单人项目中必然失控。

Lucide 胜出的核心理由：

1. 1600+ 图标，覆盖本产品全部所需语义
2. 统一 2px stroke、24×24 viewBox、`stroke="currentColor"`——颜色完全跟随 Design Token，天然满足"禁止硬编码颜色"
3. 每个图标独立入口，tree-shaking 彻底（产物中只含实际使用的图标）
4. ISC 许可，商用无顾虑
5. 与 React 19 一等兼容

## Consequences

正面：

- 全项目视觉一致，无风格漂移
- 颜色由 `currentColor` 驱动，与 Tailwind `@theme` token 自动联动
- 产物体积可控（按需 tree-shake）
- 单一来源，不存在"这个图标在 A 库有、B 库没有"的返工

负面：

- 部分极具体语义（如「银联」标识）Lucide 无原生对应，需用通用图标（如 `CreditCard`）替代，或用文字标签。这是可接受的取舍：图标是辅助识别，文字才是主信息
- 升级需整个项目同步，不能局部升级

## 使用纪律（写入 Phase 2 契约，CI 强制）

1. 只允许白名单导入：

```ts
import {
  // 类别
  Utensils, ShoppingCart, Fuel, Plane, Hotel, ShoppingBag, MoreHorizontal,
  // 渠道
  CreditCard, Wallet, MessageCircle, QrCode, Smartphone,
  // UI
  ArrowLeft, Plus, Pencil, Trash2, AlertTriangle, Settings,
  Download, Upload, Check, X, ChevronRight,
} from 'lucide-react';
```

2. 禁止 emoji 作为功能图标（P0）。CI 用 `grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' src/` 门禁。
3. `size` 只允许 `16 | 20 | 24` 三档；颜色只允许 `currentColor`（不传 `color` prop，用 CSS 控制）。
4. 禁止 `import * as Icons from 'lucide-react'`（会打包全部图标）。

## Related ADRs

ADR-006（样式与 Design Token，`currentColor` 的落点）
