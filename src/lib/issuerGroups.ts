/**
 * 按发卡行分组。
 *
 * 为什么需要：38 张卡平铺成一列，用户要在里面找「我手上这张」，
 * 等于让他在一份无序清单里做视觉搜索。按银行分组后，他的动作变成
 * 「先想起是哪家银行的卡 → 再在 1~4 张里认名字」，这才是人回忆卡片的方式。
 *
 * 为什么澳门排在香港前面：本产品的主要消费地是澳门，用户库里的卡
 * 也以澳门发行为主。默认顺序跟着使用频率走，不是跟着字母走。
 */

import type { Card } from '../domain/types';
import { CARDS } from '../domain/data/loadCards';
import { unknownCategories } from './cardFacts';
import { percent2 } from './format';

export interface IssuerGroup {
  /** 银行全称，同时作为分组键 */
  issuer: string;
  region: 'MO' | 'HK';
  cards: Card[];
  /** 该行有可用数据的卡数（至少一个类别不是 unknown） */
  usableCount: number;
}

const REGION_ORDER: Record<'MO' | 'HK', number> = { MO: 0, HK: 1 };

/**
 * 银行的稳定标识。
 *
 * 带上地区是因为「中国银行」在澳门和香港是两家不同的发卡机构，
 * 只按名字去重会把它们合并成一家，藏一家等于同时藏掉两地。
 */
export function issuerKey(region: 'MO' | 'HK', issuer: string): string {
  return `${region}|${issuer}`;
}

/**
 * 全库分组，顺序稳定：澳门在前，组内按卡名排序。
 *
 * `exclude` 用来把「已经在我的卡库里」和「我删掉过的卡」挡在外面。
 * 添加页列出用户已经持有的卡，等于让他在一堆废选项里找那张真正缺的。
 * 一条卡都不剩的银行整个不出现（点进去是空页，比不显示更糟）。
 *
 * `hidden` 是用户主动藏起来的银行（他根本没有那家的卡）。
 * 二十家银行里他只关心三四家，剩下十几家每次都在挡路 —— 藏掉之后
 * 这个列表才真的在为他服务。恢复入口在页面上，不是黑洞。
 */
export function issuerGroups(options?: {
  exclude?: ReadonlySet<string>;
  hidden?: ReadonlySet<string>;
}): IssuerGroup[] {
  const exclude = options?.exclude;
  const hidden = options?.hidden;
  const map = new Map<string, IssuerGroup>();

  for (const card of CARDS) {
    if (exclude?.has(card.cardId)) continue;
    if (hidden?.has(issuerKey(card.issuerRegion, card.issuer))) continue;
    const key = `${card.issuerRegion}|${card.issuer}`;
    let group = map.get(key);
    if (!group) {
      group = { issuer: card.issuer, region: card.issuerRegion, cards: [], usableCount: 0 };
      map.set(key, group);
    }
    group.cards.push(card);
    if (unknownCategories(card).length < 7) group.usableCount += 1;
  }

  return [...map.values()]
    .map((g) => ({ ...g, cards: [...g.cards].sort((a, b) => a.cardName.localeCompare(b.cardName, 'zh-Hans-CN')) }))
    .sort(
      (a, b) =>
        REGION_ORDER[a.region] - REGION_ORDER[b.region] || a.issuer.localeCompare(b.issuer, 'zh-Hans-CN'),
    );
}

/** 某家银行下的全部卡（已排序）。 */
/**
 * 机构短名 —— 列表副行用。
 *
 * 数据里的 issuer 是完整法定名（「澳门商业银行（Banco Comercial de Macau, BCM）」），
 * 完整名在详情页有用（能确认是哪一家），但在 84px 的行里只会被截成
 * 「澳门商业银行（Banco Comercial de...」—— 截断位置随机，反而认不出。
 *
 * 只做「剥括号 + 少数特例」，不做智能缩写：机构名是专有名词，
 * 自动缩写（取首字、去后缀）会把「中银香港」变成「中银」，
 * 而澳门和香港各有一个「中银」，那不叫简洁，叫歧义。
 */
const SHORT_OVERRIDE: Record<string, string> = {
  香港上海汇丰银行: '汇丰',
  中国银行澳门分行: '中银澳门',
  澳门商业银行: '澳门商业',
  华侨永亨银行: '华侨永亨',
  澳门国际银行: '澳门国际',
  渣打银行香港: '渣打',
  花旗银行香港: '花旗',
  东亚银行: '东亚',
  星展银行香港: '星展',
  美国运通香港: '美国运通',
  安信信贷: '安信',
};

