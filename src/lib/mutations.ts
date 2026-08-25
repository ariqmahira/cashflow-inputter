/**
 * Writes.
 *
 * Kept apart from `queries.ts` because Phase 4 treats them very differently: reads will come
 * from the device database, while writes go into an outbox and are drained when the network
 * returns. The call sites should not have to care which.
 */

import { supabase } from './supabase';
import type { PlainDate } from './plain-date';

export type NewExpense = {
  occurredOn: PlainDate;
  amountIdr: number;
  categoryId: string;
  /** Canonical merchant, created on the fly if this is a new one. */
  merchantName: string;
  placeName?: string;
  note?: string;
};

/**
 * Finds a merchant by canonical name or alias, or creates it.
 *
 * Matching on aliases matters: the migration folded `A&W`, `AW` and `Aw` into one merchant,
 * and typing any of them again should reach that same row rather than spawning a duplicate.
 */
async function resolveMerchant(name: string, categoryId: string): Promise<string> {
  const client = supabase();
  const trimmed = name.trim();

  const { data: existing, error: findError } = await client
    .from('merchants')
    .select('id')
    .or(`canonical_name.eq.${trimmed},aliases.cs.{"${trimmed.replace(/"/g, '\\"')}"}`)
    .limit(1);
  if (findError) throw findError;
  if (existing?.length) return existing[0].id;

  const { data, error } = await client
    .from('merchants')
    .insert({ canonical_name: trimmed, aliases: [trimmed], default_category_id: categoryId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function resolvePlace(name: string): Promise<string> {
  const client = supabase();
  const trimmed = name.trim();

  const { data: existing, error: findError } = await client
    .from('places')
    .select('id')
    .or(`canonical_name.eq.${trimmed},aliases.cs.{"${trimmed.replace(/"/g, '\\"')}"}`)
    .limit(1);
  if (findError) throw findError;
  if (existing?.length) return existing[0].id;

  const { data, error } = await client
    .from('places')
    .insert({ canonical_name: trimmed, aliases: [trimmed] })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function addExpense(input: NewExpense): Promise<void> {
  const merchantId = await resolveMerchant(input.merchantName, input.categoryId);
  const placeId = input.placeName?.trim() ? await resolvePlace(input.placeName) : null;

  const { error } = await supabase().from('entries').insert({
    kind: 'expense',
    occurred_on: input.occurredOn,
    amount_idr: input.amountIdr,
    category_id: input.categoryId,
    merchant_id: merchantId,
    place_id: placeId,
    note: input.note?.trim() || null,
    source: 'manual',
  });
  if (error) throw error;
}

export type NewContribution = {
  occurredOn: PlainDate;
  amountIdr: number;
  memberId: string;
  note?: string;
};

export async function addContribution(input: NewContribution): Promise<void> {
  const { error } = await supabase().from('entries').insert({
    kind: 'contribution',
    occurred_on: input.occurredOn,
    amount_idr: input.amountIdr,
    member_id: input.memberId,
    note: input.note?.trim() || null,
    source: 'manual',
  });
  if (error) throw error;
}

/** Soft delete, so a tombstone survives the merge rather than the row reappearing. */
export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase()
    .from('entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function correctDate(id: string, occurredOn: PlainDate): Promise<void> {
  const { error } = await supabase()
    .from('entries')
    // Correcting a guessed date makes it a real one.
    .update({ occurred_on: occurredOn, date_inferred: false })
    .eq('id', id);
  if (error) throw error;
}

export async function setBudget(
  categoryId: string,
  amountIdr: number,
  effectiveFromCycle: PlainDate,
): Promise<void> {
  const { error } = await supabase()
    .from('budgets')
    .upsert(
      { category_id: categoryId, amount_idr: amountIdr, effective_from_cycle: effectiveFromCycle },
      { onConflict: 'category_id,effective_from_cycle' },
    );
  if (error) throw error;
}
