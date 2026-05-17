import { useNavigate } from 'react-router-dom';
import type { OverviewRow } from '../../sheets/overview';
import { formatIDR } from '../../sheets/format';

const FMT_MONTH = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

export function MonthRow({ row }: { row: OverviewRow }) {
  const navigate = useNavigate();
  const label = FMT_MONTH.format(row.date);
  const slug = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}`;

  return (
    <button
      onClick={() => navigate(`/overview/${slug}`)}
      className="w-full text-left rounded-xl border border-slate-800 bg-slate-900 p-3 hover:border-slate-700"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium capitalize">{label}</p>
        <span className="text-slate-500 text-lg leading-none">›</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <p className="text-slate-500">Pemasukan</p>
          <p className="font-semibold text-emerald-300 tabular-nums">{formatIDR(row.income)}</p>
        </div>
        <div>
          <p className="text-slate-500">Pengeluaran</p>
          <p className="font-semibold text-red-300 tabular-nums">{formatIDR(row.expense)}</p>
        </div>
        <div>
          <p className="text-slate-500">Net</p>
          <p
            className={`font-semibold tabular-nums ${row.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
          >
            {row.net >= 0 ? '+' : '−'}
            {formatIDR(Math.abs(row.net))}
          </p>
        </div>
      </div>
    </button>
  );
}
