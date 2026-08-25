-- Row level security and Data API exposure.
--
-- This is a JOINT ledger, not per-user data: both members see and edit everything, by
-- design. So the rule is membership, not ownership — "are you one of the two people who
-- fund this pool?" — and there is deliberately no per-row owner check. Adding one would
-- mean Ika could not fix a typo in an entry Ariq typed, which is not how a shared household
-- ledger works.
--
-- The gate is the `members` table: an account gets access only once its `auth_user_id` has
-- been linked to a member row, which is a deliberate manual step. A stranger who signs up
-- reaches an empty database rather than someone else's finances.

-- ---------------------------------------------------------------------------------------
-- Membership predicate
-- ---------------------------------------------------------------------------------------

-- Lives in `private`, not `public`, on purpose. Postgres grants EXECUTE to PUBLIC on every
-- new function, so a SECURITY DEFINER function in an API-exposed schema is a public
-- endpoint that bypasses RLS. Keeping it out of `public` means it is not reachable through
-- the Data API at all.
create schema if not exists private;

-- SECURITY DEFINER is genuinely required here: the function reads `members`, which is itself
-- behind RLS, and a policy that queries its own table would recurse. The body checks
-- auth.uid() and returns nothing but a boolean about the caller themselves.
create or replace function private.is_member() returns boolean
language sql
stable
security definer
-- Pinned so a caller cannot shadow `members` with a table of their own.
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from members where auth_user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_member() from public;
grant execute on function private.is_member() to authenticated;

-- ---------------------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------------------

alter table members                   enable row level security;
alter table categories                enable row level security;
alter table places                    enable row level security;
alter table merchants                 enable row level security;
alter table entries                   enable row level security;
alter table reimbursements            enable row level security;
alter table reimbursement_settlements enable row level security;
alter table budgets                   enable row level security;
alter table recurring_rules           enable row level security;
alter table settings                  enable row level security;

-- `to authenticated` names the role; `private.is_member()` is the authorization predicate.
-- The role alone would not be enough — anonymous sign-ins also carry the `authenticated`
-- role, so role without predicate is authentication pretending to be authorization.
do $$
declare t text;
begin
  foreach t in array array[
    'members', 'categories', 'places', 'merchants', 'entries',
    'reimbursements', 'reimbursement_settlements', 'budgets',
    'recurring_rules', 'settings'
  ]
  loop
    execute format(
      'create policy %I on %I for all to authenticated
         using (private.is_member()) with check (private.is_member())',
      t || '_member_access', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Data API exposure
-- ---------------------------------------------------------------------------------------

-- Since 2026-05-30 new tables in `public` are NOT exposed to the Data API automatically, so
-- these grants are required rather than redundant. Without them PostgREST returns empty
-- results with no error, which is a miserable thing to debug.
--
-- Nothing is granted to `anon`: every table requires membership, and an unauthenticated
-- caller has no business reaching any of it.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Views run as their owner by default, which would bypass every policy above.
-- `security_invoker` makes them honour the caller's own access instead.
alter view entry_spending set (security_invoker = true);
alter view pool_balance   set (security_invoker = true);
