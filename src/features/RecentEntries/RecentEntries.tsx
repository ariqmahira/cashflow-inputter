import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSheetsClient } from '../../sheets/useSheetsClient';
import { useSettings } from '../Settings/SettingsContext';
import { readMonth, type AnyEntry } from '../../sheets/entries';
import { todayLocal } from '../../sheets/dates';
import { EntryCard } from './EntryCard';
import { EditEntryModal } from './EditEntryModal';

type Props = {
  /** Defaults to current month. */
  targetMonth?: Date;
  /** Hide refresh control, no edit/delete affordance. */
  readOnly?: boolean;
  /** Header label override (e.g., 'April 2026 (read-only)'). */
  headerLabel?: string;
};

export function RecentEntries({ targetMonth, readOnly = false, headerLabel }: Props = {}) {
  const client = useSheetsClient();
  const { spreadsheetId } = useSettings();
  const [editing, setEditing] = useState<AnyEntry | null>(null);

  const month = useMemo(() => targetMonth ?? todayLocal(), [targetMonth]);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['recent', spreadsheetId, month.getFullYear(), month.getMonth()],
    queryFn: () => readMonth(client, spreadsheetId, month),
    enabled: !!spreadsheetId,
  });

  const grouped = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.entries].sort(
      (a, b) => b.date.getTime() - a.date.getTime() || b.row - a.row,
    );
    const groups = new Map<string, AnyEntry[]>();
    for (const e of sorted) {
      const key = isNaN(e.date.getTime()) ? '—' : e.date.toDateString();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return [...groups.entries()];
  }, [data]);

  return (
    <div className="p-4 max-w-md mx-auto">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {readOnly ? 'Bulan' : 'Recent'}
          </p>
          <h1 className="text-2xl font-semibold">
            {headerLabel ?? data?.sheetTitle ?? 'Loading…'}
          </h1>
        </div>
        {!readOnly && (
          <button
            onClick={() => refetch()}
            className="text-xs text-slate-400 hover:text-slate-200"
            disabled={isFetching}
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </header>

      {isLoading && <p className="text-slate-400">Loading entries…</p>}
      {isError && <p className="text-red-400">{(error as Error).message}</p>}

      {data && data.entries.length === 0 && (
        <p className="text-slate-400">Belum ada entry bulan ini.</p>
      )}

      <div className="space-y-5">
        {grouped.map(([key, list]) => {
          const dayLabel =
            key === '—'
              ? '(tanpa tanggal)'
              : new Intl.DateTimeFormat('id-ID', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                }).format(new Date(key));
          return (
            <section key={key}>
              <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-2">{dayLabel}</h2>
              <ul className="space-y-2">
                {list.map((entry) => (
                  <li key={`${entry.kind}-${entry.row}`}>
                    <EntryCard
                      entry={entry}
                      onEdit={readOnly ? undefined : () => setEditing(entry)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {!readOnly && editing && (
        <EditEntryModal entry={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
