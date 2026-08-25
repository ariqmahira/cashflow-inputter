/**
 * Applies `supabase/migrations/*.sql` to a Postgres database, in filename order.
 *
 *   npx tsx --env-file=.env.local scripts/db/apply-migrations.mts
 *
 * There is no Supabase CLI in this project, so this is the migration runner. It keeps its
 * own `schema_migrations` table, applies each file exactly once, and wraps every file in a
 * transaction so a failure leaves nothing half-applied.
 *
 * Uses the NON-POOLING connection: DDL and advisory work belong on a direct connection, not
 * through the transaction pooler.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { dbConnection, describeSsl } from './connect.mts';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');

async function main(): Promise<void> {
  const conn = dbConnection();
  describeSsl(conn);

  const client = new pg.Client(conn.config);
  await client.connect();

  try {
    // The bookkeeping table lives in `private`, never `public`.
    //
    // Anything in `public` is reachable through the Data API once the `authenticated` role
    // is granted access, and migration 0002 grants on *all* tables in `public` — which would
    // sweep this one up with the real tables, exposing it with no RLS behind it. Keeping it
    // in `private` puts it out of the Data API's reach entirely.
    await client.query('create schema if not exists private');
    await client.query(`
      create table if not exists private.schema_migrations (
        name        text primary key,
        applied_at  timestamptz not null default now()
      )
    `);

    // Self-heal databases where an earlier version of this runner left the table in public.
    await client.query(`
      do $$
      begin
        if exists (
          select 1 from pg_tables where schemaname = 'public' and tablename = 'schema_migrations'
        ) then
          insert into private.schema_migrations (name, applied_at)
            select name, applied_at from public.schema_migrations
            on conflict (name) do nothing;
          drop table public.schema_migrations;
        end if;
      end;
      $$;
    `);

    const { rows } = await client.query<{ name: string }>(
      'select name from private.schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.name));

    const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
    let ran = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip   ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(resolve(MIGRATIONS, file), 'utf8');
      process.stdout.write(`  apply  ${file} ... `);
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into private.schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
        console.log('ok');
        ran++;
      } catch (err) {
        await client.query('rollback');
        console.log('FAILED');
        throw err;
      }
    }

    console.log(ran === 0 ? '\nnothing to apply; database is up to date' : `\napplied ${ran} migration(s)`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
