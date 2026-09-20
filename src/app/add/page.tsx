'use client';

import { useState } from 'react';

import { ExpenseForm } from '@/components/expense-form';
import { IncomeForm } from '@/components/income-form';
import { Screen } from '@/components/screen';
import { SyncStatus } from '@/components/sync-status';
import { useLedger } from '@/components/use-ledger';

type Mode = 'expense' | 'income';

/**
 * The entry screen.
 *
 * Spending is the default because it is what happens twenty times a month; kas comes in
 * twice. Both live behind the same tab rather than separate screens — they are the same
 * gesture ("write down what just happened"), and splitting them would put one of the two
 * behind a menu.
 */
export default function Add() {
  const ledgerState = useLedger();
  const { status, ledger, error, reload } = ledgerState;
  const [mode, setMode] = useState<Mode>('expense');

  if (status !== 'ready') {
    return <Screen title="Add" status={status} error={error} onRetry={reload} />;
  }

  return (
    <Screen title="Add">
      <SyncStatus state={ledgerState} />

      <div
        role="tablist"
        aria-label="Entry type"
        className="mb-4 flex gap-1 rounded-pill bg-sunken p-1"
      >
        <Tab label="Expense" active={mode === 'expense'} onClick={() => setMode('expense')} />
        <Tab label="Kas in" active={mode === 'income'} onClick={() => setMode('income')} />
      </div>

      {mode === 'expense' ? (
        <ExpenseForm ledger={ledger} onSaved={reload} />
      ) : (
        <IncomeForm ledger={ledger} onSaved={reload} />
      )}
    </Screen>
  );
}

function Tab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 rounded-pill py-2 text-sm font-medium transition-colors ${
        active ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'
      }`}
    >
      {label}
    </button>
  );
}
