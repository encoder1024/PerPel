-- Fix for the ON CONFLICT error in bulk upsert.
-- Adds the missing unique constraint to tiendanube_item_variants so we can upsert by item_id.

ALTER TABLE core.tiendanube_item_variants
ADD CONSTRAINT unique_tn_variant_per_item UNIQUE (item_id);

-- Also ensuring tiendanube_sync_map has its PK correctly identified for upserts
-- Based on the schema it already has item_id as PK, so it should be fine.
