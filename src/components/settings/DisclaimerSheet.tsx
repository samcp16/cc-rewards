/**
 * 免责声明（settings.md §7.1）。内容必须完整，不允许占位。
 *
 * 这五段不是法律套话，每一段对应一个真实误解：
 * - 「不是金融建议」：用户会把推荐当成「银行认可」
 * - 「以银行最新公告为准」：费率会变，而本产品的数据有核实日期
 * - 「待核对/未知不参与排序」：否则用户会把「没数据」读成「不划算」
 * - 「不构成消费建议」：边界要说清
 * - 「不存卡号」回应最敏感的隐私顾虑
 */

import { BottomSheet } from '../common/BottomSheet';

const PARAGRAPHS = [
  '这是一个个人使用的决策辅助工具，不是金融建议。',
  '费率与返现规则来自各发卡行公开页面，核实日期标在每张卡的详情里。银行随时可能调整条款，实际以银行最新公告为准。',
  '标「待核对」或「未知」的卡，说明我们没查到可靠数据。它们不参与排序，不代表不建议使用。',
  '计算结果仅供参考，不构成任何消费、申卡或投资建议。因参考本工具产生的任何损失，开发者不承担责任。',
  '本工具不收集任何个人信息，不连接银行账户，不存卡号、CVV 或有效期。数据仅存在本机浏览器。',
];

interface DisclaimerSheetProps {
  open: boolean;
  onClose: () => void;
  batchDate: string;
  moCount: number;
  hkCount: number;
}

export function DisclaimerSheet({ open, onClose, batchDate, moCount, hkCount }: DisclaimerSheetProps): React.JSX.Element {
  return (
    <BottomSheet open={open} onClose={onClose} title="免责声明">
      <div className="flex flex-col gap-[var(--space-3)]">
        {PARAGRAPHS.map((text) => (
          <p key={text} className="text-[length:var(--text-sm)] leading-[var(--leading-body)] text-fg-2">
            {text}
          </p>
        ))}
        <div className="mt-[var(--space-2)] border-t border-line-subtle pt-[var(--space-3)]">
          <p className="num text-[length:var(--text-xs)] text-meta">卡库数据核实日期：{batchDate}</p>
          <p className="num mt-1 text-[length:var(--text-xs)] text-meta">
            数据覆盖：中国澳门 {String(moCount)} 张 · 中国香港 {String(hkCount)} 张
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}
