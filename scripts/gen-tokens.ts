/**
 * 从 design-tokens.json 生成 design-tokens.css —— 解决「同一份色值写两遍」的问题。
 *
 * 为什么需要这个脚本：设计师交付了 .json（给程序读）与 .css（给浏览器读）两份文件。
 * 两份手工维护必然漂移，而颜色是本项目 P0 门禁的对象（禁止硬编码色值）。
 * 以 .json 为唯一源，.css 由脚本生成，漂移从流程上消失。
 *
 * 用法：
 *   npm run gen:tokens         生成并写入 design/design-tokens.css
 *   npm run gen:tokens --check 只校验，不写入；不一致时非零退出（供 CI 使用）
 *
 * 两条约束（改动本文件前先读，否则会打断设计契约）：
 *
 * 1. **变量名属于设计契约，不是脚本的自由发挥。**
 *    设计师在 MASTER.md 与 pages/*.md 里已经按 `--fg` / `--muted` / `--elev-raised`
 *    这类短名写了实现指引。脚本若按 JSON 的语义路径机械生成 `--text-primary`，
 *    生成物与契约就对不上，前端会照哪个都错。故所有命名映射集中在 CSS_NAME 里，
 *    逐条显式声明；新增 token 若没有映射，脚本**直接报错**而不是猜一个名字。
 *
 * 2. **生成物不止是变量表。**
 *    设计师的 CSS 里还有必须原样保留的非 token 内容：focus-visible 焦点环、
 *    prefers-reduced-motion 降级、body 排版复位、.num 数字容器工具类。
 *    这些不是「色值」，但都是 P0 级要求（SPEC §8 / A11y），
 *    丢一个字都会让无障碍不达标，所以由 STATIC_BLOCKS 原样输出。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CSS_NAME, DERIVED } from './token-map';
import { FOOTER, HEADER, STATIC_A11Y, STATIC_BASE } from './token-static';
import { SECTIONS } from './token-sections';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = resolve(ROOT, 'design/design-tokens.json');
const CSS_PATH = resolve(ROOT, 'design/design-tokens.css');

interface TokenNode {
  value?: string | number;
  type?: string;
  role?: string;
  description?: string;
  note?: string;
  dark?: string | number;
  [key: string]: unknown;
}

type TokenTree = Record<string, unknown>;

interface Emitted {
  /** JSON 里的源路径（用于报错定位，如 color.text.primary） */
  source: string;
  /** CSS 变量名（含 -- 前缀） */
  name: string;
  /** 值；未提供的派生变量（如 --elev-ring）在 resolve 阶段算出 */
  value: string;
  /** 生成到 CSS 里的单行注释 */
  comment?: string;
}

// ---------------------------------------------------------------------------
// 1. JSON 源 → CSS 变量名。显式映射，不猜。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 2. 取值
// ---------------------------------------------------------------------------

/** 按 `a.b.c` 路径取值，返回节点本身；任一段缺失返回 undefined。 */
function readPath(tree: TokenTree, path: string): TokenNode | undefined {
  const segments = path.split('.');
  let cursor: unknown = tree;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (cursor === null || cursor === undefined) return undefined;
  return typeof cursor === 'object' ? (cursor as TokenNode) : { value: cursor as string | number };
}

/**
 * 逐个解析 CSS_NAME。**缺路径即报错**：静默跳过会让「JSON 改了名字、CSS 少了一个变量、
 * 前端线上白屏」这类问题到运行时才暴露。
 */
function resolveTokens(tree: TokenTree): Emitted[] {
  const out: Emitted[] = [];
  const missing: string[] = [];

  for (const [source, name, comment] of CSS_NAME) {
    const node = readPath(tree, source);
    if (!node || node.value === undefined) {
      missing.push(`${source}  (-> ${name})`);
      continue;
    }
    out.push({
      source,
      name,
      value: String(node.value),
      // 显式注释优先；否则用 JSON 的 role（比 description 短，适合单行）
      comment: comment ?? (typeof node.role === 'string' ? node.role : undefined),
    });
  }

  if (missing.length > 0) {
    throw new Error(
      `design-tokens.json 缺少以下路径，CSS 变量无法生成：\n  ${missing.join('\n  ')}\n` +
        '若是有意改名，请同步修改 scripts/gen-tokens.ts 的 CSS_NAME 与 design 文档。',
    );
  }

  // 断言：没有两个源路径映射到同一个变量名（否则后写的静默覆盖前面的）
  const seen = new Map<string, string>();
  for (const token of out) {
    const previous = seen.get(token.name);
    if (previous) {
      throw new Error(`变量名冲突：${token.name} 同时来自 ${previous} 与 ${token.source}`);
    }
    seen.set(token.name, token.source);
  }

  return out;
}

