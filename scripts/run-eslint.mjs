/**
 * ESLint 启动器 —— 让 TS 7 的项目也能跑 typescript-eslint。
 *
 * ## 为什么需要这一层
 *
 * SPEC §4 锁定 TypeScript 7.0.2。但 typescript-eslint 8.72.1 在
 * `@typescript-eslint/parser/dist/index.js` 与 `typescript-eslint/dist/index.js`
 * 里都硬编码了运行时断言：
 *
 *     const [versionMajor] = ts.versionMajorMinor.split('.').map(Number);
 *     if (versionMajor >= 7) throw new Error('typescript-eslint does not support TS 7.0.');
 *
 * 这个断言不读 peer range，只要 `require('typescript').versionMajorMinor` 是 7 就抛。
 * 所以「在 package.json 里放宽 peer range」并不能解决它 —— 这也是上一轮
 * ADR-008 记下来的教训：override 能骗过 npm install，骗不过运行时断言。
 *
 * 官方在 TS 7.0 发布说明里给出的兼容路径就是「双版本并存」：
 * 类型检查用 TS 7，lint 用 TS 6。本文件把这条路径做实：
 *
 *   1. 把 `typescript6`（`npm:typescript@6.0.3` 的别名包）装成 devDependency；
 *   2. 在此处劫持模块解析，把**所有**对 `typescript` / `typescript/*` 的
 *      require 重定向到 `typescript6`；
 *   3. 然后再加载 eslint。
 *
 * ## 为什么劫持而不是 alias / NODE_PATH
 *
 * `NODE_PATH` 只在常规 node_modules 查找失败时才生效，而 `typescript` 是能
 * 解析到的（就是 7.0.2），所以 NODE_PATH 根本轮不上。必须在 `_resolveFilename`
 * 这一层改，才能覆盖「已经装了的包」。
 *
 * ## 代价（诚实记录）
 *
 * lint 所用的类型信息来自 TS 6，不是 7。对本项目可接受，因为 lint 拦住的是
 * API 用法与字面量内容（emoji / hex / 分层依赖），与 TS 7 的新语义无关；
 * 真正的类型错误由 `tsc --noEmit`（TS 7）拦住，`npm run build` 里已经串上了。
 *
 * ## 何时可以删掉这个文件
 *
 * typescript-eslint 宣称支持 TS 7 之后（跟踪 issue 10940）。届时：
 * `npm run lint` 改为直接 `eslint .`，删掉本文件与 `typescript6` 依赖，
 * 并把 ADR-008 标记为 Superseded。
 */

import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const TS6_ALIAS = 'typescript6';

// 确认别名包存在：缺了就直接给出可执行的修复指令，
// 而不是让 ESLint 抛一个「cannot find module typescript」的误导性错误
try {
  require.resolve(`${TS6_ALIAS}/package.json`);
} catch {
  console.error(
    [
      '缺少 typescript6（lint 用的 TS 6 副本）。执行：',
      '  npm install --save-dev typescript6@npm:typescript@6.0.3',
      '原因见 scripts/run-eslint.mjs 顶部说明与 docs/decisions/ADR-008-typescript-7-peer-range.md',
    ].join('\n'),
  );
  process.exit(1);
}

const ts6Version = require(`${TS6_ALIAS}/package.json`).version;
const [major] = ts6Version.split('.').map(Number);
if (major !== 6) {
  console.error(
    `typescript6 解析到 ${ts6Version}，期望 6.x。请检查 package.json 的别名依赖。`,
  );
  process.exit(1);
}

const TS6_ROOT = fileURLToPath(new URL(`../node_modules/${TS6_ALIAS}/`, import.meta.url));

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveWithTs6(request, parent, isMain, options) {
  // `typescript` 与 `typescript/lib/xxx` 都指向别名包，
  // 否则 parser 内部 `require('typescript/lib/tsserverlibrary')` 仍会拿到 7.0.2
  if (request === 'typescript' || request.startsWith('typescript/')) {
    const target = request.replace(/^typescript/, TS6_ROOT.replace(/\/$/, ''));
    return originalResolve.call(this, target, parent, isMain, options);
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

// 断言劫持确实生效 —— 静默失败会让 lint 在 TS 7 上原地爆炸，排查成本极高
const ts = require('typescript');
if (!ts.version.startsWith('6.')) {
  console.error(`模块劫持未生效：require('typescript') 仍是 ${ts.version}。`);
  process.exit(1);
}

// 用 ESLint 的 Node API 而不是 CLI 子进程：
// 子进程会重新走一遍模块解析，劫持不会继承过去
const { ESLint } = require('eslint');

const eslint = new ESLint({
  cwd: process.cwd(),
  // 改动文件只在显式传 --fix 时写回，避免 lint 顺手改代码
  fix: process.argv.includes('--fix'),
});

const patterns = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const results = await eslint.lintFiles(patterns.length > 0 ? patterns : ['.']);

if (process.argv.includes('--fix')) {
  await ESLint.outputFixes(results);
}

const formatter = await eslint.loadFormatter('stylish');
const output = formatter.format(results);
if (output) process.stdout.write(output);

const errorCount = results.reduce((sum, r) => sum + r.errorCount, 0);
const warningCount = results.reduce((sum, r) => sum + r.warningCount, 0);

if (errorCount > 0) {
  console.error(`\n门禁未通过：${errorCount} 个 error，${warningCount} 个 warning。`);
  process.exit(1);
}

console.error(`lint 通过（TS ${ts.version} 解析，0 error / ${warningCount} warning）。`);
