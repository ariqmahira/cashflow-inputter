-- Revoke the anonymous role's access to the ledger.
--
-- Supabase grants `anon` and `authenticated` broad table privileges on `public` by default,
-- via both direct grants and ALTER DEFAULT PRIVILEGES. Migration 0002 never granted anything
-- to `anon`, but 84 grants were present in the live database regardless — they came with the
-- project.
--
-- RLS already makes this harmless in practice: every policy is `to authenticated`, so an
-- anonymous caller matches no policy and reads back nothing. This migration is defence in
-- depth. Nobody signed out has any business reaching these tables at all, and a future
-- policy added without a `to` clause should not silently become public.
--
-- Note for anyone reading the pglite schema tests: they cannot catch this. Supabase's default
-- privileges do not exist in a bare Postgres, so `anon` starts with nothing there and the
-- test passes either way. This file is the real guarantee.

-- Stop future tables and functions in `public` from being granted to anon automatically.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- And remove what is already there.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on schema public from anon;
