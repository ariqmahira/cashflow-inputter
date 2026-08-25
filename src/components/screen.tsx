'use client';

/**
 * Common screen chrome, plus the loading and failure states.
 *
 * Centralised so every screen fails the same way. An error here says what went wrong and
 * offers the one action that helps; it does not apologise and it does not shrug.
 */

type Props = {
  title: string;
  children?: React.ReactNode;
  status?: 'loading' | 'ready' | 'error';
  error?: string | null;
  onRetry?: () => void;
  /** Optional control rendered opposite the title. */
  action?: React.ReactNode;
};

export function Screen({ title, children, status = 'ready', error, onRetry, action }: Props) {
  return (
    <>
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">{title}</h1>
        {action}
      </header>

      {status === 'loading' && (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <div className="h-40 animate-pulse rounded-card bg-surface" />
          <div className="h-24 animate-pulse rounded-card bg-surface" />
          <span className="sr-only">Memuat…</span>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-card bg-teler-wash p-5">
          <p className="font-display text-lg text-ink">Data nggak kebuka</p>
          <p className="mt-1 text-sm text-ink-soft">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-pill bg-ink px-4 py-2 text-sm text-paper"
            >
              Coba lagi
            </button>
          )}
        </div>
      )}

      {status === 'ready' && children}
    </>
  );
}

/** An empty state that points at the next action instead of just noting the absence. */
export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-card bg-surface px-5 py-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">{hint}</p>
    </div>
  );
}
