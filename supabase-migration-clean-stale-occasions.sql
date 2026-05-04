-- Strips any occasion value from clothing_items.occasions and
-- outfits.occasions that isn't on the current Occasion enum allowlist.
--
-- Background: an item edited before the occasion-merge migration ran
-- (or with a typo from manual editing) can carry a legacy occasion
-- value that no longer exists in the enum (e.g. "hangout", "sport",
-- "errands", "gym"). The view-mode UI rendered these as empty chips
-- — fixed defensively in commit (TBD), but cleaning the underlying
-- data prevents re-saves from re-broadcasting the stale value.
--
-- Both clothing_items.occasions and outfits.occasions are text[]
-- (verified via the existing occasion-merge migration that uses
-- array_replace). Filter each row's array down to only valid values.

begin;

-- Diagnostic — uncomment to see which rows will be touched before
-- running the UPDATEs. Returns id + name + the offending values.
-- select id, name, occasions
--   from public.clothing_items
--  where exists (
--    select 1 from unnest(occasions) as x
--     where x != all(array[
--       'at-home','casual','brunch','outdoor','travel',
--       'dinner-out','work','date','party','formal'
--     ]::text[])
--  );

-- ───────────────────────────── clothing_items.occasions ─────────────────────────────

update public.clothing_items
   set occasions = array(
     select x from unnest(occasions) as x
      where x = any(array[
        'at-home','casual','brunch','outdoor','travel',
        'dinner-out','work','date','party','formal'
      ]::text[])
   )
 where exists (
   select 1 from unnest(occasions) as x
    where x != all(array[
      'at-home','casual','brunch','outdoor','travel',
      'dinner-out','work','date','party','formal'
    ]::text[])
 );

-- ───────────────────────────── outfits.occasions ─────────────────────────────

update public.outfits
   set occasions = array(
     select x from unnest(occasions) as x
      where x = any(array[
        'at-home','casual','brunch','outdoor','travel',
        'dinner-out','work','date','party','formal'
      ]::text[])
   )
 where exists (
   select 1 from unnest(occasions) as x
    where x != all(array[
      'at-home','casual','brunch','outdoor','travel',
      'dinner-out','work','date','party','formal'
    ]::text[])
 );

commit;

notify pgrst, 'reload schema';
