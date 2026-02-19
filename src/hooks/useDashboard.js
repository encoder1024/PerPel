import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export const useDashboard = () => {
  const [snapshot, setSnapshot] = useState(null);
  const [salesHistory, setSalesHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { profile } = useAuthStore();

  const fetchDashboardData = useCallback(async () => {
    if (!profile?.account_id) return;
    
    setLoading(true);
    setError(null);

    try {
      // 1. Get Consolidated Snapshot (KPIs)
      const { data: snapshotData, error: snapshotError } = await supabase
        .from('consolidated_business_snapshot', { schema: 'reports' })
        .select('*')
        .eq('account_id', profile.account_id)
        .single();

      if (snapshotError) throw snapshotError;
      setSnapshot(snapshotData);

      // 2. Get Daily Sales Summary for Chart (Last 30 days)
      const { data: salesData, error: salesError } = await supabase
        .from('daily_sales_summary', { schema: 'reports' })
        .select('*')
        .eq('account_id', profile.account_id)
        .order('report_date', { ascending: true })
        .limit(30);

      if (salesError) throw salesError;
      setSalesHistory(salesData);

    } catch (err) {
      console.error('Error fetching dashboard data:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return { snapshot, salesHistory, loading, error, refresh: fetchDashboardData };
};
