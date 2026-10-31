/**
 * CSS 生成物的分段标题与段内变量顺序。
 *
 * `order` 是段内变量名的显式顺序 —— 不按映射表顺序自动切片，
 * 因为派生变量（--conf-* / --elev-* / --safe-*）来自另一张表，
 * 按位置切片会把它们漏在段外（这个 bug 踩过一次，见 gen-tokens.ts 的
 * buildCss 反向校验：任何没归属到段的变量都会让脚本直接报错）。
 *
 * 数据来源约束同 token-map.ts。
 */

/**
 * 段标题。变量按段输出，段顺序即 CSS 里的阅读顺序。
 *
 * `order` 是段内变量名的显式顺序 —— 不用「按 CSS_NAME 顺序切片」，
 * 因为派生变量（--conf-* / --elev-* / --safe-*）来自另一张表，
 * 按位置切片会把它们漏在段外（这个 bug 已经踩过一次）。
 */
export const SECTIONS: Array<{ title: string; note: string; order: string[] }> = [
  {
    title: '1. 色板 — 层级台阶（Surface / 行底色 / 文字 / 边框）',
    note: '深色主题的层级不是越亮越靠前，而是越亮越靠前一层。5 级台阶差值刻意做小，台阶差一大界面立刻显廉价。',
    order: [
      '--surface-0',
      '--surface-1',
      '--surface-2',
      '--surface-3',
      '--surface-4',
      '--row-champion',
      '--row-hover',
      '--fg',
      '--fg-2',
      '--muted',
      '--meta',
      '--disabled',
      '--on-accent',
      '--line-subtle',
      '--line',
      '--line-strong',
    ],
  },
  {
    title: '2. 语义色与强调色',
    note: '铁律（SPEC §8）：颜色永不单独承担语义。金额强制带正负号，倒贴写「倒贴」，未知写「未知」。颜色只做第二遍阅读时的加速，第一遍靠文字与符号。',
    order: [
      '--pos',
      '--pos-tint',
      '--neg',
      '--neg-tint',
      '--warn',
      '--warn-tint',
      '--info',
      '--info-tint',
      '--accent',
      '--accent-hover',
      '--accent-active',
      '--accent-text',
      '--accent-tint',
    ],
  },
  {
    title: '3. 置信度（数据可信度，不是收益语义）',
    note: 'unknown 是「我们不知道」，不是「这张卡不好」。所以置信度体系完全不用 pos/neg —— 用了会让用户把没数据读成亏钱。',
    order: [
      '--conf-high',
      '--conf-medium',
      '--conf-low-fg',
      '--conf-low-bg',
      '--conf-unknown-fg',
      '--conf-unknown-bg',
    ],
  },
  {
    title: '4. 字体',
    note: '中文走系统 PingFang，不加载 webfont（SPEC O17）。数字不用等宽，用 tabular-nums —— 对齐效果一样但更紧凑。',
    order: [
      '--font-display',
      '--font-body',
      '--font-num',
      '--font-mono',
      '--fw-read',
      '--fw-emphasize',
      '--fw-announce',
      '--text-2xs',
      '--text-xs',
      '--text-sm',
      '--text-base',
      '--text-md',
      '--text-lg',
      '--text-xl',
      '--text-2xl',
      '--leading-tight',
      '--leading-snug',
      '--leading-normal',
      '--leading-body',
      '--tracking-display',
      '--tracking-heading',
      '--tracking-body',
      '--tracking-label',
      '--tracking-caps',
      '--numeric-feature',
    ],
  },
  {
    title: '5. 间距（4px 基准网格）',
    note: '只允许这些值。5 / 7 / 13 / 15 / 22 / 30 会让对齐在累积误差后崩掉。',
    order: [
      '--space-0',
      '--space-1',
      '--space-2',
      '--space-3',
      '--space-4',
      '--space-5',
      '--space-6',
      '--space-8',
      '--space-10',
      '--space-12',
      '--space-16',
    ],
  },
  {
    title: '6. 尺寸与安全区',
    note: '前端不要用 padding 拼这些高度：拼出来的高度在字体切换时会抖 1–2px，而本产品最怕抖动。安全区漏一处就会出现按钮被 Home 条盖住。',
    order: [
      '--size-topbar',
      '--size-tabbar',
      '--size-touch',
      '--size-seg',
      '--size-amount-input',
      '--size-row-list',
      '--size-row-compare',
      '--size-pill',
      '--icon-inline',
      '--icon-button',
      '--icon-standalone',
      '--bar-thin',
      '--bar-normal',
      '--container-desktop',
      '--sheet-max-h',
      '--safe-top',
      '--safe-bottom',
      '--safe-left',
      '--safe-right',
      '--content-pad-bottom',
    ],
  },
  {
    title: '7. 圆角',
    note: '对比表与列表行用 0：它们靠分隔线组织，加圆角会变成一堆卡片、破坏密度。',
    order: ['--radius-none', '--radius-sm', '--radius-md', '--radius-lg', '--radius-pill'],
  },
  {
    title: '8. 层级 / 阴影',
    note: '近黑底上投影 = 更黑的黑，视觉增益趋近 0。层级用背景台阶 + 1px 边框表达，shadow 只保留给真正浮起的元素。',
    order: [
      '--elev-flat',
      '--elev-ring',
      '--elev-raised',
      '--z-base',
      '--z-sticky-answer',
      '--z-tabbar',
      '--z-fab',
      '--z-sheet-scrim',
      '--z-sheet',
      '--z-toast',
    ],
  },
  {
    title: '9. 动效',
    note: 'SPEC §8 硬上限：答案 200ms、额度条 400ms。只允许动 transform 与 opacity，动 width/height 会触发 layout 掉帧。',
    order: [
      '--motion-instant',
      '--motion-fast',
      '--motion-base',
      '--motion-answer',
      '--motion-expand',
      '--motion-progress',
      '--ease-standard',
      '--ease-exit',
      '--ease-progress',
    ],
  },
  {
    title: '10. 焦点环',
    note: '只用 :focus-visible。鼠标点击不显示环，键盘与读屏用户 100% 可见。这两件事不矛盾，可以同时做到。',
    order: ['--focus-width', '--focus-offset', '--focus-color'],
  },
];
