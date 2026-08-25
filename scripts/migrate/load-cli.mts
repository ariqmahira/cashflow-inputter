/**
 * Loads `scripts/migrate/out/entries.json` into Postgres.
 *
 *   npx tsx --env-file=.env.local scripts/migrate/load-cli.mts
 *
 * Run `index.mts` first to produce the JSON, and read `out/summary.md` before running this.
 * Nothing here re-derives anything: it loads exactly what was reviewed.
 *
 * Safe to re-run. The whole load is keyed on `legacy_ref` and wrapped in a transaction, so
 * an interrupted run leaves the database untouched rather than half-populated.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { dbConnection, describeSsl } from '../db/connect.mts';
import type { MigratedEntry, MigratedReimbursement } from './build.mts';
import { load, verifyLoad, type LoadInput } from './load.mts';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'out', 'entries.json');

type EntriesFile = {
  sourceFile: string;
  entries: MigratedEntry[];
  reimbursements: MigratedReimbursement[];
  merchants: { canonical: string; variants: string[] }[];
  places: { canonical: string; variants: string[] }[];
};

const idr = (n: number) => n.toLocaleString('id-ID');

async function main(): Promise<void> {
  const conn = dbConnection();
  describeSsl(conn);

  const file = JSON.parse(await readFile(OUT, 'utf8')) as EntriesFile;
  const input: LoadInput = {
    entries: file.entries,
    reimbursements: file.reimbursements,
    merchants: file.merchants,
    places: file.places,
  };

  const expectedBalance = file.entries.reduce(
    (acc, e) => acc + (e.kind === 'expense' ? -e.amountIdr : e.amountIdr),
    0,
  );

  console.log(`loading ${file.entries.length} entries from ${file.sourceFile}`);

  const client = new pg.Client(conn.config);
  await client.connect();
  try {
    // All or nothing: a failure halfway through must not leave a partial ledger behind.
    await client.query('begin');
    const report = await load(client, input);
    await verifyLoad(client, { entries: file.entries.length, poolBalanceIdr: expectedBalance });
    await client.query('commit');

    console.log(`
merchants        ${report.merchants}
places           ${report.places}
entries          ${report.entries}
reimbursements   ${report.reimbursements}
pool balance     ${idr(report.poolBalanceIdr)}

verification     PASS
`);
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
