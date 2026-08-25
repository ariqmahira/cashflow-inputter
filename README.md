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

## Offline

The app is local-first. The device holds the last known ledger, so a screen renders from
storage before any request is made and works with no connection; the network refreshes it
behind. Saves go into a persisted outbox, appear on screen immediately, and are sent when the
connection returns — entry never waits on the network, which matters because entry happens
standing in a mall.

- `src/lib/storage.ts` — durable key-value, the same on web and Android
- `src/lib/outbox.ts` — the queue of unsent writes, drained in order
- `src/lib/sync.ts` — cache-first reads and optimistic writes

Both halves of a sync are on a deadline. A request that neither succeeds nor fails — a
captive portal, a connection that opens then stalls — would otherwise leave the app unable to
say anything at all: not refreshed, not stale, just waiting. `supabase-js` retries such
requests internally, so without the deadline the promise never settles.

There is **no SQLite on the device**, deliberately, and this departs from the original plan.
The whole ledger is a few hundred rows loaded in full, and nothing on the device queries it
relationally — every derivation runs over an in-memory array. SQLite would add a second
schema to keep in step with Postgres, on-device migrations, and a native plugin, for nothing
this app does.

## Android

```bash
npm run android:sync    # builds the static export and syncs it into the shell
npm run android:open    # opens Android Studio to build the APK
```

**Requires Android Studio and a JDK**, neither of which is needed for anything else here. The
native project is committed (`android/`) — it holds the manifest, the deep-link filter and
the icons — but its build output is not.

`AndroidManifest.xml` registers `id.cashflow.app://auth/callback` so the magic link can return
into the app. That same URL must be listed in Supabase → Authentication → URL Configuration,
or sign-in will not complete.

No Play listing and no store review: the APK installs directly. iOS is not built — private
installs still require a paid Apple Developer account.

## Tests

```bash
npm test        # 161 tests
npm run typecheck
```

Covers the migration pipeline, the cycle and budget arithmetic, the outbox, and the database
schema.
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
