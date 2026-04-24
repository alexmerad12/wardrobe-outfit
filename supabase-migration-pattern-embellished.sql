-- Rename existing "embroidery" pattern values to "embellished".
-- The embroidery tag was conceptually wrong — it's a decoration
-- technique, not a visual pattern. "Embellished" covers embroidery,
-- beading, sequins, appliqué, and studs as a unified category.

UPDATE clothing_items
SET pattern = array_replace(pattern, 'embroidery', 'embellished')
WHERE 'embroidery' = ANY(pattern);

-- Reload PostgREST so the schema cache picks up the new value if
-- any CHECK constraint references the enum set.
NOTIFY pgrst, 'reload schema';
