/**
 * design-tokens.json → CSS 变量名的显式映射表。
 *
 * 本文件只有数据，没有逻辑；逻辑在 gen-tokens.ts。
 * 拆开的理由：单文件 ≤300 行硬规则（code-organization），
 * 而映射表天然是数据量大头（100+ 条、每条都要带契约注释），
 * 混在生成逻辑里会把「改一个变量名」变成「在 700 行里找位置」。
 *
 * 改动约束见 gen-tokens.ts 顶部说明 —— 变量名属于设计契约，
 * 新增 token 必须同时出现在 CSS_NAME（或 DERIVED）与 SECTIONS 的 order 里，
 * 漏一处脚本会直接报错。
 */

import type { Emitted } from './gen-tokens';

/** [JSON 源路径, CSS 变量名, 可选的注释覆盖] */
const CSS_NAME: Array<[string, string, string?]> = [
  // --- Surface 台阶 --------------------------------------------------------
  ['color.surface.0', '--surface-0', '页面底色。不是纯黑：#000 在 OLED 上会与边框产生糖化边缘'],
  ['color.surface.1', '--surface-1', '一级面板：答案卡、顶栏、TabBar、列表容器'],
  ['color.surface.2', '--surface-2', '二级面板：未选中段按钮、输入框底'],
  ['color.surface.3', '--surface-3', '三级面板：选中段按钮、bottom sheet 本体'],
  ['color.surface.4', '--surface-4', '四级面板：popover、日期弹层。全项目到此为止'],

  // --- 行级底色 ------------------------------------------------------------
  ['row.championBg', '--row-champion', '冠军行整行底色。1.16:1，不做左侧彩色条纹'],
  ['row.hoverBg', '--row-hover', undefined],
  ['row.raised', '--row-raised', '抬起块：段控件滑块。浅色=最白，深色=更亮，方向相反'],

  // --- 文字 ----------------------------------------------------------------
  ['color.text.primary', '--fg', '主文本 / 卡名 / 主角数字'],
  ['color.text.secondary', '--fg-2', '次级文本：渠道行、解释句'],
  ['color.text.tertiary', '--muted', '三级：字段标签、列头、少赚差值、零净返'],
  ['color.text.meta', '--meta', '四级：核实日期、计数'],
  ['color.text.disabled', '--disabled', '禁用态。必须同时带 aria-disabled，不靠颜色单独传达'],
  ['color.text.onAccent', '--on-accent', 'accent 填充上的文字。全项目唯一允许的纯白'],

  // --- 边框 ----------------------------------------------------------------
  ['color.border.subtle', '--line-subtle', '1px 分隔线，只做边界暗示'],
  ['color.border.default', '--line', '控件边框'],
  ['color.border.strong', '--line-strong', '选中态描边 / 进度条轨道'],

  // --- 语义色 --------------------------------------------------------------
  ['color.semantic.pos.value', '--pos', '省钱 / 正净返。降饱和绿，满饱和在 40px 上会发光'],
  ['color.semantic.pos.tint', '--pos-tint', undefined],
  ['color.semantic.neg.value', '--neg', '亏钱 / 倒贴。仅真亏钱使用'],
  ['color.semantic.neg.tint', '--neg-tint', undefined],
  ['color.semantic.warn.value', '--warn', '警示：额度 >= 80%、优惠 <= 60 天到期、数据待核对'],
  ['color.semantic.warn.tint', '--warn-tint', undefined],
  ['color.semantic.info.value', '--info', '信息：DCC 提示、来源说明、豁免生效'],
  ['color.semantic.info.tint', '--info-tint', undefined],

  // --- 强调色 --------------------------------------------------------------
  ['color.accent.base', '--accent', '只做填充色。做 15px 以下文字仅 3.54:1，用 --accent-text'],
  ['color.accent.hover', '--accent-hover', undefined],
  ['color.accent.active', '--accent-active', undefined],
  ['color.accent.text', '--accent-text', '蓝色文字与图标必须用这个'],
  ['color.accent.tint', '--accent-tint', undefined],

  // --- 字体族与字重 --------------------------------------------------------
  ['font.family.display', '--font-display', undefined],
  ['font.family.body', '--font-body', undefined],
  ['font.family.num', '--font-num', '金额/费率专用，必须配 tabular-nums'],
  ['font.family.mono', '--font-mono', '仅规则代码与 capId 展示，不用于金额'],
  ['font.weight.read', '--fw-read', undefined],
  ['font.weight.emphasize', '--fw-emphasize', undefined],
  ['font.weight.announce', '--fw-announce', undefined],

  // --- 字号阶梯 ------------------------------------------------------------
  ['font.size.2xs', '--text-2xs', '11px 徽章，必须配 0.06em 字距'],
  ['font.size.xs', '--text-xs', undefined],
  ['font.size.sm', '--text-sm', undefined],
  ['font.size.base', '--text-base', '正文基准。手机上 14px 才是对的'],
  ['font.size.md', '--text-md', undefined],
  ['font.size.lg', '--text-lg', undefined],
  ['font.size.xl', '--text-xl', undefined],
  ['font.size.2xl', '--text-2xl', '次级金额 / 额度页 KPI'],
  ['font.size.3xl', '--text-3xl', '金额主角 48px。全屏只允许 1–2 处'],

  // --- 行高（JSON 未单列，来自 font.size.*.lineHeight）---------------------
  ['font.size.2xl.lineHeight', '--leading-tight', undefined],
  ['font.size.xl.lineHeight', '--leading-snug', undefined],
  ['font.size.md.lineHeight', '--leading-normal', undefined],
  ['font.size.base.lineHeight', '--leading-body', undefined],

  // --- 字距 ----------------------------------------------------------------
  ['font.tracking.display', '--tracking-display', undefined],
  ['font.tracking.heading', '--tracking-heading', undefined],
  ['font.tracking.body', '--tracking-body', '中文正文必须 0，负字距会让汉字粘连'],
  ['font.tracking.label', '--tracking-label', undefined],
  ['font.tracking.caps', '--tracking-caps', undefined],
  ['font.feature.tabular', '--numeric-feature', '所有数字容器强制开启'],

  // --- 间距 ----------------------------------------------------------------
  ['space.0', '--space-0', undefined],
  ['space.1', '--space-1', undefined],
  ['space.2', '--space-2', undefined],
  ['space.3', '--space-3', undefined],
  ['space.4', '--space-4', undefined],
  ['space.5', '--space-5', undefined],
  ['space.6', '--space-6', undefined],
  ['space.8', '--space-8', undefined],
  ['space.10', '--space-10', undefined],
  ['space.12', '--space-12', undefined],
  ['space.16', '--space-16', undefined],

  // --- 尺寸 ----------------------------------------------------------------
  ['size.topBar', '--size-topbar', undefined],
  ['size.tabBar', '--size-tabbar', undefined],
  ['size.touchMin', '--size-touch', 'WCAG 2.5.5 最小命中区。视觉可小，命中区必须撑满'],
  ['size.segBtn', '--size-seg', undefined],
  ['size.amountInput', '--size-amount-input', undefined],
  ['size.listRow', '--size-row-list', undefined],
  ['size.compareRow', '--size-row-compare', undefined],
  ['size.pill', '--size-pill', '视觉高 36px，命中区仍需 44px'],
  ['size.icon.inline', '--icon-inline', undefined],
  ['size.icon.button', '--icon-button', undefined],
  ['size.icon.standalone', '--icon-standalone', undefined],
  ['size.progressBar.thin', '--bar-thin', undefined],
  ['size.progressBar.normal', '--bar-normal', undefined],
  ['size.container.maxDesktop', '--container-desktop', undefined],
  ['size.bottomSheetMaxHeight', '--sheet-max-h', undefined],

  // --- 圆角 ----------------------------------------------------------------
  ['radius.none', '--radius-none', undefined],
  ['radius.sm', '--radius-sm', undefined],
  ['radius.md', '--radius-md', undefined],
  ['radius.lg', '--radius-lg', '卡片上限 12px。更大的圆角是 AI 味的明显指纹'],
  ['radius.pill', '--radius-pill', undefined],

  // --- 层级 / 阴影 ---------------------------------------------------------
  // elevation.flat / ring / raised 在 JSON 里含裸 hex 与 rgba，直接输出等于把
  // 色值写进生成物两次；改用 var() 引用上方的颜色变量，色值仍然只有一处来源。
  ['elevation.flat', '--elev-flat', undefined],
  ['elevation.zIndex.base', '--z-base', undefined],
  ['elevation.zIndex.stickyAnswer', '--z-sticky-answer', undefined],
  ['elevation.zIndex.tabBar', '--z-tabbar', undefined],
  ['elevation.zIndex.fab', '--z-fab', undefined],
  ['elevation.zIndex.sheetScrim', '--z-sheet-scrim', undefined],
  ['elevation.zIndex.sheet', '--z-sheet', undefined],
  ['elevation.zIndex.toast', '--z-toast', undefined],

  // --- 动效 ----------------------------------------------------------------
  ['motion.duration.instant', '--motion-instant', undefined],
  ['motion.duration.fast', '--motion-fast', undefined],
  ['motion.duration.base', '--motion-base', undefined],
  ['motion.duration.answer', '--motion-answer', 'SPEC 锁定的 200ms'],
  ['motion.duration.expand', '--motion-expand', undefined],
  ['motion.duration.progress', '--motion-progress', '全项目最长动效，不得超越'],
  ['motion.easing.standard', '--ease-standard', undefined],
  ['motion.easing.exit', '--ease-exit', '仅用于元素离场'],
  ['motion.easing.progress', '--ease-progress', undefined],
];


