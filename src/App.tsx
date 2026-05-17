import { Navigate, Route, Routes } from 'react-router-dom';
import { useGoogleAuth } from './auth/useGoogleAuth';
import { SignIn } from './auth/SignIn';
import { BottomNav } from './components/BottomNav';
import { AddEntry } from './features/AddEntry/AddEntry';
import { RecentEntries } from './features/RecentEntries/RecentEntries';
import { Overview } from './features/Overview/Overview';
import { MonthDetail } from './features/Overview/MonthDetail';
import { Settings } from './features/Settings/Settings';
import { useSettings } from './features/Settings/SettingsContext';

export function App() {
  const { token } = useGoogleAuth();
  const { spreadsheetId } = useSettings();

  if (!token) {
    return <SignIn />;
  }

  if (!spreadsheetId) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="p-4 border-b border-slate-800">
          <h1 className="text-lg font-semibold">Setup</h1>
        </header>
        <main className="flex-1 overflow-y-auto pb-20">
          <Settings />
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 overflow-y-auto pb-20">
        <Routes>
          <Route path="/" element={<Navigate to="/add" replace />} />
          <Route path="/add" element={<AddEntry />} />
          <Route path="/recent" element={<RecentEntries />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/overview/:slug" element={<MonthDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/add" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
