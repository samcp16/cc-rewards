/**
 * SPEC §12 端到端验证脚本（开发期工具，不参与构建）。
 *
 * 用真实 `data/cards-hk-mo.json` 跑 6 个关键断言，把结果打到 stdout 供人工核对。
 * 它不是测试 —— 断言在 `src/domain/engine/*.test.ts` 里；这里的价值是
 * 「用真实数据看一遍数字长什么样」，尤其是被 SPEC 点名的几个易错场景。
 *
 * 类型上用具体的领域类型而不是 any：TS 7 与 lint 都禁 any，
 * 而且这里的调用点本身就是「引擎契约有没有被正确使用」的一次检查。
 */

import cardsJson from '../data/cards-hk-mo.json';
import { rankCards } from '../src/domain/engine/index';
import { buildDefaultParams } from '../src/hooks/buildDefaultParams';
import type { Card, SpendCategory, SpendInput, CurrencyCode } from '../src/domain/types';
import type { Scheme, SchemeWarning } from '../src/domain/types.result';
import { formatAmount2 } from '../src/lib/money';

const cards = cardsJson as unknown as Card[];
const params = buildDefaultParams('2026-10-31');

/** 每个场景只需要覆盖这三个字段，其余由默认值补齐 */
interface CaseInput {
  amount: number;
  settlementCurrency: CurrencyCode;
  category: SpendCategory;
}

const MO_BASE = { channel: 'physical', region: 'MO' } as const;

function run(label: string, input: CaseInput, cardId: string): void {
  const spend: SpendInput = { ...MO_BASE, ...input };
  const result = rankCards(cards, [], params, spend);
  const hit: Scheme | undefined = [...result.ranked, ...result.unranked].find((x) => x.cardId === cardId);
  console.log(`\n${label}`);
  console.log(`  [ranked=${String(result.ranked.length)} unranked=${String(result.unranked.length)}]`);
  if (!hit) {
    console.log('   未找到');
    return;
  }
  console.log(`  status=${hit.status}  route=${hit.route}  rateSide=${hit.rateSide}`);
  console.log(
    `  gross=${formatAmount2(hit.grossCashback)} fx=${formatAmount2(hit.fxFee)} channel=${formatAmount2(hit.channelFee)}`,
  );
  console.log(
    `  netRealistic=${formatAmount2(hit.netRealistic)}  netRate=${formatAmount2(hit.netRateRealistic * 100)}%`,
  );
  if (hit.capsAffected.length > 0) console.log(`  caps: ${JSON.stringify(hit.capsAffected)}`);
  if (hit.warnings.length > 0) {
    console.log(`  warnings: ${hit.warnings.map((w: SchemeWarning) => w.code).join(', ')}`);
  }
  if (hit.fxWaiverNote !== undefined) console.log(`  fxNote: ${hit.fxWaiverNote}`);
}

run('AC6.1 渣打 Simply Cash  MOP1000 餐饮', { amount: 1000, settlementCurrency: 'MOP', category: 'dining' }, 'sc-simply-cash');
run('AC6.2 汇丰 PULSE  MOP1000 餐饮', { amount: 1000, settlementCurrency: 'MOP', category: 'dining' }, 'hsbc-pulse-unionpay');
run('AC6.3 Amex Explorer  MOP1500 餐饮', { amount: 1500, settlementCurrency: 'MOP', category: 'dining' }, 'amex-hk-explorer');
run('AC6.3 Amex Explorer  HKD1500 餐饮', { amount: 1500, settlementCurrency: 'HKD', category: 'dining' }, 'amex-hk-explorer');
run('AC6.4 中银香港 Chill  MOP2000 餐饮', { amount: 2000, settlementCurrency: 'MOP', category: 'dining' }, 'boc-hk-chill');
run('AC6.5 立桥 VISA 金卡（豁免已过期）', { amount: 1000, settlementCurrency: 'MOP', category: 'dining' }, 'wlbank-visa-gold');
