/**
 * QA 独立黑盒探针（Phase 4 验收用，不属于产品代码，不属于产品测试套件）。
 *
 * 原则：只调用公开入口 rankCards，期望值全部由 QA 按 SPEC 手算后写死，
 * 不读取任何现有 *.test.ts 的期望值，避免自证循环。
 */
import { rankCards } from '../src/domain/engine/index';
import { CARDS, getCardById } from '../src/domain/data/loadCards';
import { DEFAULT_FX_TABLE } from '../src/domain/fx/fxReference';
import { DEFAULT_CHANNEL_FEES } from '../src/domain/data/channelFees';
import { buildPointValuations } from '../src/domain/fx/pointValuation';
import type { EngineParams, SpendInput } from '../src/domain/types';

const TODAY = '2026-10-31';
const params: EngineParams = {
  fx: DEFAULT_FX_TABLE,
  channelFees: DEFAULT_CHANNEL_FEES,
  pointValuations: buildPointValuations(CARDS),
  today: TODAY,
};

const MO = (over: Partial<SpendInput> = {}): SpendInput => ({
  amount: 1000,
  settlementCurrency: 'MOP',
  category: 'dining',
  channel: 'physical',
  region: 'MO',
  occurredAt: TODAY,
  ...over,
});

function one(cardId: string, input: SpendInput) {
  const c = getCardById(cardId)!;
  const r = rankCards([c], [], params, input);
  return r.ranked[0] ?? r.unranked[0] ?? null;
}

const out: string[] = [];
const log = (...a: unknown[]) => out.push(a.map(String).join(' '));

// ================= D1: 双档费率 foreign 档 =================
log('===== D1 双档费率：港卡在澳门刷 MOP 必须取 foreign 档 =====');
{
  const s = one('sc-simply-cash', MO({ amount: 1000 }));
  log('sc-simply-cash MOP1000 MO: rateSide=', s?.rateSide, 'route=', s?.route);
  log('  grossCashback=', s?.grossCashback, '(SPEC §12-6.1 期望 20 = 2.0%)');
  log('  fxFee=', s?.fxFee, '(期望 19.5)');
  log('  netRealistic=', s?.netRealistic, '(期望 0.5)');
  log('  netRateRealistic=', s?.netRateRealistic, '(期望 0.0005 = 0.05%)');
  log('  PASS?', s?.grossCashback === 20 && s?.netRealistic === 0.5);
}
{
  // 对照：HKD 卡在香港本地刷 HKD → local 档 1.5%
  // SpendRegion 只建模「用户消费发生地」的境外两档（MO / CN）：香港本地消费不在枚举内，
  // 与发卡地同为 HK 即非跨境。此处用 MO 保持类型合法，对照的是「币种相同」这一条。
  const s = one('sc-simply-cash', MO({ amount: 1000, settlementCurrency: 'HKD' }));
  log('对照 local 档 HKD1000 HK: rateSide=', s?.rateSide, 'gross=', s?.grossCashback, '(期望 15)');
}
{
  // crossBorder：HKD 卡在澳门以 HKD 结算 → SPEC §6.2.1 返现取 foreign
  const s = one('sc-simply-cash', MO({ amount: 1000, settlementCurrency: 'HKD', region: 'MO' }));
  log('crossBorder HKD1000 MO: route=', s?.route, 'rateSide=', s?.rateSide, 'gross=', s?.grossCashback, '(期望 route=crossBorder, 取 foreign → 20)');
}

// ================= D2: 上限 basis = value vs spend =================
log('');
log('===== D2 上限计量口径 basis=value（Chill 回赠上限 HK$150）=====');
{
  const s = one('boc-hk-chill', MO({ amount: 2000, category: 'dining' }));
  log('boc-hk-chill MOP2000 dining MO:');
  log('  grossCashback=', s?.grossCashback);
  log('  fxFee=', s?.fxFee, ' channelFee=', s?.channelFee);
  log('  netRealistic=', s?.netRealistic);
  log('  capsAffected=', JSON.stringify(s?.capsAffected));
  log('  breakdown=', JSON.stringify(s?.breakdown, null, 0));
  log('  warnings=', JSON.stringify(s?.warnings));
}
{
  // 本笔金额很小，远未触顶：验证 cap 不该误伤
  const s = one('boc-hk-chill', MO({ amount: 300, category: 'dining' }));
  log('boc-hk-chill MOP300: gross=', s?.grossCashback, 'net=', s?.netRealistic, 'caps=', JSON.stringify(s?.capsAffected));
}

// ================= D3: unknown 绝不按 0 排序 =================
log('');
log('===== D3 unknown 类别绝不按 0 参与排序 =====');
{
  const s = one('bnu-world-mc', MO({ amount: 1000, category: 'fuel' }));
  log('bnu-world-mc fuel: status=', s?.status, 'netRateRealistic=', s?.netRateRealistic, 'warnings=', JSON.stringify(s?.warnings));
}
{
  const r = rankCards(CARDS, [], params, MO({ amount: 1000, category: 'fuel' }));
  log('rankCards(fuel) ranked=', r.ranked.length, 'unranked=', r.unranked.length, 'total=', CARDS.length);
  log('  ranked 里有没有 bnu-world-mc?', r.ranked.some((x) => x.cardId === 'bnu-world-mc'));
  log('  unranked ids=', r.unranked.map((x) => x.cardId).join(','));
}

