/**
 * 官方卡面素材的运行时索引。
 *
 * 素材放 src/assets 而不是 public：本项目的 base 是 `./`（相对路径），
 * public 下的绝对 URL 在子路径部署时会 404；走 import.meta.glob 让打包器
 * 生成带 hash 的 URL，同时把「用了哪些图」变成构建期可分析的事实 ——
 * 某张图被删了，这里会直接少一个键，而不是线上 404。
 *
 * 登记册在 data/card-art.json（含来源 URL、抓取日期、处理方式），
 * 那里是给人看的账本，这里是给代码用的索引。两者用文件名对齐，
 * 由 cardArt.test.ts 保证不脱节。
 */

import registry from '../../data/card-art.json';

const urls = import.meta.glob('../assets/card-art/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byFile = new Map<string, string>();
for (const [path, url] of Object.entries(urls)) {
  byFile.set(path.split('/').pop() ?? path, url);
}

export interface CardArt {
  /** 打包后的图片 URL */
  src: string;
  /**
   * 这张卡面的平均色（构建前从图上采样，写进 data/card-art.json）。
   *
   * 用途只有一个：图还没到的那几百毫秒里，卡位铺这个色而不是留白。
   * 铺品牌色是不够的 —— AEON 品牌色是洋红，卡本身却是浅粉蓝；用采样色
   * 才能让「正在加载的那张卡」和「加载完的那张卡」是同一个颜色，
   * 图出现时不会有一下跳色。
   */
  tint: string;
  /** 来源页面，详情页展示「图从哪来」用 */
  issuerPage: string;
}

const ART = new Map<string, CardArt>();
for (const [cardId, entry] of Object.entries(registry.art)) {
  const src = byFile.get(entry.file);
  if (src !== undefined) ART.set(cardId, { src, tint: entry.tint, issuerPage: entry.issuerPage });
}

/**
 * 模板副本的 id 后缀，形如 `-copy` / `-copy2`。
 *
 * `cardFromTemplate()` 给每次「从卡库添加」都发一个新主键，因为同一张卡加两次
 * 要分开记额度。但卡面是同一张 —— 按 id 精确查会导致**用户添加的每一张卡
 * 都退回绘制卡面**，而「选择卡片」那一屏（读目录 id）有真图。
 * 同一张卡在两屏长得不一样，用户会以为自己加错了。
 *
 * 只剥尾部，且必须带连字符：名字中间的 copy 与这里无关。
 */
const COPY_SUFFIX = /-copy\d*$/;

/** 有官方卡面就返回，没有返回 undefined（调用方走绘制卡面） */
export function cardArt(cardId: string): CardArt | undefined {
  const direct = ART.get(cardId);
  if (direct !== undefined) return direct;
  const base = cardId.replace(COPY_SUFFIX, '');
  return base === cardId ? undefined : ART.get(base);
}

/** 已接入官方卡面的卡数量，设置页/关于页用来交代覆盖率 */
export function cardArtCount(): number {
  return ART.size;
}

/** 素材文件名列表，供测试核对登记册与资源目录一致 */
export function cardArtFiles(): string[] {
  return [...byFile.keys()].sort();
}
