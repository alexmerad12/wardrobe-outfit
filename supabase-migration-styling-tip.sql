-- Add styling_tip to outfits + the today_outfit / recent_outfits copies.
-- styling_tip is a short, concrete how-to-wear sentence ("tuck the front
-- in, roll the cuffs once, blazer worn open") that complements the
-- existing reasoning ("the why").
--
-- Run this once in Supabase SQL editor.

alter table outfits add column if not exists styling_tip text;
alter table today_outfit add column if not exists styling_tip text;
alter table recent_outfits add column if not exists styling_tip text;
