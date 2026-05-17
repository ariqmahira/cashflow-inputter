import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Button } from '../../components/Button';
import { EXPENSE_CATEGORIES } from '../../config';
import { fromDateInputValue, toDateInputValue } from '../../sheets/dates';
import { deleteEntry, updateExpense, updateIncome, type AnyEntry, type ExpenseEntry, type IncomeEntry } from '../../sheets/entries';
import { useSheetsClient } from '../../sheets/useSheetsClient';
import { useSettings } from '../Settings/SettingsContext';
import { parseAmount } from '../../sheets/format';

type Props = {
  entry: AnyEntry;
  onClose: () => void;
};

export function EditEntryModal({ entry, onClose }: Props) {
  const client = useSheetsClient();
  const { spreadsheetId, incomeCategories } = useSettings();
  const qc = useQueryClient();

  const [date, setDate] = useState(toDateInputValue(isNaN(entry.date.getTime()) ? new Date() : entry.date));
  const [name, setName] = useState(entry.name);
  const [location, setLocation] = useState(entry.kind === 'expense' ? entry.location : '');
  const [category, setCategory] = useState(entry.category);
  const [amountStr, setAmountStr] = useState(String(entry.amount ?? ''));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = parseAmount(amountStr);
      if (amount == null || amount <= 0) throw new Error('Jumlah harus angka positif.');
      if (!name.trim()) throw new Error('Nama wajib diisi.');
      if (entry.kind === 'expense') {
        const next: ExpenseEntry = {
          ...entry,
          date: fromDateInputValue(date),
          name: name.trim(),
          location: location.trim(),
          category,
          amount,
        };
        await updateExpense(client, spreadsheetId, next);
      } else {
        const next: IncomeEntry = {
          ...entry,
          date: fromDateInputValue(date),
          name: name.trim(),
          category,
          amount,
        };
        await updateIncome(client, spreadsheetId, next);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recent'] });
      qc.invalidateQueries({ queryKey: ['totals'] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteEntry(client, spreadsheetId, entry);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recent'] });
      qc.invalidateQueries({ queryKey: ['totals'] });
      onClose();
    },
  });

  const categoryOptions: string[] = entry.kind === 'expense' ? [...EXPENSE_CATEGORIES] : incomeCategories;
  const hasUnknownCategory = !categoryOptions.includes(category);
  const optionsWithCurrent = hasUnknownCategory ? [category, ...categoryOptions] : categoryOptions;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Edit {entry.kind === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-2xl leading-none">×</button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          {entry.sheetTitle} · baris {entry.row}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-3"
        >
          <Input label="Tanggal" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Input label="Nama" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          {entry.kind === 'expense' && (
            <Input label="Lokasi" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
          )}
          <Select label="Jenis" value={category} onChange={(e) => setCategory(e.target.value)} options={optionsWithCurrent} />
          <Input
            label="Jumlah (Rp)"
            type="text"
            inputMode="numeric"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            required
          />

          {(saveMutation.isError || deleteMutation.isError) && (
            <p className="text-sm text-red-400">
              {((saveMutation.error || deleteMutation.error) as Error).message}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (confirm('Hapus entry ini?')) deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending || saveMutation.isPending}
            >
              {deleteMutation.isPending ? 'Menghapus…' : 'Hapus'}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || deleteMutation.isPending} className="flex-1">
              {saveMutation.isPending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