/**
 * JSON 里没有、由其它变量组合出来的派生变量。
 * 单列一张表而不是散在模板字符串里，是为了让「哪些变量不是直接来自 JSON」
 * 一目了然 —— 这类变量最容易被误当成可手改的普通值。
 */
const DERIVED: Emitted[] = [
  {
    source: 'color.confidence.*',
    name: '--conf-high',
    value: 'var(--muted)',
    comment: 'high 不给徽章，正常显示',
  },
  {
    source: 'color.confidence.*',
    name: '--conf-medium',
    value: 'var(--muted)',
    comment: '详情内注来源，列表不加徽章',
  },
  {
    source: 'color.semantic.warn.*',
    name: '--conf-low-fg',
    value: 'var(--warn)',
    comment: '「待核对」黄字',
  },
  {
    source: 'color.semantic.warn.*',
    name: '--conf-low-bg',
    value: 'var(--warn-tint)',
  },
  {
    source: 'color.confidence.unknown',
    name: '--conf-unknown-fg',
    value: 'var(--muted)',
    comment: '「未知」灰字。unknown 表示我们不知道，不是卡不好，故不用 neg 色',
  },
  {
    source: 'color.confidence.unknown',
    name: '--conf-unknown-bg',
    value: 'var(--line)',
  },
  {
    source: 'elevation.ring',
    name: '--elev-ring',
    value: '0 0 0 1px var(--line-subtle)',
    /* 浅色下 1px 环在白面上几乎不可见，改用真实微阴影 —— 浅色主题的厚度靠光影，
       深色主题的厚度靠色阶（见 elevation.$comment）。这里必须分主题给值，
       否则浅色界面的所有卡片都会「贴死」在背景上，看起来像印刷品而不是界面 */
    lightValue: '0 1px 2px rgba(18, 24, 38, 0.07), 0 0 0 1px var(--line-subtle)',
    comment: '1px 环比 border 更可控，不参与布局计算',
  },
  {
    source: 'elevation.raised',
    name: '--elev-raised',
    value: '0 8px 24px rgba(0, 0, 0, 0.48), 0 0 0 1px var(--line)',
    lightValue: '0 8px 28px -10px rgba(18, 24, 38, 0.18), 0 0 0 1px var(--line)',
    comment: '仅 3 处：FAB / popover / bottom sheet 上缘',
  },
  {
    source: 'a11y.focus',
    name: '--focus-width',
    value: '3px',
  },
  {
    source: 'a11y.focus',
    name: '--focus-offset',
    value: '2px',
  },
  {
    source: 'a11y.focus',
    name: '--focus-color',
    value: 'var(--accent-text)',
    comment: '所有台阶上都清晰',
  },
  {
    source: 'platform.safeArea',
    name: '--safe-top',
    value: 'env(safe-area-inset-top, 0px)',
  },
  {
    source: 'platform.safeArea',
    name: '--safe-bottom',
    value: 'env(safe-area-inset-bottom, 0px)',
  },
  {
    source: 'platform.safeArea',
    name: '--safe-left',
    value: 'env(safe-area-inset-left, 0px)',
  },
  {
    source: 'platform.safeArea',
    name: '--safe-right',
    value: 'env(safe-area-inset-right, 0px)',
  },
  {
    source: 'platform.safeArea',
    name: '--content-pad-bottom',
    value: 'calc(var(--size-tabbar) + var(--safe-bottom))',
    comment: '滚动内容底部预留，漏了会被 TabBar 遮住',
  },
];

export { CSS_NAME, DERIVED };
