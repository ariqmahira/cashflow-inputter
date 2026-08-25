/**
 * Loads the migration output into Postgres.
 *
 * Deliberately written against a minimal `query(text, params)` interface rather than a
 * specific driver, because `pg` and pglite both satisfy it. That is what lets the loader be
 * tested end-to-end against a real Postgres in-process, with no database to provision and
 * nothing to clean up afterwards.
 *
 * The whole load is **idempotent**, keyed on `legacy_ref`. Re-running it against an already
 * populated database updates rather than duplicates, so a failed run can simply be run
 * again.
 */

import { deriveCategory } from './categories.mts';
import type { MigratedEntry, MigratedReimbursement } from './build.mts';

export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export type LoadInput = {
  entries: MigratedEntry[];
  reimbursements: MigratedReimbursement[];
  merchants: { canonical: string; variants: string[] }[];
  places: { canonical: string; variants: string[] }[];
};

export type LoadReport = {
  merchants: number;
  places: number;
  entries: number;
  reimbursements: number;
  poolBalanceIdr: number;
};

async function nameToId(sql: SqlClient, table: string, column: string): Promise<Map<string, string>> {
  const { rows } = await sql.query<{ id: string; name: string }>(
    `select id, ${column} as name from ${table}`,
  );
  return new Map(rows.map((r) => [r.name, r.id]));
}

