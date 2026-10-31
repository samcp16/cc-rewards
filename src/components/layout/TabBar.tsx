/**
 * 底部导航。3 项（SPEC §7 锁定）：算一笔 / 我的卡 / 设置。
 *
 * 为什么不做侧边栏：一个用户 8 张卡，侧栏是纯负担（MASTER §7.1）。
 * 桌面端 TabBar 也保留在底部中间，位置固定 —— 换设备不该换肌肉记忆。
 *
 * 当前项用 --accent-text 而不是 --accent：后者做文字只有 3.54:1。
 */

import { Calculator, CreditCard, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

interface TabItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const TABS: TabItem[] = [
  { to: '/', label: '算一笔', icon: <Calculator size={24} strokeWidth={2} aria-hidden="true" />, end: true },
  { to: '/cards', label: '我的卡', icon: <CreditCard size={24} strokeWidth={2} aria-hidden="true" /> },
  { to: '/settings', label: '设置', icon: <Settings size={24} strokeWidth={2} aria-hidden="true" /> },
];

export function TabBar(): React.JSX.Element {
  return (
    <nav
      aria-label="主导航"
      className="shrink-0 border-t border-line-subtle bg-surface-1"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex h-[var(--size-tabbar)] w-full max-w-[var(--container-desktop)]">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                [
                  'flex h-full flex-col items-center justify-center gap-0.5',
                  'transition-colors duration-[var(--motion-fast)]',
                  isActive ? 'text-accent-text' : 'text-muted hover:text-fg-2',
                ].join(' ')
              }
            >
              {tab.icon}
              <span className="text-[10px] font-[var(--fw-emphasize)] tracking-[var(--tracking-label)]">
                {tab.label}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
