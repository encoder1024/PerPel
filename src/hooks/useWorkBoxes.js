import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export const useWorkBoxes = () => {
  const { profile } = useAuthStore();
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBoxes = useCallback(async () => {
    if (!profile?.account_id) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .schema('core')
        .from('work_boxes')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false)
        .order('name');

      if (error) throw error;
      setBoxes(data || []);
    } catch (err) {
      console.error('Error fetching boxes:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id]);

  const createBox = async (boxData) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('work_boxes')
        .insert({
          ...boxData,
          account_id: profile.account_id
        });
      if (error) throw error;
      await fetchBoxes();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const updateBox = async (id, boxData) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('work_boxes')
        .update({
          ...boxData,
          updated_at: new Date()
        })
        .eq('id', id)
        .eq('account_id', profile.account_id);
      if (error) throw error;
      await fetchBoxes();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const deleteBox = async (id) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('work_boxes')
        .update({ is_deleted: true, updated_at: new Date() })
        .eq('id', id)
        .eq('account_id', profile.account_id);
      if (error) throw error;
      await fetchBoxes();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  useEffect(() => {
    fetchBoxes();
  }, [fetchBoxes]);

  return {
    boxes,
    loading,
    error,
    createBox,
    updateBox,
    deleteBox,
    refresh: fetchBoxes
  };
};
