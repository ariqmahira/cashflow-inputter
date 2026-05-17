import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_INCOME_CATEGORIES, SPREADSHEET_ID } from '../../config';

type Settings = {
  spreadsheetId: string;
  incomeCategories: string[];
};

type SettingsCtx = Settings & {
  setSpreadsheetId: (id: string) => void;
  setIncomeCategories: (cats: string[]) => void;
};

const Ctx = createContext<SettingsCtx | null>(null);

const LS_KEY = 'cashflow-inputter:settings:v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        spreadsheetId: parsed.spreadsheetId ?? SPREADSHEET_ID ?? '',
        incomeCategories: parsed.incomeCategories?.length
          ? parsed.incomeCategories
          : DEFAULT_INCOME_CATEGORIES,
      };
    }
  } catch {
    // ignore
  }
  return {
    spreadsheetId: SPREADSHEET_ID ?? '',
    incomeCategories: DEFAULT_INCOME_CATEGORIES,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  }, [settings]);

  const value = useMemo<SettingsCtx>(
    () => ({
      ...settings,
      setSpreadsheetId: (id) => setSettings((s) => ({ ...s, spreadsheetId: id.trim() })),
      setIncomeCategories: (cats) => setSettings((s) => ({ ...s, incomeCategories: cats })),
    }),
    [settings],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
