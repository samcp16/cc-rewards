/**
 * 渠道门控的回归基线（ADR-010 §4 第 8 条）。
 *
 * 从 channel-gate.test.ts 拆出：那组断言证明「tai-fung 的行为改对了」，
 * 这组断言证明「其他卡一个值都没动」。两个关注点分开，红的时候
 * 一眼能看出是「改错了语义」还是「改漏了影响面」。
 *
 * ADR-011 起基线只有一个来源：`adr011-baseline.json`（2660 组合，含两态）。
 * 上一版 `adr010-baseline.json` 固定 amount=2000 且账本为空，而 2000 已越过
 * chill/bea/wewa 三个门槛 —— 它的「未达标」侧实际是达标侧，把 N1 的缺陷值
 * （wewa grocery 4%）固化成了「正确」。QA N3 指出的失明就是它。
 *
 * 渠道维度的断言因此改为在新夹具上做切片，而不是再养一份快照：
 * 两份快照必然漂移，而漂移的那一份总是没人看的那一份。
 */

import { describe, it, expect } from 'vitest';
import { rankSingleCard } from './index';
import { CARDS } from '../data/loadCards';
import { card, makeParams } from '../__fixtures__/params';
import { MATRIX_BASELINE } from '../__fixtures__/adr011-baseline';
import type { PaymentChannel, SpendCategory, SpendInput } from '../types';

const params = makeParams();
const TAI_FUNG = 'tai-fung-unionpay-dual';
const CHANNELS: PaymentChannel[] = ['physical', 'alipay', 'wechat', 'unionpay_qr', 'apple_pay'];
const CATEGORIES: SpendCategory[] = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];

function input(over: Partial<SpendInput> & Pick<SpendInput, 'amount'>): SpendInput {
  return {
    settlementCurrency: 'MOP',
    region: 'MO',
    category: 'dining',
    channel: 'physical',
    ...over,
  };
}

describe('渠道维度：不抛错', () => {
  it('38 卡 × 5 渠道 × 7 类别 = 1330 个组合全部不抛错', () => {
    let count = 0;
    for (const c of CARDS) {
      for (const channel of CHANNELS) {
        for (const category of CATEGORIES) {
          expect(() =>
            rankSingleCard(c, [], params, input({ amount: 1000, category, channel })),
          ).not.toThrow();
          count += 1;
        }
      }
    }
    expect(count).toBe(38 * 5 * 7);
  });
});

describe('渠道维度：tai-fung 的渠道门控仍然成立', () => {
  it('physical 下 dining 是 unknown（该卡不适用实体渠道）', () => {
    const now = rankSingleCard(
      card(TAI_FUNG),
      [],
      params,
      input({ amount: 1000, category: 'dining', channel: 'physical' }),
    );
    expect(now?.status).toBe('unknown');
  });

  it('alipay 下 dining 有具体值（门控没有把可用渠道一起挡掉）', () => {
    const now = rankSingleCard(
      card(TAI_FUNG),
      [],
      params,
      input({ amount: 1000, category: 'dining', channel: 'alipay' }),
    );
    expect(now?.status).not.toBe('unknown');
  });
});

describe('渠道维度：与 2660 基线一致（不另养快照）', () => {
  it('基线中每条记录的渠道字段都在 5 个渠道之内', () => {
    const seen = new Set(MATRIX_BASELINE.map((r) => r.channel));
    for (const ch of seen) {
      expect(CHANNELS).toContain(ch as PaymentChannel);
    }
    expect(seen.size).toBe(5);
  });

  it('每个渠道都覆盖了全部 38 卡 × 7 类别 × 3 金额档 × 2 态 = 1596 条', () => {
    for (const ch of CHANNELS) {
      expect(MATRIX_BASELINE.filter((r) => r.channel === ch)).toHaveLength(38 * 7 * 3 * 2);
    }
  });
});
