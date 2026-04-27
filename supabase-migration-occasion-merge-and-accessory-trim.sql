-- Trims the taxonomy ahead of app-store launch:
--
-- 1. Merges duplicate occasions (no styling-rule difference between them):
--      hangout → casual
--      sport   → outdoor
--    Touches both clothing_items.occasions[] and outfits.occasions[].
--
-- 2. Hard-deletes jewelry and watch from the wardrobe — these don't
--    drive outfit composition the way other accessories do, and the
--    extra subcategories made the UI heavier without much payoff.
--    Outfits that referenced these items will keep the row but their
--    item_ids array will contain orphan IDs; the favorites fetch
--    already filters out unresolved IDs at read time.
--
-- Run order matters: replace strings first, then dedupe (in case an
-- item already had BOTH 'hangout' and 'casual' tagged — without dedupe
-- it would end up with ['casual', 'casual']).

begin;

-- ───────────────────────────── clothing_items ─────────────────────────────

update public.clothing_items
   set occasions = array_replace(occasions, 'hangout', 'casual')
 where 'hangout' = any(occasions);

update public.clothing_items
   set occasions = array_replace(occasions, 'sport', 'outdoor')
 where 'sport' = any(occasions);

update public.clothing_items
   set occasions = (select array_agg(distinct elem) from unnest(occasions) elem)
 where occasions is not null
   and array_length(occasions, 1) > 0;

-- Hard delete jewelry + watch items.
delete from public.clothing_items
 where subcategory in ('jewelry', 'watch');

-- ───────────────────────────── outfits ─────────────────────────────

update public.outfits
   set occasions = array_replace(occasions, 'hangout', 'casual')
 where 'hangout' = any(occasions);

update public.outfits
   set occasions = array_replace(occasions, 'sport', 'outdoor')
 where 'sport' = any(occasions);

update public.outfits
   set occasions = (select array_agg(distinct elem) from unnest(occasions) elem)
 where occasions is not null
   and array_length(occasions, 1) > 0;

commit;
