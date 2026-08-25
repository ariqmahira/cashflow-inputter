/**
 * Postgres connection settings, shared by the migration runner and the data loader.
 *
 * ## Why this file exists at all
 *
 * Supabase issues its database certificates from its own private root ("Supabase Root 2021
 * CA"), which is deliberately not in any public trust store. Meanwhile `pg` v8.16+ treats
 * `sslmode=require` as `verify-full`, so the connection strings Supabase itself hands out
 * fail against Node's default trust store with `SELF_SIGNED_CERT_IN_CHAIN`.
 *
 * There are exactly two honest ways out, and the difference matters:
 *
 * - **Pin the CA** — download it from the Supabase dashboard (Settings → Database → SSL
 *   Configuration), point `SUPABASE_CA_CERT` at the file, and the chain is fully verified.
 *   This is the only option that resists an active man-in-the-middle.
 * - **Encrypt without verifying** — libpq's own `sslmode=require` semantics. The traffic is
 *   encrypted; the chain is not checked. This is the default because it is what works out
 *   of the box, not because it is equivalent.
 *
 * Extracting the root from the chain the server presents would be circular and is not an
 * option. Whichever mode is in use, `describeSsl()` says so out loud rather than letting a
 * downgrade pass unnoticed.
 */

import { readFileSync } from 'node:fs';
import type { ClientConfig } from 'pg';

export type DbConnection = {
  config: ClientConfig;
  verified: boolean;
  description: string;
};

/**
 * Builds connection settings from the environment.
 *
 * Prefers the non-pooling URL: DDL and bulk transactional work belong on a direct session,
 * not through the transaction pooler.
 */
export function dbConnection(): DbConnection {
  const url =
    process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

  if (!url) {
    throw new Error(
      'No database URL found. Expected POSTGRES_URL_NON_POOLING (or DATABASE_URL).\n' +
        'Run with: npx tsx --env-file=.env.local <script>',
    );
  }

  // `sslmode` in the connection string takes precedence over the `ssl` option object, and
  // pg v8.16+ reads `require` as `verify-full`. Strip it so the settings below are what
  // actually apply, rather than being silently ignored.
  const parsed = new URL(url);
  parsed.searchParams.delete('sslmode');
  const connectionString = parsed.toString();

  const caPath = process.env.SUPABASE_CA_CERT;
  if (caPath) {
    const ca = readFileSync(caPath, 'utf8');
    return {
      // The certificate is a wildcard on *.pooler.supabase.com, so verify-full works once
      // the Supabase root is trusted.
      config: { connectionString, ssl: { ca, rejectUnauthorized: true } },
      verified: true,
      description: `TLS verified against ${caPath}`,
    };
  }

  return {
    config: { connectionString, ssl: { rejectUnauthorized: false } },
    verified: false,
    description:
      'TLS encrypted but NOT verified (no SUPABASE_CA_CERT set).\n' +
      '  To verify: download the CA from Supabase dashboard → Settings → Database →\n' +
      '  SSL Configuration, then set SUPABASE_CA_CERT=/path/to/prod-ca.crt',
  };
}

/** Prints the TLS posture so an unverified connection is never silent. */
export function describeSsl(conn: DbConnection): void {
  console.log(`${conn.verified ? 'ssl' : 'ssl (!)'}   ${conn.description}\n`);
}
