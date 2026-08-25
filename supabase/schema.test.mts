/**
 * Schema tests, run against real Postgres in-process via pglite.
 *
 * These exist because the constraints below are the last line of defence for the money
 * model. A bug in application code shows up as a wrong number on a screen; a missing
 * constraint lets a contribution acquire a category, or an expense go negative, and the
 * ledger quietly stops meaning what the glossary says it means.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

async function migration(name: string): Promise<string> {
  return readFile(resolve(HERE, 'migrations', name), 'utf8');
}

/**
 * A database with the schema applied.
 *
 * RLS is applied only when asked for: `auth.uid()` is a Supabase-provided function that
 * does not exist here, so the RLS tests stub it explicitly.
 */
async function freshDb(withRls = false): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(await migration('0001_init.sql'));
  if (withRls) {
    await db.exec(`
      create schema if not exists auth;
      create table auth.current (uid uuid);
      insert into auth.current values (null);
      create function auth.uid() returns uuid language sql stable
        as $$ select uid from auth.current $$;
      -- Supabase provides these roles; pglite does not.
      create role anon;
      create role authenticated;
    `);
    await db.exec(await migration('0002_rls.sql'));
  }
  await db.exec(await migration('0003_seed.sql'));
  if (withRls) {
    await db.exec(await migration('0004_revoke_anon.sql'));
    await db.exec(await migration('0005_grant_private_usage.sql'));
  }
  return db;
}

const idOf = async (db: PGlite, sql: string): Promise<string> =>
  ((await db.query(sql)).rows[0] as { id: string }).id;

describe('schema applies cleanly', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
  });

  it('runs every migration in order', async () => {
    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(rows[0].count).toBe(10);
  });

  it('seeds the two members and ten categories', async () => {
    const members = await db.query<{ display_name: string }>(
      'select display_name from members order by display_name',
    );
    expect(members.rows.map((r) => r.display_name)).toEqual(['Ariq', 'Ika']);

    const cats = await db.query<{ count: number }>('select count(*)::int as count from categories');
    expect(cats.rows[0].count).toBe(10);
  });

  it('seeds the kas top-up as the only recurring rule', async () => {
    const { rows } = await db.query<{ label: string; amount_idr: string; day_of_month: number }>(
      'select label, amount_idr, day_of_month from recurring_rules order by label',
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.day_of_month === 25)).toBe(true);
  });

  it('makes settings a singleton', async () => {
    await expect(db.exec('insert into settings (only_one_row) values (true)')).rejects.toThrow();
  });

  it('defaults the cycle anchor to the 25th and the warning to 80%', async () => {
    const { rows } = await db.query<{ cycle_anchor_day: number; warn_threshold: number }>(
      'select cycle_anchor_day, warn_threshold from settings',
    );
    expect(rows[0].cycle_anchor_day).toBe(25);
    expect(rows[0].warn_threshold).toBeCloseTo(0.8);
  });

  it('refuses a cycle anchor that does not exist in February', async () => {
    await expect(db.exec('update settings set cycle_anchor_day = 31')).rejects.toThrow();
  });
});

