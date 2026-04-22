-- Allow 0.5-step warmth ratings.
--
-- The UI slider now steps in 0.5 increments (1, 1.5, 2, 2.5, ..., 5) so a
-- thin cardigan can read 2.5 and a heavy knit 4.5 without being forced
-- into the nearest integer bucket. The existing `integer` column rejects
-- these values with "invalid input syntax for type integer: \"1.5\"".
--
-- Switch to `numeric(3,1)` — enough range + exactly one decimal place.
-- The old check constraint stays valid (1.0–5.0 still passes "between 1
-- and 5") but we drop and recreate it so it runs against the new type.

alter table clothing_items
  drop constraint if exists clothing_items_warmth_rating_check;

alter table clothing_items
  alter column warmth_rating type numeric(3, 1) using warmth_rating::numeric;

alter table clothing_items
  add constraint clothing_items_warmth_rating_check
    check (warmth_rating between 1 and 5);
