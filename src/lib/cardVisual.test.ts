/**
 * 卡面视觉的映射契约。
 *
 * 这里断言的不是「颜色好不好看」，是三件会真正出错的事：
 *   1. 银行匹配错了 → 用户凭颜色认错卡（比没卡面糟）
 *   2. 卡组织归一化漏了 → 卡面上画出空白框
 *   3. 取不到官方色的银行兜底错了 → 悄悄用了别家的品牌色
 *
 * 另外钉住「安信一家两个牌子」：WeWa 和 EarnMORE 的 issuer 是同一个，
 * 只看 issuer 会把两张不同的卡画成一模一样。
 */

import { describe, it, expect } from 'vitest';
import { cardVisual, issuerVisual, NETWORK_LABEL } from './cardVisual';
import { CARDS } from '../domain/data/loadCards';

function v(issuer: string, cardName: string, network = 'visa') {
  return cardVisual({ issuer, cardName, network });
}

describe('cardVisual：银行 → 标识色', () => {
  it('常见大行各自有独立色，不共用 neutral', () => {
    const keys = ['香港上海汇丰银行（HSBC HK）', '渣打银行香港（Standard Chartered HK）', '花旗银行香港（Citi HK）'].map(
      (issuer) => v(issuer, 'X').brand,
    );
    expect(new Set(keys).size).toBe(3);
    expect(keys).not.toContain('neutral');
  });

  it('取不到官方色的澳门本地行落到 neutral —— 不猜一个看起来像的色', () => {
    expect(v('澳门商业银行（Banco Comercial de Macau, BCM）', 'BCM World Mastercard').brand).toBe('neutral');
  });

  it('缩写取自银行，不是卡名首字', () => {
    expect(v('香港上海汇丰银行（HSBC HK）', '汇丰 Red 信用卡').mark).toBe('HSBC');
  });

  it('安信一家两个牌子：WeWa 与 EarnMORE 必须画成两张不同的卡', () => {
    const iss = '安信信贷（PrimeCredit）';
    const wewa = v(iss, 'WeWa 银联信用卡');
    const earn = v(iss, 'EarnMORE 银联钻石卡');
    expect(wewa.brand).not.toBe(earn.brand);
    expect(wewa.mark).not.toBe(earn.mark);
  });

  it('匹配不到的银行给通用标记，而不是猜一个银行缩写', () => {
    const r = v('某家还没收录的银行', '某卡');
    expect(r.mark).toBe('CARD');
    expect(r.brand).toBe('neutral');
  });
});

describe('cardVisual：卡组织归一化', () => {
  it('认得出四种卡组织', () => {
    expect(v('x', 'y', 'visa').network).toBe('visa');
    expect(v('x', 'y', 'mastercard').network).toBe('mastercard');
    expect(v('x', 'y', 'unionpay').network).toBe('unionpay');
    expect(v('x', 'y', 'amex').network).toBe('amex');
  });

  it('大小写与写法差异都能归一（Master / UnionPay / American Express）', () => {
    expect(v('x', 'y', 'Master').network).toBe('mastercard');
    expect(v('x', 'y', 'UnionPay').network).toBe('unionpay');
    expect(v('x', 'y', 'American Express').network).toBe('amex');
  });

  it('认不出时不硬猜，落到 unknown', () => {
    expect(v('x', 'y', 'jcb').network).toBe('unknown');
  });

  it('每种网络都有中文显示名，不会出现空字符串', () => {
    for (const key of Object.keys(NETWORK_LABEL) as Array<keyof typeof NETWORK_LABEL>) {
      expect(NETWORK_LABEL[key].length).toBeGreaterThan(0);
    }
  });
});

describe('cardVisual：卡库全覆盖', () => {
  it('38 张卡没有一张落到「猜不出银行」的 CARD 标记', () => {
    const unmatched = CARDS.filter((c) => cardVisual(c).mark === 'CARD').map((c) => c.cardId);
    expect(unmatched).toEqual([]);
  });

  it('每张卡的组织都能归一（卡库里不该有 unknown）', () => {
    const unknown = CARDS.filter((c) => cardVisual(c).network === 'unknown').map((c) => c.cardId);
    expect(unknown).toEqual([]);
  });

  it('同一家银行的多张卡共用品牌色 —— 这是设计意图，不是 bug', () => {
    const hsbc = CARDS.filter((c) => c.issuer.includes('香港上海汇丰银行'));
    expect(hsbc.length).toBeGreaterThan(1);
    const brands = new Set(hsbc.map((c) => cardVisual(c).brand));
    expect(brands.size).toBe(1);
  });
});

describe('issuerVisual：银行行只代表银行', () => {
  it('一家银行发两个牌子时，银行行不借用其中任一个卡品牌的色', () => {
    const bank = issuerVisual('安信信贷（PrimeCredit）');
    expect(bank.brand).toBe('neutral');
    expect(bank.mark).toBe('PC');
    // 卡那一层仍然分开
    expect(cardVisual({ issuer: '安信信贷（PrimeCredit）', cardName: 'WeWa 银联信用卡', network: 'UnionPay' }).brand).toBe('wewa');
    expect(cardVisual({ issuer: '安信信贷（PrimeCredit）', cardName: 'EarnMORE 银联钻石卡', network: 'UnionPay' }).brand).toBe('earnmore');
  });

  it('有官方色的银行，行级与卡级同色', () => {
    expect(issuerVisual('香港上海汇丰银行（HSBC HK）').brand).toBe('hsbc');
    expect(issuerVisual('渣打银行香港（Standard Chartered HK）').brand).toBe('sc');
  });

  it('查不到官方色的银行给中性色 + 真缩写，而不是通用占位', () => {
    expect(issuerVisual('澳门国际银行（Macau Chinese Bank / MIB）')).toEqual({ brand: 'neutral', mark: 'MIB', network: 'unknown' });
  });
});
