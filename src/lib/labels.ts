/**
 * 领域枚举 → 中文文案的唯一映射表。
 *
 * 为什么集中在一处：类别、渠道、卡组织、周期这四组枚举会在 5 个页面里各出现一次。
 * 分散写的话，「fuel」在一处叫「加油」、另一处叫「油费」，用户会以为是两个东西。
 *
 * 文案口径见 design/pages/*.md：
 * - 地区只写「澳门 / 内地」，不写「中国内地」（用户就在澳门）
 * - 卡组织写中文全称 + 英文括注（本产品不用品牌 logo，文字是唯一识别方式）
 */

import type {
  CardNetwork,
  CurrencyCode,
  IssuerRegion,
  PaymentChannel,
  SpendCategory,
  SpendRegion,
} from '../domain/types';

export interface Labeled<T extends string> {
  value: T;
  label: string;
  short?: string;
}

export const CATEGORY_OPTIONS: Array<Labeled<SpendCategory>> = [
  { value: 'dining', label: '餐饮' },
  { value: 'grocery', label: '超市' },
  { value: 'fuel', label: '加油' },
  { value: 'flight', label: '机票' },
  { value: 'hotel', label: '酒店' },
  { value: 'online', label: '网购' },
  { value: 'other', label: '其他' },
];

export const CHANNEL_OPTIONS: Array<Labeled<PaymentChannel>> = [
  { value: 'physical', label: '刷卡' },
  { value: 'alipay', label: '支付宝' },
  { value: 'wechat', label: '微信' },
  { value: 'unionpay_qr', label: '云闪付' },
  { value: 'apple_pay', label: 'Apple Pay' },
];

export const REGION_OPTIONS: Array<Labeled<SpendRegion>> = [
  { value: 'MO', label: '澳门' },
  { value: 'CN', label: '内地' },
];

export const ISSUER_REGION_LABEL: Record<IssuerRegion, string> = {
  MO: '澳门发卡',
  HK: '香港发卡',
};

export const NETWORK_LABEL: Record<CardNetwork, string> = {
  visa: '维萨（Visa）',
  mastercard: '万事达（Mastercard）',
  unionpay: '银联（UnionPay）',
  amex: '美国运通（Amex）',
  jcb: '吉士美（JCB）',
};

export const NETWORK_SHORT: Record<CardNetwork, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  unionpay: '银联',
  amex: 'Amex',
  jcb: 'JCB',
};

export const CURRENCY_LABEL: Record<CurrencyCode, string> = {
  MOP: '澳门币（MOP）',
  HKD: '港元（HKD）',
  CNY: '人民币（CNY）',
};

/** 结算币种随消费地区变：澳门 → MOP，内地 → CNY */
export const SETTLEMENT_BY_REGION: Record<SpendRegion, CurrencyCode> = {
  MO: 'MOP',
  CN: 'CNY',
};

export const PERIOD_LABEL: Record<'month' | 'year' | 'half_year', string> = {
  month: '每月',
  year: '每年',
  half_year: '每半年',
};

/** 「本月 / 今年 / 本半年」—— 额度数字行的口径前缀 */
export const PERIOD_SCOPE_LABEL: Record<'month' | 'year' | 'half_year', string> = {
  month: '本月',
  year: '今年',
  half_year: '本半年',
};

export function labelOf<T extends string>(options: Array<Labeled<T>>, value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function categoryLabel(value: SpendCategory): string {
  return labelOf(CATEGORY_OPTIONS, value);
}

export function channelLabel(value: PaymentChannel): string {
  return labelOf(CHANNEL_OPTIONS, value);
}

export function regionLabel(value: SpendRegion): string {
  return labelOf(REGION_OPTIONS, value);
}
