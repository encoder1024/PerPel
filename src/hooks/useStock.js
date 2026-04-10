import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export const useStock = () => {
  const { profile } = useAuthStore();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch businesses for the current account
  const fetchBusinesses = useCallback(async () => {
    if (!profile?.account_id) {
      setBusinesses([]);
      setSelectedBusinessId('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('businesses')
        .select('id, name')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);

      if (fetchError) throw fetchError;

      setBusinesses(data);
      if (data.length > 0 && !selectedBusinessId) {
        setSelectedBusinessId(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching businesses:', err.message);
      setError(`Failed to load businesses: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id, selectedBusinessId]);

  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  // Fetch stock data for the selected business
  const fetchStockData = useCallback(async () => {
    if (!selectedBusinessId || !profile?.account_id) {
      setStockData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Fetch ALL items for the account and their stock level for the SELECTED business
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('inventory_items')
        .select(`
          id,
          name,
          sku,
          item_type,
          item_categories(name),
          stock_levels(quantity, business_id)
        `)
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);

      if (fetchError) throw fetchError;
      
      const processedData = data.map(item => {
        // Find the stock level entry for the selected business
        const businessStock = item.stock_levels?.find(sl => sl.business_id === selectedBusinessId);
        const isAssigned = !!businessStock;
        const currentStock = isAssigned ? businessStock.quantity : null;
        return {
          ...item,
          category_name: item.item_categories?.name || 'N/A',
          current_stock: currentStock,
          is_assigned: isAssigned,
          is_uninitialized: isAssigned && currentStock == null,
        };
      });

      setStockData(processedData);
    } catch (err) {
      console.error('Error fetching stock data:', err.message);
      setError(`Failed to load stock data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedBusinessId, profile?.account_id]);

  useEffect(() => {
    fetchStockData();
  }, [fetchStockData]);

  // Function to call the RPC adjust_stock
  const adjustStock = async ({ itemId, quantityChange, movementType, reason }) => {
    if (!profile?.account_id || !selectedBusinessId) {
      return { status: 'error', message: 'Falta información de cuenta o negocio.' };
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('adjust_stock', {
        p_item_id: itemId,
        p_business_id: selectedBusinessId,
        p_account_id: profile.account_id,
        p_quantity_change: parseInt(quantityChange),
        p_movement_type: movementType,
        p_reason: reason
      });

      if (rpcError) throw rpcError;

      if (data.status === 'success') {
        await fetchStockData(); // Refresh data after successful adjustment
      }
      return data;
    } catch (err) {
      console.error('Error in adjustStock RPC:', err.message);
      return { status: 'error', message: err.message };
    }
  };

  // Function to link/unlink services (and products with 0 stock)
  const toggleAssignment = async (item, assign) => {
    if (!profile?.account_id || !selectedBusinessId) return { status: 'error' };

    try {
      if (assign) {
        // Al vincular, usamos adjustStock con LINK_ITEM
        // El quantityChange es 0 porque LINK_ITEM inicializa el stock en NULL en la DB
        return await adjustStock({
          itemId: item.id,
          quantityChange: 0,
          movementType: 'LINK_ITEM',
          reason: 'Vinculación inicial del ítem al negocio.'
        });
      } else {
        // Unassign: Delete from stock_levels (o soft delete)
        const { error: delError } = await supabase
          .schema('core')
          .from('stock_levels')
          .delete()
          .eq('item_id', item.id)
          .eq('business_id', selectedBusinessId)
          .eq('account_id', profile.account_id);
        if (delError) throw delError;
      }
      
      await fetchStockData();
      return { status: 'success' };
    } catch (err) {
      console.error('Error toggling assignment:', err.message);
      return { status: 'error', message: err.message };
    }
  };

  const filteredStock = useMemo(() => {
    if (!searchTerm) return stockData;
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return stockData.filter(item =>
      item.name.toLowerCase().includes(lowerCaseSearchTerm) ||
      item.sku?.toLowerCase().includes(lowerCaseSearchTerm) ||
      item.category_name.toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [stockData, searchTerm]);

  return {
    businesses,
    selectedBusinessId,
    setSelectedBusinessId,
    stockData,
    filteredStock,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    adjustStock,
    toggleAssignment,
    refreshStock: fetchStockData
  };
};
