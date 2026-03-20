import { getDatabase } from './db';
import { supabase } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid'; // I'll need to install uuid

export const syncService = {
  networkDegradedUntil: 0,
  _isInitialized: false,
  _syncIntervalId: null,
  _isProcessingQueue: false,
  markNetworkDegraded: (ms = 120000) => {
    syncService.networkDegradedUntil = Date.now() + ms;
  },
  markNetworkHealthy: () => {
    syncService.networkDegradedUntil = 0;
  },
  isNetworkDegraded: () => Date.now() < syncService.networkDegradedUntil,

  // Check if there's internet connection
  isOnline: () => navigator.onLine && !syncService.isNetworkDegraded(),
  isNetworkFailure: (message = '') =>
    /Failed to fetch|ERR_NAME_NOT_RESOLVED|NetworkError/i.test(message),
  isDuplicateKeyError: (error) => {
    const message = error?.message || '';
    return error?.code === '23505' || /duplicate key value violates unique constraint/i.test(message);
  },
  normalizeTableName: (tableName = '') =>
    tableName.includes('.') ? tableName.split('.').pop() : tableName,
  queuePriority: (tableName = '') => {
    const normalized = syncService.normalizeTableName(tableName);
    if (normalized === 'orders') return 1;
    if (normalized === 'order_items') return 2;
    return 3;
  },
  safePatchStatus: async (item, status) => {
    try {
      await item.incrementalPatch({ status });
      return;
    } catch {
      const db = await getDatabase();
      const latest = await db.sync_queue.findOne(item.id).exec();
      if (latest && latest.status !== status) {
        try {
          await latest.incrementalPatch({ status });
        } catch {
          await latest.patch({ status });
        }
      }
    }
  },
  safeRemoveQueueItem: async (item) => {
    try {
      await item.remove();
      return;
    } catch {
      const db = await getDatabase();
      const latest = await db.sync_queue.findOne(item.id).exec();
      if (latest && !latest._deleted) {
        await latest.remove();
      }
    }
  },
  recoverStuckQueue: async () => {
    const db = await getDatabase();
    const syncingItems = await db.sync_queue.find({
      selector: { status: 'SYNCING' }
    }).exec();

    for (const item of syncingItems) {
      try {
        await syncService.safePatchStatus(item, 'PENDING');
      } catch (error) {
        console.error(`Error recovering queue item ${item.id}:`, error?.message || error);
      }
    }
  },

  // Save an operation in the local sync queue
  enqueueOperation: async (operation, tableName, payload) => {
    const db = await getDatabase();
    await db.sync_queue.insert({
      id: uuidv4(),
      operation,
      table_name: tableName,
      payload,
      created_at: new Date().toISOString(),
      status: 'PENDING'
    });
  },

  // Perform pending operations to Supabase
  processQueue: async () => {
    if (syncService._isProcessingQueue) return;
    if (!navigator.onLine) return;
    syncService._isProcessingQueue = true;
    const db = await getDatabase();
    try {
      const pendingItems = await db.sync_queue.find({
        selector: {
          $or: [{ status: 'PENDING' }, { status: 'ERROR' }]
        },
        sort: [{ created_at: 'asc' }]
      }).exec();

      const sortedItems = [...pendingItems].sort((a, b) => {
        const priorityDiff =
          syncService.queuePriority(a.table_name) - syncService.queuePriority(b.table_name);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      const queuedOrders = new Set(
        sortedItems
          .filter(
            (i) =>
              syncService.normalizeTableName(i.table_name) === 'orders' &&
              i.operation === 'INSERT' &&
              i.payload?.id
          )
          .map((i) => i.payload.id)
      );
      const syncedOrderIds = new Set();

      for (const item of sortedItems) {
        const normalizedTable = syncService.normalizeTableName(item.table_name);
        const parentOrderId = item.payload?.order_id;
        const operation = item.operation;
        const payload = item.payload;
        if (
          normalizedTable === 'order_items' &&
          parentOrderId &&
          queuedOrders.has(parentOrderId) &&
          !syncedOrderIds.has(parentOrderId)
        ) {
          continue;
        }

        try {
          await syncService.safePatchStatus(item, 'SYNCING');

          const { table_name } = item;
          const getQueryBuilder = () => {
            if (table_name.includes('.')) {
              const [schemaName, tableOnly] = table_name.split('.');
              return supabase.schema(schemaName).from(tableOnly);
            }
            return supabase.schema('core').from(table_name);
          };
          let result;

          if (operation === 'INSERT') {
            result = await getQueryBuilder().insert(payload);
          } else if (operation === 'UPDATE') {
            result = await getQueryBuilder().update(payload).eq('id', payload.id);
          } else if (operation === 'DELETE') {
            result = await getQueryBuilder().delete().eq('id', payload.id);
          }

          if (result?.error) throw result.error;

          if (normalizedTable === 'orders' && operation === 'INSERT' && payload?.id) {
            syncedOrderIds.add(payload.id);
          }

          syncService.markNetworkHealthy();
          await syncService.safeRemoveQueueItem(item);
        } catch (error) {
          const message = error?.message || '';
          console.error(`Error syncing operation ${item.id}:`, message);

          if (syncService.isNetworkFailure(message)) {
            syncService.markNetworkDegraded();
            await syncService.safePatchStatus(item, 'PENDING');
            break;
          }

          // Idempotency: if INSERT already exists in server, treat as synced.
          if (operation === 'INSERT' && syncService.isDuplicateKeyError(error)) {
            if (normalizedTable === 'orders' && payload?.id) {
              syncedOrderIds.add(payload.id);
            }
            await syncService.safeRemoveQueueItem(item);
            continue;
          }

          if (
            normalizedTable === 'order_items' &&
            /order_items_order_id_fkey/i.test(message)
          ) {
            await syncService.safePatchStatus(item, 'PENDING');
            continue;
          }

          await syncService.safePatchStatus(item, 'ERROR');
        }
      }
    } finally {
      syncService._isProcessingQueue = false;
    }
  },

  // Listen for online events to trigger sync
  init: () => {
    if (syncService._isInitialized) return;
    syncService._isInitialized = true;
    syncService.recoverStuckQueue();

    window.addEventListener('online', () => {
      console.log('Internet connection restored. Processing sync queue...');
      syncService.markNetworkHealthy();
      syncService.processQueue();
    });

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        syncService.processQueue();
      }
    });

    // Check periodically for sync
    syncService._syncIntervalId = setInterval(() => {
      if (navigator.onLine) syncService.processQueue();
    }, 30000); // Every 30 seconds
  },

  // Pull data from Supabase to RxDB (Initial sync or refresh)
  pullData: async (accountId) => {
    if (!navigator.onLine || syncService.isNetworkDegraded()) return;
    const db = await getDatabase();

    try {
      // 0. Sync Businesses (needed by many selectors)
      const { data: businesses, error: businessesError } = await supabase
        .schema('core')
        .from('businesses')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_deleted', false);

      if (businessesError) throw businessesError;
      if (businesses) {
        await db.businesses.bulkUpsert(businesses);
      }

      // 1. Sync Inventory Items
      const { data: items, error: itemsError } = await supabase
        .schema('core')
        .from('inventory_items')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_deleted', false);

      if (itemsError) throw itemsError;
      if (items) {
        await db.inventory_items.bulkUpsert(items);
      }

      // 2. Sync Stock Levels
      const { data: stock, error: stockError } = await supabase
        .schema('core')
        .from('stock_levels')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_deleted', false);

      if (stockError) throw stockError;
      if (stock) {
        const stockToUpsert = stock.map(s => ({
            ...s,
            id: `${s.item_id}:${s.business_id}`
        }));
        await db.stock_levels.bulkUpsert(stockToUpsert);
      }

      // 3. Sync Customers (New central core.customers table)
      const { data: customers, error: customerError } = await supabase
        .schema('core')
        .from('customers')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_deleted', false);

      if (customerError) throw customerError;
      if (customers) {
        await db.customers.bulkUpsert(customers);
      }

      syncService.markNetworkHealthy();
      console.log('RxDB: Data sync from Supabase completed.');
    } catch (error) {
      console.error('Error pulling data to RxDB:', error.message);
      if (syncService.isNetworkFailure(error.message || '')) {
        syncService.markNetworkDegraded();
      }
    }
  }
};
