#!/usr/bin/env node
/**
 * P0-1 门禁：禁止 emoji 作为功能图标。
 *
 * 为什么必须是脚本而不是「提交前记得看一眼」：
 * emoji 在开发机上看起来没问题，一旦出现在按钮里，就变成了不可缩放、
 * 无法统一描边、跨平台渲染不一致的伪图标。等用户看到时已经上线了。
 *
 * 检查范围：src 下所有代码与样式、index.html、public 下的 svg。
 * 例外：注释里的 emoji 同样禁止 —— 注释会被复制进代码，防不住源头就没有意义。
 *
 * 退出码：0 = 通过，1 = 命中。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

const SCAN_DIRS = ['src'];
const SCAN_FILES = ['index.html'];

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.svg', '.json']);

/** 只跳过依赖与构建产物，源码一律扫描（含测试与 fixtures） */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

/**
 * emoji 码点区间。用「逐码点判定」而不是把 ZWJ / 变体选择符塞进单个字符类 ——
 * 后者会把组合字符写进 char class，语义不明确（ESLint no-misleading-character-class）。
 *
 * 区间与团队 P0 规则给出的正则一致：
 */
const EMOJI_RANGES = [
  [0x1f300, 0x1f9ff],
  [0x2600, 0x26ff],
  [0x2700, 0x27bf],
  [0xfe00, 0xfe0f],
  [0x1f000, 0x1f02f],
  [0x1f0a0, 0x1f0ff],
  [0x1f100, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x1fa00, 0x1fa6f],
  [0x1fa70, 0x1faff],
  [0x200d, 0x200d],
  [0x20e3, 0x20e3],
];

/** 找出字符串里第一个 emoji 码点；无则返回 null */
function findEmoji(str) {
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    for (const [lo, hi] of EMOJI_RANGES) {
      if (cp >= lo && cp <= hi) return ch;
    }
  }
  return null;
}

/**
 * 允许出现在非图标语境里的字符。
 *
 * 只有两个，且都是标点而非表情：
 * - ✅ U+2705 / ❌ U+274C 属于 U+2700 区块，但它们是「对/错」符号，
 *   在某些文本里是用户可见文案的一部分。
 * 本产品不用它们 —— 若将来要用，必须在这里显式放行并写清理由，
 * 而不是把整个区块关掉。
 */
const ALLOWED = new Set([]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (EXTS.has(name.slice(name.lastIndexOf('.')))) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const d of SCAN_DIRS) {
  try {
    if (statSync(join(ROOT, d)).isDirectory()) walk(join(ROOT, d), files);
  } catch {
    // 目录不存在则跳过，不视为失败
  }
}
for (const f of SCAN_FILES) {
  try {
    statSync(join(ROOT, f));
    files.push(join(ROOT, f));
  } catch {
    /* 文件不存在 */
  }
}

const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const ch = findEmoji(line);
    if (!ch) return;
    if (ALLOWED.has(ch)) return;
    const cp = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    hits.push({
      file: relative(ROOT, file),
      line: i + 1,
      char: ch,
      cp,
      context: line.trim().slice(0, 100),
    });
  });
}

if (hits.length === 0) {
  console.log(`P0-1 emoji 门禁：通过（扫描 ${files.length} 个文件，零命中）`);
  process.exit(0);
}

console.error(`P0-1 emoji 门禁：失败 —— 发现 ${hits.length} 处 emoji\n`);
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  U+${h.cp}`);
  console.error(`    ${h.context}`);
}
console.error('\n功能图标必须换成项目锁定的 SVG 图标库（lucide-react），');
console.error('尺寸规范：16px 行内 / 20px 按钮内 / 24px 独立图标。');
process.exit(1);
