import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export const useProfessionals = () => {
  const { profile } = useAuthStore();
  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfessionals = useCallback(async () => {
    if (!profile?.account_id) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .schema('core')
        .from('professionals')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false)
        .order('full_name');

      if (error) throw error;
      setProfessionals(data || []);
    } catch (err) {
      console.error('Error fetching professionals:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id]);

  const createProfessional = async (profData) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('professionals')
        .insert({
          ...profData,
          account_id: profile.account_id
        });
      if (error) throw error;
      await fetchProfessionals();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const updateProfessional = async (id, profData) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('professionals')
        .update({
          ...profData,
          updated_at: new Date()
        })
        .eq('id', id)
        .eq('account_id', profile.account_id);
      if (error) throw error;
      await fetchProfessionals();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const deleteProfessional = async (id) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('professionals')
        .update({ is_deleted: true, updated_at: new Date() })
        .eq('id', id)
        .eq('account_id', profile.account_id);
      if (error) throw error;
      await fetchProfessionals();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  useEffect(() => {
    fetchProfessionals();
  }, [fetchProfessionals]);

  return {
    professionals,
    loading,
    error,
    createProfessional,
    updateProfessional,
    deleteProfessional,
    refresh: fetchProfessionals
  };
};
