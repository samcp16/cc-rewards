/**
 * 全矩阵快照（ADR-011 施工前的一次性基线，不属于产品代码）。
 *
 * 为什么必须重做而不是复用 adr010-baseline.json（QA N3 的教训）：
 * 旧快照固定 amount=2000，而 2000 已超过 chill/cheers/bea/wewa 四个门槛，
 * 且 includeCurrentSpend 让它自己就把档位顶上去 —— 每个组合都落在「已达标」档，
 * 未达标档从未被读取。于是「把未达标档写成 10%」这类误改 0 条变红。
 *
 * 本快照的口径（ADR-011 第四轮，N5 补强后）：
 *   38 卡 × 5 渠道 × 7 类别 × 3 金额档 × 2 账本状态（空 / 已超门槛）= 7980 组合
 *   amounts = {1000, 3000, 8000} / MOP / region=MO / today=2026-10-31
 *
 * 为什么三个金额档（QA N5）：单一 amount=1000 解决了门槛两态失明，但对
 * 「上限绑定被删」失明 —— chill dining 在 1000 MOP 下（HK$97 < HK$150）根本
 * 不触顶，删掉 capIds 后 5000 MOP 的 gross 从 168.32 变 500（高估 2.97 倍），
 * 快照 0 反应。8000 MOP ≈ 7760 HKD 能触到 chill HK$150 / wewa HK$200 / bea
 * HK$500 上限；快照行同时记录 capsAffected（capId 列表），上限机制进入回归网。
 *
 * 为什么金额是 1000（不是 2000 也不是 3000）：
 * 5 张门槛卡都是 `includeCurrentSpend: true`，本笔金额会推进累计。若金额本身
 * 跨过门槛（chill/bea/wewa 的 1500/4000/1500，3000 MOP ≈ 2912 HKD 已越过前两者），
 * 「空账本」这一侧就不再是「未达标」—— 未达标档再次永远读不到，快照第二轮失明。
 * 1000 MOP ≈ 970 HKD 小于全部门槛，两态才真正分离。
 *
 * 相比之下 3000 的好处是能触及 chill 的 HK$150 / wewa 的 HK$200 上限，但那属于
 * 「上限边界」而非「门槛两态」，已由 threshold-earn.test.ts 的定点用例覆盖。
 * 3000/8000 档在 includeCurrentSpend 下「空账本」侧会自行达标（本笔推进累计），
 * 那两个档的「两态分离」不再成立 —— 两态分离由 1000 档专责保证，快照职责是
 * **广覆盖不漏项**，定点断言负责**边界精确**，两者不互相替代。
 *
 * 输出全部 38 张卡（不再排除门槛卡）：
 * 排除门槛卡会让快照对「门槛模型本身的变异」完全失明——正是 N3 的形态。
 * 比对时按卡分组：32 张无关卡必须零变化，5 张门槛卡的变化必须与 ADR-011 预期一致。
 *
 * 用法：npx tsx scripts/snapshot-matrix.ts > src/domain/__fixtures__/adr011-baseline.json
 */

import { rankSingleCard } from '../src/domain/engine/index';
import { CARDS, getCardById } from '../src/domain/data/loadCards';
import { DEFAULT_FX_TABLE } from '../src/domain/fx/fxReference';
import { DEFAULT_CHANNEL_FEES } from '../src/domain/data/channelFees';
import { buildPointValuations } from '../src/domain/fx/pointValuation';
import type { EngineParams, LedgerEntry, PaymentChannel, SpendCategory, SpendInput } from '../src/domain/types';

const TODAY = '2026-10-31';
const params: EngineParams = {
  fx: DEFAULT_FX_TABLE,
  channelFees: DEFAULT_CHANNEL_FEES,
  pointValuations: buildPointValuations(CARDS),
  today: TODAY,
};

const CHANNELS: PaymentChannel[] = ['physical', 'alipay', 'wechat', 'unionpay_qr', 'apple_pay'];
const CATEGORIES: SpendCategory[] = ['dining', 'grocery', 'fuel', 'flight', 'hotel', 'online', 'other'];

/** 「已超门槛」账本：按各卡自己的 thresholdId 注入 10 倍门槛的累计额 */
const OVER_LEDGER: Record<string, number> = {
  'boc-hk-chill:physical-spend': 15000,
  'boc-hk-cheers:monthly-retail': 50000,
  'bea-world-mc:qualified-spend': 40000,
  'dbs-black-world:monthly-spend': 200000,
  'wewa-unionpay:monthly': 15000,
};

function ledgerFor(cardId: string, state: 'empty' | 'over'): LedgerEntry[] {
  if (state === 'empty') return [];
  const contribution: Record<string, number> = {};
  const cardDef = getCardById(cardId);
  for (const th of cardDef?.thresholds ?? []) {
    contribution[th.id] = OVER_LEDGER[th.id] ?? 999999;
  }
  // 无关卡没有门槛，注入空贡献 —— 记录里仍保留这一态，证明「账本有内容但无门槛」也不变
  return [
    {
      id: `snapshot-${cardId}-${state}`,
      cardId,
      occurredAt: '2026-10-15',
      periodKey: '2026-10',
      quarterKey: '2026-Q4',
      yearKey: '2026',
      halfYearKey: '2026-H2',
      amount: 100000,
      currency: 'HKD',
      category: 'dining',
      channel: 'physical',
      capConsumption: {},
      thresholdContribution: contribution,
      channelFreeConsumption: {},
      earnedCashback: 0,
      earnedPoints: 0,
      createdAt: '2026-10-15T00:00:00.000Z',
    },
  ];
}

interface Row {
  cardId: string;
  channel: string;
  category: string;
  amount: number;
  state: string;
  expect: {
    status: string;
    grossCashback: number | null;
    pointsValue: number | null;
    netRealistic: number | null;
    fxFee: number | null;
    channelFee: number | null;
    warnings: string;
    capsAffected: string;
  };
}

const rows: Row[] = [];

const AMOUNTS = [1000, 3000, 8000];

for (const cardDef of CARDS) {
  for (const channel of CHANNELS) {
    for (const category of CATEGORIES) {
      for (const amount of AMOUNTS) {
        for (const state of ['empty', 'over'] as const) {
          const input: SpendInput = {
            amount,
            settlementCurrency: 'MOP',
            category,
            channel,
            region: 'MO',
            occurredAt: TODAY,
          };
          const s = rankSingleCard(cardDef, ledgerFor(cardDef.cardId, state), params, input);
          rows.push({
            cardId: cardDef.cardId,
            channel,
            category,
            amount,
            state,
            expect: {
              status: s?.status ?? 'null',
              grossCashback: s?.grossCashback ?? null,
              pointsValue: s?.pointsValue ?? null,
              netRealistic: s?.netRealistic ?? null,
              fxFee: s?.fxFee ?? null,
              channelFee: s?.channelFee ?? null,
              warnings: (s?.warnings ?? []).map((w) => w.code).join(','),
              capsAffected: (s?.capsAffected ?? []).map((c) => c.capId).sort().join(','),
            },
          });
        }
      }
    }
  }
}

process.stderr.write(`rows=${rows.length} cards=${new Set(rows.map((r) => r.cardId)).size}\n`);
process.stdout.write(`${JSON.stringify(rows, null, 0)}\n`);
