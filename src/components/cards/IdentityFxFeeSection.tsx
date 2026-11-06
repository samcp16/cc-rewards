/**
 * 卡详情页的「基本信息 + 外币手续费」编辑区（card-detail.md §5.3 ①②）。
 *
 * 从 CardDetailPage 拆出的原因：详情页要承载 7 个区块 + 删除流程 + 保存条，
 * 单文件超 300 行门禁。这两个区块共享 patch 函数，天然是一组。
 *
 * 外币费率是全表单唯一「空则阻止保存」的字段（AC-F2-04）：
 * 它直接决定净回报算得对不对，静默按 0 计会让港卡在澳门「倒贴 1.95%」
 * 这种关键场景整个消失。
 */

import type { Ref } from 'react';
import type { CardRow } from '../../db/schema';
import type { CardNetwork, CurrencyCode, IssuerRegion } from '../../domain/types';
import { PercentField, ReadOnlyRow, SelectField, TextField } from './FieldRows';
import { SourceLink } from '../common/SourceLink';
import { CURRENCY_LABEL, ISSUER_REGION_LABEL, NETWORK_LABEL } from '../../lib/labels';
import { shortIssuer } from '../../lib/issuerGroups';
import { formatMoney } from '../../lib/format';

interface IdentityFxFeeSectionProps {
  draft: CardRow;
  patch: (next: Partial<CardRow>) => void;
  fxError: string | null;
  /** 保存失败时滚动定位到外币费率字段 */
  fxRef?: Ref<HTMLElement>;
}

export function IdentityFxFeeSection({ draft, patch, fxError, fxRef }: IdentityFxFeeSectionProps): React.JSX.Element {
  return (
    <>
      <section className="pt-[var(--space-6)]">
        <h2 className="mb-[var(--space-2)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
          基本信息
        </h2>
        <TextField label="卡片名称" value={draft.cardName} onChange={(v) => patch({ cardName: v })} placeholder="例如 中银香港 Chill 信用卡" />
        <ReadOnlyRow label="发卡行" value={shortIssuer(draft.issuer)} hint="发卡行决定这张卡归在哪一组，要换请在卡库里重新选一张" />
        <SelectField<IssuerRegion>
          label="发卡地区"
          value={draft.issuerRegion}
          options={[
            { value: 'MO', label: ISSUER_REGION_LABEL.MO },
            { value: 'HK', label: ISSUER_REGION_LABEL.HK },
          ]}
          onChange={(v) => patch({ issuerRegion: v })}
        />
        <SelectField<CardNetwork>
          label="卡组织"
          value={draft.network}
          options={(Object.keys(NETWORK_LABEL) as CardNetwork[]).map((n) => ({ value: n, label: NETWORK_LABEL[n] }))}
          onChange={(v) => patch({ network: v })}
        />
        <SelectField<CurrencyCode>
          label="结算币种"
          value={draft.cardCurrency}
          options={(Object.keys(CURRENCY_LABEL) as CurrencyCode[]).map((c) => ({ value: c, label: CURRENCY_LABEL[c] }))}
          onChange={(v) => patch({ cardCurrency: v })}
        />
        <ReadOnlyRow
          label="年费"
          value={`${formatMoney(draft.annualFee.amount)} ${draft.annualFee.currency}`}
          hint={draft.annualFee.waiverNote}
        />
      </section>

      <section className="pt-[var(--space-6)]" ref={fxRef}>
        <h2 className="mb-[var(--space-2)] text-[length:var(--text-xs)] font-[var(--fw-emphasize)] tracking-[var(--tracking-caps)] text-muted">
          外币手续费
        </h2>
        <PercentField
          label="手续费率"
          value={draft.fxFee.rate * 100}
          error={fxError}
          onChange={(v) => {
            patch({ fxFee: { ...draft.fxFee, rate: v / 100 } });
          }}
          hint="这一项直接决定净回报算得对不对。空着不让保存。"
        />
        <ReadOnlyRow
          label="豁免条件"
          value={
            draft.fxFee.waivedWhen?.settlementCurrencyIn?.length
              ? `${draft.fxFee.waivedWhen.settlementCurrencyIn.join(' / ')} 结算免收`
              : '无'
          }
          hint={draft.fxFee.waivedWhen?.validUntil ? `豁免有效至 ${draft.fxFee.waivedWhen.validUntil}` : undefined}
        />
        <div className="flex flex-col gap-[var(--space-1)] border-b border-line-subtle py-[var(--space-2)]">
          <div className="flex min-h-[36px] items-center gap-[var(--space-3)]">
            <span className="w-[76px] shrink-0 text-[length:var(--text-sm)] text-muted">来源</span>
            <span className="min-w-0 flex-1 text-right">
              <SourceLink url={draft.fxFee.source.url} meta={`${draft.fxFee.source.verifiedAt} 核实`} />
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
