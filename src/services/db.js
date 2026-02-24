import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration-schema'; // El nombre cambió a migration-schema en versiones nuevas
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';

addRxPlugin(RxDBMigrationPlugin);
addRxPlugin(RxDBQueryBuilderPlugin);

// Esquema para Items de Inventario (Reflejo de core.inventory_items)
const inventorySchema = {
  title: 'inventory items schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    account_id: { type: 'string' },
    name: { type: 'string' },
    sku: { type: 'string' },
    item_type: { type: 'string' },
    item_status: { type: 'string' },
    selling_price: { type: 'number' },
    cost_price: { type: 'number' },
    description: { type: 'string' },
    image_url: { type: 'string' },
    updated_at: { type: 'string' },
    is_deleted: { type: 'boolean', default: false }
  },
  required: ['id', 'account_id', 'name', 'selling_price']
};

// Esquema para Niveles de Stock (Reflejo de core.stock_levels)
const stockLevelsSchema = {
  title: 'stock levels schema',
  version: 0,
  primaryKey: 'id', // We'll use a composite string "item_id:business_id" as primary key for simplicity in RxDB
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 255 },
    account_id: { type: 'string' },
    item_id: { type: 'string' },
    business_id: { type: 'string' },
    quantity: { type: 'number' },
    updated_at: { type: 'string' },
    is_deleted: { type: 'boolean', default: false }
  },
  required: ['id', 'account_id', 'item_id', 'business_id', 'quantity']
};

// Esquema para Clientes (Reflejo de core.customers)
const customerSchema = {
  title: 'customer schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    account_id: { type: 'string' },
    business_id: { type: 'string' },
    full_name: { type: 'string' },
    category: { type: 'string', default: 'NEW' },
    email: { type: 'string' },
    phone_number: { type: 'string' },
    doc_type: { type: 'string', default: '99' },
    doc_number: { type: 'string', default: '0' },
    iva_condition: { type: 'string', default: 'Consumidor Final' },
    address: { type: 'string' },
    city: { type: 'string' },
    state_prov: { type: 'string' },
    zip_code: { type: 'string' },
    notes: { type: 'string' },
    updated_at: { type: 'string' },
    is_deleted: { type: 'boolean', default: false }
  },
  required: ['id', 'account_id', 'full_name', 'doc_type', 'doc_number']
};

// Esquema para la Cola de Sincronización (Offline Sync Queue)
const syncQueueSchema = {
  title: 'sync queue schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    operation: { type: 'string' }, // 'INSERT', 'UPDATE', 'DELETE'
    table_name: { type: 'string' },
    payload: { type: 'object' },
    created_at: { type: 'string' },
    status: { type: 'string', default: 'PENDING' } // 'PENDING', 'SYNCING', 'ERROR'
  },
  required: ['id', 'operation', 'table_name', 'payload', 'created_at']
};

let dbPromise = null;

const _create = async () => {
  const db = await createRxDatabase({
    name: 'perpel_db_v4', // Incremented version to force clean schema recreation
    storage: getRxStorageDexie()
  });

  await db.addCollections({
    inventory_items: { schema: inventorySchema },
    stock_levels: { schema: stockLevelsSchema },
    customers: { schema: customerSchema },
    sync_queue: { schema: syncQueueSchema }
  });

  return db;
};

export const getDatabase = () => {
  if (!dbPromise) {
    dbPromise = _create();
  }
  return dbPromise;
};