export async function load(sql: SqlClient, input: LoadInput): Promise<LoadReport> {
  const categoryIds = await nameToId(sql, 'categories', 'name');
  const memberIds = await nameToId(sql, 'members', 'display_name');

  if (categoryIds.size === 0 || memberIds.size === 0) {
    throw new Error(
      'categories and members must be seeded before loading (run migration 0003_seed.sql)',
    );
  }

  // Everything below is written as one statement per table rather than one per row.
  // Against a remote database that is the difference between a few seconds and a few
  // minutes: 600 sequential round-trips to another continent is almost entirely latency.

  // Places and merchants each carry a per-row `text[]` of aliases, which `unnest` cannot
  // express — Postgres arrays are rectangular and unnest would flatten them into one long
  // list. `jsonb_to_recordset` keeps each row's aliases as its own array.

  // Places first: merchants and entries both point at them.
  if (input.places.length) {
    await sql.query(
      `insert into places (canonical_name, aliases)
       select name, aliases
       from jsonb_to_recordset($1::jsonb) as t(name text, aliases text[])
       on conflict (canonical_name) do update set aliases = excluded.aliases`,
      [JSON.stringify(input.places.map((p) => ({ name: p.canonical, aliases: p.variants })))],
    );
  }

  // A merchant carries the category it usually implies, which is what makes the entry form
  // pre-fill correctly the next time it is typed.
  if (input.merchants.length) {
    await sql.query(
      `insert into merchants (canonical_name, aliases, default_category_id)
       select name, aliases, category
       from jsonb_to_recordset($1::jsonb) as t(name text, aliases text[], category uuid)
       on conflict (canonical_name) do update
         set aliases = excluded.aliases, default_category_id = excluded.default_category_id`,
      [
        JSON.stringify(
          input.merchants.map((m) => ({
            name: m.canonical,
            aliases: m.variants,
            category: categoryIds.get(deriveCategory(m.canonical).category) ?? null,
          })),
        ),
      ],
    );
  }

  const placeIds = await nameToId(sql, 'places', 'canonical_name');
  const merchantIds = await nameToId(sql, 'merchants', 'canonical_name');

  if (input.entries.length) {
    const e = input.entries;
    await sql.query(
      `insert into entries (
         kind, occurred_on, date_inferred, amount_idr,
         merchant_id, place_id, category_id, member_id,
         note, source, legacy_ref
       )
       select kind, occurred_on, date_inferred, amount_idr,
              merchant_id, place_id, category_id, member_id,
              note, 'migration', legacy_ref
       from jsonb_to_recordset($1::jsonb) as t(
         kind          entry_kind,
         occurred_on   date,
         date_inferred boolean,
         amount_idr    bigint,
         merchant_id   uuid,
         place_id      uuid,
         category_id   uuid,
         member_id     uuid,
         note          text,
         legacy_ref    text
       )
       on conflict (legacy_ref) do update set
         kind          = excluded.kind,
         occurred_on   = excluded.occurred_on,
         date_inferred = excluded.date_inferred,
         amount_idr    = excluded.amount_idr,
         merchant_id   = excluded.merchant_id,
         place_id      = excluded.place_id,
         category_id   = excluded.category_id,
         member_id     = excluded.member_id,
         note          = excluded.note`,
      [
        JSON.stringify(
          e.map((x) => ({
            kind: x.kind,
            occurred_on: x.occurredOn,
            date_inferred: x.dateInferred,
            amount_idr: x.amountIdr,
            merchant_id: x.merchant ? (merchantIds.get(x.merchant) ?? null) : null,
            place_id: x.place ? (placeIds.get(x.place) ?? null) : null,
            category_id: x.category ? (categoryIds.get(x.category) ?? null) : null,
            member_id: x.member ? (memberIds.get(x.member) ?? null) : null,
            note: x.note,
            legacy_ref: x.legacyRef,
          })),
        ),
      ],
    );
  }

  const entryIds = await nameToId(sql, 'entries', 'legacy_ref');

  for (const r of input.reimbursements) {
    const expenseId = entryIds.get(r.expense);
    if (!expenseId) throw new Error(`reimbursement references unknown entry ${r.expense}`);

    const { rows } = await sql.query<{ id: string }>(
      `insert into reimbursements (expense_entry_id, amount_idr, note) values ($1, $2, $3)
       on conflict (expense_entry_id) do update
         set amount_idr = excluded.amount_idr, note = excluded.note
       returning id`,
      [expenseId, r.amountIdr, r.note],
    );
    const reimbursementId = rows[0].id;

    for (const ref of r.settlements) {
      const settlementId = entryIds.get(ref);
      if (!settlementId) throw new Error(`reimbursement references unknown settlement ${ref}`);
      await sql.query(
        `insert into reimbursement_settlements (reimbursement_id, settlement_entry_id)
         values ($1, $2) on conflict do nothing`,
        [reimbursementId, settlementId],
      );
    }
  }

  const counts = await sql.query<{ merchants: number; places: number; entries: number; reimbursements: number }>(
    `select
       (select count(*)::int from merchants)      as merchants,
       (select count(*)::int from places)         as places,
       (select count(*)::int from entries)        as entries,
       (select count(*)::int from reimbursements) as reimbursements`,
  );
  const balance = await sql.query<{ balance_idr: string }>('select balance_idr from pool_balance');

  return { ...counts.rows[0], poolBalanceIdr: Number(balance.rows[0].balance_idr) };
}

/**
 * Confirms the database agrees with the workbook after loading.
 *
 * The migration already reconciles against the spreadsheet's own cached totals; this checks
 * that nothing was lost on the way *into* Postgres, which is a different failure and worth
 * catching separately.
 */
export async function verifyLoad(
  sql: SqlClient,
  expected: { entries: number; poolBalanceIdr: number },
): Promise<void> {
  const { rows } = await sql.query<{ entries: number; balance: string }>(
    `select
       (select count(*)::int from entries where deleted_at is null) as entries,
       (select balance_idr from pool_balance)                       as balance`,
  );
  const got = { entries: rows[0].entries, poolBalanceIdr: Number(rows[0].balance) };

  const problems: string[] = [];
  if (got.entries !== expected.entries) {
    problems.push(`entries: expected ${expected.entries}, database has ${got.entries}`);
  }
  if (got.poolBalanceIdr !== expected.poolBalanceIdr) {
    problems.push(
      `pool balance: expected ${expected.poolBalanceIdr.toLocaleString()}, ` +
        `database has ${got.poolBalanceIdr.toLocaleString()}`,
    );
  }
  if (problems.length) {
    throw new Error(`Load verification FAILED:\n  ${problems.join('\n  ')}`);
  }
}
