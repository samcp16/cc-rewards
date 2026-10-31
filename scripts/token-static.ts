/**
 * 生成 CSS 里的静态块：文件头说明、焦点环行为、reduced-motion 降级、排版复位、浅色插槽。
 *
 * 这些不是 token（JSON 里没有对应值），但都是 P0 级要求：
 * 焦点环与 reduced-motion 是 A11y 硬要求（SPEC §8），.num 数字容器是信任问题。
 * 丢一个字都会让无障碍不达标，所以原样由脚本输出，不靠手抄。
 *
 * 纯文本数据，无逻辑。约束说明见 gen-tokens.ts 顶部。
 */

const HEADER = `/* ============================================================================
   刷哪张 · Design Tokens v1.0.0
   ---------------------------------------------------------------------------
   本文件由 scripts/gen-tokens.ts 从 design/design-tokens.json 自动生成，请勿手工编辑。
   重新生成：npm run gen:tokens        仅校验：npm run gen:tokens --check

   为什么是生成而不是手写：设计师交付 .json（给程序读）与 .css（给浏览器读）两份，
   两份手工维护必然漂移，而颜色是本项目 P0 门禁的对象（禁止硬编码色值）。
   以 .json 为唯一源，漂移从流程上消失。

   为什么变量名写死在脚本里：变量名属于设计契约（MASTER.md 与 pages/*.md 已按
   这些短名写了实现指引）。命名映射集中在 scripts/gen-tokens.ts 的 CSS_NAME，
   逐条显式声明 —— 机械按 JSON 路径生成会得到 --text-primary 这类与契约不符的名字。

   三条不可协商的边界：
     1. 仅深色。变量挂在 [data-theme="dark"]，同时用 :root 兜底。
        浅色插槽刻意留空 —— SPEC O16 明确不做，写个假的浅色比不写更糟。
     2. 层级靠背景色阶台阶表达，不靠阴影。
     3. 组件里禁止出现裸 hex / rgb()。唯一例外 --on-accent。
   ========================================================================== */`;

/** 焦点环与 reduced-motion 属于 A11y 硬要求，不是色值，原样保留。 */
const STATIC_A11Y = `/* ---------------------------------------------------------------------------
   焦点环行为
   ---------------------------------------------------------------------------
   只用 :focus-visible：鼠标点击不显示环（减少视觉噪音），键盘与读屏用户 100% 可见。
--------------------------------------------------------------------------- */
:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: var(--focus-width) solid var(--focus-color);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm); /* 让环贴合圆角控件，否则环的直角会切到圆角外 */
}

/* 全局兜底：禁止用 outline: none 灭掉焦点（ESLint 侧另有规则拦截） */
:where(a, button, input, select, textarea, summary, [tabindex]):focus:not(:focus-visible) {
  outline: none;
}

/* ---------------------------------------------------------------------------
   prefers-reduced-motion（SPEC §8 硬要求）
   ---------------------------------------------------------------------------
   全部时长降为 0.01ms，颜色过渡也一起关。
   用 0.01ms 而不是 0ms：部分浏览器对 0ms 的 transitionend 不触发，
   依赖 transitionend 的逻辑（如 accordion 展开后 focus）会挂住。
--------------------------------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-instant: 0.01ms;
    --motion-fast: 0.01ms;
    --motion-base: 0.01ms;
    --motion-answer: 0.01ms;
    --motion-expand: 0.01ms;
    --motion-progress: 0.01ms;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important; /* 本项目本不该有循环动画 */
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}`;

/** 排版复位与数字工具类。.num 是「改金额时数字宽度不跳」的实现，属信任问题。 */
const STATIC_BASE = `/* ---------------------------------------------------------------------------
   基础排版复位
   ---------------------------------------------------------------------------
   只做本产品需要的部分，不做完整 reset（Tailwind preflight 已覆盖其余）。
--------------------------------------------------------------------------- */
:root {
  color-scheme: dark; /* 让原生控件（日期选择、滚动条）跟着深色走，否则会出现刺眼白块 */
}

body {
  background-color: var(--surface-0);
  color: var(--fg);
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-body);
  letter-spacing: var(--tracking-body);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  -webkit-text-size-adjust: 100%;
}

/* 数字容器：所有金额 / 费率 / 百分比必须带 .num 或 data-num。
   目标是「改金额时数字宽度不跳」—— 这是信任问题，不是美观问题。 */
.num,
[data-num] {
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
  font-feature-settings: var(--numeric-feature);
  letter-spacing: 0; /* 字距会让 tabular 对齐失效 */
}

/* 金额列一律右对齐：中文用户扫读数字沿小数点对齐 */
.num-right {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-feature-settings: var(--numeric-feature);
}`;

const FOOTER = `/* ---------------------------------------------------------------------------
   浅色插槽（刻意留空）
   ---------------------------------------------------------------------------
   SPEC O16 与用户 Phase 1 决策均明确「仅深色」。一套做对 4 个语义色的对比度
   接近重做，写一个不达标的浅色比不写更糟。

   将来若要做，唯一需要改的是上面第 1–3 段的颜色变量：组件层全部引用语义名，
   不需要改任何组件代码。这就是「语义名挂 data-theme」的价值。
--------------------------------------------------------------------------- */
/* :root[data-theme="light"] { ... 待实现（不属 MVP 范围） } */`;

export { FOOTER, HEADER, STATIC_A11Y, STATIC_BASE };
