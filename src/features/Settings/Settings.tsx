import { useState } from 'react';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { useSettings } from './SettingsContext';
import { useGoogleAuth } from '../../auth/useGoogleAuth';

export function Settings() {
  const { spreadsheetId, setSpreadsheetId, incomeCategories, setIncomeCategories } = useSettings();
  const { signOut } = useGoogleAuth();

  const [draftId, setDraftId] = useState(spreadsheetId);
  const [catsDraft, setCatsDraft] = useState(incomeCategories.join(', '));

  const saveSpreadsheet = () => {
    setSpreadsheetId(draftId.trim());
  };

  const saveCats = () => {
    const next = catsDraft.split(',').map((s) => s.trim()).filter(Boolean);
    if (next.length === 0) return;
    setIncomeCategories(next);
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">Settings</p>
        <h1 className="text-2xl font-semibold">Konfigurasi</h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Spreadsheet</h2>
        <Input
          label="Spreadsheet ID"
          type="text"
          value={draftId}
          onChange={(e) => setDraftId(e.target.value)}
          placeholder="1a2b3c…  (ambil dari URL Google Sheets)"
        />
        <p className="text-xs text-slate-500">
          URL Google Sheets:&nbsp;
          <code className="text-slate-400">/spreadsheets/d/&lt;SPREADSHEET_ID&gt;/edit</code>
        </p>
        <Button onClick={saveSpreadsheet} disabled={draftId.trim() === spreadsheetId} className="w-full">
          Simpan
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Jenis Pemasukan</h2>
        <Input
          label="Pisahkan dengan koma"
          type="text"
          value={catsDraft}
          onChange={(e) => setCatsDraft(e.target.value)}
          placeholder="Kas Ariq, Kas, Gaji"
        />
        <Button onClick={saveCats} variant="secondary" className="w-full">
          Simpan kategori
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Akun</h2>
        <Button onClick={signOut} variant="danger" className="w-full">
          Sign out
        </Button>
      </section>

      <p className="text-xs text-slate-600 text-center pt-4">
        Cashflow Inputter · PWA v0.1
      </p>
    </div>
  );
}