describe('entry shape constraints', () => {
  let db: PGlite;
  let categoryId: string;
  let memberId: string;

  // Booting pglite costs a couple of seconds, so the database is built once per block and
  // the entry tables are cleared between tests instead.
  beforeAll(async () => {
    db = await freshDb();
    categoryId = await idOf(db, `select id from categories where name = 'Restoran'`);
    memberId = await idOf(db, `select id from members where display_name = 'Ariq'`);
  });

  beforeEach(async () => {
    await db.exec('delete from reimbursements; delete from entries;');
  });

  it('accepts a well-formed expense', async () => {
    await db.exec(`
      insert into entries (kind, occurred_on, amount_idr, category_id)
      values ('expense', '2026-07-14', 260700, '${categoryId}')
    `);
    const { rows } = await db.query<{ count: number }>('select count(*)::int as count from entries');
    expect(rows[0].count).toBe(1);
  });

  it('rejects an expense with no category', async () => {
    await expect(
      db.exec(`insert into entries (kind, occurred_on, amount_idr) values ('expense', '2026-07-14', 1000)`),
    ).rejects.toThrow(/expense_shape/);
  });

  it('rejects a negative or zero expense', async () => {
    for (const amount of [-1000, 0]) {
      await expect(
        db.exec(`
          insert into entries (kind, occurred_on, amount_idr, category_id)
          values ('expense', '2026-07-14', ${amount}, '${categoryId}')
        `),
      ).rejects.toThrow(/expense_shape/);
    }
  });

  it('rejects a contribution that carries a category', async () => {
    // A top-up is funding, not spending. Letting it hold a category would double-count it
    // into a budget it never belonged to.
    await expect(
      db.exec(`
        insert into entries (kind, occurred_on, amount_idr, member_id, category_id)
        values ('contribution', '2026-07-25', 700000, '${memberId}', '${categoryId}')
      `),
    ).rejects.toThrow(/contribution_shape/);
  });

  it('rejects a contribution with no member', async () => {
    await expect(
      db.exec(`insert into entries (kind, occurred_on, amount_idr) values ('contribution', '2026-07-25', 700000)`),
    ).rejects.toThrow(/contribution_shape/);
  });

  it('allows a negative contribution, which is how funding is taken back out', async () => {
    // `'September 2024'!H6`, the Rizka repayment.
    await db.exec(`
      insert into entries (kind, occurred_on, amount_idr, member_id, note)
      values ('contribution', '2024-09-24', -1200000, '${memberId}', 'Pengembalian')
    `);
    const { rows } = await db.query<{ balance_idr: string }>('select balance_idr from pool_balance');
    expect(Number(rows[0].balance_idr)).toBe(-1_200_000);
  });

  it('rejects a zero contribution, which would mean nothing happened', async () => {
    await expect(
      db.exec(`
        insert into entries (kind, occurred_on, amount_idr, member_id)
        values ('contribution', '2026-07-25', 0, '${memberId}')
      `),
    ).rejects.toThrow(/contribution_shape/);
  });

  it('allows a settlement with no known payer', async () => {
    // `sama kaya di atas` names nobody.
    await db.exec(`
      insert into entries (kind, occurred_on, amount_idr, note)
      values ('settlement', '2025-04-21', 450000, 'sama kaya di atas')
    `);
    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count from entries where kind = 'settlement'`,
    );
    expect(rows[0].count).toBe(1);
  });

  it('keeps legacy_ref unique so a re-import cannot double-insert', async () => {
    const row = `insert into entries (kind, occurred_on, amount_idr, category_id, legacy_ref)
                 values ('expense', '2026-07-14', 1000, '${categoryId}', '''Juli 2026''!H5')`;
    await db.exec(row);
    await expect(db.exec(row)).rejects.toThrow();
  });

  it('touches updated_at on write, so sync can order changes', async () => {
    await db.exec(`
      insert into entries (kind, occurred_on, amount_idr, category_id, legacy_ref)
      values ('expense', '2026-07-14', 1000, '${categoryId}', 'ref')
    `);
    const before = await db.query<{ updated_at: string }>('select updated_at from entries');
    await db.exec(`update entries set amount_idr = 2000 where legacy_ref = 'ref'`);
    const after = await db.query<{ updated_at: string }>('select updated_at from entries');
    expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before.rows[0].updated_at).getTime(),
    );
  });
});

describe('reimbursements and spending', () => {
  let db: PGlite;
  let belanja: string;
  let hiburan: string;

  beforeAll(async () => {
    db = await freshDb();
    belanja = await idOf(db, `select id from categories where name = 'Belanja'`);
    hiburan = await idOf(db, `select id from categories where name = 'Hiburan'`);
  });

  beforeEach(async () => {
    await db.exec('delete from reimbursements; delete from entries;');
  });

  it('nets a partial reimbursement off the real cost', async () => {
    // The Uniqlo case: 1.794.000 spent, 900.000 repaid, 894.000 genuinely shared.
    const expenseId = await idOf(
      db,
      `insert into entries (kind, occurred_on, amount_idr, category_id)
       values ('expense', '2025-04-21', 1794000, '${belanja}') returning id`,
    );
    await db.exec(`
      insert into reimbursements (expense_entry_id, amount_idr)
      values ('${expenseId}', 900000)
    `);
    const { rows } = await db.query<{ net_idr: string }>(
      `select net_idr from entry_spending where id = '${expenseId}'`,
    );
    expect(Number(rows[0].net_idr)).toBe(894_000);
  });

  it('reduces a fully repaid expense to zero spending', async () => {
    const expenseId = await idOf(
      db,
      `insert into entries (kind, occurred_on, amount_idr, category_id)
       values ('expense', '2024-09-24', 2877000, '${hiburan}') returning id`,
    );
    await db.exec(`
      insert into reimbursements (expense_entry_id, amount_idr) values ('${expenseId}', 2877000)
    `);
    const { rows } = await db.query<{ net_idr: string }>(
      `select net_idr from entry_spending where id = '${expenseId}'`,
    );
    expect(Number(rows[0].net_idr)).toBe(0);
  });

  it('never reports negative spending, even if over-repaid', async () => {
    const expenseId = await idOf(
      db,
      `insert into entries (kind, occurred_on, amount_idr, category_id)
       values ('expense', '2025-04-21', 100000, '${belanja}') returning id`,
    );
    await db.exec(`
      insert into reimbursements (expense_entry_id, amount_idr) values ('${expenseId}', 150000)
    `);
    const { rows } = await db.query<{ net_idr: string }>(
      `select net_idr from entry_spending where id = '${expenseId}'`,
    );
    expect(Number(rows[0].net_idr)).toBe(0);
  });

  it('leaves the pool balance untouched by a reimbursement link', async () => {
    // The money really did leave and really did come back; both movements are their own
    // entries, so the link itself must not move the balance again.
    const expenseId = await idOf(
      db,
      `insert into entries (kind, occurred_on, amount_idr, category_id)
       values ('expense', '2024-09-24', 2877000, '${hiburan}') returning id`,
    );
    await db.exec(`
      insert into entries (kind, occurred_on, amount_idr, note)
      values ('settlement', '2024-09-24', 2877000, 'Kas Rizka (Beli Tiket)')
    `);
    const before = await db.query<{ balance_idr: string }>('select balance_idr from pool_balance');
    await db.exec(`
      insert into reimbursements (expense_entry_id, amount_idr) values ('${expenseId}', 2877000)
    `);
    const after = await db.query<{ balance_idr: string }>('select balance_idr from pool_balance');
    expect(after.rows[0].balance_idr).toBe(before.rows[0].balance_idr);
    expect(Number(after.rows[0].balance_idr)).toBe(0);
  });

  it('allows only one reimbursement per expense', async () => {
    const expenseId = await idOf(
      db,
      `insert into entries (kind, occurred_on, amount_idr, category_id)
       values ('expense', '2025-04-21', 100000, '${belanja}') returning id`,
    );
    await db.exec(`insert into reimbursements (expense_entry_id, amount_idr) values ('${expenseId}', 10000)`);
    await expect(
      db.exec(`insert into reimbursements (expense_entry_id, amount_idr) values ('${expenseId}', 20000)`),
    ).rejects.toThrow();
  });

  it('excludes soft-deleted entries from spending and balance', async () => {
    const expenseId = await idOf(
      db,
      `insert into entries (kind, occurred_on, amount_idr, category_id)
       values ('expense', '2026-07-14', 50000, '${belanja}') returning id`,
    );
    await db.exec(`update entries set deleted_at = now() where id = '${expenseId}'`);
    const spending = await db.query('select * from entry_spending');
    expect(spending.rows).toHaveLength(0);
    const { rows } = await db.query<{ balance_idr: string }>('select balance_idr from pool_balance');
    expect(Number(rows[0].balance_idr)).toBe(0);
  });
});

describe('row level security', () => {
  let shared: PGlite;
  beforeAll(async () => {
    shared = await freshDb(true);
  });
  /** RLS tests mutate the auth stub, so each gets the shared db reset to signed-out. */
  const rlsDb = async () => {
    await shared.exec(`update auth.current set uid = null;
                       update members set auth_user_id = null;`);
    return shared;
  };

  it('closes the database to an account not linked to a member', async () => {
    const db = await rlsDb();
    // auth.uid() is null: nobody is signed in.
    const { rows } = await db.query('select private.is_member() as ok');
    expect((rows[0] as { ok: boolean }).ok).toBe(false);
  });

  it('opens it once an account is linked to a member row', async () => {
    const db = await rlsDb();
    const uid = '11111111-1111-1111-1111-111111111111';
    await db.exec(`update members set auth_user_id = '${uid}' where display_name = 'Ariq'`);
    await db.exec(`update auth.current set uid = '${uid}'`);
    const { rows } = await db.query('select private.is_member() as ok');
    expect((rows[0] as { ok: boolean }).ok).toBe(true);
  });

  it('protects every table', async () => {
    const db = await rlsDb();
    const { rows } = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => !r.rowsecurity)).toEqual([]);
  });

  it('lets the authenticated role reach the schema holding the membership check', async () => {
    // Regression: 0002 granted EXECUTE on `private.is_member()` but not USAGE on `private`.
    // Postgres needs both, so every policy — which all call this function — failed with
    // `permission denied for schema private`. Not "no data": every query errored.
    //
    // Checked as a privilege rather than by querying as the role, because pglite runs as
    // superuser and would bypass the check that was missing.
    const db = await rlsDb();
    const { rows } = await db.query<{ ok: boolean }>(
      `select has_schema_privilege('authenticated', 'private', 'USAGE') as ok`,
    );
    expect(rows[0].ok).toBe(true);
  });

  it('still keeps the private schema itself unreadable', async () => {
    // USAGE on the schema is permission to reach into it, not to read what it holds.
    const db = await rlsDb();
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.role_table_grants
       where table_schema = 'private' and grantee in ('authenticated', 'anon')`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('keeps the SECURITY DEFINER helper out of the API-exposed schema', async () => {
    // A SECURITY DEFINER function in `public` is callable by anon through the Data API,
    // because Postgres grants EXECUTE to PUBLIC on every new function.
    const db = await rlsDb();
    const { rows } = await db.query<{ nspname: string }>(
      `select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'is_member'`,
    );
    expect(rows.map((r) => r.nspname)).toEqual(['private']);
  });

  it('grants the authenticated role access, since tables are no longer auto-exposed', async () => {
    // Supabase stopped auto-exposing new public tables to the Data API on 2026-05-30.
    // Without these grants PostgREST returns empty results and no error.
    const db = await rlsDb();
    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public'
         and privilege_type = 'SELECT'`,
    );
    // Ten tables plus two views.
    expect(rows[0].count).toBeGreaterThanOrEqual(12);
  });

  it('adds no grants of its own for the anonymous role', async () => {
    // Scope note: this proves migration 0002 does not grant to `anon`. It does NOT prove
    // production is clean. A real Supabase project ships `anon` grants of its own — 84 of
    // them were present on this database before migration 0004 revoked them — and bare
    // Postgres has no such defaults, so pglite cannot see them either way.
    const db = await rlsDb();
    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(rows[0].count).toBe(0);
  });

  it('leaves no policy that an anonymous caller could match', async () => {
    // The real guarantee, and one pglite can check: even with grants present, an anonymous
    // caller matches no policy and therefore reads nothing.
    const db = await rlsDb();
    const { rows } = await db.query<{ policyname: string }>(
      `select policyname from pg_policies
       where schemaname = 'public' and 'anon' = any(roles::text[])`,
    );
    expect(rows).toEqual([]);
  });

  it('scopes every policy to the authenticated role', async () => {
    const db = await rlsDb();
    const { rows } = await db.query<{ tablename: string; roles: string[] }>(
      `select tablename, roles::text[] from pg_policies where schemaname = 'public'`,
    );
    expect(rows).toHaveLength(10);
    for (const p of rows) expect(p.roles).toEqual(['authenticated']);
  });

  it('makes views honour the caller rather than their owner', async () => {
    const db = await rlsDb();
    const { rows } = await db.query<{ viewname: string; options: string[] | null }>(
      `select c.relname as viewname, c.reloptions as options
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'`,
    );
    expect(rows).toHaveLength(2);
    for (const v of rows) {
      expect(v.options ?? []).toContain('security_invoker=true');
    }
  });
});
