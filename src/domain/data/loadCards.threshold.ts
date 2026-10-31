/**
 * 门槛定义的校验（从 loadCards.validate.ts 拆出）。
 *
 * 门槛是模型里唯一「同一件事有两种表达」的地方（categoryBindings / bonusTiers），
 * 因此校验规则也最密：五条断言，每条都对应一种会静默算错的数据形态。
 * 单独成文件是为了让这五条规则能在一屏内读完并逐条对照 ADR-011 §3（含第四轮勘误）。
 */

import {
  CardDataError,
  CATEGORIES,
  CURRENCIES,
  PERIODS,
  assertArray,
  assertNumber,
  assertOneOf,
  assertString,
} from './loadCards.assert';

/** `fallback` 的形状：对象，且 rate 与 multiplierDelta 二选一 */
function validateDeltaShape(value: unknown, path: string): { rate?: number; multiplierDelta?: number } {
  if (typeof value !== 'object' || value === null) {
    throw new CardDataError(`${path} 必须是对象`);
  }
  const d = value as Record<string, unknown>;
  const hasRate = d.rate !== undefined;
  const hasMult = d.multiplierDelta !== undefined;
  if (hasRate && hasMult) {
    throw new CardDataError(`${path} 的 rate 与 multiplierDelta 不得同时声明（二选一）`);
  }
  if (hasRate) assertNumber(d.rate, `${path}.rate`);
  if (hasMult) assertNumber(d.multiplierDelta, `${path}.multiplierDelta`);
  return {
    ...(hasRate ? { rate: d.rate as number } : {}),
    ...(hasMult ? { multiplierDelta: d.multiplierDelta as number } : {}),
  };
}

/**
 * 门槛校验（ADR-011 §3 五条，含第四轮勘误）。
 *
 * 这里刻意把「引擎会不会静默用达标值充当未达标值」变成加载期红灯，而不是运行时算错：
 * 卡库是编译期资产，坏数据应该在加载时报错，而不是在用户付款前一刻静默降级。
 *
 * 第 3 条（勘误后）比原版更强：binding 存在即声明「本类别受门槛约束」，
 * 因此 fallback 必填、且 categories 侧必须显式声明 isBaseTierRate: false
 * （categories 记的是达标档）。原版只拦「有 gain 无 fallback」，空 binding
 * （gain 与 fallback 均缺）曾合法加载并在未达标时静默沿用达标值
 * （chill dining 高估 25 倍、零告警，QA N8）。
 */
export function validateThreshold(
  thRaw: unknown,
  path: string,
  cardId: string,
  categories: Record<string, unknown>,
): void {
  const th = thRaw as Record<string, unknown>;
  assertString(th.id, `${path}.id`);
  assertOneOf(th.period, PERIODS, `${path}.period`);
  assertOneOf(th.currency, CURRENCIES, `${path}.currency`);
  assertNumber(th.thresholdAmount, `${path}.thresholdAmount`);

  // 1. 累计口径必须是 'all' 或非空 SpendCategory[]
  if (th.accrualCategories !== 'all') {
    const list = assertArray(th.accrualCategories, `${path}.accrualCategories`);
    if (list.length === 0) {
      throw new CardDataError(
        `${path}(${cardId}).accrualCategories 不得为空数组（表达「全部类别都累计」应写 'all'）`,
      );
    }
    list.forEach((cat, i) => assertOneOf(cat, CATEGORIES, `${path}.accrualCategories[${i}]`));
  }

  const bindings = th.categoryBindings;
  const bonusTiers = th.bonusTiers;

  // 5. 两者不得同时声明：一个门槛不能既按类别又整卡。
  //    真有这种卡，数据层应拆成两个门槛；而 resolveThreshold 禁止多门槛，
  //    所以必须先解决多门槛限制才能表达。这是明确的建模限制，抛错而非静默择一。
  if (bindings !== undefined && bonusTiers !== undefined) {
    throw new CardDataError(
      `${path}(${cardId}) 的 categoryBindings 与 bonusTiers 不得同时声明（一个门槛不能既按类别又整卡）`,
    );
  }

  if (bindings !== undefined) {
    const map = bindings as Record<string, unknown>;
    if (typeof map !== 'object' || map === null) {
      throw new CardDataError(`${path}.categoryBindings 必须是对象`);
    }
    for (const [cat, raw] of Object.entries(map)) {
      assertOneOf(cat, CATEGORIES, `${path}.categoryBindings 的 key`);
      const bPath = `${path}.categoryBindings.${cat}`;
      if (typeof raw !== 'object' || raw === null) {
        throw new CardDataError(`${bPath} 必须是对象`);
      }
      const binding = raw as Record<string, unknown>;
      // 2. fallback 形状校验（rate 与 multiplierDelta 二选一）
      const fallback =
        binding.fallback === undefined ? undefined : validateDeltaShape(binding.fallback, `${bPath}.fallback`);

      // 3. binding 存在 ⇒ fallback 必填（N8：空 binding 与「不出现」语义等价，
      //    不允许第三种表达。缺 fallback 的 binding 在未达标时会静默沿用 categories
      //    的达标值 —— 高估 25 倍且零告警的形态，必须在加载期拒绝）
      if (fallback === undefined) {
        throw new CardDataError(
          `${bPath} 缺 fallback：binding 存在即声明「本类别受门槛约束」，` +
            `未达标费率必须显式声明。若该类别不受门槛影响，请删除整个 binding`,
        );
      }

      // 3b. binding 存在 ⇒ categories 侧必须显式 isBaseTierRate: false
      //     （categories 记的是达标档；「哪一侧是主档」这件事不允许被省略。
      //     旧版校验只看标志本身，标志缺省 true 时会被静默绕过 —— A10 形态）
      const rule = categories[cat] as Record<string, unknown> | undefined;
      if (rule?.isBaseTierRate !== false) {
        throw new CardDataError(
          `${bPath} 声明了门槛约束，但 categories.${cat}.isBaseTierRate !== false —— ` +
            `binding 存在要求 categories 记的是达标档且显式声明（isBaseTierRate: false），` +
            `否则「哪一侧是主档」无法机读`,
        );
      }
    }
  }

  if (bonusTiers !== undefined) {
    const list = assertArray(bonusTiers, `${path}.bonusTiers`);
    if (list.length === 0) {
      throw new CardDataError(`${path}.bonusTiers 不得为空数组`);
    }
    for (const [j, raw] of list.entries()) {
      const tPath = `${path}.bonusTiers[${j}]`;
      const tier = raw as Record<string, unknown>;
      assertNumber(tier.minSpend, `${tPath}.minSpend`);
      if (tier.gain === undefined) {
        throw new CardDataError(`${tPath}.gain 必填（未达档写空对象即可）`);
      }
      validateDeltaShape(tier.gain, `${tPath}.gain`);
    }
    // 4. 最低档必须为 0（原 pickTier 的断言迁到这里，pickTier 仍保留给 bonusTiers）
    const minSpends = list.map((raw) => (raw as Record<string, unknown>).minSpend as number);
    if (!minSpends.includes(0)) {
      throw new CardDataError(
        `${path}(${cardId}).bonusTiers 的最低档 minSpend 必须为 0，实际最低为 ${Math.min(...minSpends)}`,
      );
    }
  }
}
