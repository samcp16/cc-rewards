/**
 * 卡库校验的基础设施：错误类型、枚举白名单、标量断言。
 *
 * 单独成文件的原因：`CardDataError` 被三个校验文件共用，`assertOneOf` 等
 * 标量断言是它们共同的词汇表。放在任何一个业务校验文件里都会让其余文件
 * 反向依赖它，形成「校验器依赖校验器」的隐式顺序。
 */

import type { CardNetwork, ConfidenceLevel, CurrencyCode, IssuerRegion, PaymentChannel, SpendCategory } from '../types';

export const CATEGORIES: SpendCategory[] = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];
export const NETWORKS: CardNetwork[] = ['visa', 'mastercard', 'unionpay', 'amex', 'jcb'];
export const REGIONS: IssuerRegion[] = ['MO', 'HK'];
export const CURRENCIES: CurrencyCode[] = ['MOP', 'HKD', 'CNY'];
export const CONFIDENCE: ConfidenceLevel[] = ['high', 'medium', 'low', 'unknown', 'user_provided'];
export const PERIODS = ['month', 'year', 'half_year'] as const;
/** 与 types.ts 的 PaymentChannel 联合类型保持同步（新增渠道时两处都要改） */
export const PAYMENT_CHANNELS: PaymentChannel[] = ['physical', 'alipay', 'wechat', 'unionpay_qr', 'apple_pay'];


export class CardDataError extends Error {
  constructor(message: string) {
    super(`卡库数据校验失败：${message}`);
    this.name = 'CardDataError';
  }
}

export function assertOneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new CardDataError(`${path} 必须是 ${allowed.join(' | ')} 之一，实际为 ${JSON.stringify(value)}`);
  }
  return value as T;
}

export function assertNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CardDataError(`${path} 必须是有限数值，实际为 ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CardDataError(`${path} 必须是非空字符串，实际为 ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new CardDataError(`${path} 必须是数组，实际为 ${typeof value}`);
  }
  return value;
}
