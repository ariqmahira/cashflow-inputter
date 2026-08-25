'use client';

import { formatIdr } from '@/lib/money';

/**
 * The kas jar — the one place this app is allowed to be bold.
 *
 * Pool Balance drawn as a fill level, because the domain object genuinely is a shared pot
 * and a bare number cannot answer the question actually being asked several times a month:
 * *are we going to make it to the next top-up?*
 *
 * Two marks carry the whole story:
 *   - the **fill** is what is left, against what the cycle started with
 *   - the **pace line** is where the level would be if this cycle's spending were spread
 *     evenly across its days
 *
 * Fill above the line means ahead; below means burning faster than the cycle can carry. That
 * comparison is the reason the jar exists — without the line it would be decoration.
 */

type Props = {
  /** Money left in the pool right now. May be negative before a top-up lands. */
  balance: number;
  /** What the pool held at the start of this cycle, plus contributions since. */
  cycleStartingFunds: number;
  /** 0–1 through the current cycle. */
  progress: number;
};

export function KasJar({ balance, cycleStartingFunds, progress }: Props) {
  const empty = cycleStartingFunds <= 0;
  const fill = empty ? 0 : clamp01(balance / cycleStartingFunds);
  const pace = 1 - clamp01(progress);
  const behind = fill < pace - 0.02;

  const tone = balance < 0 ? 'teler' : behind ? 'gula' : 'pandan';
  // Written out in full rather than interpolated: Tailwind extracts class names statically,
  // so `text-${tone}` would simply never be generated.
  const TONE = {
    pandan: { liquid: 'var(--color-pandan)', text: 'text-pandan' },
    gula: { liquid: 'var(--color-gula)', text: 'text-gula' },
    teler: { liquid: 'var(--color-teler)', text: 'text-teler' },
  } as const;
  const { liquid, text } = TONE[tone];

  // Jar interior in SVG user units.
  const top = 22;
  const bottom = 96;
  const height = bottom - top;
  const levelY = bottom - height * fill;
  const paceY = bottom - height * pace;

  return (
    <div className="flex items-center gap-5">
      <svg
        width="96"
        height="118"
        viewBox="0 0 84 108"
        role="img"
        aria-label={`Sisa kas ${formatIdr(balance)}`}
        className="shrink-0"
      >
        <defs>
          <clipPath id="jar-inside">
            <path d="M14 22h56v62a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10z" />
          </clipPath>
        </defs>

        {/* Lid */}
        <rect x="22" y="6" width="40" height="9" rx="4.5" fill="var(--color-line)" />
        <rect x="26" y="13" width="32" height="6" rx="3" fill="var(--color-line)" />

        {/* Body */}
        <path
          d="M14 22h56v62a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10z"
          fill="var(--color-sunken)"
        />

        <g clipPath="url(#jar-inside)">
          {fill > 0 && (
            <>
              <rect x="14" y={levelY} width="56" height={bottom - levelY} fill={liquid} opacity="0.85" />
              {/* A single wave so the fill reads as liquid rather than a progress bar. */}
              <path
                d={`M14 ${levelY} q 14 -5 28 0 t 28 0 v 6 h -56 z`}
                fill={liquid}
              />
            </>
          )}
        </g>

        {/* Pace mark: where the level would be if this cycle's spending were even. The
            sentence beside the jar says which side of it we are on, so it needs no label. */}
        {!empty && (
          <line
            x1="10"
            x2="74"
            y1={paceY}
            y2={paceY}
            stroke="var(--color-ink-faint)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        )}

        {/* Outline last, so it sits over the liquid. */}
        <path
          d="M14 22h56v62a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10z"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          opacity="0.75"
        />
      </svg>

      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Sisa kas</p>
        <p className={`tnum whitespace-nowrap font-display text-[2rem] leading-tight ${text}`}>
          {formatIdr(balance)}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {empty
            ? 'Belum ada kas masuk siklus ini.'
            : behind
              ? 'Lebih cepat dari biasanya.'
              : 'Masih aman sampai kas berikutnya.'}
        </p>
      </div>
    </div>
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
