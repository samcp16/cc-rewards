/**
 * 卡面视觉：发卡行标识色 + 卡组织 + 银行缩写。
 *
 * 为什么不用官网抓来的卡面照片：
 *   - 澳门 17 张卡的官网是 JS 空壳或被 Incapsula 反爬，抓不到图
 *   - 香港各家图片规则互不相同，且多为带场景的营销图（684×630 方图、
 *     1920×280 banner），要逐张裁切再逐张核对是不是那张卡
 *   - 配错卡比没有卡面糟得多：用户会以为自己拿的是另一张卡
 *
 * 所以列表里统一用绘制卡面：颜色 + 卡组织 + 银行缩写。在 48px 的高度上，
 * 辨识靠的本来就是「颜色块 + 形状」，不是卡面细节；而绘制方案 38 张全覆盖、
 * 零请求、零版权风险。
 *
 * 这里只给 token 名，颜色值全部在 design/design-tokens.css 的 3.5 节。
 * 品牌色是数据不是样式，但它仍然必须走 token —— 否则「这批色各自配什么字」
 * 会散落在 n 个组件里，没人能一次审完。
 */

export type CardNetwork = 'visa' | 'mastercard' | 'unionpay' | 'amex' | 'unknown';

/** design-tokens.css 中 `--brand-<key>` / `--brand-<key>-ink` 的 key */
export type BrandKey =
  | 'hsbc'
  | 'sc'
  | 'citi'
  | 'bochk'
  | 'hase'
  | 'dbs'
  | 'mox'
  | 'amex'
  | 'aeon'
  | 'bea'
  | 'ocbc'
  | 'icbc'
  | 'bnu'
  | 'bocm'
  | 'tf'
  | 'wewa'
  | 'earnmore'
  | 'neutral';

export interface CardVisual {
  /** 卡面底色 */
  brand: BrandKey;
  /** 卡面左上角的银行缩写，2–5 个大写字母 */
  mark: string;
  network: CardNetwork;
}

/**
 * 银行 → 标识色。
 *
 * 落到 'neutral' 表示「没查到可信的官方色」。宁可少一点辨识度，也不猜一个
 * 看起来像的颜色 —— 猜错最坏的结果不是难看，是让用户凭颜色认错卡。
 */
const ISSUER_BRAND: Array<{ match: string; brand: BrandKey; mark: string }> = [
  // —— 香港 ——
  { match: '香港上海汇丰银行', brand: 'hsbc', mark: 'HSBC' },
  { match: '渣打银行', brand: 'sc', mark: 'SC' },
  { match: '花旗银行', brand: 'citi', mark: 'CITI' },
  { match: '中银香港', brand: 'bochk', mark: 'BOCHK' },
  { match: '恒生银行', brand: 'hase', mark: 'HASE' },
  { match: '星展银行', brand: 'dbs', mark: 'DBS' },
  { match: 'Mox', brand: 'mox', mark: 'MOX' },
  { match: '美国运通', brand: 'amex', mark: 'AMEX' },
  { match: 'AEON', brand: 'aeon', mark: 'AEON' },
  { match: '东亚银行', brand: 'bea', mark: 'BEA' },
  // —— 澳门 ——
  { match: '华侨永亨', brand: 'ocbc', mark: 'OCBC' },
  { match: '工银澳门', brand: 'icbc', mark: 'ICBC' },
  { match: '大西洋银行', brand: 'bnu', mark: 'BNU' },
  { match: '中国银行澳门分行', brand: 'bocm', mark: 'BOCM' },
  { match: '大丰银行', brand: 'tf', mark: 'TF' },
  { match: '澳门商业银行', brand: 'neutral', mark: 'BCM' },
  { match: '澳门国际银行', brand: 'neutral', mark: 'MIB' },
  { match: '立桥银行', brand: 'neutral', mark: 'WLB' },
];

/**
 * 卡名下自带品牌名的卡。安信信贷一家发两个牌子（WeWa / EarnMORE），
 * 只看 issuer 会把它们画成同一个颜色，而它们是两张不同的卡。
 */
const CARD_NAME_BRAND: Array<{ match: string; brand: BrandKey; mark: string }> = [
  { match: 'WeWa', brand: 'wewa', mark: 'WEWA' },
  { match: 'EarnMORE', brand: 'earnmore', mark: 'EARN' },
];

export function cardVisual(input: { issuer: string; cardName: string; network: string }): CardVisual {
  const network = normalizeNetwork(input.network);

  for (const entry of CARD_NAME_BRAND) {
    if (input.cardName.includes(entry.match)) {
      return { brand: entry.brand, mark: entry.mark, network };
    }
  }

  for (const entry of ISSUER_BRAND) {
    if (input.issuer.includes(entry.match)) {
      return { brand: entry.brand, mark: entry.mark, network };
    }
  }

  // 匹配不到银行：给通用标记。让用户看到的是一张「还没归类」的卡面，
  // 而不是一个猜错的银行缩写。
  return { brand: 'neutral', mark: 'CARD', network };
}

function normalizeNetwork(raw: string): CardNetwork {
  const s = raw.toLowerCase();
  if (s.includes('visa')) return 'visa';
  if (s.includes('master')) return 'mastercard';
  if (s.includes('union')) return 'unionpay';
  if (s.includes('amex') || s.includes('american')) return 'amex';
  return 'unknown';
}

/** 卡组织显示名。与卡面标识同源，避免详情页文字与卡面图形两处不一致 */
export const NETWORK_LABEL: Record<CardNetwork, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  unionpay: '银联',
  amex: '美国运通',
  unknown: '卡组织未填',
};
