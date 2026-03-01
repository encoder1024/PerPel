import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export const useBusinesses = () => {
  const { profile } = useAuthStore();
  const [businesses, setBusinesses] = useState([]);
  const [accountUsers, setAccountUsers] = useState([]); // Todos los usuarios de la cuenta
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!profile?.account_id) return;

    setLoading(true);
    setError(null);
    try {
      // 1. Obtener los negocios de la cuenta
      const { data: bData, error: bError } = await supabase
        .schema('core')
        .from('businesses')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false)
        .order('name');

      if (bError) throw bError;

      // 2. Obtener todos los perfiles de la cuenta (para el selector de asignación)
      const { data: uData, error: uError } = await supabase
        .schema('core')
        .from('user_profiles')
        .select('id, full_name, email, app_role')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);

      if (uError) throw uError;
      setAccountUsers(uData);

      // 3. Obtener las asignaciones activas
      const { data: aData, error: aError } = await supabase
        .schema('core')
        .from('employee_assignments')
        .select(`
          business_id,
          user_id,
          profile:user_profiles (id, full_name, email, app_role)
        `)
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);

      if (aError) throw aError;

      // 4. Combinar datos: negocios con su staff asignado
      const businessesWithStaff = bData.map(business => ({
        ...business,
        staff: aData
          .filter(a => a.business_id === business.id)
          .map(a => a.profile)
          .filter(p => p !== null)
      }));

      setBusinesses(businessesWithStaff);
    } catch (err) {
      console.error('Error en useBusinesses:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id]);

  // Función para asignar un usuario a un negocio
  const assignEmployee = async (userId, businessId) => {
    try {
      // Verificamos si ya existe (podría estar como is_deleted = true)
      const { data: existing } = await supabase
        .schema('core')
        .from('employee_assignments')
        .select('*')
        .eq('user_id', userId)
        .eq('business_id', businessId)
        .eq('account_id', profile.account_id)
        .maybeSingle();

      let error;
      if (existing) {
        ({ error } = await supabase
          .schema('core')
          .from('employee_assignments')
          .update({ is_deleted: false, updated_at: new Date() })
          .eq('user_id', userId)
          .eq('business_id', businessId));
      } else {
        ({ error } = await supabase
          .schema('core')
          .from('employee_assignments')
          .insert({
            user_id: userId,
            business_id: businessId,
            account_id: profile.account_id,
            created_by: profile.id
          }));
      }

      if (error) throw error;
      await fetchData();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  // Función para remover un usuario de un negocio
  const removeEmployee = async (userId, businessId) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('employee_assignments')
        .update({ is_deleted: true, updated_at: new Date() })
        .eq('user_id', userId)
        .eq('business_id', businessId)
        .eq('account_id', profile.account_id);

      if (error) throw error;
      await fetchData();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    businesses,
    accountUsers,
    loading,
    error,
    assignEmployee,
    removeEmployee,
    refresh: fetchData
  };
};