// ---------------------------------------------------------------------------
// 3. 输出
// ---------------------------------------------------------------------------

function renderVar(token: Emitted): string[] {
  const lines: string[] = [];
  if (token.comment) {
    const safe = token.comment.replace(/\*\//g, '* /').replace(/\s+/g, ' ').trim();
    lines.push(`  /* ${safe} */`);
  }
  lines.push(`  ${token.name}: ${token.value};`);
  return lines;
}

/** 按 72 列折行，避免长注释撑出横向滚动条。 */
function wrapNote(note: string): string[] {
  const chunks = note.match(/.{1,72}(\s|$)/g) ?? [note];
  return chunks.map((line) => `   ${line.trim()}`);
}

function buildCss(tree: TokenTree): string {
  const resolved = resolveTokens(tree);
  const byName = new Map<string, Emitted>();
  for (const token of [...resolved, ...DERIVED]) byName.set(token.name, token);

  const blocks: string[] = [HEADER];
  const emitted = new Set<string>();

  for (const section of SECTIONS) {
    const slice: Emitted[] = [];
    for (const name of section.order) {
      const token = byName.get(name);
      if (!token) {
        // 变量名写错、或新加了 token 忘记放进段里，都在这里炸掉。
        // 静默漏掉一个变量 = 前端引用时静默拿到空值，比构建失败难查得多。
        throw new Error(`段「${section.title}」列出了不存在的变量 ${name}，请检查 CSS_NAME / DERIVED`);
      }
      if (emitted.has(name)) {
        throw new Error(`变量 ${name} 在多个段里重复出现`);
      }
      emitted.add(name);
      slice.push(token);
    }

    blocks.push(
      [
        '/* ---------------------------------------------------------------------------',
        `   ${section.title}`,
        '   ---------------------------------------------------------------------------',
        ...wrapNote(section.note),
        '--------------------------------------------------------------------------- */',
        ':root,',
        ':root[data-theme="dark"] {',
        ...slice.flatMap(renderVar),
        '}',
      ].join('\n'),
    );
  }

  // 反向校验：解析出来的每个变量都必须落在某一段里，否则它根本不会出现在 CSS 里。
  const orphans = [...byName.keys()].filter((name) => !emitted.has(name));
  if (orphans.length > 0) {
    throw new Error(`以下变量没有归属到任何段，不会出现在 CSS 中：${orphans.join(', ')}`);
  }

  blocks.push(STATIC_A11Y, STATIC_BASE, FOOTER);
  return `${blocks.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------
// 4. 入口
// ---------------------------------------------------------------------------

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const tokens = JSON.parse(readFileSync(JSON_PATH, 'utf8')) as TokenTree;

  let css: string;
  try {
    css = buildCss(tokens);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const declarations = (css.match(/^\s+--[a-z0-9-]+:/gm) ?? []).length;
  const uniqueNames = new Set((css.match(/^\s+(--[a-z0-9-]+):/gm) ?? []).map((s) => s.trim().replace(':', '')));

  if (checkOnly) {
    let existing = '';
    try {
      existing = readFileSync(CSS_PATH, 'utf8');
    } catch {
      console.error('design-tokens.css 不存在，请先运行 npm run gen:tokens');
      process.exit(1);
    }
    if (existing.trim() !== css.trim()) {
      console.error('design-tokens.css 与 design-tokens.json 不一致，请运行 npm run gen:tokens');
      process.exit(1);
    }
    console.log(`design-tokens.css 与 JSON 源一致（${declarations} 处声明 / ${uniqueNames.size} 个变量）`);
    return;
  }

  writeFileSync(CSS_PATH, css, 'utf8');
  console.log(`已生成 design/design-tokens.css（${uniqueNames.size} 个变量，${declarations} 处声明）`);
}

main();

export { buildCss, resolveTokens, readPath };
export type { Emitted };
export { CSS_NAME, DERIVED } from './token-map';
export { SECTIONS } from './token-sections';
export { FOOTER, HEADER, STATIC_A11Y, STATIC_BASE } from './token-static';
