import { useState } from 'react';
import { AddExpense } from './AddExpense';
import { AddIncome } from './AddIncome';
import { MonthTotals } from '../Totals/MonthTotals';
import { sheetTitleFor } from '../../config';
import { todayLocal } from '../../sheets/dates';

type Tab = 'expense' | 'income';

export function AddEntry() {
  const [tab, setTab] = useState<Tab>('expense');
  const title = sheetTitleFor(todayLocal());

  return (
    <div className="p-4 max-w-md mx-auto">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Current month</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </header>

      <div className="flex rounded-xl bg-slate-900 p-1 mb-4 border border-slate-800">
        <button
          onClick={() => setTab('expense')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            tab === 'expense' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'
          }`}
        >
          Pengeluaran
        </button>
        <button
          onClick={() => setTab('income')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            tab === 'income' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'
          }`}
        >
          Pemasukan
        </button>
      </div>

      {tab === 'expense' ? <AddExpense /> : <AddIncome />}

      <div className="mt-6">
        <MonthTotals />
      </div>
    </div>
  );
}
