/**
 * Member identity.
 *
 * Two people fund the pool, but they are written thirteen different ways across the income
 * rows — `Kas Ariq`, `Ariq`, `Ariq Cantik`, `Kas Ika`, `Ika Cantik`, `Kas Pacarnya Ariq`
 * ("Ariq's girlfriend") and so on.
 *
 * `Rizka` is Ika. Confirmed by the user; it looks like a third contributor in the raw data
 * and is not one.
 */

import { normalizeKey } from './text.mts';

export const MEMBERS = ['Ariq', 'Ika'] as const;
export type Member = (typeof MEMBERS)[number];

/** Every spelling seen on a contribution row, mapped to the person who wrote it. */
const MEMBER_ALIASES: Record<Member, string[]> = {
  Ariq: ['Kas Ariq', 'Ariq', 'Ariq Cantik', 'Kas Ariq Cantik'],
  Ika: [
    'Kas Ika',
    'Ika',
    'Ika Cantik',
    'Kas Ika Cantik',
    'Kas Pacarnya Ariq',
    'Kas Rizka',
    'Kas Rizka (Beli Tiket)',
  ],
};

const LOOKUP: Map<string, Member> = new Map(
  MEMBERS.flatMap((m) => MEMBER_ALIASES[m].map((a) => [normalizeKey(a), m] as const)),
);

/**
 * Resolves a contribution row's name to a member.
 *
 * Returns null rather than guessing. Unattributed rows are reported, not silently assigned:
 * `sama kaya di atas` ("same as above") names nobody, and inventing an owner for money would
 * be worse than admitting we do not know.
 */
export function resolveMember(name: unknown): Member | null {
  if (typeof name !== 'string') return null;
  return LOOKUP.get(normalizeKey(name)) ?? null;
}
