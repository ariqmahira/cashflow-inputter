-- Correct four kas rows that carry a stale date.
--
-- When the monthly sheets were duplicated, the income rows were copied with them and their
-- dates were never updated. `Februari 2026` and `Maret 2026` both ended up holding January's
-- date:
--
--     'Januari 2026'!N5,N6   24/01/2026   correct
--     'Februari 2026'!N5,N6  24/01/2026   belongs to February
--     'Maret 2026'!N6        24/01/2026   belongs to March
--     'Maret 2026'!N5        18/02/2026   belongs to March
--
-- The effect was that contributions piled into the 25 Dec – 24 Jan cycle while
-- 25 Feb – 24 Mar came out empty. No money was missing — all fourteen rows for the seven
-- cycles are present — but the cycles they were filed under were wrong, so the jar and the
-- history read wrong for those months.
--
-- Only the month changes. The day is taken as recorded, since the pattern (24th, 18th)
-- matches how these top-ups actually land.
--
-- Each update is guarded on the date it expects to find, so re-running changes nothing and a
-- row edited by hand since is left alone rather than overwritten.

with fix (ref, expected, corrected_to) as (
  values
    ('''Februari 2026''!N5', date '2026-01-24', date '2026-02-24'),
    ('''Februari 2026''!N6', date '2026-01-24', date '2026-02-24'),
    ('''Maret 2026''!N6',    date '2026-01-24', date '2026-03-24'),
    ('''Maret 2026''!N5',    date '2026-02-18', date '2026-03-18')
)
update entries e
   set occurred_on = f.corrected_to,
       note = coalesce(e.note, '') || ' — tanggal dikoreksi dari ' || f.expected::text
  from fix f
 where e.legacy_ref = f.ref
   and e.kind = 'contribution'
   and e.occurred_on = f.expected;
