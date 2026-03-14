/*****************************************************************************************
 * MIGRACIÓN: 20260311100000_add_unique_constraint_to_credentials.sql                   *
 * Añade una restricción de unicidad para permitir el UPSERT seguro de credenciales      *
 * de Tiendanube basándose en la cuenta, el nombre de la API y el ID de la tienda.       *
 *****************************************************************************************/

BEGIN;

ALTER TABLE core.business_credentials 
ADD CONSTRAINT unique_account_api_client UNIQUE (account_id, api_name, client_id);

COMMIT;
