-- Add sunglasses_style to clothing_items. Style of sunglasses is a
-- strong styling signal — aviator (rugged / casual), wayfarer (icon-
-- ically chic), cat-eye (feminine / vintage), oversized (Jackie-O /
-- glamorous), round (intellectual), shield (futuristic), etc. Adding
-- this lets the AI stylist match sunglasses to outfit vibes.

alter table clothing_items
  add column if not exists sunglasses_style text
    check (sunglasses_style in (
      'aviator',
      'wayfarer',
      'cat-eye',
      'round',
      'oversized',
      'rectangle',
      'sport',
      'shield',
      'other'
    ));

notify pgrst, 'reload schema';