// ================= D4: 折算不出现在成本项 =================
log('');
log('===== D4 跨币种折算不得作为成本项出现 =====');
{
  const s = one('boc-hk-chill', MO({ amount: 2000, category: 'dining' }));
  const kinds = (s?.breakdown ?? []).map((b) => b.kind);
  log('breakdown kinds=', JSON.stringify(kinds));
  log('  有 fx_cost / exchange / 汇率 类成本项?', JSON.stringify(s?.breakdown ?? []).match(/汇率成本|汇兑|fx_cost|exchange_rate/));
  log('  fxNotes(全局)=', JSON.stringify(rankCards([getCardById('boc-hk-chill')!], [], params, MO({ amount: 2000 })).fxNotes));
}

// ================= D5: 边界输入 =================
log('');
log('===== D5 边界输入 =====');
for (const amt of [0, -1, -0.0001, 1e12, Number.NaN, Number.POSITIVE_INFINITY]) {
  const r = rankCards(CARDS, [], params, MO({ amount: amt }));
  log(`amount=${amt} → ok=${r.ok} reject=${JSON.stringify(r.rejectReason)} ranked=${r.ranked.length}`);
}

// ================= D6: 不存在 category / cardId =================
log('');
log('===== D6 非法 category =====');
{
  const r = rankCards(CARDS, [], params, MO({ category: 'casino' as never }));
  log("category='casino' → ok=", r.ok, 'reject=', JSON.stringify(r.rejectReason));
}
log('===== D6b 不存在 cardId 在账本里 =====');
{
  const ghost = { id: 'x', cardId: 'no-such-card', occurredAt: TODAY, periodKey: '2026-10', quarterKey: '2026-Q4', yearKey: '2026', halfYearKey: '2026-H2', amount: 500, currency: 'MOP', category: 'dining', channel: 'physical', capConsumption: {}, thresholdContribution: {}, channelFreeConsumption: {}, earnedCashback: 0, earnedPoints: 0, createdAt: TODAY };
  const r = rankCards(CARDS, [ghost] as never, params, MO({}));
  log('ledger 含幽灵 cardId → ok=', r.ok, 'ranked=', r.ranked.length);
}

// ================= D7: 排序主键必须是回报率 =================
log('');
log('===== D7 排序主键 = 净回报率（不是净额）=====');
{
  for (const amt of [380, 12000]) {
    const r = rankCards(CARDS, [], params, MO({ amount: amt }));
    log(`amount=${amt} top5:`, r.ranked.slice(0, 5).map((x) => `${x.cardId}=${(x.netRateRealistic * 100).toFixed(4)}%/额${x.netRealistic}`).join(' | '));
    const rates = r.ranked.map((x) => x.netRateRealistic);
    const sortedDesc = rates.every((v, i) => i === 0 || rates[i - 1]! >= v);
    log('  降序单调?', sortedDesc);
  }
}

// ================= D8: Chill 门槛生效性 =================
log('');
log('===== D8 Chill 门槛（月满 1500 才 10%，否则 8%）=====');
{
  // 本月已刷 1600（仅餐饮累计），本笔 2000 → 应达 10% 档
  const ledger = [{ id: 'l1', cardId: 'boc-hk-chill', occurredAt: '2026-10-10', periodKey: '2026-10', quarterKey: '2026-Q4', yearKey: '2026', halfYearKey: '2026-H2', amount: 1600, currency: 'HKD', category: 'dining', channel: 'physical', capConsumption: { 'boc-hk-chill:extra': 0 }, thresholdContribution: { 'boc-hk-chill:physical-spend': 1600 }, channelFreeConsumption: {}, earnedCashback: 0, earnedPoints: 0, createdAt: '2026-10-10T00:00:00Z' }];
  const c = getCardById('boc-hk-chill')!;
  const hi = rankCards([c], ledger as never, params, MO({ amount: 2000 })).ranked[0];
  const lo = rankCards([c], [], params, MO({ amount: 2000 })).ranked[0];
  log('已累计1600 → gross=', hi?.grossCashback, ' note=', hi?.thresholdNote);
  log('已累计0    → gross=', lo?.grossCashback, ' note=', lo?.thresholdNote);
  log('两档是否产生差异?', hi?.grossCashback !== lo?.grossCashback);
}

// ================= D9: 排序里 unknown 占比 & 数感 =================
log('');
log('===== D9 全卡库 dining MOP1000 排序（前 12 + 末 3）=====');
{
  const r = rankCards(CARDS, [], params, MO({ amount: 1000 }));
  r.ranked.slice(0, 12).forEach((x, i) => log(`  #${i + 1} ${x.cardId} ${(x.netRateRealistic * 100).toFixed(3)}% net=${x.netRealistic} route=${x.route}`));
  log('  ...');
  r.ranked.slice(-3).forEach((x) => log(`  ${x.cardId} ${(x.netRateRealistic * 100).toFixed(3)}%`));
  log('  unranked=', r.unranked.length, 'ids=', r.unranked.map((x) => x.cardId).join(','));
}

console.log(out.join('\n'));
