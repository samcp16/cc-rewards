/**
 * 卡库的卡片级结构校验（从 loadCards.ts 拆出，单一职责）。
 *
 * 为什么 JSON 还要校验：`import cards from '...json'` 在 TS 里会推断出宽泛的
 * `string` 而非字面量联合，等于类型系统在数据入口处完全失效。这里做一次
 * 显式校验，让「费率写成字符串」「period 拼错」在启动时立刻炸，而不是算出一个假数字。
 *
 * 本文件只管「一张卡」的结构；门槛定义有自己的校验文件（loadCards.threshold.ts）。
 */

import type { Card, EarnTrack, PaymentChannel } from '../types';
import {
  CardDataError,
  CATEGORIES,
  CURRENCIES,
  CONFIDENCE,
  NETWORKS,
  PAYMENT_CHANNELS,
  PERIODS,
  REGIONS,
  assertArray,
  assertNumber,
  assertOneOf,
  assertString,
} from './loadCards.assert';
import { validateThreshold } from './loadCards.threshold';

/**
 * 卡库的运行时类型校验（从 loadCards.ts 拆出，单一职责）。
 *
 * 为什么 JSON 还要校验：`import cards from '...json'` 在 TS 里会推断出宽泛的
 * `string` 而非字面量联合，等于类型系统在数据入口处完全失效。这里做一次
 * 显式校验，让「费率写成字符串」「period 拼错」在启动时立刻炸，而不是算出一个假数字。
 *
 * 本文件的全部导出只为 loadCards.ts 服务；外部不应直接依赖校验器。
 */


/**
 * 渠道作用域校验（ADR-010）。
 *
 * 两条都必须拒绝：
 * - 空数组：看起来声明了作用域、实际一个渠道都没有，会让该卡在所有渠道静默进
 *   unranked，而数据作者以为自己在写「全渠道」——表达「全渠道适用」应省略该字段。
 * - 枚举外的渠道名：拼错渠道（如写成 'alipay_hk'）会让成员判定恒为 false，
 *   同样静默进 unranked，且没有任何一层会报错。
 */
function validateChannelScope(value: unknown, path: string): PaymentChannel[] {
  const scope = assertArray(value, path);
  if (scope.length === 0) {
    throw new CardDataError(`${path} 不得为空数组（表达「全渠道适用」应省略该字段）`);
  }
  return scope.map((ch, i) => assertOneOf(ch, PAYMENT_CHANNELS, `${path}[${i}]`));
}

/** 轨道校验：cashback 的 rates 必须是 {local, foreign?}，不允许出现旧版单值 rate */
function validateTrack(track: unknown, path: string): EarnTrack {
  const t = track as Record<string, unknown>;
  const kind = assertOneOf(t.kind, ['cashback', 'points', 'unknown'] as const, `${path}.kind`);
  const exclusivityGroup = assertString(t.exclusivityGroup, `${path}.exclusivityGroup`);
  const capIds = assertArray(t.capIds ?? [], `${path}.capIds`).map((c, i) =>
    assertString(c, `${path}.capIds[${i}]`),
  );
  const channelScope =
    t.channelScope === undefined ? undefined : validateChannelScope(t.channelScope, `${path}.channelScope`);
  const scoped = channelScope === undefined ? {} : { channelScope };

  if (kind === 'cashback') {
    if (t.rates === null) {
      return { kind, exclusivityGroup, capIds, rates: null, ...scoped };
    }
    const rates = t.rates as Record<string, unknown> | undefined;
    if (typeof rates !== 'object' || rates === null) {
      throw new CardDataError(`${path}.rates 必须是 {local, foreign?} 对象或 null`);
    }
    assertNumber(rates.local, `${path}.rates.local`);
    if (rates.foreign !== undefined) assertNumber(rates.foreign, `${path}.rates.foreign`);
    // 旧版单值 rate 直接拒绝：单值模型会让 MOP 消费取错档（已知坑）
    if ('rate' in rates) {
      throw new CardDataError(`${path}.rates 含旧版单值 rate 字段，必须迁移为 {local, foreign}`);
    }
    return {
      kind,
      exclusivityGroup,
      capIds,
      rates: {
        local: rates.local as number,
        ...(rates.foreign === undefined ? {} : { foreign: rates.foreign as number }),
      },
      ...scoped,
    };
  }
  if (kind === 'points') {
    return {
      kind,
      exclusivityGroup,
      capIds,
      multiplier: assertNumber(t.multiplier, `${path}.multiplier`),
      pointProgramId: assertString(t.pointProgramId, `${path}.pointProgramId`),
      ...scoped,
    };
  }
  return { kind: 'unknown', exclusivityGroup, capIds, rates: null, ...scoped };
}

/**
 * 类别条目上的两个「只用于校验、不参与计算」的字段（ADR-011 §1c / §3）。
 *
 * - `capIds`：显式上限绑定。空数组是合法且必要的（= 本类别不受任何上限约束），
 *   因此不能用 validateChannelScope 那种「空数组即错误」的口径。
 * - `isBaseTierRate`：`rates` 存的是否基础档。缺省 true。
 */
function validateCategoryCapIds(value: unknown, path: string): void {
  const list = assertArray(value, path);
  list.forEach((id, i) => assertString(id, `${path}[${i}]`));
}

