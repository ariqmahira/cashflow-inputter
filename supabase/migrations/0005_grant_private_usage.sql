-- Let the `authenticated` role reach `private.is_member()`.
--
-- Migration 0002 granted EXECUTE on the function but never granted USAGE on the schema
-- holding it. Postgres requires both: without schema USAGE the call fails with
-- `permission denied for schema private` before the EXECUTE grant is even consulted.
--
-- Because every RLS policy on every table calls this function, the effect was total — not
-- "the app shows no data" but "every query errors out". It surfaced only when connecting as
-- the real `authenticated` role; the pglite schema tests run as superuser, which bypasses
-- the check entirely, so they passed throughout.
--
-- USAGE on the schema is not access to what is in it. `private.schema_migrations` has no
-- grants of its own and stays unreadable; the revoke below states that rather than leaving
-- it to the default.
grant usage on schema private to authenticated;

revoke all on all tables in schema private from authenticated, anon;
alter default privileges in schema private revoke all on tables from authenticated, anon;

-- `anon` gets nothing here either: an unauthenticated caller has no reason to ask whether it
-- is a member.
revoke all on schema private from anon;
