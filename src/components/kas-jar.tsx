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
  /** Put into the pool this cycle. */
  contributed: number;
  /** Non-reimbursed spending this cycle. */
  spent: number;
  /** 0–1 through the current cycle. */
  progress: number;
};

export function KasJar({ balance, contributed, spent, progress }: Props) {
  /**
   * The jar measures what is left against **this cycle's funding**, not against what was
   * available to spend.
   *
   * Those differ whenever a cycle opens in deficit. On 25 Aug 2026 the pool held 89.022
   * after 1.200.000 went in — because 1.1M of the new kas immediately covered the previous
   * cycle's overspend. Measuring against "balance + spent" made that read as a full jar and
   * "still safe", when the truth was 89.022 to last 23 days.
   */
  const funding = contributed > 0 ? contributed : balance + spent;
  const empty = funding <= 0;
  const fill = empty ? 0 : clamp01(balance / funding);
  const pace = 1 - clamp01(progress);
  const behind = fill < pace - 0.02;

  // How much of this cycle's kas was swallowed by the last one before any of it was spent.
  const carried = Math.max(0, funding - (balance + spent));

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
        aria-label={`Kas balance ${formatIdr(balance)}`}
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
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Kas balance</p>
        <p className={`tnum whitespace-nowrap font-display text-[2rem] leading-tight ${text}`}>
          {formatIdr(balance)}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {empty
            ? 'No kas has come in this cycle yet.'
            : carried > 0 && spent === 0
              ? // Nothing spent yet, but the jar is already low: the shortfall came from the
                // previous cycle, and saying "spending fast" would blame the wrong month.
                `${formatIdr(carried)} of this month's kas went to covering the previous cycle.`
              : behind
                ? 'Spending faster than usual.'
                : 'On track until the next top-up.'}
        </p>
      </div>
    </div>
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
