-- Rollback the unused 'Part of a set' feature: drop the set_id column.
-- Safe even if the previous migration was never applied.
--
-- Run this once in Supabase SQL editor.

drop index if exists clothing_items_set_id_idx;
alter table clothing_items drop column if exists set_id;
