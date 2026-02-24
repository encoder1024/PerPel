/************************************************************************************
 *                                                                                  *
 *   MIGRACIÓN: 20260223120000_fix_orders_client_reference.sql                     *
 *   CORRECCIÓN DE REFERENCIA DE CLIENTE EN ÓRDENES                                *
 *                                                                                  *
 ************************************************************************************/

BEGIN;

-- 1. Eliminar la restricción que apuntaba a auth.users (sistema anterior)
ALTER TABLE core.orders 
DROP CONSTRAINT IF EXISTS orders_client_id_fkey;

-- 2. Hacer que client_id sea opcional (para permitir ventas sin cliente registrado)
ALTER TABLE core.orders 
ALTER COLUMN client_id DROP NOT NULL;

-- 3. Crear la nueva relación con la tabla core.customers
ALTER TABLE core.orders 
ADD CONSTRAINT orders_customer_id_fkey 
FOREIGN KEY (client_id) REFERENCES core.customers(id) ON DELETE SET NULL;

COMMIT;
