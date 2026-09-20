/**
 * Local-first reads and writes.
 *
 * The device holds the last known ledger, so a screen renders from storage before any
 * request is made and works with no connection at all. The network refreshes it when it can.
 *
 * Writes go into the outbox and are applied to the cached copy immediately, so a saved entry
 * appears at once whether or not it has reached the server. This is why entry never blocks
 * on the network: standing at a counter with one bar of signal is the normal case, not the
 * edge case.
 */

import { cycleFor } from './cycle';
import { fetchLedger, type Entry, type Ledger } from './queries';
import type { NewContribution, NewExpense } from './mutations';
import { drain, enqueue, newId, pending } from './outbox';
import { todayLocal, type PlainDate } from './plain-date';
import { readJson, writeJson } from './storage';

const KEY = 'kas.ledger.v1';

/** The cached snapshot. `Map`s do not survive JSON, so they are stored as pairs. */
type Snapshot = Omit<Ledger, 'reimbursed' | 'cycle' | 'today'> & {
  reimbursed: [string, number][];
  fetchedAt: string;
};

export type LocalLedger = Ledger & {
  /** When the cached copy was taken; null when it came straight from the network. */
  cachedAt: string | null;
  /** Writes still waiting to reach the server. */
  pendingWrites: number;
};

function hydrate(snap: Snapshot, pendingWrites: number): LocalLedger {
  const today = todayLocal();
  return {
    ...snap,
    reimbursed: new Map(snap.reimbursed),
    today,
    cycle: cycleFor(today, snap.settings.cycleAnchorDay),
    cachedAt: snap.fetchedAt,
    pendingWrites,
  };
}

function dehydrate(ledger: Ledger): Snapshot {
  const { reimbursed, cycle: _cycle, today: _today, ...rest } = ledger;
  return { ...rest, reimbursed: [...reimbursed], fetchedAt: new Date().toISOString() };
}

export async function readCache(): Promise<LocalLedger | null> {
  const snap = await readJson<Snapshot>(KEY);
  if (!snap) return null;
  return hydrate(snap, (await pending()).length);
}

async function writeCache(ledger: Ledger): Promise<void> {
  await writeJson(KEY, dehydrate(ledger));
}

const SYNC_TIMEOUT_MS = 12_000;

/** Rejects if `work` has not finished in time, so a stalled request cannot hang the UI. */
async function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const bell = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([work, bell]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Sends anything queued, then refreshes from the server.
 *
 * Draining first matters: pulling before pushing would overwrite the cache with a server
 * state that does not yet contain the local writes, and they would vanish from the screen
 * until the next sync.
 *
 * Both halves are bounded. A request that neither succeeds nor fails — a captive portal, a
 * connection that opens and then stalls, exactly what mall wifi does — would otherwise leave
 * the app unable to say anything at all: not refreshed, not stale, just waiting forever.
 */
export async function syncNow(): Promise<LocalLedger> {
  await withTimeout(drain(), SYNC_TIMEOUT_MS, 'Sending entries');
  const fresh = await withTimeout(fetchLedger(), SYNC_TIMEOUT_MS, 'Loading data');
  await writeCache(fresh);
  return { ...fresh, cachedAt: null, pendingWrites: (await pending()).length };
}

/* ---------------------------------------------------------------------------------------
 * Optimistic writes
 *
 * Each of these updates the cached ledger as though the write had already landed, queues the
 * real one, and asks for a sync. The temporary entry carries a `local:` id so it can be told
 * apart from anything the server has seen.
 * ------------------------------------------------------------------------------------ */

export function isLocal(entry: Entry): boolean {
  return entry.id.startsWith('local:');
}

async function mutateCache(fn: (ledger: LocalLedger) => Ledger): Promise<void> {
  const cached = await readCache();
  if (!cached) return; // Nothing cached yet; the next sync brings the truth anyway.
  await writeCache(fn(cached));
}

export async function saveExpense(input: NewExpense): Promise<void> {
  const id = `local:${newId()}`;

  await mutateCache((ledger) => {
    // Resolve the merchant against what is already known so the new row reads properly
    // offline. An unknown name simply has no merchant until the server assigns one.
    const merchant = ledger.merchants.find(
      (m) =>
        m.name.toLowerCase() === input.merchantName.trim().toLowerCase() ||
        m.aliases.some((a) => a.toLowerCase() === input.merchantName.trim().toLowerCase()),
    );
    const place = input.placeName
      ? ledger.places.find((p) => p.name.toLowerCase() === input.placeName!.trim().toLowerCase())
      : undefined;

    const optimistic: Entry = {
      id,
      kind: 'expense',
      occurredOn: input.occurredOn,
      dateInferred: false,
      amountIdr: input.amountIdr,
      merchantId: merchant?.id ?? null,
      placeId: place?.id ?? null,
      categoryId: input.categoryId,
      memberId: null,
      note: input.note ?? merchant?.name ?? input.merchantName,
    };
    return { ...ledger, entries: [optimistic, ...ledger.entries] };
  });

  await enqueue({ id, kind: 'expense', payload: input });
}

export async function saveContribution(input: NewContribution): Promise<void> {
  const id = `local:${newId()}`;

  await mutateCache((ledger) => ({
    ...ledger,
    entries: [
      {
        id,
        kind: 'contribution',
        occurredOn: input.occurredOn,
        dateInferred: false,
        amountIdr: input.amountIdr,
        merchantId: null,
        placeId: null,
        categoryId: null,
        memberId: input.memberId,
        note: input.note ?? null,
      },
      ...ledger.entries,
    ],
  }));

  await enqueue({ id, kind: 'contribution', payload: input });
}

export async function removeEntry(entryId: string): Promise<void> {
  await mutateCache((ledger) => ({
    ...ledger,
    entries: ledger.entries.filter((e) => e.id !== entryId),
  }));
  // A row that never reached the server has nothing to delete there; dropping it from the
  // cache is the whole job.
  if (!entryId.startsWith('local:')) {
    await enqueue({ id: newId(), kind: 'delete', entryId });
  }
}

export async function fixDate(entryId: string, date: PlainDate): Promise<void> {
  await mutateCache((ledger) => ({
    ...ledger,
    entries: ledger.entries.map((e) =>
      e.id === entryId ? { ...e, occurredOn: date, dateInferred: false } : e,
    ),
  }));
  await enqueue({ id: newId(), kind: 'correctDate', entryId, date });
}

export async function saveBudget(
  categoryId: string,
  amountIdr: number,
  cycleStart: PlainDate,
): Promise<void> {
  await mutateCache((ledger) => ({
    ...ledger,
    budgets: [
      { categoryId, amountIdr, effectiveFrom: cycleStart },
      ...ledger.budgets.filter(
        (b) => !(b.categoryId === categoryId && b.effectiveFrom === cycleStart),
      ),
    ],
  }));
  await enqueue({ id: newId(), kind: 'budget', categoryId, amountIdr, cycleStart });
}
