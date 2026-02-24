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

  return {
    activeSession,
    sessionSummary,
    loading,
    error,
    checkActiveSession,
    fetchSessionSummary,
    openSession,
    closeSession
  };
};
