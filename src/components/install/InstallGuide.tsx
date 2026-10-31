/**
 * 安装引导（F11，P0）。
 *
 * 为什么这是 P0 而不是体验优化：iOS Safari 对未「添加到主屏幕」的站点，
 * 7 天未交互即清除 IndexedDB。用户花 20 分钟录入 8 张卡的规则，7 天不开，全没。
 * 安卓没有这个清除机制，但装成 App 后能离线算、从桌面直达，同样值得引导。
 *
 * 两个平台给的方案完全不同，不是同一段文案换个措辞：
 * - iOS：网页无法触发「添加到主屏幕」，只能老实给 4 个步骤，把用户送到系统 UI。
 *   给「一键安装」按钮等于假承诺 —— 点了没反应，用户会认为产品坏了。
 * - 安卓：Chrome 提供 `beforeinstallprompt`，存下事件后可以由按钮触发原生安装框。
 *   这时候给真按钮才是对的，反过来给 4 步 iOS 操作说明（「点底部分享按钮」）
 *   安卓用户根本找不到，同样会认为产品坏了。
 *
 * 三条视觉纪律（onboarding-install.md §8）：
 * - 不用插画、不模拟系统截图，只用 smartphone 一个 24px 图标
 * - 不用红色警告三角，用 --accent-text（这是提醒，不是错误）
 * - iOS 不提供「一键安装」按钮（原因见上）
 */

