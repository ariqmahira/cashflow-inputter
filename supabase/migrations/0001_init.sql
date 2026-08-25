-- Cashflow: initial schema.
--
-- A joint "kas" ledger for two people. The money model is deliberately not the usual
-- income/expense pair, because a kas top-up is not income — it is funding a shared pool out
-- of money that was already someone's. Conflating the two makes "net cashflow" answer a
-- question nobody asked. See CONTEXT.md for the full glossary.
--
-- Amounts are `bigint` rupiah. IDR has no subunit in practice, every value in two years of
-- source data is a whole number, and floating point has no business in a ledger.
--
-- Cycle arithmetic lives in TypeScript (`src/lib/cycle.ts`), NOT here. The whole dataset is
-- a few hundred rows and syncs to the device in full, so aggregation happens client-side.
-- Keeping the cycle rules in one language avoids two implementations drifting apart.

-- `gen_random_uuid()` is core Postgres since 13, so no pgcrypto extension is needed.

-- ---------------------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------------------

create table members (
  id            uuid primary key default gen_random_uuid(),
  -- Null until that person first signs in; the two member rows are seeded ahead of time so
  -- historical contributions can be attributed before anyone has an account.
  auth_user_id  uuid unique,
  display_name  text not null unique,
  created_at    timestamptz not null default now()
);

create table categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int  not null,
  icon        text
);

create table places (
  id              uuid primary key default gen_random_uuid(),
  canonical_name  text not null unique,
  -- Every spelling seen in the source, so an old value still resolves and autocomplete can
  -- match on what the user actually types ("GI" finds "Grand Indonesia").
  aliases         text[] not null default '{}'
);

create table merchants (
  id                   uuid primary key default gen_random_uuid(),
  canonical_name       text not null unique,
  aliases              text[] not null default '{}',
  -- Drives auto-categorization: picking a known merchant pre-fills this.
  default_category_id  uuid references categories (id) on delete set null
);

-- ---------------------------------------------------------------------------------------
-- Entries
-- ---------------------------------------------------------------------------------------

create type entry_kind as enum (
  'expense',       -- money leaving the pool for shared spending
  'contribution',  -- a member funding the pool (negative when taking funding back out)
  'settlement'     -- money arriving from outside that repays a specific expense
);

create type entry_source as enum ('manual', 'migration');

create table entries (
  id             uuid primary key default gen_random_uuid(),
  kind           entry_kind not null,

  occurred_on    date not null,
  -- True when the date was inferred during migration rather than recorded. Roughly two in
  -- five migrated expenses have one; the app shows a marker so they can be corrected.
  date_inferred  boolean not null default false,

  amount_idr     bigint not null,

  merchant_id    uuid references merchants (id) on delete set null,
  place_id       uuid references places (id) on delete set null,
  category_id    uuid references categories (id) on delete restrict,
  member_id      uuid references members (id) on delete restrict,

  note           text,
  source         entry_source not null default 'manual',
  -- The originating spreadsheet cell, e.g. `'September 2024'!H5`. Unique, so re-running the
  -- import cannot double-insert. Kept permanently: category values no longer match the
  -- source, so this is the only way back to what a row originally said.
  legacy_ref     text unique,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Soft delete. Sync is last-write-wins, and a tombstone survives a merge where a hard
  -- delete would silently reappear from the other device.
  deleted_at     timestamptz,

  -- An expense is the only kind that is categorized spending.
  constraint expense_shape check (
    kind <> 'expense' or (category_id is not null and amount_idr > 0)
  ),
  -- A contribution belongs to a member and touches no category. It may be negative, which
  -- is how money is taken back out of the pool without being recorded as spending.
  constraint contribution_shape check (
    kind <> 'contribution' or (
      member_id is not null
      and category_id is null and merchant_id is null and place_id is null
      and amount_idr <> 0
    )
  ),
  -- A settlement repays an expense. The payer is often unknown, so member_id is optional.
  constraint settlement_shape check (
    kind <> 'settlement' or (
      category_id is null and merchant_id is null and amount_idr > 0
    )
  )
);

