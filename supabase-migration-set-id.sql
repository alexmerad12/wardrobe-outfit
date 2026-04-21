-- Add set_id to clothing_items so two or more coordinated pieces can be
-- linked (matching blazer + pants, tracksuits, etc.). The value is an
-- arbitrary UUID shared by every item in the same set.
--
-- Run this once in Supabase SQL editor.

alter table clothing_items
  add column if not exists set_id uuid;

create index if not exists clothing_items_set_id_idx
  on clothing_items (set_id);