export function shortIssuer(issuer: string): string {
  const base = issuer.split('（')[0]?.trim() ?? issuer;
  return SHORT_OVERRIDE[base] ?? base;
}

/**
 * 卡名拆成「主名 + 等级标注」。
 *
 * 列表里的卡名有两个固定的赘余：
 *
 *   1. **机构名重复**。副行已经写了「中银香港」，卡名再以「中银香港」开头，
 *      等于一行里说两遍同一件事 —— 而这一行总共只有 ~190px。
 *      只剥**完整机构名**（issuer 去括号那一段），不做模糊匹配：
 *      模糊匹配会把「东亚银行 World Mastercard」剥成「银行 World Mastercard」。
 *
 *   2. **尾部等级括号**。「（Visa Signature）」「（World Mastercard）」在
 *      32 字的卡名里占掉一大半，却是列表里最不紧急的信息。拆出来交给副行，
 *      主名就回到「Chill 信用卡」这种一眼能扫的长度。
 *
 * 拿不准时不剥：宁可长一点，也不要剥出一个语义残缺的名字。
 */
export function cardTitle(card: { issuer: string; cardName: string }): { main: string; tag: string | null } {
  const raw = card.cardName.trim();
  const bracket = /[（(]([^（()）]+)[)）]\s*$/.exec(raw);
  const tag = bracket?.[1]?.trim() ?? null;
  let main = bracket ? raw.slice(0, bracket.index).trim() : raw;

  const fullIssuer = card.issuer.split('（')[0]?.trim() ?? '';
  if (fullIssuer !== '' && main.startsWith(fullIssuer)) {
    const rest = main.slice(fullIssuer.length).trim();
    // 剥完只剩空白、或只剩一两个字符时，说明这名字本来就等于机构名
    if (rest.length >= 2) main = rest;
  } else {
    /* 完整名没匹配上时，再试一次短名 —— 但只在**剥完剩下的是拉丁字母或数字**
       时才认。否则「东亚银行 World Mastercard」会被短名「东亚」剥成
       「银行 World Mastercard」：那不是简洁，是把一个词从中间切断。
       「渣打 Simply Cash Visa 卡」剩「Simply Cash Visa 卡」，是安全的。 */
    const short = shortIssuer(card.issuer);
    if (short !== '' && main.startsWith(short)) {
      const rest = main.slice(short.length).trim();
      if (rest.length >= 2 && /^[0-9A-Za-z]/.test(rest)) main = rest;
    }
  }

  return { main, tag };
}


export function cardsOfIssuer(issuer: string): Card[] {
  return issuerGroups().find((g) => g.issuer === issuer)?.cards ?? [];
}

/**
 * 卡列表右侧那一行摘要。
 *
 * 三种卡三种说法，不能用同一句话糊过去：
 *   cashback → 「最高 2.50%」是用户要比的数
 *   points   → 它没有百分比。写「积分 1×」是事实，写「费率待补」是撒谎
 *              （数据是全的，缺的是「1 分值多少钱」这个用户自己的假设）
 *   unknown  → 真的没核实，且要说清缺的是
 *              「回赠」——写成「费率待补」会被读成手续费，那是另一栏
 */
export function cardSummary(card: Card): { text: string; state: 'cashback' | 'points' | 'unknown' } {
  const cashbackRates = Object.values(card.categories)
    .map((rule) => {
      if (rule.kind !== 'cashback' || !rule.rates) return null;
      return Math.max(rule.rates.local, rule.rates.foreign ?? rule.rates.local);
    })
    .filter((r): r is number => r !== null);

  if (cashbackRates.length > 0) {
    return { text: `最高 ${percent2(Math.max(...cashbackRates))}`, state: 'cashback' };
  }

  const multipliers = Object.values(card.categories)
    .filter((rule) => rule.kind === 'points')
    .map((rule) => rule.multiplier ?? 1);
  if (multipliers.length > 0) {
    const max = Math.max(...multipliers);
    return { text: `积分 ${String(max)}x`, state: 'points' };
  }

  return { text: '回赠待补', state: 'unknown' };
}