function validateIsBaseTierRate(value: unknown, path: string): void {
  if (typeof value !== 'boolean') {
    throw new CardDataError(`${path} 必须是布尔值，实际为 ${JSON.stringify(value)}`);
  }
}

export function validateCard(raw: unknown, index: number): Card {
  const c = raw as Record<string, unknown>;
  const path = `cards[${index}]`;
  const cardId = assertString(c.cardId, `${path}.cardId`);

  if (!c.fxFee) throw new CardDataError(`${path}(${cardId}).fxFee 缺失`);
  const fxFeeRaw = c.fxFee as Record<string, unknown>;
  assertNumber(fxFeeRaw.rate, `${path}(${cardId}).fxFee.rate`);
  if (!fxFeeRaw.source || typeof (fxFeeRaw.source as Record<string, unknown>).url !== 'string') {
    throw new CardDataError(`${path}(${cardId}).fxFee.source.url 缺失，费率必须可溯源`);
  }

  const categories = c.categories as Record<string, unknown>;
  if (!categories) throw new CardDataError(`${path}(${cardId}).categories 缺失`);
  for (const cat of CATEGORIES) {
    const rule = categories[cat] as Record<string, unknown> | undefined;
    if (!rule) throw new CardDataError(`${path}(${cardId}).categories 缺少 ${cat}`);
    assertOneOf(rule.kind, ['cashback', 'points', 'unknown'] as const, `${path}(${cardId}).${cat}.kind`);
    // 类别条目上的 channelScope 必须单独校验：它不走 validateTrack（类别不是轨道），
    // 漏这一步会让拼错的渠道名/空数组在加载期完全静默，只在运行时表现为「这张卡没了」。
    if (rule.channelScope !== undefined) {
      validateChannelScope(rule.channelScope, `${path}(${cardId}).${cat}.channelScope`);
    }
    if (rule.capIds !== undefined) {
      validateCategoryCapIds(rule.capIds, `${path}(${cardId}).${cat}.capIds`);
    }
    if (rule.isBaseTierRate !== undefined) {
      validateIsBaseTierRate(rule.isBaseTierRate, `${path}(${cardId}).${cat}.isBaseTierRate`);
    }
  }

  const caps = assertArray(c.caps ?? [], `${path}(${cardId}).caps`);
  for (const [i, capRaw] of caps.entries()) {
    const cap = capRaw as Record<string, unknown>;
    assertString(cap.id, `${path}(${cardId}).caps[${i}].id`);
    assertOneOf(cap.period, PERIODS, `${path}(${cardId}).caps[${i}].period`);
    assertNumber(cap.limitAmount, `${path}(${cardId}).caps[${i}].limitAmount`);
    assertOneOf(cap.limitCurrency, CURRENCIES, `${path}(${cardId}).caps[${i}].limitCurrency`);
    if (cap.overLimitFallback) {
      validateTrack(cap.overLimitFallback, `${path}(${cardId}).caps[${i}].overLimitFallback`);
    }
  }

  // capIds 必须指向本卡真实声明的上限。拼错的 id 不会报错，只会让该类别
  // 静默地「不受任何上限约束」—— 与 N1 同属静默高估，必须在加载期拦住。
  // 校验放在 caps 解析之后：需要先拿到 id 全集。
  const declaredCapIds = new Set(caps.map((capRaw) => (capRaw as Record<string, unknown>).id as string));
  for (const cat of CATEGORIES) {
    const rule = categories[cat] as Record<string, unknown> | undefined;
    for (const capId of (rule?.capIds as string[] | undefined) ?? []) {
      if (!declaredCapIds.has(capId)) {
        throw new CardDataError(
          `${path}(${cardId}).${cat}.capIds 引用了本卡未声明的上限 ${capId}（已声明：${
            [...declaredCapIds].join(', ') || '无'
          }）—— 拼错的 id 会让该类别静默地不受任何上限约束`,
        );
      }
    }
  }

  const thresholds = assertArray(c.thresholds ?? [], `${path}(${cardId}).thresholds`);
  for (const [i, thRaw] of thresholds.entries()) {
    validateThreshold(thRaw, `${path}(${cardId}).thresholds[${i}]`, cardId, categories);
  }

  const issuerRegion = assertOneOf(c.issuerRegion, REGIONS, `${path}(${cardId}).issuerRegion`);
  const network = assertOneOf(c.network, NETWORKS, `${path}(${cardId}).network`);

  return {
    ...(c as unknown as Card),
    issuerRegion,
    network,
    cardCurrency: assertOneOf(c.cardCurrency, CURRENCIES, `${path}(${cardId}).cardCurrency`),
    confidence: assertOneOf(c.confidence, CONFIDENCE, `${path}(${cardId}).confidence`),
    verifiedAt: assertString(c.verifiedAt, `${path}(${cardId}).verifiedAt`),
    // 注入发卡身份：豁免过期后需要按 issuerRegion + network 回落到默认费率表
    fxFee: {
      ...(fxFeeRaw as unknown as Card["fxFee"]),
      currencyRegion: issuerRegion,
      currencyNetwork: network,
    },
  };
}
