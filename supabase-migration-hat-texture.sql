-- Add hat_texture to clothing_items. Mirrors bag_texture: texture is
-- orthogonal to material and carries its own styling signal — a felt
-- fedora reads polished, a knit beanie reads cozy, a straw boater reads
-- summer-brunch. Used by the suggest endpoint to match hats to occasion
-- and mood, and by the analyze endpoint to capture from item photos.

alter table clothing_items
  add column if not exists hat_texture text
    check (hat_texture in (
      'felt',
      'straw',
      'knit',
      'canvas',
      'leather',
      'velvet',
      'other'
    ));

-- PostgREST needs to re-read the schema so the new column is visible.
notify pgrst, 'reload schema';
