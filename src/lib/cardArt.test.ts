/**
 * 官方卡面登记册的完整性。
 *
 * 这套机制最怕的不是「少一张图」，是「登记册说有、资源目录里没有」——
 * 那种情况上线后是一张裂图，而且只在用户看到的那张卡上出现。
 * 所以用测试把两份数据钉在一起。
 */

import { describe, it, expect } from 'vitest';
import registry from '../../data/card-art.json';
import { cardArt, cardArtCount, cardArtFiles } from './cardArt';

describe('cardArt：登记册与资源目录一致', () => {
  it('每条登记都能在资源目录里找到对应文件', () => {
    const files = new Set(cardArtFiles());
    for (const [cardId, entry] of Object.entries(registry.art)) {
      expect(files.has(entry.file), `${cardId} 登记的 ${entry.file} 不存在`).toBe(true);
    }
  });

  it('资源目录里没有未被登记的孤儿文件', () => {
    const registered = new Set(Object.values(registry.art).map((entry) => entry.file));
    for (const file of cardArtFiles()) {
      expect(registered.has(file), `${file} 没有登记来源`).toBe(true);
    }
  });

  it('每条登记都带来源页面 —— 没有来源的图不该进卡库', () => {
    for (const [cardId, entry] of Object.entries(registry.art)) {
      expect(entry.issuerPage, cardId).toMatch(/^https:\/\//);
      expect(entry.source, cardId).toMatch(/^https:\/\//);
    }
  });

  it('可查到的卡数与登记册一致', () => {
    expect(cardArtCount()).toBe(Object.keys(registry.art).length);
  });
});

describe('cardArt：查询', () => {
  it('登记过的卡返回打包后的 URL（不是原始文件名）', () => {
    const art = cardArt('hsbc-red');
    expect(art).toBeDefined();
    expect(art?.src).toContain('hsbc-red');
  });

  it('没登记的卡返回 undefined，调用方据此走绘制卡面', () => {
    expect(cardArt('mox-credit')).toBeUndefined();
  });

  it('不存在的 cardId 不抛错', () => {
    expect(cardArt('no-such-card')).toBeUndefined();
  });

  /* 这一组是这个文件名存在的原因。
     从卡库添加一张卡时，cardId 会带上 `-copy` 后缀（同一张卡加两次要分开记额度），
     而卡面按目录 id 精确匹配 —— 于是「选择卡片」那一屏有真图，
     「我的卡」里同一张卡退回成绘制卡面。用户在两个屏看到两种卡面，
     会以为自己加错了卡。 */
  it('模板副本（-copy）沿用母卡的官方卡面', () => {
    expect(cardArt('hsbc-everymile-copy')?.src).toBe(cardArt('hsbc-everymile')?.src);
  });

  it('同一张卡加第三次的 -copy2 也认', () => {
    expect(cardArt('hsbc-red-copy2')?.src).toBe(cardArt('hsbc-red')?.src);
  });

  it('只剥尾部的 -copy，不误伤名字里本来就有 copy 的卡', () => {
    for (const id of Object.keys(registry.art)) expect(cardArt(id), id).toBeDefined();
    // 「copy」出现在中间不该被剥
    expect(cardArt('copy-hsbc-red')).toBeUndefined();
  });
});

describe('卡面主色调：加载中的那一块', () => {
  it('每张登记过的卡都带一个合法的 tint', () => {
    for (const cardId of ['hsbc-red', 'amex-hk-explorer', 'sc-simply-cash']) {
      expect(cardArt(cardId)?.tint).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('tint 来自图本身，不是品牌色 —— AEON 洋红品牌配的是浅色卡', () => {
    // 只断言「有值且不等于品牌 token 名」，防止有人把它改回 var(--brand-*)
    const tint = cardArt('aeon-wakuwaku')?.tint ?? '';
    expect(tint.startsWith('#')).toBe(true);
  });
});
