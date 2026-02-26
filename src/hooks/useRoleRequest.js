import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export const useRoleRequest = () => {
  const { profile } = useAuthStore();
  const [roleRequests, setRoleRequests] = useState([]);
  const [businesses, setBusinesses] = useState([]); // Para la asignación de roles EMPLOYEE
  const [registrationCode, setRegistrationCode] = useState(''); // Código de registro de la cuenta del OWNER
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRoleRequests = useCallback(async () => {
    if (!profile?.account_id) {
      setRoleRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('role_requests')
        .select(`
          *,
          user:user_id (id, full_name, email),
          account:account_id (account_name)
        `)
        .eq('account_id', profile.account_id)
        .eq('status', 'PENDING')
        .eq('is_deleted', false);

      if (fetchError) throw fetchError;
      setRoleRequests(data);
    } catch (err) {
      console.error('Error fetching role requests:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id]);

  const fetchBusinesses = useCallback(async () => {
    if (!profile?.account_id) {
      setBusinesses([]);
      return;
    }
    try {
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('businesses')
        .select('id, name')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      if (fetchError) throw fetchError;
      setBusinesses(data);
    } catch (err) {
      console.error('Error fetching businesses:', err.message);
    }
  }, [profile?.account_id]);

  const fetchRegistrationCode = useCallback(async () => {
    if (!profile?.account_id || profile.app_role !== 'OWNER') {
      setRegistrationCode('');
      return;
    }
    try {
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('accounts')
        .select('registration_code')
        .eq('id', profile.account_id)
        .single();
      if (fetchError) throw fetchError;
      setRegistrationCode(data.registration_code);
    } catch (err) {
      console.error('Error fetching registration code:', err.message);
    }
  }, [profile?.account_id, profile?.app_role]);

  useEffect(() => {
    fetchRoleRequests();
    fetchBusinesses();
    fetchRegistrationCode();
  }, [fetchRoleRequests, fetchBusinesses, fetchRegistrationCode]);

  const approveRequest = async (requestId, businessId = null) => {
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase
        .schema('core')
        .rpc('approve_role_request', {
          p_request_id: requestId,
          p_approver_user_id: profile.id,
          p_business_id: businessId
        });

      if (rpcError) throw rpcError;
      if (!data.success) throw new Error(data.message);

      fetchRoleRequests(); // Refrescar la lista
      return { success: true, message: data.message };
    } catch (err) {
      console.error('Error approving request:', err.message);
      setError(err.message);
      return { success: false, message: err.message };
    } finally {
      setLoading(false);
    }
  };

  const rejectRequest = async (requestId) => {
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase
        .schema('core')
        .rpc('reject_role_request', {
          p_request_id: requestId,
          p_approver_user_id: profile.id
        });

      if (rpcError) throw rpcError;
      if (!data.success) throw new Error(data.message);

      fetchRoleRequests(); // Refrescar la lista
      return { success: true, message: data.message };
    } catch (err) {
      console.error('Error rejecting request:', err.message);
      setError(err.message);
      return { success: false, message: err.message };
    } finally {
      setLoading(false);
    }
  };

  const updateRegistrationCode = async (newCode) => {
    if (!profile?.account_id || profile.app_role !== 'OWNER') {
      return { success: false, message: 'Solo el OWNER puede actualizar el código.' };
    }
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase
        .schema('core')
        .rpc('update_account_registration_code', {
          p_account_id: profile.account_id,
          p_new_code: newCode,
          p_owner_user_id: profile.id
        });

      if (rpcError) throw rpcError;
      if (!data.success) throw new Error(data.message);

      setRegistrationCode(newCode); // Actualizar estado local
      return { success: true, message: data.message };
    } catch (err) {
      console.error('Error updating registration code:', err.message);
      setError(err.message);
      return { success: false, message: err.message };
    } finally {
      setLoading(false);
    }
  };

  return {
    roleRequests,
    businesses,
    registrationCode,
    loading,
    error,
    fetchRoleRequests,
    approveRequest,
    rejectRequest,
    updateRegistrationCode,
    isOwner: profile?.app_role === 'OWNER',
    isAdmin: profile?.app_role === 'ADMIN',
  };
};