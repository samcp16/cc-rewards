/**
 * 银行分组与卡摘要的契约。
 *
 * 这两个函数决定了「添加卡片」那两屏长什么样，也决定了用户会不会被
 * 「费率待补」这种说法误导 —— 积分卡数据是全的，缺的只是用户自己的
 * 分值假设，不能和「核实中」混为一谈。
 */

import { describe, it, expect } from 'vitest';
import { CARDS, getCardById } from '../domain/data/loadCards';
import { cardSummary, cardsOfIssuer, issuerGroups, issuerKey, shortIssuer } from './issuerGroups';

describe('issuerGroups', () => {
  it('每张卡只被分到一组，且总量守恒', () => {
    const groups = issuerGroups();
    const total = groups.reduce((n, g) => n + g.cards.length, 0);
    expect(total).toBe(CARDS.length);
  });

  it('澳门银行排在香港前面（主要消费地优先）', () => {
    const groups = issuerGroups();
    const firstHk = groups.findIndex((g) => g.region === 'HK');
    const lastMo = groups.map((g) => g.region).lastIndexOf('MO');
    expect(lastMo).toBeLessThan(firstHk);
  });

  it('组内按卡名排序，顺序稳定（不是 JSON 里碰巧的顺序）', () => {
    for (const group of issuerGroups()) {
      const names = group.cards.map((c) => c.cardName);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')));
    }
  });

  it('usableCount 只数「至少有一个类别有数据」的卡', () => {
    const group = issuerGroups().find((g) => g.issuer.includes('汇丰'));
    expect(group).toBeDefined();
    // 汇丰 4 张里至少 1 张有可用数据（EveryMile 是积分卡，也算有数据）
    expect(group?.usableCount).toBeGreaterThan(0);
  });

  it('exclude 掉的卡不出现，整条银行消失而不是留一个空组', () => {
    const all = issuerGroups();
    const first = all[0]!;
    const exclude = new Set(first.cards.map((c) => c.cardId));
    const after = issuerGroups({ exclude });
    expect(after.find((g) => g.issuer === first.issuer)).toBeUndefined();
    // 只少了这一组，其余银行不受影响
    expect(after.length).toBe(all.length - 1);
  });

  it('exclude 单张卡时，同组其它卡仍在', () => {
    const group = issuerGroups().find((g) => g.cards.length >= 3);
    expect(group).toBeDefined();
    const drop = group!.cards[0]!.cardId;
    const after = issuerGroups({ exclude: new Set([drop]) }).find((g) => g.issuer === group!.issuer);
    expect(after?.cards.map((c) => c.cardId)).not.toContain(drop);
    expect(after?.cards.length).toBe(group!.cards.length - 1);
  });

  it('cardsOfIssuer 未知银行返回空数组，不抛错', () => {
    expect(cardsOfIssuer('不存在的银行')).toEqual([]);
  });

  it('打错一个银行名不该连累别家（hidden 只认精确键）', () => {
    const all = issuerGroups();
    const target = all[0]!;
    const typo = new Set([`${target.region}|${target.issuer}支行`]);
    expect(issuerGroups({ hidden: typo })).toHaveLength(all.length);
  });

  it('exclude 与 hidden 同时生效，互不干扰', () => {
    const all = issuerGroups();
    const [a, b] = [all[0]!, all[1]!];
    const after = issuerGroups({
      hidden: new Set([issuerKey(a.region, a.issuer)]),
      exclude: new Set(b.cards.map((c) => c.cardId)),
    });
    expect(after.find((g) => g.issuer === a.issuer)).toBeUndefined();
    expect(after.find((g) => g.issuer === b.issuer)).toBeUndefined();
    expect(after).toHaveLength(all.length - 2);
  });

  it('hidden 掉一家银行，只少这一家的卡，别家一张不少', () => {
    const all = issuerGroups();
    const target = all[0]!;
    const totalBefore = all.reduce((n, g) => n + g.cards.length, 0);
    const after = issuerGroups({ hidden: new Set([issuerKey(target.region, target.issuer)]), exclude: undefined });
    expect(after.reduce((n, g) => n + g.cards.length, 0)).toBe(totalBefore - target.cards.length);
  });

  it('issuerKey 带地区 —— 澳门与香港的同名银行是两个不同的键', () => {
    expect(issuerKey('MO', '中国银行')).not.toBe(issuerKey('HK', '中国银行'));
  });
});

describe('cardSummary', () => {
  it('现金回赠卡报最高百分比', () => {
    const card = getCardById('sc-simply-cash');
    expect(card).toBeDefined();
    expect(cardSummary(card!).state).toBe('cashback');
    expect(cardSummary(card!).text).toMatch(/^最高 \d+\.\d{2}%$/);
  });

  it('积分卡说「积分 x 倍」，不说「费率待补」——它的数据是全的', () => {
    const card = getCardById('amex-hk-explorer');
    expect(card).toBeDefined();
    const s = cardSummary(card!);
    expect(s.state).toBe('points');
    expect(s.text).toMatch(/^积分 \d+x$/);
  });

  it('真正没核实的卡说「回赠待补」，且不说「费率」', () => {
    const card = getCardById('hsbc-pulse-unionpay');
    expect(card).toBeDefined();
    const s = cardSummary(card!);
    expect(s).toEqual({ text: '回赠待补', state: 'unknown' });
    // 「费率」在这个产品里专指外币手续费，用它描述回赠会让用户去查错栏位
    expect(s.text).not.toContain('费率');
  });

  it('三种摘要都不出现「费率」二字', () => {
    for (const id of ['sc-simply-cash', 'amex-hk-explorer', 'hsbc-pulse-unionpay']) {
      const card = getCardById(id);
      expect(card).toBeDefined();
      expect(cardSummary(card!).text).not.toContain('费率');
    }
  });

  it('回赠卡优先于积分：同时有两种规则时报表内最高百分比', () => {
    const mixed = {
      ...getCardById('sc-simply-cash')!,
      categories: {
        ...getCardById('sc-simply-cash')!.categories,
        dining: { kind: 'points' as const, multiplier: 4 },
      },
    };
    expect(cardSummary(mixed).state).toBe('cashback');
  });
});


describe('shortIssuer：列表副行用的短名', () => {
  it('剥掉括号里的法定名与拉丁名', () => {
    expect(shortIssuer('澳门商业银行（Banco Comercial de Macau, BCM）')).toBe('澳门商业');
    expect(shortIssuer('大丰银行（Tai Fung Bank）')).toBe('大丰银行');
  });

  it('有特例的走特例 —— 两个「中银」必须分得开', () => {
    expect(shortIssuer('中国银行澳门分行（BOC Macau）')).toBe('中银澳门');
    expect(shortIssuer('中银香港（Bank of China Hong Kong）')).toBe('中银香港');
  });

  it('没有括号的名字原样返回', () => {
    expect(shortIssuer('Mox Bank')).toBe('Mox Bank');
  });

  it('结果一定短于原始全名，否则截断白做了', () => {
    const full = '澳门国际银行（Macau Chinese Bank / MIB）';
    expect(shortIssuer(full).length).toBeLessThan(full.length);
  });
});
