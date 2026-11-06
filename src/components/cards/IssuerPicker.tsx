/**
 * 第一步：选银行。
 *
 * 每行只回答一个问题「哪家银行」，别顺手把卡名也塞进来 ——
 * 三十多张卡名堆在第一屏，等于把「缩小范围」这一步取消了。
 */

import { ChevronRight } from 'lucide-react';
import type { IssuerGroup } from '../../lib/issuerGroups';
import { ISSUER_REGION_LABEL } from '../../lib/labels';

interface IssuerPickerProps {
  groups: IssuerGroup[];
  onPick: (issuer: string) => void;
}

export function IssuerPicker({ groups, onPick }: IssuerPickerProps): React.JSX.Element {
  const regions: Array<{ region: 'MO' | 'HK'; items: IssuerGroup[] }> = [
    { region: 'MO', items: groups.filter((g) => g.region === 'MO') },
    { region: 'HK', items: groups.filter((g) => g.region === 'HK') },
  ];

  return (
    <>
      {regions.map(({ region, items }) => (
        <section key={region}>
          <h2 className="pb-[var(--space-2)] pt-[var(--space-5)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
            {ISSUER_REGION_LABEL[region]} · {items.length} 家
          </h2>
          <ul className="border-t border-line-subtle">
            {items.map((group) => (
              <li key={group.issuer}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(group.issuer);
                  }}
                  className="flex w-full items-center gap-[var(--space-3)] border-b border-line-subtle py-[var(--space-3)] text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 active:bg-surface-3"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg">
                      {group.issuer}
                    </span>
                    <span className="truncate text-[length:var(--text-xs)] text-muted">
                      {group.cards.length} 张卡
                      {group.usableCount < group.cards.length
                        ? ` · ${String(group.cards.length - group.usableCount)} 张核实中`
                        : ''}
                    </span>
                  </span>
                  <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-meta" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
