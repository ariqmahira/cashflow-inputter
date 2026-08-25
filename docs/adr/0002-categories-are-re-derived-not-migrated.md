# 2. Categories are re-derived from the merchant, not migrated

Date: 2026-08-22

## Status

Accepted

## Context

The spreadsheet has a `Jenis Pengeluaran` column. The obvious migration maps its five values
onto the new category list and moves on.

That column cannot be trusted. `Makan` ("food") covers 218 of 292 rows — 75% — and by
inspection it has become the value you pick when you are not thinking about it:

- `XXI` 145,000 at Metropole — a cinema ticket, filed as `Makan`
- `LOKER MAHAL` 36,000 at GBK — a locker, filed as `Makan`
- `Juli 2026` row 15, `Mie Aceh` 105,000 — no category at all

Meanwhile `Gocar` and `Grab Car` sit under `Hiburan` ("entertainment") in the older sheets.

The whole point of the ten-category redesign is that a budget on `Makan` cannot distinguish a
15,000 packet of crackers from a 274,000 dinner. Carrying the old values across would import
the exact problem the redesign exists to fix, and every historical row would need
re-categorizing by hand afterwards.

## Decision

Ignore `Jenis Pengeluaran` entirely. Derive each row's category from its canonical **Merchant**
instead, in three layers of decreasing confidence: an explicit hand-checked mapping, then a
keyword rule on the merchant name, then `Lainnya`.

Every row where the derived category disagrees with the sheet is written to
`out/categories-report.md`, grouped by which layer decided it.

## Consequences

**Good.** Categories mean something from day one. 240 of 289 expenses were re-filed, only
three landed in the fallback, and the same merchant now always gets the same category — which
is also what makes autocomplete pre-fill correctly on the entry form.

**Bad, and worth being plain about:** the app's category totals **will not match the
spreadsheet's**, and that is not a bug. Anyone comparing the two will find `Hiburan` and
`Makan` substantially different. Only the *money* reconciles — that is checked per sheet
against the workbook's own cached `SUM`, and the migration aborts if it disagrees.

Some derivations are certainly wrong. `Qq`, `shu` and `Nika` are one-off merchant names
nothing recognised, and they sit in `Lainnya`.

**Reversibility: poor for the data, good for the rules.** Every row keeps its `legacy_ref`
pointing at the spreadsheet cell it came from, permanently, so the original value can always
be looked up. But re-running the migration over a ledger that has since been edited by hand
would overwrite those corrections.

The rules themselves live in `scripts/migrate/categories.mts` and are cheap to change; a
wrong category is fixed in the app in one tap.
