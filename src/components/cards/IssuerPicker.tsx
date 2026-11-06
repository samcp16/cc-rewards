/**
 * 第一步：选银行。
 *
 * 每行只回答一个问题「哪家银行」，别顺手把卡名也塞进来 ——
 * 三十多张卡名堆在第一屏，等于把「缩小范围」这一步取消了。
 *
 * 编辑态解决另一件事：二十家银行里用户往往只有三四家，剩下十几家
 * 每次都挡在候选列表里。藏掉之后列表才开始为他服务。
 * 为什么不是每行常驻一个删除按钮：行长要放银行全称（澳门国际银行
 * 还带英文括注），再挤一个按钮会把名字截断，而名字是这一行唯一的信息。
 * 编辑态才让出位置，是唯一不牺牲可读性的做法。
 *
 * 编辑态下行本身不可点 —— 这时点行想的是「删掉这家」，不是「进去选卡」，
 * 让它跳走等于惩罚正确的意图。
 */

import { ChevronRight, Minus } from 'lucide-react';
import { shortIssuer, type IssuerGroup } from '../../lib/issuerGroups';
import { ISSUER_REGION_LABEL } from '../../lib/labels';

interface IssuerPickerProps {
  groups: IssuerGroup[];
  onPick: (issuer: string) => void;
  /** 编辑态：行不进选卡，右侧换成「隐藏这家」按钮 */
  editing?: boolean;
  onHide?: (group: IssuerGroup) => void;
}

export function IssuerPicker({ groups, onPick, editing = false, onHide }: IssuerPickerProps): React.JSX.Element {
  const regions: Array<{ region: 'MO' | 'HK'; items: IssuerGroup[] }> = [
    { region: 'MO', items: groups.filter((g) => g.region === 'MO') },
    { region: 'HK', items: groups.filter((g) => g.region === 'HK') },
  ];

  return (
    <>
      {regions.map(({ region, items }) => {
        if (items.length === 0) return null;
        return (
          <section key={region}>
            <h2 className="pb-[var(--space-2)] pt-[var(--space-5)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
              {ISSUER_REGION_LABEL[region]} · {items.length} 家
            </h2>
            <ul className="border-t border-line-subtle">
              {items.map((group) => (
                <li key={group.issuer} className="flex items-center border-b border-line-subtle">
                  {editing ? (
                    <div className="flex min-w-0 flex-1 items-center py-[var(--space-3)]">
                      <IssuerLabel group={group} />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onPick(group.issuer);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-[var(--space-3)] py-[var(--space-3)] text-left transition-colors duration-[var(--motion-fast)] hover:bg-surface-2 active:bg-surface-3"
                    >
                      <IssuerLabel group={group} />
                      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-meta" aria-hidden="true" />
                    </button>
                  )}

                  {editing && (
                    <button
                      type="button"
                      aria-label={`隐藏 ${group.issuer}`}
                      onClick={() => {
                        onHide?.(group);
                      }}
                      className="flex h-11 w-11 shrink-0 items-center justify-center text-fg-2 transition-colors duration-[var(--motion-fast)] hover:text-fg"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line-strong">
                        <Minus size={14} strokeWidth={2} aria-hidden="true" />
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function IssuerLabel({ group }: { group: IssuerGroup }): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      {/* 用短名：全名是法定名 + 拉丁名，在手机上永远被截成半句，读起来像加载失败 */}
      <span className="truncate text-[length:var(--text-base)] font-[var(--fw-emphasize)] text-fg">
        {shortIssuer(group.issuer)}
      </span>
      <span className="truncate text-[length:var(--text-xs)] text-muted">
        {group.cards.length} 张卡
        {group.usableCount < group.cards.length ? ` · ${String(group.cards.length - group.usableCount)} 张核实中` : ''}
      </span>
    </span>
  );
}
