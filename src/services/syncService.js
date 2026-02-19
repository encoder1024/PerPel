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
  }
};
