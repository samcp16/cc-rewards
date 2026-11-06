/**
 * 新版本提示条。
 *
 * 为什么是常驻条而不是 Toast：Toast 2.5s 自散（MASTER §3.10），
 * 而「有新版本」是用户需要**看见并决定**的一件事 —— 用会自动消失的
 * 提示去传达需要选择的事，等于把选择权也一起消失掉。
 *
 * 为什么不做成整屏弹窗：「稍后」是合法选择。一个不该拦截付款流程的
 * 通知，没有资格挡住用户正在做的下一步。
 *
 * 为什么更新需要用户点：卡库是用户手改的数据，重载会把正在编辑的
 * 表单清空。自动更新在这个产品里是数据事故，不是体验优化。
 */

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { subscribeUpdateReady, type ApplyUpdate } from '../../platform/updateSignal';

/**
 * 纯展示层，受控。可被静态渲染测试覆盖（本项目 vitest 是 node 环境）。
 *
 * 为什么不用 createPortal（Toast 用了）：Toast 挂在随机位置的组件树里，
 * 需要 portal 逃出父级 transform 形成的包含块；本组件挂在 App 根部，
 * 外面没有任何 transform/filter，fixed 就是相对视口。
 * 少一层 portal 换来的是「这个组件的输出能被 renderToStaticMarkup 直接断言」。
 */
export function UpdateBannerView({
  onApply,
  onDismiss,
}: {
  onApply: () => void;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 z-[var(--z-toast)] flex justify-center px-[var(--space-4)]"
      style={{ bottom: 'calc(var(--size-tabbar) + var(--safe-bottom) + var(--space-4))' }}
    >
      <div className="w-full max-w-[420px] rounded-lg border border-line-strong bg-surface-4 p-[var(--space-4)]">
        <div className="flex items-start gap-[var(--space-3)]">
          <RefreshCw size={16} className="mt-[2px] shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg">
              新版本已就绪
            </p>
            <p className="mt-[var(--space-1)] text-[length:var(--text-sm)] text-fg-2">
              更新会重新加载页面。卡库与设置都在这台手机上，不会丢。
            </p>
          </div>
        </div>
        <div className="mt-[var(--space-3)] flex gap-[var(--space-2)]">
          <Button variant="secondary" size="compact" fullWidth onClick={onDismiss}>
            稍后
          </Button>
          <Button variant="primary" size="compact" fullWidth onClick={onApply}>
            立即更新
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 订阅更新的容器。
 *
 * 卸载后重新挂载（路由切换、HMR）时不会重复弹：`apply` 已被消费，
 * 信号总线里的 pending 也已清空 —— 重载才是唯一出路，同一个版本
 * 反复提示只会变成噪音。
 */
export function UpdateBanner(): React.JSX.Element | null {
  const [apply, setApply] = useState<ApplyUpdate | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeUpdateReady((next) => {
      setApply(() => next);
    });
    return unsubscribe;
  }, []);

  if (!apply) return null;

  return (
    <UpdateBannerView
      onApply={() => {
        apply();
      }}
      onDismiss={() => {
        setApply(null);
      }}
    />
  );
}
