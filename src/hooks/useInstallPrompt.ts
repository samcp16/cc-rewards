/**
 * 安装引导 hook（F11 P0）。
 *
 * 触发规则（onboarding-install.md §2，这是设计决策不是技术常量）：
 * - 首次访问 + iOS + 未安装 → **8 秒后**弹。立即弹会打断「第一次看到答案」的关键时刻
 * - 关闭过 → 24 小时内不自动弹
 * - 已关闭 3 次 → 不再自动弹，只在设置页保留入口
 * - standalone 模式 → 永不出现
 * - 非 iOS → 不出现（Android 走 beforeinstallprompt，桌面没有 7 天清除问题）
 *
 * 8 秒这个值的依据：用户在前 3 秒读答案、接下来 5 秒可能改个金额。
 * 8 秒后他已跑完第一次核心体验，此时提示接受率最高。
 */

import { useCallback, useEffect, useState } from 'react';
import { bumpInstallDismiss, loadInstallDismiss } from '../db/settingsRepository';
import {
  INSTALL_GUIDE_COOLDOWN_MS,
  INSTALL_GUIDE_DELAY_MS,
  INSTALL_GUIDE_MAX_DISMISS,
  getPlatformInfo,
  shouldConsiderInstallGuide,
} from '../platform/installGuide';
import type { PlatformInfo } from '../platform/installGuide';

export interface UseInstallPromptResult {
  open: boolean;
  isSafari: boolean;
  /** 平台信息，透传给 InstallGuide 决定给「真按钮」还是「步骤引导」 */
  platform: Pick<PlatformInfo, 'isIOS' | 'isAndroid'>;
  /** 刚刚被用户关掉（用于把焦点还给金额输入） */
  justDismissed: boolean;
  dismiss: () => void;
  /** 「先导出备份也行」：关闭并记为已走备份路线（同样 24h 冷却） */
  chooseBackupRoute: () => void;
}

export function useInstallPrompt(): UseInstallPromptResult {
  const [open, setOpen] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [justDismissed, setJustDismissed] = useState(false);
  // 平台判定只依赖 UA，首帧就能拿到，不需要等 effect ——
  // 但 SSR/测试环境没有 window，getPlatformInfo 自己兜底返回全 false。
  const [platform, setPlatform] = useState<Pick<PlatformInfo, 'isIOS' | 'isAndroid'>>(() => getPlatformInfo());

  useEffect(() => {
    const info = getPlatformInfo();
    if (!shouldConsiderInstallGuide(info)) return;
    let cancelled = false;

    const timer = setTimeout(() => {
      void (async () => {
        const state = await loadInstallDismiss();
        if (cancelled) return;
        if (state.count >= INSTALL_GUIDE_MAX_DISMISS) return;
        if (state.at !== null) {
          const elapsed = Date.now() - Date.parse(state.at);
          if (Number.isFinite(elapsed) && elapsed < INSTALL_GUIDE_COOLDOWN_MS) return;
        }
        setIsSafari(info.isSafari);
        setPlatform({ isIOS: info.isIOS, isAndroid: info.isAndroid });
        setOpen(true);
      })();
    }, INSTALL_GUIDE_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setJustDismissed(true);
    void bumpInstallDismiss();
  }, []);

  return {
    open,
    isSafari,
    platform,
    justDismissed,
    dismiss: close,
    chooseBackupRoute: close,
  };
}
