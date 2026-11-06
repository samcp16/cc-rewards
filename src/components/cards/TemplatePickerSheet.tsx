/**
 * 「从卡库选一张」——空白卡的填充入口。
 *
 * 为什么需要它：空白卡表单里每一格都要手打，而卡库里本来就有 38 张卡的
 * 完整数据（回赠、门槛、外币手续费、来源）。让用户照着自己那张卡的内容
 * 一格一格抄进表单，是把我们该做的活推给他 —— 而且抄错一个字，
 * 后面所有算出来的数字都是错的。
 *
 * 为什么不跳去 /cards/new：那条路选完直接入库、不让你核对。这里的意图
 * 相反 —— 选完进表单，你可以改、可以看来源，改完再保存。
 */

import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { CardPickerList } from './CardPickerList';
import { IssuerPicker } from './IssuerPicker';
import type { Card } from '../../domain/types';
import { cardsOfIssuer, issuerGroups } from '../../lib/issuerGroups';

interface TemplatePickerSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (template: Card) => void;
  /** 已有卡的 id，用于在列表里标「已有」 */
  existingIds: Set<string>;
}

export function TemplatePickerSheet({ open, onClose, onPick, existingIds }: TemplatePickerSheetProps): React.JSX.Element {
  const [issuer, setIssuer] = useState<string | null>(null);

  // 每次重新打开都从「选银行」开始，不保留上次停在哪家
  useEffect(() => {
    if (open) setIssuer(null);
  }, [open]);

  const groups = useMemo(() => issuerGroups(), []);
  const picks = useMemo(() => (issuer === null ? [] : cardsOfIssuer(issuer)), [issuer]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={issuer ?? '从卡库选一张'}
      subtitle={issuer === null ? '选好之后回赠、门槛、手续费都会自动填上' : `${issuer} · ${String(picks.length)} 张`}
      footer={
        issuer === null ? undefined : (
          <Button variant="secondary" fullWidth onClick={() => setIssuer(null)}>
            换一家银行
          </Button>
        )
      }
    >
      {issuer === null ? (
        <IssuerPicker
          groups={groups}
          onPick={(next) => {
            setIssuer(next);
          }}
        />
      ) : (
        <CardPickerList
          cards={picks}
          existingIds={existingIds}
          busy={false}
          onPick={(card) => {
            onPick(card);
            onClose();
          }}
        />
      )}
    </BottomSheet>
  );
}
