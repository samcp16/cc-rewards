/**
 * 快捷金额。
 *
 * 收银台前输金额，绝大多数情况是整数（一杯咖啡 45、一顿饭 300、一趟超市 500）。
 * 手输这些数字要在数字键盘上点 2–4 次，而这四个 chip 只需一次。
 *
 * 只给 4 个档位，不给「常用金额」智能推荐：一个自用工具里，任何需要「学习」
 * 的功能都会在第三次使用时变成噪音 —— 用户记得住四个数，记不住算法猜了什么。
 */

const PRESETS = [100, 200, 500, 1000];

interface QuickAmountProps {
  current: number;
  onPick: (value: number) => void;
}

export function QuickAmount({ current, onPick }: QuickAmountProps): React.JSX.Element {
  return (
    <div role="group" aria-label="快捷金额" className="flex gap-[7px]">
      {PRESETS.map((value) => {
        const active = Math.abs(current - value) < 0.005;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onPick(value);
            }}
            className={[
              'num h-9 min-w-[62px] flex-1 rounded-[var(--radius-md)] text-[length:var(--text-sm)]',
              'transition-[background-color,color,transform] duration-[var(--motion-fast)] active:scale-[0.97]',
              active
                ? 'bg-accent-tint font-[var(--fw-announce)] text-accent-text'
                : 'bg-surface-2 font-[var(--fw-read)] text-fg-2 hover:bg-surface-3',
            ].join(' ')}
            style={{ boxShadow: active ? 'inset 0 0 0 1px var(--accent-text)' : 'none' }}
          >
            {value.toLocaleString('en-US')}
          </button>
        );
      })}
    </div>
  );
}
