/**
 * 导入流程面板（settings.md §5.3，AC-F7-03/04/05）。
 *
 * 三种失败各有独立文案，一个都不能合并：
 * - 格式错误 → 列出缺哪个字段路径，并明确「现有卡库没有改动」
 * - 冲突     → 列出具体是哪几张，解释两个选项各自的结果
 * - 写入失败 → 说明「整体回滚」，用结果语言而不是技术词
 *
 * 「现有卡库没有改动」「已经全部撤回。你原来的卡库还在」这两句必须有 ——
 * 用户在这一刻唯一想知道的就是「我的数据还在不在」。
 */

import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '../common/Button';
import { BottomSheet } from '../common/BottomSheet';

export type ImportPhase =
  | { kind: 'pick' }
  | { kind: 'invalid'; problems: string[] }
  | { kind: 'conflict'; names: string[]; onChoose: (policy: 'overwrite' | 'keep-both') => void }
  | { kind: 'failed' };

interface ImportSheetProps {
  open: boolean;
  phase: ImportPhase;
  onClose: () => void;
  onPickFile: (file: File) => void;
  busy: boolean;
}

export function ImportSheet({ open, phase, onClose, onPickFile, busy }: ImportSheetProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const title =
    phase.kind === 'pick'
      ? '导入备份'
      : phase.kind === 'invalid'
        ? '这个文件不是刷哪张的备份'
        : phase.kind === 'conflict'
          ? `发现 ${String(phase.names.length)} 张同名卡`
          : '导入没完成';

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickFile(file);
          e.target.value = '';
        }}
      />

      {phase.kind === 'pick' && (
        <div className="flex flex-col gap-[var(--space-3)]">
          <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
            从「文件」App 里选之前导出的 JSON 文件。导入前会先检查文件格式，格式不对不会动你现在的卡库。
          </p>
          <Button
            fullWidth
            disabled={busy}
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            {busy ? '正在读文件…' : '选择文件'}
          </Button>
        </div>
      )}

      {phase.kind === 'invalid' && (
        <div className="flex flex-col gap-[var(--space-3)]">
          <TriangleAlert size={20} strokeWidth={2} className="text-neg" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-[length:var(--text-sm)] text-fg-2">缺少或写错的字段：</p>
            <p
              className="num break-all rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-[length:var(--text-xs)] text-neg"
              style={{ fontFamily: 'var(--font-mono)', backgroundColor: 'var(--surface-4)' }}
            >
              {phase.problems.slice(0, 8).join('、')}
              {phase.problems.length > 8 ? ` 等 ${String(phase.problems.length)} 处` : ''}
            </p>
          </div>
          <p className="text-[length:var(--text-sm)] font-[var(--fw-emphasize)] text-fg">现有卡库没有改动。</p>
          <Button
            fullWidth
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            换一个文件
          </Button>
        </div>
      )}

      {phase.kind === 'conflict' && (
        <div className="flex flex-col gap-[var(--space-3)]">
          <ul className="flex flex-col gap-1">
            {phase.names.map((name) => (
              <li
                key={name}
                className="text-[length:var(--text-sm)] text-fg-2"
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                · {name}
              </li>
            ))}
          </ul>
          <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
            选「覆盖」用文件里的版本替掉，选「保留两者」会存成两张，名字后面加「（导入）」。两种都不会丢数据。
          </p>
          <div className="flex gap-[var(--space-2)]">
            <Button
              variant="secondary"
              fullWidth
              disabled={busy}
              onClick={() => {
                phase.onChoose('keep-both');
              }}
            >
              保留两者
            </Button>
            <Button
              variant="secondary"
              fullWidth
              disabled={busy}
              onClick={() => {
                phase.onChoose('overwrite');
              }}
            >
              覆盖
            </Button>
          </div>
          <Button variant="ghost" fullWidth onClick={onClose}>
            取消
          </Button>
        </div>
      )}

      {phase.kind === 'failed' && (
        <div className="flex flex-col gap-[var(--space-3)]">
          <RotateCcw size={20} strokeWidth={2} className="text-neg" aria-hidden="true" />
          <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
            写入时出错了，已经全部撤回。你原来的卡库还在，和导入前一模一样。
          </p>
          <Button
            fullWidth
            onClick={() => {
              inputRef.current?.click();
            }}
          >
            重试
          </Button>
          <Button variant="ghost" fullWidth onClick={onClose}>
            取消
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
