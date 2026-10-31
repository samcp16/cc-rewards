/**
 * 来源链接（MASTER §3.8）。
 *
 * 显示域名而非完整 URL —— 「hsbc.com.hk」能一眼认出是哪家银行，
 * 「https://www.hsbc.com.hk/credit-cards/products/xxx?a=1」只会占满一行。
 *
 * 注意：本产品 CSP 是 `connect-src 'none'`，但 `<a href>` 的导航不受它限制，
 * 外链可以正常打开。用户点链接会离开应用，这是预期行为 —— 查证费率必须能看官方页面。
 */

import { ArrowUpRight } from 'lucide-react';

interface SourceLinkProps {
  url: string;
  /** 右侧补充说明，如「2026-10-31 核实」 */
  meta?: string;
  /** 显示完整 URL 而不是域名（详情页的来源区用） */
  showPath?: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    // 卡库里理论上不该出现非法 URL，但用户手填的可能是空的
    return url || '来源未填';
  }
}

export function SourceLink({ url, meta, showPath = false }: SourceLinkProps): React.JSX.Element {
  const label = showPath ? url.replace(/^https?:\/\//, '') : hostOf(url);
  if (!url) {
    return <span className="text-[length:var(--text-sm)] text-muted">来源未填</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-[var(--space-2)] gap-y-[var(--space-1)]">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className="inline-flex items-center gap-[var(--space-1)] text-[length:var(--text-sm)] text-info underline decoration-from-font underline-offset-2 hover:text-accent-text"
        style={{ textUnderlineOffset: '2px' }}
      >
        {label}
        <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
      </a>
      {meta !== undefined && (
        <span className="text-[length:var(--text-xs)] text-meta">{meta}</span>
      )}
    </span>
  );
}
