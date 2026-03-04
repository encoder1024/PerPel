import { useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export const useCashRegister = () => {
  const [activeSession, setActiveSession] = useState(null);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { profile } = useAuthStore();

  const checkActiveSession = useCallback(async (businessId) => {
    if (!profile?.id || !businessId) return null;
    
    setLoading(true);
    setSessionSummary(null); // Reset summary when checking
    try {
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('cash_register_sessions')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('business_id', businessId)
        .eq('status', 'OPEN')
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
      
      setActiveSession(data);
      return data;
    } catch (err) {
      console.error('Error checking cash session:', err.message);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const fetchSessionSummary = useCallback(async (sessionId) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_cash_session_summary', {
        p_session_id: sessionId
      });

      if (rpcError) throw rpcError;

      setSessionSummary({ total_cash_sales: data });
      return { total_cash_sales: data };
    } catch (err) {
      setError(err.message);
      setSessionSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSessionPayments = useCallback(async (openedAt, businessId) => {
    if (!openedAt || !businessId) return [];
    setLoading(true);
    try {
      // Definimos los métodos que queremos mostrar siempre por defecto
      const defaultSummary = {
        'CASH': 0,
        'POINT_MP': 0,
        'ONLINE_MP': 0
      };

      const { data, error: payError } = await supabase
        .schema('core')
        .from('payments')
        .select(`
          payment_method_id, 
          amount,
          orders!inner(business_id)
        `)
        .eq('account_id', profile.account_id)
        .eq('orders.business_id', businessId)
        .eq('status', 'approved')
        .gte('created_at', openedAt);

      if (payError) throw payError;

      // Agrupar por método de pago sobre los valores por defecto
      const summary = data.reduce((acc, curr) => {
        const method = curr.payment_method_id || 'OTROS';
        if (!acc[method]) acc[method] = 0;
        acc[method] += parseFloat(curr.amount);
        return acc;
      }, defaultSummary);

      return Object.entries(summary).map(([method, total]) => ({ method, total }));
    } catch (err) {
      console.error('Error fetching session payments:', err.message);
      setError(err.message);
      // Retornar al menos los ceros para que la UI los muestre
      return [
        { method: 'CASH', total: 0 },
        { method: 'POINT_MP', total: 0 },
        { method: 'ONLINE_MP', total: 0 }
      ];
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id]);

  const openSession = async (businessId, openingBalance, notes = '') => {
    setLoading(true);
    try {
      const { data, error: openError } = await supabase
        .schema('core')
        .from('cash_register_sessions')
        .insert({
          account_id: profile.account_id,
          business_id: businessId,
          opened_by_user_id: profile.id,
          opening_balance: openingBalance,
          notes,
          status: 'OPEN'
        })
        .select()
        .single();

      if (openError) throw openError;
      setActiveSession(data);
      return { success: true, session: data };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const closeSession = async (sessionId, closingBalance, calculatedCashIn, notes = '') => {

  // console.log("Los valores de cierre de caja son: ", closingBalance, calculatedCashIn);

    setLoading(true);
    try {
      const { data, error: closeError } = await supabase
        .schema('core')
        .from('cash_register_sessions')
        .update({
          closed_by_user_id: profile.id,
          closing_balance: closingBalance,
          calculated_cash_in: calculatedCashIn,
          notes: notes,
          status: 'CLOSED',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (closeError) throw closeError;
      setActiveSession(null);
      setSessionSummary(null);
      return { success: true, session: data };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const fetchAllActiveSessions = useCallback(async () => {
    if (!profile?.account_id) return [];
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('cash_register_sessions')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('status', 'OPEN')
        .eq('is_deleted', false);

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      console.error('Error fetching all active sessions:', err.message);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id]);

  return {
    activeSession,
    sessionSummary,
    loading,
    error,
    checkActiveSession,
    fetchAllActiveSessions,
    fetchSessionSummary,
    fetchSessionPayments,
    openSession,
    closeSession
  };
};
