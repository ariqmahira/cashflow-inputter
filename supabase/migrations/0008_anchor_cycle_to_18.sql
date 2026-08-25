-- Move the cycle anchor from the 25th to the 18th.
--
-- The 25th was chosen from the single most common top-up day, but the full history says the
-- distribution matters more than the mode:
--
--     day:  18:1  19:2  20:2  21:6  22:1  23:7  24:10  25:22  26:3
--     before the 25th: 32        on or after: 25
--
-- With an anchor of 25, a top-up on the 24th funds the cycle that *ends* that day rather
-- than the one starting tomorrow, so 32 of 57 top-ups were credited a cycle early. That is
-- what left 25 Jul – 24 Aug with no kas while other cycles showed three.
--
-- At 18, every top-up in the record lands inside the cycle it pays for, 0–8 days in, and
-- every cycle from November 2025 to August 2026 comes out with exactly one Ariq and one Ika.
--
-- Nothing about the money changes — this only decides which cycle each date belongs to.
-- Reverting is `update settings set cycle_anchor_day = 25`.

update settings set cycle_anchor_day = 18, updated_at = now();

-- Keep a fresh install consistent with this one.
alter table settings alter column cycle_anchor_day set default 18;
