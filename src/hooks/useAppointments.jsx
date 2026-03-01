import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useAuthStore } from "../stores/authStore";

const FINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "NO_SHOW"]);

export const useAppointments = () => {
  const { profile } = useAuthStore();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [error, setError] = useState(null);
  const [calcomExpired, setCalcomExpired] = useState(false);

  const isOwnerAdmin = useMemo(
    () => ["OWNER", "ADMIN"].includes(profile?.app_role),
    [profile?.app_role]
  );

  const loadBusinesses = useCallback(async () => {
    if (!profile?.account_id || !profile?.id) return;
    setError(null);
    try {
      if (isOwnerAdmin) {
        const { data, error: bError } = await supabase
          .schema("core")
          .from("businesses")
          .select("id, name")
          .eq("account_id", profile.account_id)
          .eq("is_deleted", false)
          .order("name");
        if (bError) throw bError;
        setBusinesses(data || []);
        if (!selectedBusinessId && data?.length) {
          setSelectedBusinessId(data[0].id);
        }
      } else {
        const { data, error: aError } = await supabase
          .schema("core")
          .from("employee_assignments")
          .select("business:businesses (id, name)")
          .eq("account_id", profile.account_id)
          .eq("user_id", profile.id)
          .eq("is_deleted", false);
        if (aError) throw aError;
        const mapped =
          data?.map((row) => row.business).filter(Boolean) ?? [];
        setBusinesses(mapped);
        if (!selectedBusinessId && mapped.length) {
          setSelectedBusinessId(mapped[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading businesses:", err.message);
      setError("No se pudieron cargar los negocios.");
    }
  }, [profile?.account_id, profile?.id, isOwnerAdmin, selectedBusinessId]);

  const loadAppointments = useCallback(async () => {
    if (!profile?.account_id || !selectedBusinessId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .schema("core")
        .from("appointments")
        .select(
          `
          id,
          start_time,
          end_time,
          status,
          inventory_items (name),
          client_name,
          client_email,
          client_phone,
          external_booking_id
        `
        )
        .eq("account_id", profile.account_id)
        .eq("business_id", selectedBusinessId)
        .eq("status", "SCHEDULED")
        .eq("is_deleted", false)
        .order("start_time", { ascending: true })
        .limit(20);
      if (fetchError) throw fetchError;
      setAppointments(data || []);
    } catch (err) {
      console.error("Error fetching appointments:", err.message);
      setError("No se pudieron cargar los turnos.");
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id, selectedBusinessId]);

  const checkCalcomCredential = useCallback(async () => {
    if (!profile?.account_id) return;
    try {
      const { data, error: credError } = await supabase
        .schema("core")
        .from("business_credentials")
        .select("id, external_status")
        .eq("account_id", profile.account_id)
        .eq("api_name", "CAL_COM")
        .eq("is_deleted", false)
        .limit(1)
        .maybeSingle();
      if (credError) throw credError;
      const expired = data?.external_status === "expired";
      console.log("[calcom-cred-check]", profile.account_id, expired);
      setCalcomExpired(expired);
    } catch (err) {
      console.error("Error checking Cal.com credential:", err.message);
    }
  }, [profile?.account_id]);

  const updateStatus = async (appointmentId, nextStatus) => {
    if (!profile?.account_id || !appointmentId) return;
    setActionLoadingId(appointmentId);
    try {
      const { error: updateError } = await supabase
        .schema("core")
        .from("appointments")
        .update({ status: nextStatus })
        .eq("id", appointmentId)
        .eq("account_id", profile.account_id);
      if (updateError) throw updateError;
      await loadAppointments();
    } catch (err) {
      console.error("Error updating appointment:", err.message);
      setError("No se pudo actualizar el turno.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const markAttended = (appointmentId) =>
    updateStatus(appointmentId, "COMPLETED");
  const markCancelled = async (appointmentId, externalBookingId) => {
    if (!appointmentId) return;
    setActionLoadingId(appointmentId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let session = sessionData?.session;
      const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
      if (session && expiresAt && expiresAt <= Date.now() + 60_000) {
        const { data: refreshed, error: refreshError } =
          await supabase.auth.refreshSession();
        if (!refreshError && refreshed?.session) {
          session = refreshed.session;
        }
      }
      const accessToken = session?.access_token;
      console.log("[calcom-cancel] accessToken?", !!accessToken);
      if (!accessToken) {
        throw new Error("Sesión inválida");
      }
      if (!externalBookingId) {
        throw new Error("external_booking_id requerido");
      }

      const { data: functionData, error: functionError } =
        await supabase.functions.invoke("calcom-booking-cancel", {
          body: {
            appointmentId,
            external_booking_id: externalBookingId,
            reason: "Cancelado desde ERP",
            userAccessToken: accessToken,
          },
        });

      const failMessage =
        functionError?.message ||
        functionData?.message ||
        "Cancelaci�n fallida";
      if (functionError || !functionData?.success) {
        throw new Error(failMessage);
      }
      await loadAppointments();
    } catch (err) {
      console.error("Error cancelling appointment:", err.message);
      const message = (err?.message || "").toString();
      const invalidTokenRegex = /invalid\s+access\s+token|invalid\s+token|invalid_grant|expired/i;
      if (invalidTokenRegex.test(message)) {
        setCalcomExpired(true);
        checkCalcomCredential();
      }
      setError("No se pudo cancelar el turno en Cal.com.");
    } finally {
      setActionLoadingId(null);
    }
  };
  const markNoShow = (appointmentId) => updateStatus(appointmentId, "NO_SHOW");

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    checkCalcomCredential();
    const interval = setInterval(() => {
      checkCalcomCredential();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [checkCalcomCredential]);

  const isFinalStatus = (status) => FINAL_STATUSES.has(status);

  return {
    businesses,
    selectedBusinessId,
    setSelectedBusinessId,
    appointments,
    loading,
    error,
    actionLoadingId,
    refresh: loadAppointments,
    markAttended,
    markCancelled,
    markNoShow,
    isOwnerAdmin,
    isFinalStatus,
    calcomExpired,
  };
};
