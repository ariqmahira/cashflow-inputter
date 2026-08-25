# Kas

A joint cashflow ledger for two people, rebuilt from a Google Sheets workbook.

Next.js (static export) · Capacitor (Android) · Supabase · Vercel

The vocabulary this project uses — Pool, Contribution, Settlement, Reimbursement, Cycle — is
defined in [CONTEXT.md](./CONTEXT.md). It is worth two minutes before reading the code,
because a Contribution is deliberately **not** income and the difference runs through
everything.

## Layout

```
src/app/         screens: / · /tambah · /riwayat · /anggaran · /pengaturan
src/components/  UI, including the kas jar
src/lib/         cycle + budget arithmetic, money formatting, Supabase access
scripts/migrate/ one-time migration from the spreadsheet
scripts/db/      migration runner
supabase/        SQL migrations and schema tests
docs/adr/        the two decisions worth explaining
```

## Setup

```bash
npm install
vercel env pull .env.local --yes     # Supabase keys, from the Marketplace integration
npm run db:migrate                   # apply supabase/migrations/*.sql
npm run dev
```

### Linking an account

The database is closed until an auth user is linked to a member row. This is a deliberate
manual step — an unlinked account reaches an empty database rather than someone else's
finances.

After signing in once, take the user id from Supabase → Authentication → Users:

```sql
update members set auth_user_id = '<uuid>' where display_name = 'Ariq';
```

### Magic link redirects

Add both of these under Supabase → Authentication → URL Configuration → Redirect URLs, or
sign-in will not return:

- `http://localhost:3000/` (development)
- `id.cashflow.app://auth/callback` (the Android shell)

## Migrating the spreadsheet

Only needed when there is a newer export of the workbook.

```bash
npm run migrate -- "Cashflow Bab & Bi_YYYYMMDD.xlsx"   # writes scripts/migrate/out/
npm run migrate:load                                    # loads it into Supabase
```

The migration **aborts** unless every monthly sheet's total matches the `SUM` the workbook
itself cached. Read `out/summary.md` before loading; `out/categories-report.md` lists every
row whose category changed, which is most of them — see
[ADR 0002](./docs/adr/0002-categories-are-re-derived-not-migrated.md) for why.

Loading is idempotent, keyed on the originating spreadsheet cell, so re-running is safe.

## Android

```bash
npm run android:sync    # builds the static export and syncs it into the shell
npm run android:open    # opens Android Studio to build the APK
```

Needs Android Studio. No Play listing, no store review: the APK installs directly. iOS is
not built — private installs still require a paid Apple Developer account.

## Tests

```bash
npm test        # 147 tests
npm run typecheck
```

Covers the migration pipeline, the cycle and budget arithmetic, and the database schema.
The schema tests run real Postgres in-process via pglite, so no database is needed to run
them — including in CI.

There are no UI tests. That was a deliberate call: the money math and the migration are
where a silent bug does lasting damage.

## Things worth knowing

**Dates are strings.** `YYYY-MM-DD`, never `Date`. A purchase happened on the 14th and stays
the 14th regardless of timezone; `Date` is a UTC instant and quietly shifts the calendar day.
See `src/lib/plain-date.ts`.

**Amounts are whole rupiah.** `bigint` in Postgres, no fractional part anywhere.

**116 dates are guessed.** Two in five rows in the old spreadsheet had no date at all. Those
carry `date_inferred` and show a marker in Riwayat so they can be corrected.

**Cycles run 25th to 24th**, not calendar months, because that is when the kas is topped up.
The anchor is capped at 28 — a 29th does not exist every February.

**The database connection is encrypted but unverified** unless `SUPABASE_CA_CERT` points at
the CA from Supabase → Settings → Database → SSL Configuration. Supabase signs with a private
root that is not in any public trust store. See `scripts/db/connect.mts`.
