// @ts-check
import js from '@eslint/js';
import css from '@eslint/css';
import globals from 'globals';
import { createRequire } from 'node:module';

/**
 * ESLint 配置 —— 门禁优先。
 *
 * 本文件不是「风格检查」，而是把 SPEC 的 P0 硬规则翻译成机器可校验的条目。
 * 一条规则对应一条可被指认的违约，注释里写明它在防什么。
 *
 * 四类门禁（SPEC §8 / ARCHITECTURE §6.1 C1–C9）：
 *
 *   G1 禁 emoji 作功能图标      —— C4。emoji 字形随系统变、不跟随 currentColor，
 *                                  做不了图标，也不受设计 token 控制。
 *   G2 禁硬编码颜色              —— C3。唯一例外 #fff / #000。
 *   G3 禁紫粉色系                —— 团队级 P0 规则。从 lint 层断掉可能。
 *   G4 分层依赖                  —— C1 / C2。domain 不许碰 React/浏览器，
 *                                  data 不许反向 import domain。
 *
 * ── 关于 TypeScript 版本（重要，改这里之前先读完）──────────────────────────
 * 项目编译用 TS 7.0.2（SPEC §4 锁定），但 typescript-eslint 8.72.1 在
 * dist/index.js 里硬编码了 `if (versionMajor >= 7) throw`，且 peer 声明
 * `typescript >=4.8.4 <6.1.0`。官方给出的兼容路径是「双版本并存」：
 * 类型检查走 TS 7，lint 走 TS 6（见 TS 7.0 发布说明的 running-side-by-side 一节）。
 *
 * 因此这里**不 use `typescript-eslint` 的 umbrella 包**（它一 import 就执行版本
 * 断言然后抛异常），改为直接加载 @typescript-eslint/parser 与 eslint-plugin，
 * 并显式把 parser 的 tsconfigRootDir / 项目指向 tsconfig.eslint.json。
 *
 * 代价：lint 的类型信息来自 TS 6 而不是 7。对本项目可接受 ——
 * lint 拦的是 API 用法与字面量内容（emoji / hex / 分层），
 * 与 TS 7 的新语义无关；真正的类型错误由 `tsc --noEmit`（TS 7）拦住。
 * 决策记录：docs/decisions/ADR-008-typescript-7-peer-range.md
 * ───────────────────────────────────────────────────────────────────────────
 */

const require = createRequire(import.meta.url);

/**
 * TS 6 解析别名（ADR-008 双版本方案的落地机制）。
 *
 * `@typescript-eslint/parser` 在模块顶层执行 `require('typescript')` 并断言
 * versionMajor < 7，失败即 throw。Node 的模块缓存无法事后替换，所以必须在
 * **加载 parser 之前**把 'typescript' 这个说明符指向 typescript6 包。
 *
 * 做法：先 resolve 出 typescript6 的真实入口，写进 require.cache 的
 * 'typescript' 键，parser 随后 require 时直接命中缓存，不再解析到 TS 7。
 * 这是 ADR-008 里「lint 走 TS 6」的具体实现，不依赖任何全局环境变量 ——
 * `npm run lint` 在干净 clone 上开箱即用。
 */
const ts6Entry = require.resolve('typescript6');
if (!require.cache[require.resolve('typescript')]) {
  require.cache[require.resolve('typescript')] = require.cache[ts6Entry] ?? {
    id: require.resolve('typescript'),
    filename: ts6Entry,
    loaded: true,
    exports: require('typescript6'),
    children: [],
    paths: [],
  };
}

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

/** emoji 与常见图形符号区间。ASCII 不在内，避免误伤注释里的箭头与破折号。 */
const EMOJI_PATTERN = String.raw`[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]`;

/** 紫粉色系：既拦 hex（常见紫/粉代码），也拦类名与 token 名。 */
const PURPLE_PINK_PATTERN = String.raw`(7C3AED|A855F7|9333EA|C084FC|8B5CF6|6D28D9|5B21B6|EC4899|DB2777|BE185D|F472B6|F9A8D4|purple|pink|fuchsia|violet|magenta)`;

/** hex 色值。#fff / #FFF / #000 / #000000 例外，其余一律拦。 */
const HEX_PATTERN = String.raw`#(?![fF]{3}\b)(?![fF]{6}\b)(?![fF]{8}\b)(?![0]{3}\b)(?![0]{6}\b)[0-9a-fA-F]{3,8}\b`;

/** 颜色函数。rgba/hsl/oklch/color-mix 都不允许出现在 src/。 */
const COLOR_FN_PATTERN = String.raw`\b(rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\s*\(`;

/** 把「字面量里匹配某正则」翻译成三条 no-restricted-syntax 选择器。 */
function literalRules(pattern, message, flags = '') {
  return [
    { selector: `Literal[value=/${pattern}/${flags}]`, message },
    { selector: `TemplateElement[value.raw=/${pattern}/${flags}]`, message },
    // template literal 的 cooked 值才是运行时字符串，raw 漏掉的转义由它兜底
    { selector: `JSXText[value=/${pattern}/${flags}]`, message },
  ];
}

