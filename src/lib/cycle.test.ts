import { describe, expect, it } from 'vitest';
import {
  budgetAfterAdding,
  budgetStatus,
  burnRate,
  clampAnchorDay,
  cycleFor,
  cycleLengthDays,
  cycleProgress,
  isWithinCycle,
  nextCycle,
  previousCycle,
  projectedRunDry,
} from './cycle.ts';
import { addDays } from './plain-date.ts';

describe('cycleFor', () => {
  it('starts the cycle on the anchor day', () => {
    expect(cycleFor('2026-01-25')).toMatchObject({ start: '2026-01-25', end: '2026-02-24' });
  });

  it('puts a date before the anchor into the previous cycle', () => {
    expect(cycleFor('2026-01-24')).toMatchObject({ start: '2025-12-25', end: '2026-01-24' });
  });

  it('handles the anchor day itself as the first day, not the last', () => {
    const cycle = cycleFor('2026-01-25');
    expect(cycle.start).toBe('2026-01-25');
    expect(isWithinCycle('2026-01-25', cycle)).toBe(true);
  });

  describe('crosses month and year boundaries', () => {
    it('spans February correctly in a common year', () => {
      const cycle = cycleFor('2026-02-10');
      expect(cycle).toMatchObject({ start: '2026-01-25', end: '2026-02-24' });
      expect(cycleLengthDays(cycle)).toBe(31);
    });

    it('spans February correctly in a leap year', () => {
      // 2028 is a leap year: 25 Feb to 24 Mar is one day longer than 2026's.
      const cycle = cycleFor('2028-02-25');
      expect(cycle).toMatchObject({ start: '2028-02-25', end: '2028-03-24' });
      expect(cycleLengthDays(cycle)).toBe(29);
    });

    it('rolls from December into January', () => {
      expect(cycleFor('2025-12-31')).toMatchObject({ start: '2025-12-25', end: '2026-01-24' });
    });

    it('rolls back from January into December', () => {
      expect(cycleFor('2026-01-03')).toMatchObject({ start: '2025-12-25', end: '2026-01-24' });
    });
  });

  it('never produces a cycle shorter than 28 or longer than 31 days', () => {
    // Walks two full years at the default anchor.
    for (let i = 0; i < 730; i++) {
      const d = new Date(Date.UTC(2025, 0, 1 + i));
      const iso = d.toISOString().slice(0, 10);
      const len = cycleLengthDays(cycleFor(iso));
      expect(len).toBeGreaterThanOrEqual(28);
      expect(len).toBeLessThanOrEqual(31);
    }
  });

  it('tiles the calendar with no gaps and no overlaps', () => {
    let cycle = cycleFor('2025-06-01');
    for (let i = 0; i < 24; i++) {
      const next = nextCycle(cycle);
      // The next cycle must start exactly one day after this one ends.
      expect(next.start).toBe(addDays(cycle.end, 1));
      cycle = next;
    }
  });

  it('assigns every day in two years to exactly one cycle', () => {
    let day = '2025-01-01';
    while (day <= '2026-12-31') {
      const cycle = cycleFor(day);
      expect(isWithinCycle(day, cycle)).toBe(true);
      day = addDays(day, 1);
    }
  });

  it('round-trips through next and previous', () => {
    const cycle = cycleFor('2026-03-15');
    expect(previousCycle(nextCycle(cycle))).toEqual(cycle);
  });
});

describe('anchor day', () => {
  it('clamps above 28, because the 29th does not exist every February', () => {
    expect(clampAnchorDay(31)).toBe(28);
    expect(clampAnchorDay(29)).toBe(28);
  });

  it('clamps below 1 and falls back on nonsense', () => {
    expect(clampAnchorDay(0)).toBe(1);
    expect(clampAnchorDay(-5)).toBe(1);
    expect(clampAnchorDay(Number.NaN)).toBe(25);
  });

  it('respects a configured anchor', () => {
    expect(cycleFor('2026-01-10', 1)).toMatchObject({ start: '2026-01-01', end: '2026-01-31' });
    expect(cycleFor('2026-01-10', 15)).toMatchObject({ start: '2025-12-15', end: '2026-01-14' });
  });

  it('is safe at the clamp boundary across February', () => {
    expect(cycleFor('2026-02-28', 28)).toMatchObject({ start: '2026-02-28', end: '2026-03-27' });
  });
});

