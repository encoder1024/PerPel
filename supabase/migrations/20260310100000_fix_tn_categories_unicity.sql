-- MIGRACIÓN: Ajuste de Unicidad para Categorías Tiendanube
BEGIN;

-- Eliminar el índice si existiera uno previo menos restrictivo
DROP INDEX IF EXISTS core.idx_unique_tn_category;

-- Crear restricción de unicidad para permitir UPSERT seguro
ALTER TABLE core.tiendanube_categorias 
ADD CONSTRAINT unique_tn_category_per_business 
UNIQUE (account_id, business_id, tn_category_id);

COMMIT;
