/**
 * 数据安全卡（settings.md §3，本页最重要且唯一使用卡片形态的元素）。
 *
 * 一屏里只有这一块需要用户「停下来读」，所以它独占卡片的视觉重量：
 * 其他项都是可跳过的操作，用留白分组就够。全都做成卡片 = 没有重点。
 *
 * 图标用 --info 蓝而不是 --pos 绿：绿色在本产品只有「省钱」一个含义，
 * 用绿会让用户以为「安全 = 有收益」，也会稀释绿色的唯一性。
 *
 * 第 4 条必须写「7 天」这个具体数字和条件。写「可能丢失」等于没说 ——
 * 用户不会为一个模糊的风险装 App。
 */

import { ShieldCheck } from 'lucide-react';
import { Button } from '../common/Button';

interface DataSafetyCardProps {
  /** 距上次导出的天数；null = 从未导出 */
  daysSinceExport: number | null;
  onExport: () => void;
  exporting: boolean;
}

function exportStatusText(days: number | null): { text: string; warn: boolean } {
  if (days === null) return { text: '还没备份过', warn: true };
  if (days === 0) return { text: '上次备份：今天', warn: false };
  if (days > 30) return { text: `${String(days)} 天没备份了`, warn: true };
  return { text: `上次备份：${String(days)} 天前`, warn: false };
}

const POINTS = [
  '卡库和账本只存在本机浏览器里，没有任何上传',
  '不存卡号、有效期、CVV',
  '没有账号，也没有后端服务器',
  '唯一会丢数据的情况：清浏览器数据，或 iOS 超过 7 天没打开（安装到主屏幕可以避免）',
];

export function DataSafetyCard({ daysSinceExport, onExport, exporting }: DataSafetyCardProps): React.JSX.Element {
  const status = exportStatusText(daysSinceExport);

  return (
    <div className="mt-[var(--space-4)] rounded-[var(--radius-lg)] border border-line bg-surface-1 p-[var(--space-4)]">
      <ShieldCheck size={20} strokeWidth={2} className="text-info" aria-hidden="true" />
      <h2 className="mt-[var(--space-2)] text-[length:var(--text-md)] font-[var(--fw-announce)] text-fg">
        你的数据不离开这台设备
      </h2>
      <ul className="mt-[var(--space-2)] flex flex-col gap-[var(--space-1)]">
        {POINTS.map((point) => (
          <li key={point} className="flex gap-[var(--space-1)] text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
            <span className="shrink-0" aria-hidden="true">
              ·
            </span>
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="mt-[var(--space-3)] flex items-center justify-between gap-[var(--space-3)] rounded-[var(--radius-md)] bg-surface-2 px-[var(--space-3)] py-[var(--space-2)]">
        <span className={`text-[length:var(--text-xs)] ${status.warn ? 'text-warn' : 'text-meta'}`}>{status.text}</span>
        <Button size="compact" variant="secondary" disabled={exporting} onClick={onExport}>
          {exporting ? '正在导出…' : '立即导出备份'}
        </Button>
      </div>
    </div>
  );
}
