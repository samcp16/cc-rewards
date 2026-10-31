#!/usr/bin/env node
/**
 * P0-2 + P0-3 门禁：禁止紫粉渐变主视觉、禁止硬编码颜色。
 *
 * 两条规则放同一个脚本，因为它们检查的是同一件事的两面：
 * 「颜色必须来自设计 Token」。紫粉渐变是 Token 体系被绕过的典型症状，
 * 硬编码色值是同一个病的最小单位。
 *
 * 检查范围：src 下的代码与样式。
 * 例外：仅 #fff / #ffffff / #000 / #000000（纯黑白，无品牌语义）。
 *
 * 退出码：0 = 通过，1 = 命中。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

/** 允许的纯黑白（大小写不敏感） */
const ALLOWED_HEX = /^#(fff|ffffff|000|000000)$/i;

/** P0-2：紫→粉渐变。命中任一组即失败 */
const FORBIDDEN_GRADIENT = [
  { name: 'Indigo → Pink 渐变', re: /from-indigo[\s\S]{0,80}to-pink/i },
  { name: 'Purple → Pink 渐变', re: /from-purple[\s\S]{0,80}to-pink/i },
  { name: 'Violet → Fuchsia 渐变', re: /from-violet[\s\S]{0,80}to-fuchsia/i },
  { name: 'P0-2 明列色值 7C3AED', re: /#7C3AED/i },
  { name: 'P0-2 明列色值 A855F7', re: /#A855F7/i },
  { name: 'P0-2 明列色值 EC4899', re: /#EC4899/i },
];

/** 任意 hex 色值：3 / 4 / 6 / 8 位 */
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.has(name.slice(name.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

const files = [];
for (const d of SCAN_DIRS) {
  try {
    if (statSync(join(ROOT, d)).isDirectory()) walk(join(ROOT, d), files);
  } catch {
    /* 目录不存在 */
  }
}

const gradientHits = [];
const hexHits = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const rel = relative(ROOT, file);

  lines.forEach((line, i) => {
    for (const g of FORBIDDEN_GRADIENT) {
      if (g.re.test(line)) {
        gradientHits.push({ file: rel, line: i + 1, name: g.name, context: line.trim().slice(0, 120) });
      }
    }

    // 行长内可能有多个色值，逐个判定
    const matches = line.match(HEX_RE);
    if (!matches) return;
    for (const hex of matches) {
      if (ALLOWED_HEX.test(hex)) continue;
      hexHits.push({ file: rel, line: i + 1, hex, context: line.trim().slice(0, 120) });
    }
  });
}

let failed = false;

if (gradientHits.length > 0) {
  failed = true;
  console.error(`P0-2 紫粉渐变门禁：失败 —— 发现 ${gradientHits.length} 处\n`);
  for (const h of gradientHits) {
    console.error(`  ${h.file}:${h.line}  ${h.name}`);
    console.error(`    ${h.context}`);
  }
  console.error('');
}

if (hexHits.length > 0) {
  failed = true;
  console.error(`P0-3 硬编码颜色门禁：失败 —— 发现 ${hexHits.length} 处非 Token 色值\n`);
  for (const h of hexHits) {
    console.error(`  ${h.file}:${h.line}  ${h.hex}`);
    console.error(`    ${h.context}`);
  }
  console.error('\n颜色必须引用 CSS 变量（var(--color-*)）或语义类名（text-pos / bg-surface）。');
  console.error('唯一例外：纯黑白 #fff / #000。');
  console.error('');
}

if (failed) process.exit(1);

console.log(
  `P0-2 / P0-3 门禁：通过（扫描 ${files.length} 个文件，紫粉渐变 0 处、硬编码色值 0 处）`,
);
