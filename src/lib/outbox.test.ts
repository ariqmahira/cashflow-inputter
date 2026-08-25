import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The outbox is the only thing standing between a save made on bad wifi and losing it, so
 * its ordering and failure handling are worth pinning down.
 *
 * Storage and the network are both stubbed: these tests are about queue behaviour, not about
 * Capacitor or Supabase.
 */

const store = new Map<string, string>();

vi.mock('./storage', () => ({
  readJson: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null),
  writeJson: async (k: string, v: unknown) => void store.set(k, JSON.stringify(v)),
  remove: async (k: string) => void store.delete(k),
}));

const sent: string[] = [];
const failures = new Map<string, number>();

/** Fails the named merchant `times` times, then succeeds. */
function failFor(name: string, times: number) {
  failures.set(name, times);
}

vi.mock('./mutations', () => ({
  addExpense: async (p: { merchantName: string }) => {
    const left = failures.get(p.merchantName) ?? 0;
    if (left > 0) {
      failures.set(p.merchantName, left - 1);
      throw new Error(`boom ${p.merchantName}`);
    }
    sent.push(p.merchantName);
  },
  addContribution: async () => void sent.push('contribution'),
  deleteEntry: async (id: string) => void sent.push(`delete:${id}`),
  correctDate: async (id: string) => void sent.push(`date:${id}`),
  setBudget: async (c: string) => void sent.push(`budget:${c}`),
}));

const { drain, enqueue, pending, rejected, clearRejected } = await import('./outbox');

const expense = (merchantName: string) =>
  ({
    id: merchantName,
    kind: 'expense' as const,
    payload: {
      occurredOn: '2026-08-25',
      amountIdr: 50_000,
      categoryId: 'cat',
      merchantName,
    },
  });

describe('outbox', () => {
  beforeEach(async () => {
    store.clear();
    sent.length = 0;
    failures.clear();
  });

  it('holds writes until drained', async () => {
    await enqueue(expense('Chagee'));
    expect(await pending()).toHaveLength(1);
    expect(sent).toEqual([]);
  });

  it('sends in the order they were made', async () => {
    await enqueue(expense('Chagee'));
    await enqueue(expense('Sushi Tei'));
    await enqueue(expense('Gocar'));
    await drain();
    expect(sent).toEqual(['Chagee', 'Sushi Tei', 'Gocar']);
    expect(await pending()).toHaveLength(0);
  });

  it('stops at the first failure rather than skipping past it', async () => {
    // A later write can depend on an earlier one, so draining out of order would be wrong.
    await enqueue(expense('Chagee'));
    failFor('Sushi Tei', 1);
    await enqueue(expense('Sushi Tei'));
    await enqueue(expense('Gocar'));

    const result = await drain();
    expect(sent).toEqual(['Chagee']);
    expect(result.sent).toBe(1);
    expect(result.remaining).toBe(2);
  });

  it('picks up where it left off on the next drain', async () => {
    failFor('Sushi Tei', 1);
    await enqueue(expense('Sushi Tei'));
    await enqueue(expense('Gocar'));

    await drain();
    expect(sent).toEqual([]);

    await drain();
    expect(sent).toEqual(['Sushi Tei', 'Gocar']);
    expect(await pending()).toHaveLength(0);
  });

  it('keeps the queue in storage, not memory, so it survives a relaunch', async () => {
    await enqueue(expense('Chagee'));
    // The queue must be readable from storage alone — that is what makes a save survive the
    // app being closed on the walk out of the mall.
    const raw = JSON.parse(store.get('kas.outbox.v1')!);
    expect(raw.queue).toHaveLength(1);
    expect(raw.queue[0].payload.merchantName).toBe('Chagee');
  });

  it('gives up on a write that will never go, and says so', async () => {
    failFor('Broken', 99);
    await enqueue(expense('Broken'));

    for (let i = 0; i < 5; i++) await drain();

    expect(await pending()).toHaveLength(0);
    const dead = await rejected();
    expect(dead).toHaveLength(1);
    expect(dead[0].error).toContain('boom Broken');
  });

  it('does not let one dead write block everything behind it', async () => {
    // Without this, a single permanently rejected item silently stops all syncing.
    failFor('Broken', 99);
    await enqueue(expense('Broken'));
    await enqueue(expense('Chagee'));

    for (let i = 0; i < 5; i++) await drain();

    expect(sent).toContain('Chagee');
    expect(await pending()).toHaveLength(0);
  });

  it('lets a rejection be dismissed once seen', async () => {
    failFor('Broken', 99);
    await enqueue(expense('Broken'));
    for (let i = 0; i < 5; i++) await drain();
    expect(await rejected()).toHaveLength(1);

    await clearRejected();
    expect(await rejected()).toHaveLength(0);
  });

  it('sends an item once even when two drains start together', async () => {
    // Saving reloads the screen and then navigates, so two components mount and each starts
    // a sync. Racing drains would both read the same queued item and both send it, recording
    // the purchase twice.
    await enqueue(expense('Chagee'));
    await Promise.all([drain(), drain(), drain()]);
    expect(sent).toEqual(['Chagee']);
    expect(await pending()).toHaveLength(0);
  });

  it('still drains normally after a shared drain finishes', async () => {
    await enqueue(expense('Chagee'));
    await Promise.all([drain(), drain()]);
    await enqueue(expense('Gocar'));
    await drain();
    expect(sent).toEqual(['Chagee', 'Gocar']);
  });

  it('handles every kind of write', async () => {
    await enqueue({ id: '1', kind: 'delete', entryId: 'e1' });
    await enqueue({ id: '2', kind: 'correctDate', entryId: 'e2', date: '2026-08-01' });
    await enqueue({ id: '3', kind: 'budget', categoryId: 'c1', amountIdr: 500_000, cycleStart: '2026-08-18' });
    await drain();
    expect(sent).toEqual(['delete:e1', 'date:e2', 'budget:c1']);
  });
});
