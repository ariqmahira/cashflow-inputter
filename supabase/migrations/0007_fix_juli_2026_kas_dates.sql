-- Correct the two `Juli 2026` kas rows, which the migration dated 1 July.
--
-- The sheet recorded both top-ups with no date at all. Date inference works within a column,
-- and that sheet's income column had no dated row anywhere to inherit from, so it fell back
-- to the first of the month — even though the expense column beside it was full of real July
-- dates. The migration pipeline has since been taught to look across both columns before
-- falling back; this corrects the rows already loaded.
--
-- 24 July is the inference, and it is the same one every other month supports: the 24th is
-- the second most common top-up day in the whole history, and every neighbouring month lands
-- between the 18th and the 26th. 1 July matches nothing.
--
-- Guarded on the date it expects, so re-running changes nothing.

with fix (ref, expected, corrected_to) as (
  values
    ('''Juli 2026''!N5', date '2026-07-01', date '2026-07-24'),
    ('''Juli 2026''!N6', date '2026-07-01', date '2026-07-24')
)
update entries e
   set occurred_on = f.corrected_to,
       -- Still inferred: a better guess is still a guess, and the app should keep saying so.
       date_inferred = true,
       note = coalesce(e.note, '') || ' — tanggal dikoreksi ke 24/07'
  from fix f
 where e.legacy_ref = f.ref
   and e.kind = 'contribution'
   and e.occurred_on = f.expected;
