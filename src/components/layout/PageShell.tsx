/**
 * 布局壳：顶栏 + 滚动内容 + 可选底部粘附区 + TabBar。
 *
 * 高度用 `100dvh` 不用 `100vh`：iOS 地址栏收起时 `vh` 会把底部答案卡顶出视口
 * （main-query.md §2 的明确要求）。
 *
 * 内容区的底部 padding 必须由调用方传入，且要按「最大的那个态」计算 ——
 * 宁可留 16px 空隙，也不要最后一行被答案卡遮住。
 */

import type { ReactNode } from 'react';

interface PageShellProps {
  /** 顶栏内容（左标题 / 右侧操作）。为空则不渲染顶栏 */
  topbar?: ReactNode;
  children: ReactNode;
  /** 粘在内容区底部的元素（答案卡 / 保存条），不随滚动离开 */
  sticky?: ReactNode;
  /** 底部导航 */
  tabbar?: ReactNode;
  /** 内容区额外底部 padding（默认 16px） */
  contentPaddingBottom?: string;
}

export function PageShell({ topbar, children, sticky, tabbar, contentPaddingBottom }: PageShellProps): React.JSX.Element {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface-0 text-fg">
      {topbar !== undefined && (
        <div className="shrink-0" style={{ paddingTop: 'var(--safe-top)' }}>
          {topbar}
        </div>
      )}
      <main
        className="page-enter min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{
          WebkitOverflowScrolling: 'touch',
          paddingBottom: contentPaddingBottom ?? 'var(--space-4)',
        }}
      >
        {children}
      </main>
      {sticky !== undefined && (
        <div className="shrink-0" style={{ paddingBottom: tabbar === undefined ? 'var(--safe-bottom)' : undefined }}>
          {sticky}
        </div>
      )}
      {tabbar}
    </div>
  );
}
