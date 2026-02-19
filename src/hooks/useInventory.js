import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { useOffline } from './useOffline';
import { v4 as uuidv4 } from 'uuid';

export const useInventory = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { profile } = useAuthStore();
  const { db, isOnline, syncService } = useOffline();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isOnline) {
      try {
        const { data, error: fetchError } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('account_id', profile?.account_id)
          .eq('deleted', false);

        if (fetchError) throw fetchError;

        setItems(data);
        
        // Sincronizar con RxDB local (opcional/segundo plano)
        if (db) {
          // Nota: Esto se podría mejorar con un motor de sincronización más robusto
          for (const item of data) {
             await db.inventory_items.upsert(item);
          }
        }
      } catch (err) {
        console.error('Error fetching from Supabase:', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else if (db) {
      try {
        const localItems = await db.inventory_items.find({
          selector: { account_id: profile?.account_id, deleted: false }
        }).exec();
        setItems(localItems.map(item => item.toJSON()));
      } catch (err) {
        console.error('Error fetching from RxDB:', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  }, [isOnline, profile?.account_id, db]);

  useEffect(() => {
    if (profile?.account_id) {
      fetchItems();
    }
  }, [profile?.account_id, fetchItems]);

  const saveItem = async (itemData) => {
    const isNew = !itemData.id;
    const item = {
      ...itemData,
      id: itemData.id || uuidv4(),
      account_id: profile?.account_id,
      updated_at: new Date().toISOString(),
    };

    if (isOnline) {
      try {
        const { error: saveError } = await supabase
          .from('inventory_items')
          .upsert(item);

        if (saveError) throw saveError;
        
        // Actualizar localmente también
        if (db) await db.inventory_items.upsert(item);
        
        await fetchItems();
        return { success: true };
      } catch (err) {
        console.error('Error saving to Supabase:', err.message);
        return { success: false, error: err.message };
      }
    } else {
      // Offline: Guardar en RxDB y en la cola de sincronización
      try {
        if (db) {
          await db.inventory_items.upsert(item);
          await syncService.enqueueOperation(
            isNew ? 'INSERT' : 'UPDATE',
            'inventory_items',
            item
          );
          await fetchItems();
          return { success: true, offline: true };
        }
      } catch (err) {
        console.error('Error saving offline:', err.message);
        return { success: false, error: err.message };
      }
    }
  };

  const deleteItem = async (id) => {
    if (isOnline) {
      try {
        const { error: deleteError } = await supabase
          .from('inventory_items')
          .update({ deleted: true })
          .eq('id', id);

        if (deleteError) throw deleteError;
        
        if (db) {
          const doc = await db.inventory_items.findOne(id).exec();
          if (doc) await doc.patch({ deleted: true });
        }
        
        await fetchItems();
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    } else {
      try {
        if (db) {
          const doc = await db.inventory_items.findOne(id).exec();
          if (doc) await doc.patch({ deleted: true });
          
          await syncService.enqueueOperation('UPDATE', 'inventory_items', { id, deleted: true });
          await fetchItems();
          return { success: true, offline: true };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  };

  return { items, loading, error, saveItem, deleteItem, refresh: fetchItems };
};
