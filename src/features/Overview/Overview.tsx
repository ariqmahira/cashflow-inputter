import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSheetsClient } from '../../sheets/useSheetsClient';
import { useSettings } from '../Settings/SettingsContext';
import { readOverview } from '../../sheets/overview';
import { formatIDR } from '../../sheets/format';
import { MonthRow } from './MonthRow';

export function Overview() {
  const client = useSheetsClient();
  const { spreadsheetId } = useSettings();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['overview', spreadsheetId],
    queryFn: () => readOverview(client, spreadsheetId),
    enabled: !!spreadsheetId,
  });

  const rowsDesc = useMemo(() => {
    if (!data) return [];
    return [...data.rows].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [data]);

  return (
    <div className="p-4 max-w-md mx-auto">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Cashflow</p>
          <h1 className="text-2xl font-semibold">Overview</h1>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-slate-400 hover:text-slate-200"
          disabled={isFetching}
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {isLoading && <p className="text-slate-400">Memuat Overview…</p>}
      {isError && (
        <p className="text-red-400">{(error as Error)?.message ?? 'Gagal memuat Overview.'}</p>
      )}
      {data === null && !isLoading && (
        <p className="text-amber-300">
          Tidak menemukan sheet bernama <code>Overview</code> di spreadsheet ini.
        </p>
      )}

      {data && (
        <>
          <ul className="space-y-2">
            {rowsDesc.map((row) => (
              <li key={row.row}>
                <MonthRow row={row} />
              </li>
            ))}
          </ul>

          {data.totals && (
            <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">JUMLAH</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-slate-400">Pemasukan</p>
                  <p className="font-semibold text-emerald-300 tabular-nums text-sm">
                    {formatIDR(data.totals.income)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Pengeluaran</p>
                  <p className="font-semibold text-red-300 tabular-nums text-sm">
                    {formatIDR(data.totals.expense)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Sisa Uang</p>
                  <p
                    className={`font-semibold tabular-nums text-sm ${data.totals.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    {data.totals.net >= 0 ? '+' : '−'}
                    {formatIDR(Math.abs(data.totals.net))}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
