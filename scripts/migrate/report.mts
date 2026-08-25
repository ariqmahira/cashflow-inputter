/**
 * Human-readable audit trail for the migration.
 *
 * The migration rewrites two years of records: it invents 116 dates, re-files 240 rows into
 * different categories, and merges spellings into single merchants. None of that should be
 * discoverable only by using the app and noticing something looks wrong. These reports are
 * how those decisions stay reviewable.
 */

import { CATEGORIES } from './categories.mts';
import { poolBalance, spendingByCategory, type MigrationResult } from './build.mts';
import { SUGGESTED_PLACE_MERGES } from './places.mts';

const idr = (n: number) => n.toLocaleString('id-ID');

function table(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

export function summaryReport(m: MigrationResult, sourceFile: string): string {
  const spend = spendingByCategory(m.entries, m.reimbursements);
  const spendTotal = [...spend.values()].reduce((a, b) => a + b, 0);
  const excluded = m.reconciliation.totals.expense - spendTotal;

  return `# Migration summary

Source: \`${sourceFile}\`
Generated: ${new Date().toISOString().slice(0, 10)}

## Reconciliation

**${m.reconciliation.ok ? 'PASS' : 'FAIL'}** — every sheet's parsed total matches the \`SUM\`
the workbook itself cached.

${table(
  ['', 'Amount'],
  [
    ['Expense rows (raw)', idr(m.reconciliation.totals.expense)],
    ['Income rows (raw)', idr(m.reconciliation.totals.income)],
    ['Net', idr(m.reconciliation.totals.net)],
  ],
)}

## What was imported

${table(
  ['Kind', 'Count'],
  [
    ['Expenses', String(m.stats.expenses)],
    ['Contributions', String(m.stats.contributions)],
    ['Settlements', String(m.stats.settlements)],
    ['**Total entries**', `**${m.entries.length}**`],
    ['Discarded rows', String(m.discards.length)],
  ],
)}

- **${m.stats.datesInferred} dates were inferred** and carry \`date_inferred\`. They appear in
  the app with a marker so they can be corrected.
- **${m.stats.autofillRepaired} dates** were repaired from Excel autofill corruption.
- **${m.categoryChanges.length} of ${m.stats.expenses} rows** were filed under a different
  category than the workbook said. See \`categories-report.md\`.

## Pool balance

**${idr(poolBalance(m.entries))}**

Contributions and settlements in, expenses out, from \`Maret 2024\` onward. A negative figure
here is expected when the month's kas top-up has not been recorded yet.

## Spending by category

Repaid money is excluded — that is the point of modelling reimbursements.

${table(
  ['Category', 'Spending'],
  CATEGORIES.map((c) => [c, idr(spend.get(c) ?? 0)]).concat([['**Total**', `**${idr(spendTotal)}**`]]),
)}

${idr(excluded)} of the raw expense total is excluded as money that passed through the pool
without being shared spending:

${m.reimbursements.map((r) => `- \`${r.expense}\` — ${idr(r.amountIdr)} repaid. ${r.note}`).join('\n')}
- \`'September 2024'!H6\` — 1.200.000 reclassified as a negative contribution, not spending.

## Discarded rows

These carried no usable amount and were not imported. Nothing here affects the totals.

${table(
  ['Cell', 'Reason', 'Content'],
  m.discards.map((d) => [`\`${d.legacyRef}\``, d.reason, `\`${JSON.stringify(d.raw)}\``]),
)}

${
  m.discards.some((d) => d.reason === 'amount is zero' || d.reason === 'has a name but no amount')
    ? '> Rows with a merchant but no amount are real purchases with the number missing. ' +
      'Re-enter them by hand if you remember what they cost.'
    : ''
}

${
  m.unattributed.length
    ? `## Unattributed contributions\n\n${m.unattributed.map((r) => `- \`${r}\``).join('\n')}`
    : '## Unattributed contributions\n\nNone — every income row resolved to a member.'
}
`;
}

export function merchantsReport(m: MigrationResult): string {
  const merged = m.merchants.clusters.filter((c) => c.variants.length > 1);

  return `# Merchant canonicalization

${m.merchants.clusters.length} canonical merchants from the workbook's spellings.
${merged.length} of them absorbed more than one spelling.

## Merged spellings

${table(
  ['Uses', 'Canonical', 'Absorbed spellings'],
  merged.map((c) => [String(c.count), c.canonical, c.variants.filter((v) => v !== c.canonical).map((v) => `\`${v}\``).join(', ')]),
)}

## Fuzzy merges

These were joined by string similarity rather than by an exact or hand-verified match, so
they are the ones most worth a second look.

${
  m.merchants.fuzzyMerges.length
    ? table(
        ['Score', 'Kept', 'Absorbed'],
        m.merchants.fuzzyMerges.map((f) => [String(f.score), f.canonical, `\`${f.absorbed}\``]),
      )
    : '_None._'
}

## Places

${m.places.clusters.length} canonical places.

${table(
  ['Uses', 'Canonical', 'Absorbed spellings'],
  m.places.clusters
    .filter((c) => c.variants.length > 1)
    .map((c) => [String(c.count), c.canonical, c.variants.filter((v) => v !== c.canonical).map((v) => `\`${v}\``).join(', ')]),
)}

### Suggested but NOT applied

Judgement calls rather than typo fixes. Left alone deliberately.

${SUGGESTED_PLACE_MERGES.map((s) => `- Keep \`${s.keep}\`, consider merging \`${s.consider}\` — ${s.why}`).join('\n')}
`;
}

export function categoriesReport(m: MigrationResult): string {
  const byConfidence = (c: 'merchant' | 'keyword' | 'fallback') =>
    m.categoryChanges.filter((x) => x.confidence === c);

  const section = (title: string, note: string, rows: typeof m.categoryChanges) =>
    rows.length
      ? `## ${title}\n\n${note}\n\n${table(
          ['Cell', 'Merchant', 'Was', 'Now'],
          rows.map((r) => [`\`${r.legacyRef}\``, r.merchant, r.from ?? '_(blank)_', `**${r.to}**`]),
        )}\n`
      : '';

  return `# Category re-derivation

The workbook's \`Jenis Pengeluaran\` column was **not** used. It had become a catch-all:
\`Makan\` covered 218 of 292 rows and contained a cinema ticket, a locker, and every meal
alike, while ride-hailing sat under \`Hiburan\`.

Each row's category is derived from its canonical merchant instead. This table lists every
row where that disagreed with the sheet — ${m.categoryChanges.length} of ${m.stats.expenses}.

${section(
  'Explicit merchant mapping',
  'Hand-checked assignments. Highest confidence.',
  byConfidence('merchant'),
)}
${section(
  'Keyword match',
  'A word in the merchant name implied the category.',
  byConfidence('keyword'),
)}
${section(
  'No rule matched',
  'Nothing recognised these, so they landed in `Lainnya`. Most worth reviewing.',
  byConfidence('fallback'),
)}`;
}
