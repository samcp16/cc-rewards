/**
 * 浅色主题覆盖表 —— design-tokens.json 里 `light` / `lightTint` / `lightBg` 字段 → CSS 变量。
 *
 * 为什么不复用 token-map.ts：
 *
 * 深色映射走的是「叶子节点」路径（`color.semantic.pos.value`），因为那里取值就是字符串本身。
 * 但浅色值不能挂在字符串上 —— `pos.value` 是 "#3DD68C"，给它加子字段需要把 JSON 改成
 * `{ value: { dark, light } }`，那会让已有的 CSS_NAME 映射、tokens-reference.json、
 * 以及设计师文档里的写法全部失效。
 *
 * 所以浅色值挂在**最近的祖先对象**上（`color.semantic.pos.light`），并在这里显式声明
 * 每个变量该读哪个字段。字段三选一：
 *   light      —— 主色（surface / 文字 / 语义色 / 强调色）
 *   lightTint  —— 极淡底（--pos-tint 这类）
 *   lightBg    —— 徽章底（--conf-low-bg 这类）
 *
 * 缺字段时 gen-tokens **直接报错**，不静默跳过。浅色主题少一个变量不会白屏，
 * 但会在某个页面上显示成深色主题的残留值 —— 那比白屏难查得多。
 */

/** [JSON 源路径, CSS 变量名, 读取字段] */
export const LIGHT_NAME: Array<[string, string, 'light' | 'lightTint' | 'lightBg']> = [
  // --- Surface 台阶 --------------------------------------------------------
  ['color.surface.0', '--surface-0', 'light'],
  ['color.surface.1', '--surface-1', 'light'],
  ['color.surface.2', '--surface-2', 'light'],
  ['color.surface.3', '--surface-3', 'light'],
  ['color.surface.4', '--surface-4', 'light'],

  // --- 行级底色 ------------------------------------------------------------
  ['row.championBg', '--row-champion', 'light'],
  ['row.hoverBg', '--row-hover', 'light'],
  ['row.raised', '--row-raised', 'light'],

  // --- 文字 ----------------------------------------------------------------
  ['color.text.primary', '--fg', 'light'],
  ['color.text.secondary', '--fg-2', 'light'],
  ['color.text.tertiary', '--muted', 'light'],
  ['color.text.meta', '--meta', 'light'],
  ['color.text.disabled', '--disabled', 'light'],
  ['color.text.onAccent', '--on-accent', 'light'],

  // --- 边框 ----------------------------------------------------------------
  ['color.border.subtle', '--line-subtle', 'light'],
  ['color.border.default', '--line', 'light'],
  ['color.border.strong', '--line-strong', 'light'],

  // --- 语义色 --------------------------------------------------------------
  ['color.semantic.pos', '--pos', 'light'],
  ['color.semantic.pos', '--pos-tint', 'lightTint'],
  ['color.semantic.neg', '--neg', 'light'],
  ['color.semantic.neg', '--neg-tint', 'lightTint'],
  ['color.semantic.warn', '--warn', 'light'],
  ['color.semantic.warn', '--warn-tint', 'lightTint'],
  ['color.semantic.info', '--info', 'light'],
  ['color.semantic.info', '--info-tint', 'lightTint'],

  // --- 强调色 --------------------------------------------------------------
  ['color.accent.base', '--accent', 'light'],
  ['color.accent.hover', '--accent-hover', 'light'],
  ['color.accent.active', '--accent-active', 'light'],
  ['color.accent.text', '--accent-text', 'light'],
  ['color.accent.tint', '--accent-tint', 'light'],

  /* 置信度四色刻意不在此表：--conf-* 是派生变量（= var(--warn) / var(--muted) / var(--line)），
     上游一变它就跟着变。在这里再覆盖一遍等于给同一件事两个来源，迟早漂移。 */
];
