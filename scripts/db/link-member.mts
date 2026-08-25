/**
 * Links a Supabase login to a member of the kas.
 *
 *   npx tsx --env-file=.env.local scripts/db/link-member.mts <email> <member>
 *   npx tsx --env-file=.env.local scripts/db/link-member.mts --list
 *
 * This is the security gate, run once per person. Every RLS policy calls
 * `private.is_member()`, which asks whether any `members` row carries the current
 * `auth.uid()`. Until a login is linked, that is false and the database returns nothing —
 * so a stranger who signs up reaches an empty ledger rather than someone else's finances.
 *
 * The two member rows exist before anyone signs in, because two years of imported
 * contributions had to be attributed to people who did not yet have accounts.
 */

import pg from 'pg';

import { dbConnection, describeSsl } from './connect.mts';

type AuthUser = { id: string; email: string | null };
type Member = { display_name: string; auth_user_id: string | null };

async function list(client: pg.Client): Promise<void> {
  const users = await client.query<AuthUser>(
    'select id, email from auth.users order by created_at',
  );
  const members = await client.query<Member>(
    'select display_name, auth_user_id from members order by display_name',
  );

  console.log('logins (auth.users):');
  if (users.rows.length === 0) console.log('  none yet — sign in through the app first');
  for (const u of users.rows) console.log(`  ${u.id}  ${u.email ?? '(no email)'}`);

  console.log('\nmembers:');
  for (const m of members.rows) {
    const linked = m.auth_user_id
      ? users.rows.find((u) => u.id === m.auth_user_id)?.email ?? m.auth_user_id
      : 'not linked';
    console.log(`  ${m.display_name.padEnd(6)} ${linked}`);
  }
}

async function link(client: pg.Client, email: string, member: string): Promise<void> {
  const user = await client.query<AuthUser>(
    'select id, email from auth.users where lower(email) = lower($1)',
    [email],
  );
  if (user.rows.length === 0) {
    throw new Error(
      `No login found for ${email}. That person needs to sign in through the app once ` +
        'before their account can be linked.',
    );
  }

  const { rows } = await client.query<Member>(
    'select display_name, auth_user_id from members where display_name = $1',
    [member],
  );
  if (rows.length === 0) throw new Error(`No member called "${member}".`);

  // Refuse to silently move a login off someone else's member row.
  const taken = await client.query<Member>(
    'select display_name from members where auth_user_id = $1 and display_name <> $2',
    [user.rows[0].id, member],
  );
  if (taken.rows.length > 0) {
    throw new Error(
      `${email} is already linked to ${taken.rows[0].display_name}. ` +
        'Unlink that first if this is really meant to move.',
    );
  }

  await client.query('update members set auth_user_id = $1 where display_name = $2', [
    user.rows[0].id,
    member,
  ]);
  console.log(`linked  ${email}  ->  ${member}\n`);
}

async function main(): Promise<void> {
  const [a, b] = process.argv.slice(2);
  const conn = dbConnection();
  describeSsl(conn);

  const client = new pg.Client(conn.config);
  await client.connect();
  try {
    if (!a || a === '--list') {
      await list(client);
      return;
    }
    if (!b) {
      console.error('usage: link-member.mts <email> <member>   |   link-member.mts --list');
      process.exit(2);
    }
    await link(client, a, b);
    await list(client);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
