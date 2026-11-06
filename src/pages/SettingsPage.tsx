/**
 * 设置页（F7 / F11 / 免责声明，settings.md）。
 *
 * 这是本产品唯一「不解决决策问题」的页面，但它承担两件比决策更要紧的事：
 * 数据存活（iOS 7 天后清除 IndexedDB）与数据可带走（零后端，导出 JSON 是唯一备份）。
 *
 * 所以这一屏的语气是「认真的」，但不用红色警报 —— 用信息层级：
 * 数据安全卡置顶且独占卡片形态，其余都是靠留白分组的操作项。
 */

import { CheckCircle2, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { InstallGuide } from '../components/install/InstallGuide';
import { PageShell } from '../components/layout/PageShell';
import { TabBar } from '../components/layout/TabBar';
import { TopBar } from '../components/layout/TopBar';
import { showToast } from '../components/common/Toast';
import { DataSafetyCard } from '../components/settings/DataSafetyCard';
import { DisclaimerSheet } from '../components/settings/DisclaimerSheet';
import { FxSheet } from '../components/settings/FxSheet';
import { ImportSheet } from '../components/settings/ImportSheet';
import type { ImportPhase } from '../components/settings/ImportSheet';
import { ActionRow, Group, ValueRow } from '../components/settings/SettingsRows';
import { applyImport, exportBackup, findConflicts, validateBackup } from '../db/backup';
import type { BackupFile } from '../db/backup';
import { markExported, loadLastExportAt } from '../db/settingsRepository';
import { useCards } from '../db/useDb';
import { useEngineParams } from '../db/paramsRepository';
import { getPlatformInfo } from '../platform/installGuide';
import { APP_VERSION, BUILD_STAMP } from '../platform/buildInfo';
import { daysBetween } from '../lib/period';
import { DEFAULT_FX_TABLE, describeRate } from '../domain/fx/fxReference';

export function SettingsPage(): React.JSX.Element {
  const { cards } = useCards();
  const { params, loaded } = useEngineParams(cards);
  const platform = getPlatformInfo();

  const [exporting, setExporting] = useState(false);
  const [lastExportDays, setLastExportDays] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'none' | 'import' | 'fx' | 'disclaimer' | 'install'>('none');
  const [importPhase, setImportPhase] = useState<ImportPhase>({ kind: 'pick' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadLastExportAt().then((at) => {
      setLastExportDays(at === null ? null : Math.max(0, daysBetween(params.today, at)));
    });
  }, [params.today]);

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      const result = await exportBackup();
      await markExported();
      setLastExportDays(0);
      showToast(`已导出，文件名 ${result.fileName}`);
    } catch {
      showToast('导出失败，浏览器不允许写文件', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function handleFile(file: File): Promise<void> {
    setBusy(true);
    try {
      const text = await file.text();
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        setImportPhase({ kind: 'invalid', problems: ['文件内容不是合法 JSON'] });
        setBusy(false);
        return;
      }
      const check = validateBackup(raw);
      if (!check.ok || !check.data) {
        setImportPhase({ kind: 'invalid', problems: check.problems });
        setBusy(false);
        return;
      }
      const conflicts = findConflicts(check.data.cards, cards);
      if (conflicts.length > 0) {
        setImportPhase({
          kind: 'conflict',
          names: conflicts.map((c) => c.cardName),
          onChoose: (policy) => {
            void runImport(check.data as BackupFile, policy);
          },
        });
        setBusy(false);
        return;
      }
      await runImport(check.data, 'keep-both');
    } catch {
      setImportPhase({ kind: 'failed' });
      setBusy(false);
    }
  }

  async function runImport(data: BackupFile, policy: 'overwrite' | 'keep-both'): Promise<void> {
    setBusy(true);
    try {
      const result = await applyImport(data, policy);
      showToast(
        result.renamed > 0
          ? `已导入 ${String(result.cards)} 张卡，其中 ${String(result.renamed)} 张存为「（导入）」版本`
          : `已导入 ${String(result.cards)} 张卡、${String(result.ledger)} 条账本记录`,
      );
      setSheet('none');
      setImportPhase({ kind: 'pick' });
    } catch {
      setImportPhase({ kind: 'failed' });
    } finally {
      setBusy(false);
    }
  }

  const batchDate = cards.reduce((latest, c) => (c.verifiedAt > latest ? c.verifiedAt : latest), '');
  const moCount = cards.filter((c) => c.issuerRegion === 'MO').length;
  const hkCount = cards.filter((c) => c.issuerRegion === 'HK').length;

  return (
    <PageShell topbar={<TopBar title="设置" />} tabbar={<TabBar />} contentPaddingBottom="calc(var(--size-tabbar) + var(--safe-bottom) + var(--space-6))">
      <div className="mx-auto w-full max-w-[var(--container-desktop)] px-[var(--space-4)]">
        <DataSafetyCard daysSinceExport={lastExportDays} onExport={() => void handleExport()} exporting={exporting} />

        <Group title="安装到主屏幕">
          {platform.installed ? (
            <div className="flex items-center gap-[var(--space-3)] px-[var(--space-1)] py-[var(--space-3)]" style={{ minHeight: 64 }}>
              <CheckCircle2 size={20} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[length:var(--text-md)] font-[var(--fw-emphasize)] text-fg-2">已安装到主屏幕</span>
                <span className="text-[length:var(--text-xs)] text-meta">数据不会因为 7 天没打开而被清除</span>
              </span>
            </div>
          ) : (
            <ActionRow
              label="安装到主屏幕"
              hint={platform.isIOS ? '避免 iOS 7 天后清掉你的卡库' : '装好后离线也能算，数据不受清理影响'}
              hintTone="warn"
              icon={<Smartphone size={20} strokeWidth={2} aria-hidden="true" />}
              onClick={() => {
                setSheet('install');
              }}
            />
          )}
        </Group>

        <Group title="备份">
          <ActionRow label="导出备份" hint="把卡库和账本存成一个 JSON 文件" onClick={() => void handleExport()} />
          <ActionRow
            label="导入备份"
            hint="从 JSON 文件恢复"
            onClick={() => {
              setImportPhase({ kind: 'pick' });
              setSheet('import');
            }}
          />
          <ValueRow
            label="上次导出"
            value={lastExportDays === null ? '还没导出过' : lastExportDays === 0 ? '今天' : `${String(lastExportDays)} 天前`}
            valueTone={lastExportDays === null || lastExportDays > 30 ? 'warn' : 'normal'}
          />
        </Group>

        <Group title="汇率与积分">
          <ActionRow
            label="汇率参考"
            hint={describeRate('HKD', 'MOP', params.fx)}
            onClick={() => {
              setSheet('fx');
            }}
          />
          <ValueRow
            label="汇率是否调整过"
            value={params.fx.userAdjusted ? '你改过' : '默认值'}
            hint={`默认 HKD 1 = MOP ${String(DEFAULT_FX_TABLE.rates[0]?.rate ?? 1.03)}`}
          />
        </Group>

        <Group title="关于">
          <ValueRow
            label="版本"
            value={`${APP_VERSION} · ${BUILD_STAMP}`}
            hint="更新到这版后，检测到新版本会弹提示"
          />
          <ValueRow label="数据核实批次" value={loaded && batchDate ? batchDate : '—'} hint={loaded ? `覆盖 ${String(cards.length)} 张卡` : undefined} />
          <ActionRow
            label="免责声明"
            onClick={() => {
              setSheet('disclaimer');
            }}
          />
        </Group>

        <p className="px-[var(--space-1)] py-[var(--space-6)] text-center text-[length:var(--text-xs)] leading-[var(--leading-body)] text-muted">
          本产品的数据全都存在这台设备上，没有任何上传。
        </p>
      </div>

      <ImportSheet
        open={sheet === 'import'}
        phase={importPhase}
        busy={busy}
        onClose={() => {
          setSheet('none');
          setImportPhase({ kind: 'pick' });
        }}
        onPickFile={(file) => void handleFile(file)}
      />

      <FxSheet
        open={sheet === 'fx'}
        table={params.fx}
        onClose={() => {
          setSheet('none');
        }}
        onSaved={() => {
          // useLiveQuery 会自动重渲染，这里不需要额外动作
        }}
      />

      <DisclaimerSheet
        open={sheet === 'disclaimer'}
        onClose={() => {
          setSheet('none');
        }}
        batchDate={batchDate || '2026-10-31'}
        moCount={moCount}
        hkCount={hkCount}
      />

      <InstallGuide
        open={sheet === 'install'}
        isSafari={platform.isSafari}
        platform={platform}
        onClose={() => {
          setSheet('none');
        }}
        onBackupRoute={() => {
          setSheet('none');
          void handleExport();
        }}
      />
    </PageShell>
  );
}
