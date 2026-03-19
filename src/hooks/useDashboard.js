import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { seedInitialCategories } from '../utils/initialData';
import { syncService } from '../services/syncService';

export const useDashboard = () => {
  const [snapshot, setSnapshot] = useState(null);
  const [salesHistory, setSalesHistory] = useState([]);
  const [businessDistribution, setBusinessDistribution] = useState([]);
  const [totalRevenue30Days, setTotalRevenue30Days] = useState(0);
  const [revenueDetails, setRevenueDetails] = useState([]);
  const [allOrdersDetails, setAllOrdersDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { profile } = useAuthStore();

  const fetchDashboardData = useCallback(async () => {
    if (!profile?.account_id) return;
    
    setLoading(true);
    setError(null);

    try {
      // 0. Initialize RxDB Data (Pull from Supabase)
      await syncService.pullData(profile.account_id);

      // 0.1. Trigger initial categories seeding if it's an OWNER
      if (profile.app_role === 'OWNER') {
        await seedInitialCategories(profile.account_id);
      }

      // 1. Get Consolidated Snapshot (KPIs)
      const { data: snapshotData, error: snapshotError } = await supabase
        .schema('reports')
        .from('consolidated_business_snapshot')
        .select('*')
        .eq('account_id', profile.account_id)
        .single();

      if (snapshotError) throw snapshotError;
      setSnapshot(snapshotData);

      // 2. Get Daily Sales Summary for Chart (Last 30 days)
      const { data: salesData, error: salesError } = await supabase
        .schema('reports')
        .from('daily_sales_summary')
        .select('*')
        .eq('account_id', profile.account_id)
        .order('report_date', { ascending: true })
        .limit(30);

      if (salesError) throw salesError;
      setSalesHistory(salesData);

      // 3. Calculate 30-day total revenue
      const total30 = salesData.reduce((acc, curr) => acc + (Number(curr.total_sales) || 0), 0);
      setTotalRevenue30Days(total30);

      // 4. Process Sales Data for Business Distribution (Bar Chart)
      const distMap = {};
      salesData.forEach(item => {
        if (!distMap[item.business_id]) {
          distMap[item.business_id] = { 
            name: item.business_name, 
            order_count: 0,
            revenue: 0,
            business_id: item.business_id 
          };
        }
        distMap[item.business_id].order_count += item.order_count || 0;
        distMap[item.business_id].revenue += Number(item.total_sales) || 0;
      });
      setBusinessDistribution(Object.values(distMap));

      // 5. Fetch all orders for status distribution (last 35 days for 5 weeks)
      const thirtyFiveDaysAgo = new Date();
      thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

      const { data: orderDetails, error: detailsError } = await supabase
        .schema('core')
        .from('orders')
        .select(`
          id,
          total_amount,
          created_at,
          business_id,
          origin,
          status,
          businesses (name)
        `)
        .eq('account_id', profile.account_id)
        .gte('created_at', thirtyFiveDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (detailsError) throw detailsError;
      
      setAllOrdersDetails(orderDetails || []);
      // Filter PAID for revenueDetails compatibility
      setRevenueDetails(orderDetails?.filter(o => o.status === 'PAID') || []);

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

  return { 
    snapshot, 
    salesHistory, 
    businessDistribution, 
    totalRevenue30Days, 
    revenueDetails,
    allOrdersDetails,
    loading, 
    error, 
    refresh: fetchDashboardData 
  };
};
