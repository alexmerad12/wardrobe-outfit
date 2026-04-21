-- Add 'one-piece' as a valid category and reclassify any existing
-- jumpsuits / overalls that were previously stored under 'dress'.
--
-- Run this once in Supabase SQL editor.

-- 1. Replace the category check constraint to allow 'one-piece'.
alter table clothing_items
  drop constraint if exists clothing_items_category_check;

alter table clothing_items
  add constraint clothing_items_category_check
  check (category in ('top','bottom','dress','one-piece','outerwear','shoes','bag','accessory'));

-- 2. Migrate existing items: anything previously categorized as 'dress'
--    with a jumpsuit / overalls subcategory moves to the new 'one-piece'
--    category. Their subcategory stays the same.
update clothing_items
set category = 'one-piece'
where category = 'dress'
  and subcategory in ('jumpsuit', 'overalls');
