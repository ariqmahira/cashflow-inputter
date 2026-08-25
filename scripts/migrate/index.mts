/**
 * Migration CLI.
 *
 *   npx tsx scripts/migrate/index.mts "Cashflow Bab & Bi_20260822.xlsx"
 *
 * Reads the workbook, runs the whole pipeline, and writes the cleaned entries plus an audit
 * trail to `scripts/migrate/out/`. Writes nothing to a database — loading is a separate
 * step, so the output can be reviewed first.
 *
 * Exits non-zero if reconciliation fails.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMigration, poolBalance } from './build.mts';
import { parseWorkbook } from './parse.mts';
import { categoriesReport, merchantsReport, summaryReport } from './report.mts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, 'out');

const idr = (n: number) => n.toLocaleString('id-ID');

async function main(): Promise<void> {
  const sourceFile = process.argv[2];
  if (!sourceFile) {
    console.error('usage: tsx scripts/migrate/index.mts <workbook.xlsx>');
    process.exit(2);
  }

  console.log(`reading ${sourceFile}`);
  const wb = await parseWorkbook(sourceFile);
  console.log(`  ${wb.sheets.length} monthly sheets, ${wb.sheets[0].title} to ${wb.sheets.at(-1)!.title}`);

  // Throws, and so aborts, if any sheet disagrees with its own cached total.
  const result = buildMigration(wb);

  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(OUT_DIR, 'entries.json'),
      JSON.stringify(
        {
          sourceFile,
          generatedAt: new Date().toISOString(),
          entries: result.entries,
          reimbursements: result.reimbursements,
          merchants: result.merchants.clusters,
          places: result.places.clusters,
        },
        null,
        2,
      ),
    ),
    writeFile(resolve(OUT_DIR, 'summary.md'), summaryReport(result, sourceFile)),
    writeFile(resolve(OUT_DIR, 'merchants-report.md'), merchantsReport(result)),
    writeFile(resolve(OUT_DIR, 'categories-report.md'), categoriesReport(result)),
  ]);

  console.log(`
reconciliation   PASS on all ${result.reconciliation.sheets.length} sheets
entries          ${result.entries.length} (${result.stats.expenses} expense, ${result.stats.contributions} contribution, ${result.stats.settlements} settlement)
discarded        ${result.discards.length}
dates inferred   ${result.stats.datesInferred}
recategorized    ${result.categoryChanges.length}
merchants        ${result.merchants.clusters.length}
places           ${result.places.clusters.length}
pool balance     ${idr(poolBalance(result.entries))}

written to scripts/migrate/out/
  entries.json          the data to load
  summary.md            reconciliation, totals, discards
  merchants-report.md   every spelling merge
  categories-report.md  every row that changed category
`);
}

main().catch((err: unknown) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