/** src/ 内部通用的三条：emoji / hex / 颜色函数 / 紫粉，各自附带组件写法约束。 */
const SRC_RULES = [
  ...literalRules(EMOJI_PATTERN, 'G1/P0：禁止 emoji。图标只用 lucide-react（SPEC §4 唯一图标库）。', 'u'),
  ...literalRules(
    HEX_PATTERN,
    'G2/P0：禁止硬编码 hex 色值（仅 #fff / #000 例外）。用 var(--surface-0) 或 Tailwind 语义类 bg-surface-0。',
  ),
  ...literalRules(
    COLOR_FN_PATTERN,
    'G2/P0：禁止 rgb()/hsl() 等颜色函数。颜色只能来自 design-tokens.css。',
  ),
  ...literalRules(
    PURPLE_PINK_PATTERN,
    'G3/P0：禁止紫粉色系（团队级规则）。token 中不存在 purple/pink 色阶，不得自行引入。',
    'i',
  ),
  {
    selector: `JSXAttribute[name.name='className'][value.value=/${PURPLE_PINK_PATTERN}/i]`,
    message: 'G3/P0：禁止紫粉色工具类（bg-purple-500 / from-pink-400 等）。',
  },
  {
    selector: `JSXAttribute[name.name='className'][value.value=/shadow-(md|lg|xl|2xl)/]`,
    message:
      'P0：禁止 shadow-md 及以上。深色背景下投影 = 更黑的黑，层级用背景台阶 + 1px 边框（MASTER §11.3 易错点 2）。',
  },
  // className 之外的字符串也可能拼出这些类（如 clsx 参数、常量表），一并拦
  ...literalRules(
    String.raw`shadow-(md|lg|xl|2xl)\b`,
    'P0：禁止 shadow-md 及以上。深色下阴影无效，用背景台阶 + 1px 边框表达层级。',
  ),
  ...literalRules(
    String.raw`bg-gradient-to-|text-transparent|bg-clip-text`,
    'P0：禁止渐变底色与渐变文字。见 design-tokens.json 的 tailwind.forbiddenUtilities。',
  ),
  {
    // 只拦「任意值**颜色**」：`bg-[#123456]` / `text-[rgb(...)]` / `border-[hsl(...)]`。
    //
    // 不能写成 `/(bg|text|border)-\[/` —— 那会把 `text-[length:var(--text-xs)]`
    // 这类**合法**的任意值（字号、间距、z-index）一起拦掉。这一点很关键：
    // 本项目几乎所有尺寸都用 var() 任意值，误拦会让门禁变成「大家都想关掉的东西」。
    // 判据是方括号内容以颜色字面量开头。
    selector: `JSXAttribute[name.name='className'][value.value=/(bg|text|border|fill|stroke|from|to|via|ring|outline|shadow|divide|placeholder|decoration|accent|caret)-\\[(#|rgb|hsl|oklch|color-mix)/]`,
    message:
      'G2/P0：禁止 Tailwind 任意值颜色（bg-[#...] / text-[rgb(...)] 等）。任意值绕过 token 体系，只能用语义类。',
  },
  // clsx 参数、常量表里的 className 字符串同样要拦
  ...literalRules(
    String.raw`(bg|text|border|fill|stroke|from|to|via|ring|outline|shadow|divide|placeholder|decoration|accent|caret)-\[(#|rgba?\s*\(|hsla?\s*\(|oklch|color-mix)`,
    'G2/P0：禁止 Tailwind 任意值颜色。任意值绕过 token 体系，只能用语义类。',
  ),
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message:
      'C5：金额舍入只用 lib/money.ts 的 round2 / toCents。toFixed 走二进制浮点，1.005.toFixed(2) 得 "1.00"。',
  },
];

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'public/**',
      'design/design-tokens.css', // 生成物，由 gen-tokens --check 单独校验
    ],
  },

  js.configs.recommended,

  // -------------------------------------------------------------------------
  // 全项目基线
  // -------------------------------------------------------------------------
  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // -------------------------------------------------------------------------
  // TypeScript 文件：parser + 插件
  // -------------------------------------------------------------------------
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
      ...tsPlugin.configs.recommended.rules,

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // 引擎立项理由就是「靠类型系统防错」，any 会让它失效
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // 这些规则在纯 JS 里由 eslint 本体覆盖，TS 下重复报错
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },

  // -------------------------------------------------------------------------
  // src/：G1 / G2 / G3 / C5
  // -------------------------------------------------------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...SRC_RULES],
    },
  },

  // 样式文件同样禁止 emoji 与裸色值（index.css 是手写的，最容易漏进 hex）
  //
  // 两个坑，都踩过：
  // 1. 这一项**不能**继承 js.configs.recommended —— JS 核心规则（如
  //    no-irregular-whitespace）调用 sourceCode.getAllComments()，
  //    而 @eslint/css 的 sourceCode 不提供该方法，会直接抛 TypeError。
  // 2. @eslint/css 0.14 是「语言插件」而非「规则插件」：通过
  //    `language: 'css/css'` + `languages: { css }` 注册，
  //    不是 `plugins: { css }`（那样 no-restricted-syntax 会找不到 AST 语法）。
  {
    files: ['src/**/*.css'],
    // @eslint/css 0.14 把一个「语言」挂在 plugin 对象上，ESLint 9 通过
    // `language: 'css/css'`（plugin名/语言名）引用它，插件也需在 plugins 里注册。
    language: 'css/css',
    plugins: { css },
    languageOptions: {
      // 允许 Tailwind v4 的 @import / @theme / @layer 语法，
      // 否则 @eslint/css 会在 @theme 处报 Parsing error
      tolerant: true,
    },
    rules: {
      // ESLint 会沿 files 匹配合并规则：全局基线里的 JS 核心规则仍会作用于 CSS
      // 语法，而 no-irregular-whitespace 调 sourceCode.getAllComments()，
      // CSS 的 sourceCode 没有这个方法 → TypeError。逐条关掉会随 ESLint 升级漂移，
      // 所以直接在这里把「已知会在 CSS 语法上崩的 JS 规则」全部置 off。
      'no-irregular-whitespace': 'off',
      'no-control-regex': 'off',
      'no-regex-spaces': 'off',

      // 只挑与本项目相关的 CSS 规则：其余（use-baseline / no-important /
      // font-family-fallbacks）要么与 Tailwind 生成物冲突，要么与设计规范重复。
      //
      // no-invalid-at-rules 刻意关闭：它按 CSS 规范白名单校验 at-rule 名称，
      // 而 Tailwind v4 的 @theme / @apply / @utility / @custom-variant 全都不在
      // 白名单里，且该规则不接受 ignore 选项（schema 为空）。
      // 与其关掉整条规则以外的变通（自定义 language 扩展），不如承认：
      // 「Tailwind 指令是否合法」由 vite build 判定，那才是真正的裁判。
      'css/no-invalid-at-rules': 'off',
      'css/no-duplicate-imports': 'error',
      'no-restricted-syntax': [
        'error',
        ...literalRules(
          HEX_PATTERN,
          'G2/P0：src/ 下的 CSS 禁止裸 hex。颜色只能来自 design/design-tokens.css（由 gen-tokens 生成）。',
        ),
        ...literalRules(PURPLE_PINK_PATTERN, 'G3/P0：禁止紫粉色系。', 'i'),
      ],
    },
  },

  // -------------------------------------------------------------------------
  // G4 分层依赖
  // -------------------------------------------------------------------------
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'dexie', 'dexie-react-hooks'],
              message:
                'C1：domain/ 是纯函数层，禁止 import React / Dexie。需要数据时由调用方传入。',
            },
            {
              group: [
                '@/hooks/*',
                '@/components/*',
                '@/data/*',
                '@/platform/*',
                '@/pages/*',
                '../data/*',
                '../hooks/*',
                '../components/*',
              ],
              message: 'C1：domain/ 只依赖 domain/ 与 lib/。反向依赖会让引擎无法在 Node 里单测。',
            },
          ],
        },
      ],
      // 浏览器 API 出现在 domain 里，单测就跑不进 node 环境
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'C1：domain/ 禁止访问 window。' },
        { name: 'document', message: 'C1：domain/ 禁止访问 document。' },
        { name: 'localStorage', message: 'C1：domain/ 禁止访问 localStorage。' },
        { name: 'sessionStorage', message: 'C1：domain/ 禁止访问 sessionStorage。' },
        { name: 'navigator', message: 'C1：domain/ 禁止访问 navigator。' },
        { name: 'fetch', message: 'C9：本项目零网络请求（SPEC O2）。' },
      ],
    },
  },
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/domain/*', '../domain/*', '../../domain/*'],
              message: 'C2：data/ 禁止 import domain/。数据层不认识业务规则，只存类型。',
            },
          ],
        },
      ],
    },
  },
  // C9：零网络请求。全 src/ 生效，不仅 domain。
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'C9：本项目零网络请求（SPEC O2 / CSP connect-src none）。' },
        {
          name: 'XMLHttpRequest',
          message: 'C9：本项目零网络请求。导出用 Blob + URL.createObjectURL。',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'sendBeacon',
          message: 'C9：禁止埋点上报（SPEC O18）。',
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // 豁免：测试与夹具
  // -------------------------------------------------------------------------
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/domain/__fixtures__/**'],
    rules: {
      // 反向验证本来就要传错值、构造非法输入、断言异常
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
    },
  },

  // scripts / 配置文件跑在 Node 里
  {
    files: ['scripts/**/*.{ts,mjs,js}', '*.config.ts', '*.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-console': 'off',
      'no-undef': 'off', // .mjs 里的 process / console 由 globals.node 声明，此处显式关闭避免重复
    },
  },
];