describe('cycleProgress', () => {
  const cycle = cycleFor('2026-01-25'); // 25 Jan – 24 Feb, 31 days

  it('counts the first day as one day elapsed', () => {
    expect(cycleProgress('2026-01-25', cycle)).toBeCloseTo(1 / 31);
  });

  it('reaches exactly 1 on the last day', () => {
    expect(cycleProgress('2026-02-24', cycle)).toBe(1);
  });

  it('clamps outside the cycle', () => {
    expect(cycleProgress('2026-01-01', cycle)).toBe(0);
    expect(cycleProgress('2026-03-01', cycle)).toBe(1);
  });
});

describe('budgetStatus', () => {
  it('is ok below the warning threshold', () => {
    expect(budgetStatus(500_000, 1_000_000).state).toBe('ok');
  });

  it('warns at exactly the threshold', () => {
    expect(budgetStatus(800_000, 1_000_000).state).toBe('warn');
  });

  it('is over at exactly the limit, not merely above it', () => {
    expect(budgetStatus(1_000_000, 1_000_000).state).toBe('over');
  });

  it('reports a negative remaining once over', () => {
    expect(budgetStatus(1_200_000, 1_000_000).remaining).toBe(-200_000);
  });

  it('treats no limit as no budget rather than a zero budget', () => {
    // Otherwise every uncategorized purchase would scream that it is over budget.
    expect(budgetStatus(50_000, 0).state).toBe('ok');
  });

  it('honours a custom threshold', () => {
    expect(budgetStatus(500_000, 1_000_000, 0.5).state).toBe('warn');
  });
});

describe('budgetAfterAdding', () => {
  it('detects an entry that tips a category into warning', () => {
    const r = budgetAfterAdding(300_000, 600_000, 1_000_000);
    expect(r.before.state).toBe('ok');
    expect(r.after.state).toBe('warn');
    expect(r.crosses).toBe(true);
  });

  it('detects an entry that tips a category over the limit', () => {
    const r = budgetAfterAdding(300_000, 850_000, 1_000_000);
    expect(r.after.state).toBe('over');
    expect(r.crosses).toBe(true);
  });

  it('does not re-warn when the category was already in the same state', () => {
    const r = budgetAfterAdding(10_000, 900_000, 1_000_000);
    expect(r.before.state).toBe('warn');
    expect(r.after.state).toBe('warn');
    expect(r.crosses).toBe(false);
  });

  it('reports the ratio the warning should quote', () => {
    const r = budgetAfterAdding(120_000, 800_000, 1_000_000);
    expect(Math.round(r.after.ratio * 100)).toBe(92);
  });
});

describe('burnRate and projectedRunDry', () => {
  const cycle = cycleFor('2026-01-25');

  it('averages over elapsed days, counting today', () => {
    expect(burnRate(300_000, '2026-01-27', cycle)).toBe(100_000);
  });

  it('never divides by zero on the first day', () => {
    expect(burnRate(50_000, '2026-01-25', cycle)).toBe(50_000);
  });

  it('projects the day the pool empties', () => {
    expect(projectedRunDry(500_000, 100_000, '2026-01-27')).toBe('2026-02-01');
  });

  it('rounds up, so the projection is the day it actually runs out', () => {
    expect(projectedRunDry(250_000, 100_000, '2026-01-27')).toBe('2026-01-30');
  });

  it('refuses to project from an empty pool or no spending', () => {
    expect(projectedRunDry(0, 100_000, '2026-01-27')).toBeNull();
    expect(projectedRunDry(-50_000, 100_000, '2026-01-27')).toBeNull();
    expect(projectedRunDry(500_000, 0, '2026-01-27')).toBeNull();
  });
});
