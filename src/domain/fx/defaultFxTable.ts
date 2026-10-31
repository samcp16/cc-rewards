/**
 * 外币手续费默认值表（发卡地区 + 卡组织 二维）。
 *
 * 为什么必须二维：AC-F2-03 要求「按发卡地区 + 卡组织」带出默认值。只按地区带出
 * 会给所有香港卡填 0%，系统性高估 1.95% —— 这正是产品的价值支点（ARCHITECTURE §12.3 差异 D1）。
 *
 * 表内数字全部来自卡库已核实的官方来源，不是经验值。
 */

import type { CardNetwork, IssuerRegion, SourceRef } from '../types';

interface DefaultFxEntry {
  rate: number;
  /** 银联双币在特定结算币种下豁免；此处为「其他外币」的兜底费率 */
  note: string;
  source: SourceRef;
}

const VERIFIED_AT = '2026-10-31';

/** 香港主流发卡行卡组织的官方 KFS 费率表，2026-10-31 核实 */
const HK_VISA_MC: DefaultFxEntry = {
  rate: 0.0195,
  note: '香港主流发卡行 Visa / Mastercard 外币交易手续费 1.95%',
  source: {
    url: 'https://www.hsbc.com.hk/credit-cards/',
    verifiedAt: VERIFIED_AT,
    note: '汇丰《Key Fact Statement》与 comparecard.hk 2026 年海外签账手续费比较交叉确认',
  },
};

const HK_AMEX: DefaultFxEntry = {
  rate: 0.02,
  note: 'Amex 香港外币交易费 2%，且不收跨境港币交易费（CBF 0%）',
  source: {
    url: 'https://www.americanexpress.com/hk/credit-cards/',
    verifiedAt: VERIFIED_AT,
    note: 'Amex 官方 KFS 明列外币交易费 2%',
  },
};

const HK_UNIONPAY: DefaultFxEntry = {
  rate: 0.01,
  note: '银联双币卡：人民币 / 澳门币结算豁免，其他外币 1%',
  source: {
    url: 'https://www.hsbc.com.hk/credit-cards/products/unionpay-dual-currency/',
    verifiedAt: VERIFIED_AT,
    note: '汇丰银联双币卡官方费率页：非港元 / 澳门币 / 人民币交易，汇率已含 1% 手续费',
  },
};

const HK_AEON: DefaultFxEntry = {
  rate: 0.015,
  note: 'AEON 香港外币交易手续费 1.5%，为市场最低档之一',
  source: {
    url: 'https://www.aeon.com.hk/credit-card/',
    verifiedAt: VERIFIED_AT,
    note: 'AEON 官方收费表 1.5%',
  },
};

const MO_VISA_MC: DefaultFxEntry = {
  rate: 0.0195,
  note: '澳门发卡行 Visa / Mastercard 跨境交易手续费 1.75%–1.95%，取上限',
  source: {
    url: 'https://bnu.com.mo/storage/documents/PricingList/BNU_PricingList_CN.pdf',
    verifiedAt: VERIFIED_AT,
    note: 'BNU 官方收费表第 18 页：跨境交易手续费 1.90%；取区域内上限 1.95% 以不低估成本',
  },
};

const MO_UNIONPAY: DefaultFxEntry = {
  rate: 0,
  note: '澳门银联卡跨境交易手续费 0%',
  source: {
    url: 'https://www.taifungbank.com/',
    verifiedAt: VERIFIED_AT,
    note: '大丰银行官方收费表：银联卡跨境交易手续费 0%',
  },
};

/**
 * 默认表：region -> network -> 费率。
 * 未覆盖的组合返回 null，调用方必须要求用户显式填写（AC-F2-04 禁止留空保存）。
 */
const DEFAULT_FX_TABLE: Record<IssuerRegion, Partial<Record<CardNetwork, DefaultFxEntry>>> = {
  HK: {
    visa: HK_VISA_MC,
    mastercard: HK_VISA_MC,
    amex: HK_AMEX,
    unionpay: HK_UNIONPAY,
    jcb: HK_VISA_MC,
  },
  MO: {
    visa: MO_VISA_MC,
    mastercard: MO_VISA_MC,
    amex: HK_AMEX,
    unionpay: MO_UNIONPAY,
    jcb: MO_VISA_MC,
  },
};

/** AEON 香港的两张卡实测为 1.5%，按发卡行细化（AC-F2-03 明确列出 AEON = 1.5%） */
const ISSUER_OVERRIDES: Array<{ match: RegExp; region: IssuerRegion; entry: DefaultFxEntry }> = [
  { match: /aeon/i, region: 'HK', entry: HK_AEON },
];

export function getDefaultFx(issuerRegion: IssuerRegion, network: CardNetwork): number | null {
  const entry = DEFAULT_FX_TABLE[issuerRegion]?.[network];
  return entry ? entry.rate : null;
}

export function getDefaultFxEntry(
  issuerRegion: IssuerRegion,
  network: CardNetwork,
  issuerName?: string,
): DefaultFxEntry | null {
  if (issuerName) {
    const override = ISSUER_OVERRIDES.find((o) => o.region === issuerRegion && o.match.test(issuerName));
    if (override) return override.entry;
  }
  return DEFAULT_FX_TABLE[issuerRegion]?.[network] ?? null;
}

/**
 * 银联双币卡的豁免币种集合。SPEC §6.2.1 表最后一行：银联双币在港澳 / 内地场景
 * 视同 local 且 FTF 判豁免。这里给出默认豁免集合，卡级已配置 waivers 时以卡级为准。
 */
export const UNIONPAY_DUAL_CURRENCY_WAIVER: ReadonlyArray<'MOP' | 'HKD' | 'CNY'> = ['MOP', 'HKD', 'CNY'];
