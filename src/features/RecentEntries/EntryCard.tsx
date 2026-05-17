import type { AnyEntry } from '../../sheets/entries';
import { formatIDR } from '../../sheets/format';

type Props = {
  entry: AnyEntry;
  /** When omitted, the card renders as a non-interactive div (read-only). */
  onEdit?: () => void;
};

export function EntryCard({ entry, onEdit }: Props) {
  const isExpense = entry.kind === 'expense';
  const body = (
    <>
      <div
        className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-lg ${isExpense ? 'bg-red-950/60 text-red-300' : 'bg-emerald-950/60 text-emerald-300'}`}
      >
        {isExpense ? '↘' : '↗'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{entry.name || '(no name)'}</p>
        <p className="text-xs text-slate-400 truncate">
          {entry.category}
          {isExpense && entry.location ? ` · ${entry.location}` : ''}
        </p>
      </div>
      <div
        className={`font-semibold tabular-nums ${isExpense ? 'text-red-300' : 'text-emerald-300'}`}
      >
        {isExpense ? '−' : '+'}
        {formatIDR(entry.amount)}
      </div>
    </>
  );

  const className =
    'w-full text-left rounded-xl border border-slate-800 bg-slate-900 p-3 flex items-center gap-3';

  if (onEdit) {
    return (
      <button onClick={onEdit} className={`${className} hover:border-slate-700`}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
