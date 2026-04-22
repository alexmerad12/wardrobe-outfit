-- Add bag_size to clothing_items so we can apply the canonical
-- "bag size scales down as formality rises" styling rule without
-- relying on subcategory alone (a handbag can be any size; a clutch
-- is always small; a tote is always big, but handbag is ambiguous).
--
-- Five tiers: clutch (evening) → small → medium → large → tote.

alter table clothing_items
  add column if not exists bag_size text
    check (bag_size in ('clutch','small','medium','large','tote'));
