import { useGoogleAuth } from './useGoogleAuth';
import { GOOGLE_CLIENT_ID } from '../config';

export function SignIn() {
  const { signIn, loading, error } = useGoogleAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-6">
        <span className="text-3xl font-bold text-brand-accent">Rp</span>
      </div>
      <h1 className="text-2xl font-semibold mb-2">Cashflow Inputter</h1>
      <p className="text-slate-400 mb-8 max-w-xs">
        Catat pengeluaran &amp; pemasukan harian langsung ke Google Sheets.
      </p>

      {!GOOGLE_CLIENT_ID && (
        <div className="mb-6 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200 max-w-sm">
          <p className="font-medium mb-1">Setup required</p>
          <p>Set <code className="text-amber-100">VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code>. See README.</p>
        </div>
      )}

      <button
        onClick={signIn}
        disabled={loading || !GOOGLE_CLIENT_ID}
        className="px-6 py-3 rounded-xl bg-brand-accent text-slate-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
      >
        {loading ? 'Loading…' : 'Sign in with Google'}
      </button>

      {error && <p className="mt-4 text-sm text-red-400 max-w-xs">{error}</p>}
    </div>
  );
}
