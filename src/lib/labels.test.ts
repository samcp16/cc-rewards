/**
 * 中文文案映射测试。
 *
 * 这一层不出错则没人注意，出错则用户会以为「加油」和「油费」是两个类别。
 * 所以断言分两类：
 * 1. 每个枚举成员都有映射（漏一个 → 界面上出现英文原始值）
 * 2. 文案彼此不重复（重复 → 用户无法区分）
 */

import { describe, it, expect } from 'vitest';
import {
  CATEGORY_OPTIONS,
  CHANNEL_OPTIONS,
  REGION_OPTIONS,
  ISSUER_REGION_LABEL,
  NETWORK_LABEL,
  NETWORK_SHORT,
  CURRENCY_LABEL,
  SETTLEMENT_BY_REGION,
  PERIOD_LABEL,
  PERIOD_SCOPE_LABEL,
  labelOf,
  categoryLabel,
  channelLabel,
  regionLabel,
} from './labels';
import type { SpendCategory, PaymentChannel, CardNetwork, CurrencyCode } from '../domain/types';

const CATEGORIES: SpendCategory[] = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];
const CHANNELS: PaymentChannel[] = ['physical', 'alipay', 'wechat', 'unionpay_qr', 'apple_pay'];
const NETWORKS: CardNetwork[] = ['visa', 'mastercard', 'unionpay', 'amex', 'jcb'];
const CURRENCIES: CurrencyCode[] = ['MOP', 'HKD', 'CNY'];

describe('消费类别', () => {
  it('7 个类别全部有中文文案，一个不漏', () => {
    expect(CATEGORY_OPTIONS.map((o) => o.value).sort()).toEqual([...CATEGORIES].sort());
    for (const c of CATEGORIES) expect(categoryLabel(c)).not.toBe(c);
  });

  it('文案互不重复（否则用户以为有重复项）', () => {
    const labels = CATEGORY_OPTIONS.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('order 与 SPEC 一致：餐饮在最前（最高频）', () => {
    expect(CATEGORY_OPTIONS[0]!.value).toBe('dining');
    expect(CATEGORY_OPTIONS.at(-1)!.value).toBe('other');
  });
});

describe('支付渠道', () => {
  it('5 个渠道全有文案', () => {
    expect(CHANNEL_OPTIONS.map((o) => o.value).sort()).toEqual([...CHANNELS].sort());
    for (const c of CHANNELS) expect(channelLabel(c)).not.toBe(c);
  });

  it('Apple Pay 保留英文品牌名，不硬译', () => {
    expect(channelLabel('apple_pay')).toBe('Apple Pay');
  });

  it('渠道文案互不重复', () => {
    const labels = CHANNEL_OPTIONS.map((o) => o.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('地区：只写「澳门 / 内地」', () => {
  it('内地不写成「中国内地」（用户就在澳门，语境里不需要）', () => {
    expect(regionLabel('CN')).toBe('内地');
    expect(regionLabel('MO')).toBe('澳门');
  });

  it('两个地区都在选项里', () => {
    expect(REGION_OPTIONS).toHaveLength(2);
  });
});

describe('枚举映射完整性', () => {
  it('发卡地区全有文案', () => {
    expect(ISSUER_REGION_LABEL.MO).toBe('澳门发卡');
    expect(ISSUER_REGION_LABEL.HK).toBe('香港发卡');
  });

  it('5 个卡组织全有全称与简称', () => {
    for (const n of NETWORKS) {
      expect(NETWORK_LABEL[n]).toBeTruthy();
      expect(NETWORK_SHORT[n]).toBeTruthy();
    }
  });

  it('卡组织全称带中文，简称用英文（唯一识别方式，不用 logo）', () => {
    expect(NETWORK_LABEL.unionpay).toContain('银联');
    expect(NETWORK_SHORT.unionpay).toBe('银联');
    expect(NETWORK_SHORT.visa).toBe('Visa');
  });

  it('3 个币种全有文案', () => {
    for (const c of CURRENCIES) expect(CURRENCY_LABEL[c]).toContain(c);
  });
});

describe('结算币种随地区', () => {
  it('澳门 → MOP，内地 → CNY', () => {
    expect(SETTLEMENT_BY_REGION.MO).toBe('MOP');
    expect(SETTLEMENT_BY_REGION.CN).toBe('CNY');
  });
});

describe('周期文案：口径前缀与单位分开', () => {
  it('三个周期全有单位文案', () => {
    expect(PERIOD_LABEL.month).toBe('每月');
    expect(PERIOD_LABEL.year).toBe('每年');
    expect(PERIOD_LABEL.half_year).toBe('每半年');
  });

  it('额度数字行用「本月/今年/本半年」', () => {
    expect(PERIOD_SCOPE_LABEL.month).toBe('本月');
    expect(PERIOD_SCOPE_LABEL.year).toBe('今年');
    expect(PERIOD_SCOPE_LABEL.half_year).toBe('本半年');
  });

  it('两套文案不得混用（「每月限额」与「本月已用」语义不同）', () => {
    expect(PERIOD_LABEL.month).not.toBe(PERIOD_SCOPE_LABEL.month);
  });
});

describe('labelOf：查不到时回落到原始值', () => {
  it('已知值返回文案', () => {
    expect(labelOf(CATEGORY_OPTIONS, 'dining' as SpendCategory)).toBe('餐饮');
  });

  it('未知值返回原值而不是空串或 undefined（便于发现数据问题）', () => {
    const unknown = 'entertainment' as SpendCategory;
    expect(labelOf(CATEGORY_OPTIONS, unknown)).toBe('entertainment');
  });
});
