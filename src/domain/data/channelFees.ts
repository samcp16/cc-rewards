/**
 * 渠道服务费默认规则。
 *
 * 为什么是「渠道 × 卡组织 × 金额区间」三维函数而不是常数：
 * 内地支付宝绑境外 Visa/MC 200 元以上收 3%，而云闪付绑港银联卡 0%。
 * 把渠道费当 0 或当常数，都会让「换个渠道刷」这个核心建议失去依据。
 *
 * 数据来源见每条规则的 source；核实日期 2026-10-31。
 */

import type { ChannelFeeRule } from '../types';

const VERIFIED_AT = '2026-10-31';

export const DEFAULT_CHANNEL_FEES: ChannelFeeRule[] = [
  {
    id: 'channel:alipay:cn-foreign-card',
    channel: 'alipay',
    // 内地支付宝直绑境外 Visa / Mastercard / Amex：200 元以上收 3%
    networkIn: ['visa', 'mastercard', 'amex', 'jcb'],
    tiers: [
      { fromAmount: 0, toAmount: 200, rate: 0, fixedFee: 0 },
      { fromAmount: 200, toAmount: null, rate: 0.03, fixedFee: 0 },
    ],
    source: {
      url: 'https://longbridge.com/',
      verifiedAt: VERIFIED_AT,
      note: '内地支付宝直接绑定境外 Visa / Mastercard：200 元以上收取 3% 手续费',
    },
  },
  {
    id: 'channel:wechat:cn-foreign-card',
    channel: 'wechat',
    networkIn: ['visa', 'mastercard', 'amex', 'jcb'],
    tiers: [
      { fromAmount: 0, toAmount: 200, rate: 0, fixedFee: 0 },
      { fromAmount: 200, toAmount: null, rate: 0.03, fixedFee: 0 },
    ],
    source: {
      url: 'https://longbridge.com/',
      verifiedAt: VERIFIED_AT,
      note: '内地微信支付绑定境外卡：200 元以上收取 3% 手续费',
    },
  },
  {
    id: 'channel:unionpay_qr',
    channel: 'unionpay_qr',
    // 云闪付绑港银联卡走银联通道：0 手续费
    networkIn: ['unionpay'],
    tiers: [{ fromAmount: 0, toAmount: null, rate: 0, fixedFee: 0 }],
    source: {
      url: 'https://evision.news/',
      verifiedAt: VERIFIED_AT,
      note: '云闪付绑定港澳银联卡走银联通道，0 手续费',
    },
  },
  {
    id: 'channel:physical',
    channel: 'physical',
    tiers: [{ fromAmount: 0, toAmount: null, rate: 0, fixedFee: 0 }],
    source: {
      url: 'https://www.hsbc.com.hk/credit-cards/',
      verifiedAt: VERIFIED_AT,
      note: '实体刷卡本身不产生渠道服务费，跨境成本由卡的外币手续费承担',
    },
  },
  {
    id: 'channel:apple_pay',
    channel: 'apple_pay',
    tiers: [{ fromAmount: 0, toAmount: null, rate: 0, fixedFee: 0 }],
    source: {
      url: 'https://www.hsbc.com.hk/credit-cards/',
      verifiedAt: VERIFIED_AT,
      note: 'Apple Pay 视同实体刷卡，不额外收取渠道服务费',
    },
  },
];
