import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export const useMonitoring = (businessId) => {
  const { profile } = useAuthStore();
  const [boxes, setBoxes] = useState([]);
  const [activeAppointments, setActiveAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!profile?.account_id || !businessId) return;

    setLoading(true);
    setError(null);
    try {
      // 1. Obtener todos los boxes del negocio
      const { data: bData, error: bError } = await supabase
        .schema('core')
        .from('work_boxes')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('business_id', businessId)
        .eq('is_deleted', false)
        .order('name');

      if (bError) throw bError;
      setBoxes(bData || []);

      // 2. Obtener turnos en progreso o agendados para hoy
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: aData, error: aError } = await supabase
        .schema('core')
        .from('appointments')
        .select(`
          *,
          professional:professionals(full_name),
          service:inventory_items(name)
        `)
        .eq('account_id', profile.account_id)
        .eq('business_id', businessId)
        .in('status', ['SCHEDULED', 'IN_PROGRESS'])
        .gte('start_time', today.toISOString())
        .lt('start_time', tomorrow.toISOString())
        .eq('is_deleted', false);

      if (aError) throw aError;
      setActiveAppointments(aData || []);

    } catch (err) {
      console.error('Error in useMonitoring:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id, businessId]);

  const startService = async (appointmentId, boxId, professionalId) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('appointments')
        .update({
          status: 'IN_PROGRESS',
          box_id: boxId,
          professional_id: professionalId,
          actual_start_time: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId)
        .eq('account_id', profile.account_id);

      if (error) throw error;
      await fetchData();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const endService = async (appointmentId) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('appointments')
        .update({
          status: 'COMPLETED',
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId)
        .eq('account_id', profile.account_id);

      if (error) throw error;
      await fetchData();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const createSpontaneousAppointment = async (data) => {
    try {
      const { data: newApp, error } = await supabase
        .schema('core')
        .from('appointments')
        .insert({
          account_id: profile.account_id,
          business_id: businessId,
          client_name: data.client_name,
          service_id: data.service_id,
          start_time: new Date().toISOString(),
          end_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min default
          status: 'SCHEDULED'
        })
        .select()
        .single();

      if (error) throw error;
      await fetchData();
      return { success: true, appointment: newApp };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  useEffect(() => {
    fetchData();

    // Suscripción en tiempo real
    if (!profile?.account_id || !businessId) return;

    const channel = supabase
      .channel('monitoring_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'core',
          table: 'appointments',
          filter: `account_id=eq.${profile.account_id}`
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, profile?.account_id, businessId]);

  return {
    boxes,
    activeAppointments,
    loading,
    error,
    startService,
    endService,
    createSpontaneousAppointment,
    refresh: fetchData
  };
};
