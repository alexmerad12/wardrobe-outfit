-- Phase 2 schema additions:
--   hat_silhouette  — fedora vs baseball vs bucket etc. (gates formality)
--   jewelry_scale   — minimal vs statement (proximity-filter input)
--   scarf_function  — decorative vs functional (head/neck zone accounting)
--   bag_metal_finish — extends metal-sync rule to bag hardware
--   skirt_length    — proper four-tier length for the bottoms/skirt subcategory
--
-- All five are optional (nullable). Existing rows get NULL, the AI fills in
-- new uploads, the user can edit on the item-detail page. Run as one batch.

alter table clothing_items
  add column if not exists hat_silhouette text
    check (hat_silhouette in (
      'baseball','trucker','bucket','fedora','beret','beanie',
      'pillbox','headband','sun-hat','other'
    ));

alter table clothing_items
  add column if not exists jewelry_scale text
    check (jewelry_scale in ('minimal','statement'));

alter table clothing_items
  add column if not exists scarf_function text
    check (scarf_function in ('decorative','functional'));

alter table clothing_items
  add column if not exists bag_metal_finish text
    check (bag_metal_finish in (
      'silver','gold','rose-gold','chrome','matte-silver','matte-gold',
      'brass','bronze','gunmetal','mixed','none'
    ));

alter table clothing_items
  add column if not exists skirt_length text
    check (skirt_length in ('mini','knee-length','midi','maxi'));

notify pgrst, 'reload schema';