create index entries_occurred_on_idx on entries (occurred_on) where deleted_at is null;
create index entries_kind_idx        on entries (kind)        where deleted_at is null;
create index entries_category_idx    on entries (category_id) where deleted_at is null;
create index entries_updated_at_idx  on entries (updated_at);

-- ---------------------------------------------------------------------------------------
-- Reimbursements
-- ---------------------------------------------------------------------------------------

-- Money that passed through the pool without being shared spending. Carries its own amount
-- rather than being a bare link, because repayment is often partial: a 1,794,000 purchase
-- with 900,000 repaid leaves 894,000 that really was shared spending and must still count
-- against a budget.
create table reimbursements (
  id                uuid primary key default gen_random_uuid(),
  expense_entry_id  uuid not null unique references entries (id) on delete cascade,
  amount_idr        bigint not null check (amount_idr > 0),
  note              text,
  created_at        timestamptz not null default now()
);

-- One reimbursement can be repaid across several incoming rows.
create table reimbursement_settlements (
  reimbursement_id     uuid not null references reimbursements (id) on delete cascade,
  settlement_entry_id  uuid not null references entries (id) on delete cascade,
  primary key (reimbursement_id, settlement_entry_id)
);

-- ---------------------------------------------------------------------------------------
-- Budgets, recurring rules, settings
-- ---------------------------------------------------------------------------------------

create table budgets (
  id                    uuid primary key default gen_random_uuid(),
  category_id           uuid not null references categories (id) on delete cascade,
  amount_idr            bigint not null check (amount_idr >= 0),
  -- The cycle this limit takes effect from, identified by its start date. Budgets are
  -- versioned rather than overwritten so past cycles keep the limit they were judged
  -- against.
  effective_from_cycle  date not null,
  created_at            timestamptz not null default now(),
  unique (category_id, effective_from_cycle)
);

create table recurring_rules (
  id            uuid primary key default gen_random_uuid(),
  kind          entry_kind not null,
  amount_idr    bigint not null check (amount_idr > 0),
  day_of_month  int not null check (day_of_month between 1 and 28),
  member_id     uuid references members (id) on delete cascade,
  category_id   uuid references categories (id) on delete cascade,
  label         text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Single-row table. The `only_one_row` check is what makes it a singleton.
create table settings (
  only_one_row      boolean primary key default true check (only_one_row),
  -- Budget periods run anchor-day to anchor-day. Capped at 28 because a 29th, 30th or 31st
  -- does not exist in every month and every workaround makes some cycle mysteriously
  -- shorter.
  cycle_anchor_day  int  not null default 25 check (cycle_anchor_day between 1 and 28),
  warn_threshold    real not null default 0.80 check (warn_threshold > 0 and warn_threshold <= 1),
  updated_at        timestamptz not null default now()
);

insert into settings (only_one_row) values (true);

-- ---------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger entries_touch_updated_at
  before update on entries
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------------------

-- What each expense actually cost the pool, with any repayment removed. This is what
-- budgets consume and what the spending charts read. Clamped at zero so an over-repayment
-- can never show up as negative spending.
create view entry_spending as
select
  e.id,
  e.occurred_on,
  e.category_id,
  e.amount_idr                                          as gross_idr,
  coalesce(r.amount_idr, 0)                             as reimbursed_idr,
  greatest(e.amount_idr - coalesce(r.amount_idr, 0), 0) as net_idr
from entries e
left join reimbursements r on r.expense_entry_id = e.id
where e.kind = 'expense' and e.deleted_at is null;

-- Contributions and settlements in, expenses out, all time. Reimbursed money is not netted
-- off here: it genuinely left the pool and genuinely came back, and both movements exist as
-- their own entries.
create view pool_balance as
select coalesce(sum(
  case when kind = 'expense' then -amount_idr else amount_idr end
), 0)::bigint as balance_idr
from entries
where deleted_at is null;
