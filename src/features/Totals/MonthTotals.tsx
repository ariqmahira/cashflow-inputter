import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSheetsClient } from '../../sheets/useSheetsClient';
import { useSettings } from '../Settings/SettingsContext';
import { readTotals } from '../../sheets/entries';
import { todayLocal } from '../../sheets/dates';
import { formatIDR } from '../../sheets/format';

type Props = {
  /** Defaults to current month. */
  targetMonth?: Date;
  /** Header label override. */
  label?: string;
};

export function MonthTotals({ targetMonth, label = 'Bulan ini' }: Props = {}) {
  const client = useSheetsClient();
  const { spreadsheetId } = useSettings();
  const target = useMemo(() => targetMonth ?? todayLocal(), [targetMonth]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['totals', spreadsheetId, target.getFullYear(), target.getMonth()],
    queryFn: () => readTotals(client, spreadsheetId, target),
    enabled: !!spreadsheetId,
  });

  const net = (data?.income ?? 0) - (data?.expense ?? 0);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">{label}</p>
      {isLoading ? (
        <p className="text-sm text-slate-400">Memuat…</p>
      ) : isError ? (
        <p className="text-sm text-red-400">Gagal memuat totals.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-slate-400">Pengeluaran</p>
            <p className="font-semibold text-red-300 tabular-nums text-sm">
              {formatIDR(data?.expense)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Pemasukan</p>
            <p className="font-semibold text-emerald-300 tabular-nums text-sm">
              {formatIDR(data?.income)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Net</p>
            <p
              className={`font-semibold tabular-nums text-sm ${net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
            >
              {net >= 0 ? '+' : '−'}
              {formatIDR(Math.abs(net))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
