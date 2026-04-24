-- Add bag_texture to clothing_items. Texture is orthogonal to material
-- (a quilted leather bag reads very differently from a smooth leather
-- bag) and carries its own styling signal: quilted + chain = evening /
-- Chanel flap vibes, woven = summer / French casual, croc-embossed =
-- polished / business, etc.

alter table clothing_items
  add column if not exists bag_texture text
    check (bag_texture in (
      'smooth',
      'woven',
      'quilted',
      'pebbled',
      'croc-embossed',
      'snake-embossed',
      'fringed',
      'other'
    ));

-- PostgREST needs to re-read the schema so the new column is visible.
notify pgrst, 'reload schema';
