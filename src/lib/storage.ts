/**
 * Durable key-value storage, the same on the web and inside the Android shell.
 *
 * ## Why not SQLite
 *
 * The plan called for `@capacitor-community/sqlite`. This is a deliberate departure: the
 * whole ledger is a few hundred rows and is loaded in full anyway, and nothing on the device
 * ever queries it relationally — every derivation in `queries.ts` runs over an in-memory
 * array. SQLite would add a second schema to keep in step with Postgres, on-device
 * migrations, and a native plugin, in exchange for nothing this app does.
 *
 * `@capacitor/preferences` gives durable storage backed by SharedPreferences on Android and
 * localStorage on the web. The snapshot is roughly 100 KB of JSON.
 */

import { Preferences } from '@capacitor/preferences';

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    // A corrupt or unreadable value must never take the app down; the caller falls back to
    // the network, which is the correct answer anyway.
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await Preferences.set({ key, value: JSON.stringify(value) });
  } catch {
    // Storage can be full or blocked. Losing the cache degrades the app to online-only,
    // which is survivable; throwing here would break a save that already succeeded.
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await Preferences.remove({ key });
  } catch {
    /* see above */
  }
}
