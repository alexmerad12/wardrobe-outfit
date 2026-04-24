-- Rename existing "embroidery" pattern values to "embellished".
-- The embroidery tag was conceptually wrong — it's a decoration
-- technique, not a visual pattern. "Embellished" covers embroidery,
-- beading, sequins, appliqué, and studs as a unified category.
--
-- `pattern` is stored as jsonb (not a postgres text array) so we
-- operate on its serialized form. Safe because no other pattern
-- value contains "embroidery" as a substring.

UPDATE clothing_items
SET pattern = replace(pattern::text, 'embroidery', 'embellished')::jsonb
WHERE pattern::text LIKE '%embroidery%';

-- Reload PostgREST so the schema cache picks up the new value.
NOTIFY pgrst, 'reload schema';
