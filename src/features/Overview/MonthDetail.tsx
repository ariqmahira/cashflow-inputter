import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RecentEntries } from '../RecentEntries/RecentEntries';
import { MonthTotals } from '../Totals/MonthTotals';
import { MONTHS_ID } from '../../config';
import { todayLocal } from '../../sheets/dates';

const FMT_MONTH = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

function parseSlug(slug: string | undefined): Date | null {
  if (!slug) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(slug);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  if (!Number.isFinite(year) || monthIdx < 0 || monthIdx > 11) return null;
  return new Date(year, monthIdx, 1);
}

export function MonthDetail() {
  const { slug } = useParams<{ slug: string }>();
  const target = useMemo(() => parseSlug(slug), [slug]);
  const today = todayLocal();
  const isCurrentMonth =
    target != null &&
    target.getFullYear() === today.getFullYear() &&
    target.getMonth() === today.getMonth();

  if (!target) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <p className="text-red-400">Bulan tidak valid: {slug}</p>
        <Link to="/overview" className="text-brand-accent text-sm">
          ← Kembali ke Overview
        </Link>
      </div>
    );
  }

  const label = `${MONTHS_ID[target.getMonth()]} ${target.getFullYear()}`;

  return (
    <div>
      <div className="p-4 max-w-md mx-auto -mb-2">
        <Link
          to="/overview"
          className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200"
        >
          ← Overview
        </Link>
      </div>

      <RecentEntries
        targetMonth={target}
        readOnly={!isCurrentMonth}
        headerLabel={`${FMT_MONTH.format(target)}${isCurrentMonth ? '' : ' · read-only'}`}
      />

      <div className="px-4 pb-4 max-w-md mx-auto">
        <MonthTotals targetMonth={target} label={label} />
      </div>
    </div>
  );
}
