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
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('inventory_items')
        .select(`
          id,
          name,
          sku,
          item_type,
          item_categories(name),
          stock_levels(quantity)
        `)
        .eq('account_id', profile.account_id)
        .eq('item_type', 'PRODUCT')
        .eq('is_deleted', false)
        .eq('stock_levels.business_id', selectedBusinessId);

      if (fetchError) throw fetchError;
      
      const processedData = data.map(item => ({
        ...item,
        category_name: item.item_categories?.name || 'N/A',
        current_stock: item.stock_levels?.[0]?.quantity || 0
      }));

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
    refreshStock: fetchStockData
  };
};
