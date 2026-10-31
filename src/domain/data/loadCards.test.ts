/**
 * 数据层测试：卡库校验、默认费率表、积分估值。
 *
 * 这些是「输入能否被信任」的关口。把关口测松了，后面所有数字都没有意义。
 */

import { describe, it, expect } from 'vitest';
import { loadCards, CARDS, getCardById, PRESET_CARD_IDS, CardDataError } from './loadCards';

describe('loadCards：预置卡库', () => {
  it('加载 38 张卡（SPEC §3.1）', () => {
    expect(CARDS).toHaveLength(38);
  });

  it('全部 issuerRegion 只含 MO / HK（美国卡已移除）', () => {
    const regions = new Set(CARDS.map((c) => c.issuerRegion));
    expect([...regions].sort()).toEqual(['HK', 'MO']);
  });

  it('每张卡 fxFee 都带 source.url（费率必须可溯源）', () => {
    for (const c of CARDS) {
      expect(c.fxFee.source.url, `${c.cardId} 缺 fxFee.source.url`).toBeTruthy();
    }
  });

  it('每张卡的 categories 七个类别齐全', () => {
    const cats = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];
    for (const c of CARDS) {
      for (const cat of cats) {
        expect(c.categories[cat as keyof typeof c.categories], `${c.cardId}.${cat}`).toBeDefined();
      }
    }
  });

  it('fxFee 注入发卡身份（豁免过期后回落用）', () => {
    const sc = getCardById('sc-simply-cash')!;
    expect(sc.fxFee.currencyRegion).toBe('HK');
    expect(sc.fxFee.currencyNetwork).toBe('visa');
  });

  it('SPEC §3.2 的 12 张预置卡全部真实存在（防止凭记忆写 id）', () => {
    for (const id of PRESET_CARD_IDS) {
      expect(getCardById(id), `预置 id 不存在：${id}`).toBeDefined();
    }
    expect(PRESET_CARD_IDS).toHaveLength(12);
  });

  it('反向验证：重复 cardId → 抛 CardDataError', () => {
    expect(() => loadCards([CARDS[0], CARDS[0]])).toThrow(CardDataError);
  });

  it('反向验证：缺 fxFee → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(CARDS[0]));
    delete clone.fxFee;
    expect(() => loadCards([clone])).toThrow(/fxFee 缺失/);
  });

  it('反向验证：fxFee 缺 source.url → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(CARDS[0]));
    clone.fxFee.source = {};
    expect(() => loadCards([clone])).toThrow(/source.url 缺失/);
  });

  it('反向验证：类别缺失 → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(CARDS[0]));
    delete clone.categories.dining;
    expect(() => loadCards([clone])).toThrow(/缺少 dining/);
  });

  it('反向验证：issuerRegion=US → 抛错（枚举已收窄）', () => {
    const clone = JSON.parse(JSON.stringify(CARDS[0]));
    clone.issuerRegion = 'US';
    expect(() => loadCards([clone])).toThrow(/issuerRegion/);
  });

  it('反向验证：bonusTiers 为空数组 → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('dbs-black-world')));
    clone.thresholds[0].bonusTiers = [];
    expect(() => loadCards([clone])).toThrow(/不得为空/);
  });

  it('反向验证：categoryBindings 与 bonusTiers 同时声明 → 抛错（两条路互斥）', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('boc-hk-chill')));
    clone.thresholds[0].bonusTiers = [{ minSpend: 0, gain: {} }];
    expect(() => loadCards([clone])).toThrow(/不得同时声明/);
  });

  it('反向验证：binding 缺 fallback（空 binding）→ 抛错（N8：高估 25 倍零告警的形态）', () => {
    // binding 存在即声明「本类别受门槛约束」。空 binding（gain 与 fallback 均缺）
    // 曾合法加载，未达标时静默沿用 categories 的达标值（chill dining 10% vs 官方 0.4%）。
    // 第四轮勘误后 gain 字段已删除，等价形态是「缺 fallback」，必须在加载期拒绝。
    const clone = JSON.parse(JSON.stringify(getCardById('boc-hk-chill')));
    delete clone.thresholds[0].categoryBindings.dining.fallback;
    expect(() => loadCards([clone])).toThrow(/缺 fallback/);
  });

  it('反向验证：binding 存在但 isBaseTierRate !== false → 抛错（哪一侧是主档不可省略）', () => {
    // binding 存在要求 categories 记的是达标档且显式声明。标志缺省 true 时
    // 旧版校验会被静默绕过（QA A10 形态），新校验不看「有没有 gain」而看声明本身。
    const clone = JSON.parse(JSON.stringify(getCardById('boc-hk-chill')));
    clone.categories.dining.isBaseTierRate = true;
    expect(() => loadCards([clone])).toThrow(/isBaseTierRate !== false/);
  });

  it('反向验证：binding 缺 fallback 且 isBaseTierRate 缺省（全空声明）→ 抛 fallback 错在先', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('boc-hk-chill')));
    delete clone.thresholds[0].categoryBindings.dining.fallback;
    delete clone.categories.dining.isBaseTierRate;
    expect(() => loadCards([clone])).toThrow(/缺 fallback/);
  });

  it('反向验证：bonusTiers 的档位缺 gain → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('dbs-black-world')));
    delete clone.thresholds[0].bonusTiers[0].gain;
    expect(() => loadCards([clone])).toThrow(/gain 必填/);
  });

  it('反向验证：bonusTiers 最低档 minSpend 非 0 → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('dbs-black-world')));
    clone.thresholds[0].bonusTiers[0].minSpend = 500;
    expect(() => loadCards([clone])).toThrow(/最低档 minSpend 必须为 0/);
  });

  it('反向验证：capIds 含未定义的上限 id → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('boc-hk-chill')));
    clone.categories.dining.capIds = ['no-such-cap'];
    expect(() => loadCards([clone])).toThrow(/capIds/);
  });

  it('反向验证：isBaseTierRate 非布尔 → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('boc-hk-chill')));
    clone.categories.dining.isBaseTierRate = 'no';
    expect(() => loadCards([clone])).toThrow(/isBaseTierRate/);
  });

  it('反向验证：binding 同时声明 rate 与 multiplierDelta → 抛错（二选一）', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('boc-hk-chill')));
    clone.thresholds[0].categoryBindings.dining.fallback = { rate: 0.004, multiplierDelta: 1 };
    expect(() => loadCards([clone])).toThrow(/不得同时声明/);
  });

  it('反向验证：accrualCategories 为空数组 → 抛错（表达「全类别」应写 "all"）', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('boc-hk-chill')));
    clone.thresholds[0].accrualCategories = [];
    expect(() => loadCards([clone])).toThrow(/accrualCategories/);
  });

  it('反向验证：CAPS 非法 limitCurrency → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('boc-hk-chill')));
    clone.caps[0].limitCurrency = 'USD';
    expect(() => loadCards([clone])).toThrow(/limitCurrency/);
  });

  // ---------- channelScope 校验（ADR-010 §5） ----------
  // 两条断言的理由同源：写错的 channelScope 不会让任何一层报错，
  // 只会让该卡在所有渠道静默进 unranked，用户看到「这张卡没了」。

  it('反向验证：channelScope 为空数组 → 抛错（表达「全渠道」应省略该字段）', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('tai-fung-unionpay-dual')));
    clone.categories.dining.channelScope = [];
    expect(() => loadCards([clone])).toThrow(CardDataError);
    expect(() => loadCards([clone])).toThrow(/channelScope 不得为空数组/);
  });

  it('反向验证：channelScope 含枚举外的渠道名 → 抛错（拼错渠道会让成员判定恒为 false）', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('tai-fung-unionpay-dual')));
    clone.categories.dining.channelScope = ['alipay_hk'];
    expect(() => loadCards([clone])).toThrow(CardDataError);
    expect(() => loadCards([clone])).toThrow(/channelScope\[0\]/);
  });

  it('反向验证：channelScope 非数组 → 抛错', () => {
    const clone = JSON.parse(JSON.stringify(getCardById('tai-fung-unionpay-dual')));
    clone.categories.dining.channelScope = 'alipay';
    expect(() => loadCards([clone])).toThrow(/channelScope 必须是数组/);
  });

  it('正向验证：tai-fung 的 channelScope 通过加载并落到 CategoryRule 上', () => {
    const tf = getCardById('tai-fung-unionpay-dual')!;
    expect(tf.categories.dining.channelScope).toEqual(['unionpay_qr', 'wechat', 'alipay']);
    // 其余卡保持缺省（全渠道适用）
    expect(getCardById('boc-hk-chill')!.categories.dining.channelScope).toBeUndefined();
  });

  it('channelScope 的校验对 categories 轨道生效（门槛已不持有轨道，ADR-011）', () => {
    // ADR-011 删掉 tier.earn 后，门槛侧再无轨道可携带 channelScope；
    // 渠道作用域只存在于 categories[].channelScope 一处，校验仍走同一函数。
    const clone = JSON.parse(JSON.stringify(getCardById('tai-fung-unionpay-dual')));
    clone.categories.dining.channelScope = [];
    expect(() => loadCards([clone])).toThrow(/channelScope 不得为空数组/);
  });
});
