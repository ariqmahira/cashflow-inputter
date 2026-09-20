/**
 * The outbox: writes that have not reached Supabase yet.
 *
 * Entry happens standing in a mall, which is exactly where the connection is worst. A save
 * must succeed locally and reach the server later, and it must survive the app being closed
 * in between — so the queue is persisted, not held in memory.
 *
 * Order is preserved and the queue is drained strictly in sequence. A later write can depend
 * on an earlier one (a budget set on a category, a correction to an entry), so reordering
 * would be wrong even though it would drain more of the queue on a bad connection.
 */

import { addContribution, addExpense, correctDate, deleteEntry, setBudget } from './mutations';
import type { NewContribution, NewExpense } from './mutations';
import type { PlainDate } from './plain-date';
import { readJson, writeJson } from './storage';

const KEY = 'kas.outbox.v1';

/**
 * Give up on an item after this many attempts.
 *
 * Without a limit, one permanently rejected write — a constraint violation, a deleted
 * category — blocks every write behind it forever, and the app silently stops syncing.
 */
const MAX_ATTEMPTS = 5;

export type PendingKind = 'expense' | 'contribution' | 'delete' | 'correctDate' | 'budget';

export type Pending =
  | { id: string; kind: 'expense'; attempts: number; queuedAt: string; payload: NewExpense }
  | { id: string; kind: 'contribution'; attempts: number; queuedAt: string; payload: NewContribution }
  | { id: string; kind: 'delete'; attempts: number; queuedAt: string; entryId: string }
  | { id: string; kind: 'correctDate'; attempts: number; queuedAt: string; entryId: string; date: PlainDate }
  | {
      id: string;
      kind: 'budget';
      attempts: number;
      queuedAt: string;
      categoryId: string;
      amountIdr: number;
      cycleStart: PlainDate;
    };

/**
 * `Omit` over a union collapses it to the keys every member shares, which would leave a
 * queued item with no payload at all. Distributing keeps each variant intact.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A mutation as the caller supplies it, before the queue adds its bookkeeping. */
export type NewPending = DistributiveOmit<Pending, 'attempts' | 'queuedAt'>;

export type Rejected = { item: Pending; error: string };

type Stored = { queue: Pending[]; rejected: Rejected[] };

/**
 * A fresh empty state every time, never a shared constant.
 *
 * Callers mutate what `read()` hands back before writing it, so returning one module-level
 * object would let queued items accumulate in it across calls — and be sent more than once —
 * whenever storage is empty or unreadable.
 */
async function read(): Promise<Stored> {
  return (await readJson<Stored>(KEY)) ?? { queue: [], rejected: [] };
}

async function write(state: Stored): Promise<void> {
  await writeJson(KEY, state);
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueue(item: NewPending): Promise<void> {
  const state = await read();
  state.queue.push({ ...item, attempts: 0, queuedAt: new Date().toISOString() } as Pending);
  await write(state);
}

export async function pending(): Promise<Pending[]> {
  return (await read()).queue;
}

export async function rejected(): Promise<Rejected[]> {
  return (await read()).rejected;
}

export async function clearRejected(): Promise<void> {
  const state = await read();
  await write({ ...state, rejected: [] });
}

async function send(item: Pending): Promise<void> {
  switch (item.kind) {
    case 'expense':
      return addExpense(item.payload);
    case 'contribution':
      return addContribution(item.payload);
    case 'delete':
      return deleteEntry(item.entryId);
    case 'correctDate':
      return correctDate(item.entryId, item.date);
    case 'budget':
      return setBudget(item.categoryId, item.amountIdr, item.cycleStart);
  }
}

export type DrainResult = { sent: number; remaining: number; rejected: number };

/**
 * Only one drain runs at a time.
 *
 * Saving an entry reloads the current screen and then navigates, so two components mount and
 * each starts a sync. Both would read the same queued item and both would send it — the
 * ledger ends up with the purchase recorded twice. Sharing one in-flight drain makes the
 * second caller wait for the first instead of racing it.
 */
let inFlight: Promise<DrainResult> | null = null;

export function drain(): Promise<DrainResult> {
  inFlight ??= drainOnce().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Sends everything queued, oldest first.
 *
 * Stops at the first item that will not go, rather than skipping past it, so ordering holds.
 * An item that has failed `MAX_ATTEMPTS` times is moved aside as rejected — it is reported
 * to the user rather than retried forever or silently dropped.
 */
async function drainOnce(): Promise<DrainResult> {
  const state = await read();
  let sent = 0;

  while (state.queue.length > 0) {
    const item = state.queue[0];
    try {
      await send(item);
      state.queue.shift();
      sent++;
    } catch (err) {
      item.attempts++;
      if (item.attempts >= MAX_ATTEMPTS) {
        state.queue.shift();
        state.rejected.push({
          item,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        // Move on: the blockage is gone, and the rest of the queue deserves a chance.
        continue;
      }
      await write(state);
      return { sent, remaining: state.queue.length, rejected: state.rejected.length };
    }
  }

  await write(state);
  return { sent, remaining: 0, rejected: state.rejected.length };
}
