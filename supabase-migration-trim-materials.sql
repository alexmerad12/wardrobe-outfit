-- Trims the material taxonomy from 36 → 25 entries. The dropped values
-- were mostly niche synthetics (modal/tencel/rayon-viscose), weave names
-- (twill), or qualities masquerading as materials (sheer, spandex). Each
-- one collapses into a sensible neighbour so existing items keep a valid
-- material tag with no information loss for styling purposes.
--
-- Mappings:
--   faux-suede     → suede
--   jersey         → knit
--   modal          → polyester
--   rayon-viscose  → polyester
--   tencel         → polyester
--   spandex        → polyester
--   twill          → cotton          (most twill in the wardrobe is cotton)
--   mesh           → other
--   rubber         → other           (mostly shoe soles, not garments)
--   sheer          → other
--   tulle          → other
--
-- material is jsonb on clothing_items (Material | Material[] union — jsonb
-- holds either shape). The replace approach below works for both:
-- single-string "modal" and array ["cotton","modal"]. After remap, any
-- array that now has duplicates ([..."cotton","cotton"...]) gets deduped.

begin;

-- ───────────────────────────── data remap ─────────────────────────────
-- Cast the jsonb to text, do a literal string replace on the quoted
-- values (so we only match the enum string, not partial matches inside
-- another value), then cast back to jsonb.

update public.clothing_items
   set material = replace(material::text, '"faux-suede"', '"suede"')::jsonb
 where material::text like '%"faux-suede"%';

update public.clothing_items
   set material = replace(material::text, '"jersey"', '"knit"')::jsonb
 where material::text like '%"jersey"%';

update public.clothing_items
   set material = replace(material::text, '"modal"', '"polyester"')::jsonb
 where material::text like '%"modal"%';

update public.clothing_items
   set material = replace(material::text, '"rayon-viscose"', '"polyester"')::jsonb
 where material::text like '%"rayon-viscose"%';

update public.clothing_items
   set material = replace(material::text, '"tencel"', '"polyester"')::jsonb
 where material::text like '%"tencel"%';

update public.clothing_items
   set material = replace(material::text, '"spandex"', '"polyester"')::jsonb
 where material::text like '%"spandex"%';

update public.clothing_items
   set material = replace(material::text, '"twill"', '"cotton"')::jsonb
 where material::text like '%"twill"%';

update public.clothing_items
   set material = replace(material::text, '"mesh"', '"other"')::jsonb
 where material::text like '%"mesh"%';

update public.clothing_items
   set material = replace(material::text, '"rubber"', '"other"')::jsonb
 where material::text like '%"rubber"%';

update public.clothing_items
   set material = replace(material::text, '"sheer"', '"other"')::jsonb
 where material::text like '%"sheer"%';

update public.clothing_items
   set material = replace(material::text, '"tulle"', '"other"')::jsonb
 where material::text like '%"tulle"%';

-- Dedupe: only applies to array-shaped values that may now have duplicates
-- (e.g. an item that was tagged ['cotton','twill'] is now ['cotton','cotton']).
-- jsonb_typeof = 'array' filters out single-string values, which can't
-- have duplicates anyway.
update public.clothing_items
   set material = (
     select jsonb_agg(distinct elem)
       from jsonb_array_elements_text(material) elem
   )
 where jsonb_typeof(material) = 'array';

commit;

notify pgrst, 'reload schema';
