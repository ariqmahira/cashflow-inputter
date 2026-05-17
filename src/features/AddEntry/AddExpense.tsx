import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Button } from '../../components/Button';
import { EXPENSE_CATEGORIES } from '../../config';
import { fromDateInputValue, todayLocal, toDateInputValue } from '../../sheets/dates';
import { addExpense } from '../../sheets/entries';
import { useSheetsClient } from '../../sheets/useSheetsClient';
import { useSettings } from '../Settings/SettingsContext';
import { parseAmount, formatIDR } from '../../sheets/format';

export function AddExpense() {
  const client = useSheetsClient();
  const { spreadsheetId } = useSettings();
  const qc = useQueryClient();

  const [date, setDate] = useState(toDateInputValue(todayLocal()));
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amountStr, setAmountStr] = useState('');
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const amount = parseAmount(amountStr);
      if (amount == null || amount <= 0) throw new Error('Jumlah harus angka positif.');
      if (!name.trim()) throw new Error('Nama pengeluaran wajib diisi.');
      return addExpense(client, spreadsheetId, {
        date: fromDateInputValue(date),
        name: name.trim(),
        location: location.trim(),
        category,
        amount,
      });
    },
    onSuccess: ({ row, sheetTitle }) => {
      setSavedNote(`Tersimpan di ${sheetTitle} baris ${row} · ${formatIDR(parseAmount(amountStr) ?? 0)}`);
      setName('');
      setLocation('');
      setAmountStr('');
      qc.invalidateQueries({ queryKey: ['recent'] });
      qc.invalidateQueries({ queryKey: ['totals'] });
      setTimeout(() => setSavedNote(null), 3500);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="space-y-3"
    >
      <Input
        label="Tanggal"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
      />
      <Input
        label="Nama Pengeluaran"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Truffle Belly"
        required
      />
      <Input
        label="Lokasi"
        type="text"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="MOI"
      />
      <Select
        label="Jenis"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        options={EXPENSE_CATEGORIES}
      />
      <Input
        label="Jumlah (Rp)"
        type="text"
        inputMode="numeric"
        value={amountStr}
        onChange={(e) => setAmountStr(e.target.value)}
        placeholder="184800"
        required
      />

      <Button type="submit" disabled={mutation.isPending} className="w-full">
        {mutation.isPending ? 'Menyimpan…' : 'Simpan Pengeluaran'}
      </Button>

      {mutation.isError && (
        <p className="text-sm text-red-400">{(mutation.error as Error).message}</p>
      )}
      {savedNote && <p className="text-sm text-brand-accent">{savedNote}</p>}
    </form>
  );
}
