-- Reference data the app cannot start without.
--
-- Members are seeded with a null `auth_user_id`: the two people exist in the ledger before
-- either has signed in, which is what lets two years of historical contributions be
-- attributed at import time. Linking an account happens once, by hand, after first sign-in:
--
--   update members set auth_user_id = '<uuid from auth.users>' where display_name = 'Ariq';
--
-- Until that link exists, `is_member()` is false and the database is closed.

insert into members (display_name) values ('Ariq'), ('Ika');

-- The ten categories, in entry-form order — most-used first, so the common case is the
-- shortest reach. Derived from what two years of spending actually contains.
insert into categories (name, sort_order, icon) values
  ('Restoran',         1,  'utensils'),
  ('Kopi & Minuman',   2,  'cup'),
  ('Jajan & Snack',    3,  'cookie'),
  ('Transportasi',     4,  'car'),
  ('Hiburan',          5,  'ticket'),
  ('Groceries',        6,  'basket'),
  ('Foto & Aktivitas', 7,  'camera'),
  ('Belanja',          8,  'bag'),
  ('Hadiah',           9,  'gift'),
  ('Lainnya',          10, 'dots');

-- The kas top-up: the only thing that has recurred in twenty-six months of records. It
-- drives the pool forecast and the "when does it refill" projection. It never auto-posts —
-- the app prompts for confirmation on the day, because the real top-ups land anywhere from
-- the 18th to the 26th.
insert into recurring_rules (kind, amount_idr, day_of_month, member_id, label)
select 'contribution', v.amount, 25, m.id, v.label
from (values
  ('Ariq', 700000::bigint, 'Kas bulanan Ariq'),
  ('Ika',  500000::bigint, 'Kas bulanan Ika')
) as v(member, amount, label)
join members m on m.display_name = v.member;
