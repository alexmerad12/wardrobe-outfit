-- Add dress_silhouette to clothing_items so we can apply body-type and
-- silhouette-matching styling rules (A-line is universal, sheath for
-- office, bodycon for hourglass, etc.) that today rely only on the
-- dress length subcategory.

alter table clothing_items
  add column if not exists dress_silhouette text
    check (dress_silhouette in (
      'a-line','sheath','bodycon','wrap','fit-and-flare',
      'slip','shift','empire','mermaid'
    ));
