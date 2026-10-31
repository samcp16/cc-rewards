/**
 * 删除二次确认（card-detail.md §7，AC-F2-05）。
 *
 * 为什么不用原生 confirm：原生弹窗在 iOS 上样式不可控，且放不下
 * 「账本记录会保留」这句说明 —— 用户最担心的就是「我的记录会不会一起没了」。
 *
 * 按钮排布：取消在上（拇指更容易够到安全项），删除在下；
 * 删除不用红填充 —— 红填充会把破坏性操作做成主操作。
 */

import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';

interface DeleteConfirmProps {
  open: boolean;
  onClose: () => void;
  cardName: string;
  ledgerCount: number;
  onConfirm: () => void;
}

export function DeleteConfirm({ open, onClose, cardName, ledgerCount, onConfirm }: DeleteConfirmProps): React.JSX.Element {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="删除这张卡？"
      footer={
        <div className="flex flex-col gap-[var(--space-2)]">
          <Button variant="secondary" fullWidth onClick={onClose}>
            取消
          </Button>
          <Button variant="destructive" fullWidth onClick={onConfirm}>
            删除
          </Button>
        </div>
      }
    >
      <p className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
        {cardName || '这张卡'}会从卡库中移除。
        {ledgerCount > 0 ? `相关的 ${String(ledgerCount)} 条账本记录会保留，但不再参与计算。` : '没有关联的账本记录。'}
      </p>
    </BottomSheet>
  );
}
