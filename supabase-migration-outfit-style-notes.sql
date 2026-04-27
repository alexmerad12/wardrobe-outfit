-- Adds a free-text style_notes field to saved outfits.
--
-- Why: when the user saves a custom outfit, the create dialog now lets
-- them jot down what they love about the look ("the cinched waist makes
-- this work", "love it with the gold hoops"). The note flows back into
-- the AI suggest prompt so future suggestions reflect *why* the user
-- liked the outfit, not just the items in it.
--
-- 280 char cap matches the textarea maxLength on the client.

alter table public.outfits
  add column if not exists style_notes text;