import { Check, ChevronRight, Smartphone, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { canPromptInstall, promptInstall } from '../../platform/installGuide';
import type { PlatformInfo } from '../../platform/installGuide';

interface InstallGuideProps {
  open: boolean;
  /** 是否 Safari。非 Safari（微信 / Chrome）第一步是「换用 Safari」 */
  isSafari: boolean;
  /** 平台信息。缺省时按 iOS 处理（保守：宁可给步骤，不给假按钮） */
  platform?: Pick<PlatformInfo, 'isIOS' | 'isAndroid'>;
  onClose: () => void;
  onBackupRoute: () => void;
}

interface Step {
  title: string;
  hint: string;
  done?: boolean;
}

function stepsFor(isSafari: boolean): Step[] {
  return [
    isSafari
      ? { title: '在 Safari 里打开这一页', hint: '现在是 Safari，这一步已完成', done: true }
      : { title: '在 Safari 里打开这一页', hint: '先点右上角的 ···，选「在 Safari 中打开」' },
    { title: '点屏幕底部的分享按钮', hint: '方框中间一个向上箭头' },
    { title: '在菜单里选「添加到主屏幕」', hint: '可能要往下滑一点才看到' },
    { title: '点右上角「添加」', hint: '之后从主屏幕的图标打开，数据就不再受 7 天限制' },
  ];
}

export function InstallGuide({ open, isSafari, platform, onClose, onBackupRoute }: InstallGuideProps): React.JSX.Element | null {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // 安卓：是否是「可一键安装」的浏览器。Chrome / Edge 会给事件，
  // 微信内置浏览器不给 —— 那种情况下退回手动步骤（安卓 Chrome 菜单里也有「安装应用」）。
  const isAndroid = platform?.isAndroid === true && platform?.isIOS !== true;
  const [promptReady, setPromptReady] = useState<boolean>(false);
  const [installing, setInstalling] = useState<boolean>(false);
  const [promptFailed, setPromptFailed] = useState<boolean>(false);

  useEffect(() => {
    if (!open || !isAndroid) return;
    // 打开时才读一次：事件可能在应用启动后才到，读早了会拿到 false
    setPromptReady(canPromptInstall());
    setPromptFailed(false);
  }, [open, isAndroid]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const node = sheetRef.current;
      if (!node) return;
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const steps = stepsFor(isSafari);

  return (
    <div className="fixed inset-0 z-[var(--z-sheet-scrim)]">
      <button type="button" aria-label="关闭安装引导" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/50" tabIndex={-1} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex max-h-[var(--sheet-max-h)] flex-col rounded-t-lg bg-surface-3"
        style={{ boxShadow: 'var(--elev-raised)' }}
      >
        <div className="mx-auto mt-[var(--space-2)] h-1 w-8 shrink-0 rounded-[var(--radius-pill)] bg-line-strong" aria-hidden="true" />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="关闭安装引导"
          className="absolute right-[var(--space-2)] top-[var(--space-2)] flex h-11 w-11 items-center justify-center text-muted hover:text-fg"
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>

        <div className="overflow-y-auto px-[var(--space-4)] pb-[var(--space-4)] pt-[var(--space-6)]">
          <Smartphone size={24} strokeWidth={2} className="text-accent-text" aria-hidden="true" />
          <h2
            id={titleId}
            className="mt-[var(--space-3)] text-[length:var(--text-xl)] font-[var(--fw-announce)] tracking-[var(--tracking-heading)] text-fg"
          >
            {isAndroid ? '装成 App，用时更快' : '装到主屏幕，卡库才不会丢'}
          </h2>

          {isAndroid ? (
            <>
              <p className="mt-[var(--space-2)] text-[length:var(--text-base)] leading-[1.65] text-fg-2">
                装好后从桌面直接打开，没有地址栏，离线也能算。安卓不会像 iPhone 那样清掉你的数据，但装成 App 用起来顺手得多。
              </p>

              {promptReady ? (
                <button
                  type="button"
                  disabled={installing}
                  onClick={() => {
                    setInstalling(true);
                    void promptInstall().then((accepted) => {
                      setInstalling(false);
                      setPromptReady(false);
                      if (accepted) onClose();
                      else setPromptFailed(true);
                    });
                  }}
                  className="mt-[var(--space-5)] flex h-[var(--size-touch)] w-full items-center justify-center rounded-md bg-accent text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-on-accent disabled:opacity-60"
                >
                  {installing ? '正在打开安装框…' : '安装到桌面'}
                </button>
              ) : (
                <>
                  <ol className="mt-[var(--space-5)] flex flex-col gap-[var(--space-2)]">
                    {[
                      { title: '点右上角的 ⋮ 菜单', hint: 'Chrome / Edge 都在这里' },
                      { title: '选「安装应用」或「添加到主屏幕」', hint: '名字随浏览器版本略有不同' },
                      { title: '确认后从桌面图标打开', hint: '之后就不需要再输网址了' },
                    ].map((step, index) => (
                      <li
                        key={step.title}
                        className="flex items-start gap-[var(--space-3)] rounded-md border border-line-subtle bg-surface-2 px-[var(--space-3)] py-[var(--space-2)]"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-pill)] bg-surface-4 text-[length:var(--text-2xs)] font-[var(--fw-announce)] text-fg-2"
                        >
                          {String(index + 1)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg">
                            {step.title}
                          </span>
                          <span className="text-[length:var(--text-xs)] text-muted">{step.hint}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  {promptFailed && (
                    <p className="mt-[var(--space-3)] text-[length:var(--text-xs)] text-warn">
                      安装框没有打开。按上面三步在浏览器菜单里手动装也一样。
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <p className="mt-[var(--space-2)] text-[length:var(--text-base)] leading-[1.65] text-fg-2">
                iPhone 上，没装到主屏幕的网页超过 7 天没打开，存的东西会被系统清掉。你的卡库就没了。
              </p>

              <ol className="mt-[var(--space-5)] flex flex-col gap-[var(--space-2)]">
                {steps.map((step, index) => {
                  const dimmed = !isSafari && index > 0;
                  return (
                    <li
                      key={step.title}
                      className="flex items-start gap-[var(--space-3)] rounded-md border border-line-subtle bg-surface-2 px-[var(--space-3)] py-[var(--space-2)]"
                      style={{ opacity: dimmed ? 0.55 : 1 }}
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-pill)]',
                          'text-[length:var(--text-2xs)] font-[var(--fw-announce)]',
                          step.done ? 'bg-pos-tint text-pos' : !isSafari && index === 0 ? 'bg-warn-tint text-warn' : 'bg-surface-4 text-fg-2',
                        ].join(' ')}
                      >
                        {String(index + 1)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-[var(--space-1)] text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg">
                          {step.title}
                          <span className="sr-only">第 {String(index + 1)} 步，共 4 步</span>
                          {step.done === true && <Check size={14} strokeWidth={2} className="text-pos" aria-hidden="true" />}
                        </span>
                        <span className={`text-[length:var(--text-xs)] ${step.done === true ? 'text-pos' : 'text-muted'}`}>
                          {step.hint}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>

              {!isSafari && (
                <p className="mt-[var(--space-3)] text-[length:var(--text-xs)] text-warn">
                  现在这个浏览器装不了。换成 Safari 才能添加到主屏幕。
                </p>
              )}
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-[var(--space-4)] flex h-[var(--size-touch)] w-full items-center justify-center text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg-2"
          >
            稍后再说
          </button>
          <button
            type="button"
            onClick={onBackupRoute}
            className="mx-auto flex items-center gap-0.5 text-[length:var(--text-sm)] text-info"
          >
            先导出备份也行
            <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div style={{ paddingBottom: 'var(--safe-bottom)' }} />
      </div>
    </div>
  );
}
