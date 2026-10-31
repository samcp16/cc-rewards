/**
 * 输入编排 hook：主查询页的四个输入 + 200ms 防抖 + 渠道记忆。
 *
 * 为什么防抖只作用在「结果重算」而不作用在输入框本身：
 * 输入框必须即时响应（用户敲 3 就立刻看到 3），但引擎重算与答案卡淡入可以
 * 合并到 200ms 一次。反过来做用户会觉得键盘卡了。
 *
 * 为什么不把输入放进全局状态：SPEC §4 明确「不引入状态管理」。这里的输入是
 * 单页局部状态，离开页面即可丢弃（除「上次用的渠道」——它跨会话有意义，进 localStorage）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PaymentChannel, SpendCategory, SpendInput, SpendRegion } from '../domain/types';
import { SETTLEMENT_BY_REGION } from '../lib/labels';
import { formatAmount2 } from '../lib/money';

const LAST_CHANNEL_KEY = 'cc-rewards:lastChannel';
const CHANNELS: PaymentChannel[] = ['physical', 'alipay', 'wechat', 'unionpay_qr', 'apple_pay'];

/** 读「上次用的渠道」。localStorage 不可用（隐私模式）时回落到 physical。 */
export function readLastChannel(): PaymentChannel {
  try {
    const raw = localStorage.getItem(LAST_CHANNEL_KEY);
    if (raw && CHANNELS.includes(raw as PaymentChannel)) return raw as PaymentChannel;
  } catch {
    // 隐私模式下 localStorage 读写会抛异常，不能让它阻断首屏
  }
  return 'physical';
}

function rememberChannel(channel: PaymentChannel): void {
  try {
    localStorage.setItem(LAST_CHANNEL_KEY, channel);
  } catch {
    // 记住失败不影响使用
  }
}

/**
 * 解析用户输入。0 表示「没法算」，由 UI 决定是空态还是错误。
 *
 * 用 Number 而不是 parseInt：`parseInt('1.99')` 得 1，
 * 会把用户输入的小数金额悄悄截断成整数。
 */
export function parseAmount(text: string): number {
  if (text.trim() === '') return 0;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

/** 粘贴清洗：只留数字与小数点，多个小数点只保留第一个 */
export function sanitizeAmount(text: string): string {
  const stripped = text.replace(/[^0-9.]/g, '');
  const firstDot = stripped.indexOf('.');
  if (firstDot === -1) return stripped;
  return stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '');
}

/**
 * 失焦格式化到 2 位小数；输入过程中不格式化，避免打断打字。
 *
 * 用 formatAmount2 而不是 toFixed：C5 门禁禁 toFixed，且 1.005 这类值
 * toFixed 会给出 1.00（浮点误差），formatAmount2 先十进制收敛再补位。
 * 整数金额（500.00）去掉尾零显示 500 —— 输入框里挂着 ".00" 显得很吵。
 */
export function formatOnBlur(text: string): string {
  const value = parseAmount(text);
  if (value === 0) return text;
  const fixed = formatAmount2(value);
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed;
}

export interface UseSpendInputResult {
  amountText: string;
  amount: number;
  amountError: string | null;
  region: SpendRegion;
  category: SpendCategory;
  channel: PaymentChannel;
  settlementCurrency: SpendInput['settlementCurrency'];
  /** 交给引擎的输入（已防抖） */
  input: SpendInput;
  setAmountText: (text: string) => void;
  setRegion: (region: SpendRegion) => void;
  setCategory: (category: SpendCategory) => void;
  setChannel: (channel: PaymentChannel) => void;
  blurAmount: () => void;
  /** 用户是否还没填金额（用于答案卡空态文案分支） */
  pristine: boolean;
}

export function useSpendInput(initialAmount = 500): UseSpendInputResult {
  const [amountText, setAmountTextRaw] = useState(String(initialAmount));
  const [region, setRegion] = useState<SpendRegion>('MO');
  const [category, setCategory] = useState<SpendCategory>('dining');
  const [channel, setChannelState] = useState<PaymentChannel>(() => readLastChannel());

  const amount = useMemo(() => parseAmount(amountText), [amountText]);
  const settlementCurrency = SETTLEMENT_BY_REGION[region];

  const [debounced, setDebounced] = useState<SpendInput>(() => ({
    amount: parseAmount(String(initialAmount)),
    settlementCurrency: SETTLEMENT_BY_REGION.MO,
    category: 'dining',
    channel: readLastChannel(),
    region: 'MO',
  }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next: SpendInput = { amount, settlementCurrency, category, channel, region };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDebounced(next);
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [amount, settlementCurrency, category, channel, region]);

  const setChannel = useCallback((next: PaymentChannel) => {
    setChannelState(next);
    rememberChannel(next);
  }, []);

  const setAmountText = useCallback((text: string) => {
    setAmountTextRaw(sanitizeAmount(text));
  }, []);

  const blurAmount = useCallback(() => {
    setAmountTextRaw((prev) => formatOnBlur(prev));
  }, []);

  const amountError = amountText.trim() !== '' && amount <= 0 ? '金额得大于 0' : null;

  return {
    amountText,
    amount,
    amountError,
    region,
    category,
    channel,
    settlementCurrency,
    input: debounced,
    setAmountText,
    setRegion,
    setCategory,
    setChannel,
    blurAmount,
    pristine: amount <= 0,
  };
}
