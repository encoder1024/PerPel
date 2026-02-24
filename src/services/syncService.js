import { getDatabase } from './db';
import { supabase } from './supabaseClient';
import { v4 as uuidv4 } from 'uuid'; // I'll need to install uuid

export const syncService = {
  // Check if there's internet connection
  isOnline: () => navigator.onLine,

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
    if (!navigator.onLine) return;
    
    const db = await getDatabase();
    const pendingItems = await db.sync_queue.find({
      selector: { status: 'PENDING' },
      sort: [{ created_at: 'asc' }]
    }).exec();

    for (const item of pendingItems) {
      try {
        await item.patch({ status: 'SYNCING' });
        
        const { operation, table_name, payload } = item;
        let result;

        if (operation === 'INSERT') {
          result = await supabase.from(table_name).insert(payload);
        } else if (operation === 'UPDATE') {
          result = await supabase.from(table_name).update(payload).eq('id', payload.id);
        } else if (operation === 'DELETE') {
          result = await supabase.from(table_name).delete().eq('id', payload.id);
        }

        if (result.error) throw result.error;
        
        // Remove item from local queue after success
        await item.remove();
      } catch (error) {
        console.error(`Error syncing operation ${item.id}:`, error.message);
        await item.patch({ status: 'ERROR' });
      }
    }
  },

  // Listen for online events to trigger sync
  init: () => {
    window.addEventListener('online', () => {
      console.log('Internet connection restored. Processing sync queue...');
      syncService.processQueue();
    });

    // Check periodically for sync
    setInterval(() => {
      if (navigator.onLine) syncService.processQueue();
    }, 30000); // Every 30 seconds
  },

  // Pull data from Supabase to RxDB (Initial sync or refresh)
  pullData: async (accountId) => {
    if (!navigator.onLine) return;
    const db = await getDatabase();

    try {
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

      console.log('RxDB: Data sync from Supabase completed.');
    } catch (error) {
      console.error('Error pulling data to RxDB:', error.message);
    }
  }
};
