import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  Divider,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from "@mui/material";
import * as CalEmbed from "@calcom/embed-react";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import SyncIcon from "@mui/icons-material/Sync";
import LinkIcon from "@mui/icons-material/Link";
import BugReportIcon from "@mui/icons-material/BugReport";
import { useAppointments } from "../../hooks/useAppointments";
import { supabase } from "../../services/supabaseClient";
import { useAuthStore } from "../../stores/authStore";

export default function Appointments() {
  const { profile } = useAuthStore();
  const {
    businesses,
    selectedBusinessId,
    setSelectedBusinessId,
    appointments,
    loading,
    error,
    actionLoadingId,
    refresh, // Usamos la función de refresco del hook
    markAttended,
    markCancelled,
    markNoShow,
    isOwnerAdmin,
    isFinalStatus,
    calcomExpired,
  } = useAppointments();

  // Estados para Diagnóstico y Conexión
  const [calcomStatus, setCalcomStatus] = useState('unknown'); 
  const [credentialId, setCredentialId] = useState(null);
  const [openDebugModal, setOpenDebugModal] = useState(false);
  const [debugInfo, setDebugData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0); // Para forzar reinicio del calendario

  useEffect(() => {
    fetchCalcomStatus();
  }, [profile?.account_id]);

  const fetchCalcomStatus = async () => {
    if (!profile?.account_id) return;
    try {
      const { data, error: credError } = await supabase
        .schema("core")
        .from("business_credentials")
        .select("id, external_status")
        .eq("account_id", profile.account_id)
        .eq("api_name", "CAL_COM")
        .eq("is_deleted", false)
        .maybeSingle();

      if (data) {
        setCalcomStatus(data.external_status || 'active');
        setCredentialId(data.id);
      } else {
        setCalcomStatus('disconnected');
      }
    } catch (err) {
      console.error("Error fetching Cal.com status:", err);
    }
  };

  const handleLinkCalcom = async () => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('calcom-oauth-start', {
        body: { accountId: profile.account_id }
      });
      if (invokeError) throw invokeError;
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setDebugData({ error: err.message, action: 'oauth-start' });
      setOpenDebugModal(true);
    }
  };

  const handleRefreshCalcom = async () => {
    if (!credentialId) return;
    setRefreshing(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('calcom-token-refresh', {
        body: { credentialId, accountId: profile.account_id }
      });
      setDebugData(data || { error: invokeError?.message });
      setOpenDebugModal(true);
      fetchCalcomStatus();
    } catch (err) {
      setDebugData({ error: err.message, action: 'refresh' });
      setOpenDebugModal(true);
    } finally {
      setRefreshing(false);
    }
  };

  // Extraemos lo que necesitamos del namespace
  const getCalApi = CalEmbed.getCalApi;

  // In a real scenario, this would be the Cal.com link of the business or employee
  const CAL_COM_LINK =
    "andres-ferrer-yknamm/62edd46d-ec20-4178-b7d0-48ba8b080586";

  useEffect(() => {
    (async function () {
      const cal = await getCalApi({
        namespace: "62edd46d-ec20-4178-b7d0-48ba8b080586",
      });
      cal("inline", { 
        calLink: CAL_COM_LINK,
        elementOrSelector: "#my-cal-inlines",
        config: { layout: "week_view" },
      });
    })();
  }, []);

  useEffect(() => {
    let calInstance;

    (async function initCal() {
      try {
        const cal = await getCalApi();
        calInstance = cal;

        // Limpiamos el contenedor antes de renderizar (evita duplicados)
        const container = document.getElementById("cal-inline-container");
        if (container) container.innerHTML = "";

        // Ejecutamos la carga "inline"
        cal("inline", {
          elementOrSelector: "#cal-inline-container",
          calLink: CAL_COM_LINK, // Aquí definimos el link
          config: { 
            layout: "month_view",
            theme: "light" 
          }
        });

        cal("ui", {
          styles: { branding: { brandColor: "#000000" } },
          hideEventTypeDetails: false,
          layout: "month_view"
        });

        // ESCUCHAR EVENTO DE ÉXITO
        cal("on", {
          action: "bookingSuccessful",
          callback: (e) => {
            console.log("Reserva exitosa en Cal.com:", e);
            
            // 1. Refrescar la lista de turnos en el ERP (con un pequeño delay para que el webhook procese)
            setTimeout(() => {
              if (typeof setSelectedBusinessId === 'function') {
                // Forzamos un refresco recargando las citas
                window.location.reload(); // Opción radical si el hook no expone refresh directamente
              }
            }, 2000);
          }
        });

      } catch (err) {
        console.error("Error al inicializar Cal.com:", err);
      }
    })();
  }, [selectedBusinessId]);

  useEffect(() => {
    // Load Cal.com embed script
    const script = document.createElement("script");
    script.src = "https://app.cal.com/embed/embed.js";
    script.async = true;
    script.onload = () => {
      if (window.Cal) {
        window.Cal("init", { origin: "https://cal.com" });
        window.Cal("ui", {
          styles: { branding: { brandColor: "#1e293b" } },
          hideEventTypeDetails: false,
          layout: "month_view",
        });
      }
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const normalizePhone = (phone) => {
    const digits = (phone ?? "").toString().replace(/[^\d+]/g, "");
    return digits.startsWith("+") ? digits.slice(1) : digits;
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Gestión de Turnos y Agendamiento
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="textSecondary">Cal.com:</Typography>
            {calcomStatus === 'active' ? (
              <Chip label="Conectado" color="success" size="small" variant="filled" />
            ) : calcomStatus === 'expired' ? (
              <Chip label="Expirado" color="warning" size="small" variant="filled" />
            ) : (
              <Chip label="Desconectado" color="error" size="small" variant="filled" />
            )}
          </Box>

          <Button 
            variant="outlined" 
            size="small" 
            startIcon={<LinkIcon />}
            onClick={handleLinkCalcom}
            disabled={calcomStatus === 'active'}
          >
            Vincular
          </Button>

          <Button 
            variant="outlined" 
            size="small" 
            color="secondary"
            startIcon={refreshing ? <CircularProgress size={16} /> : <SyncIcon />}
            onClick={handleRefreshCalcom}
            disabled={calcomStatus === 'disconnected' || refreshing}
          >
            Refrescar Token
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {calcomExpired && (
          <Grid item xs={12}>
            <Alert severity="warning">
              La credencial de Cal.com está expirada. Re-vinculá la cuenta en
              Configuración → Credenciales.
            </Alert>
          </Grid>
        )}
        {/* Lado Izquierdo: Embebed de Cal.com */}
        <Grid item xs={12} lg={4}>
          <Paper
            sx={{ p: 0, overflow: "hidden", height: 750, borderRadius: 2 }}
          >
            <Box
              component="div"
              id="my-cal-inline"
              data-cal-link={CAL_COM_LINK}
              sx={{ width: "100%", height: "100%", border: "none" }}
            >
              {/* <iframe
                src={`https://cal.com/${CAL_COM_LINK}?embed=true`}
                title="Cal.com Scheduling"
                width="100%"
                height="100%"
                frameBorder="0"
              /> */}
              <div
                id="cal-inline-container"
                // namespace="62edd46d-ec20-4178-b7d0-48ba8b080586"
                // calLink="andres-ferrer-yknamm/62edd46d-ec20-4178-b7d0-48ba8b080586"
                style={{ width: "100%", height: "100%", overflow: "scroll" }}
                // config={{
                //   layout: "week_view",
                //   useSlotsViewOnSmallScreen: "true",
                // }}
              />;
            </Box>
          </Paper>
          <Alert severity="info" sx={{ mt: 2 }}>
            Los turnos agendados aquí se sincronizarán automáticamente con el
            sistema mediante Webhooks.
          </Alert>
        </Grid>

        {/* Lado Derecho: Turnos Recientes */}
        <Grid item xs={12} lg={8}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 2,
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Próximos Turnos
            </Typography>
            {businesses.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Negocio</InputLabel>
                <Select
                  label="Negocio"
                  value={selectedBusinessId || ""}
                  onChange={(e) => setSelectedBusinessId(e.target.value)}
                >
                  {businesses.map((b) => (
                    <MenuItem key={b.id} value={b.id}>
                      {b.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
          <Paper
            sx={{ p: 2, height: "auto", maxHeight: 900, overflowY: "auto" }}
          >
            {loading ? (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : businesses.length === 0 ? (
              <Alert severity="warning">
                No tenés negocios asignados. Contactá a un administrador.
              </Alert>
            ) : error ? (
              <Alert severity="error">{error}</Alert>
            ) : appointments.length === 0 ? (
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ textAlign: "center", py: 4 }}
              >
                No hay turnos agendados para los próximos días.
              </Typography>
            ) : (
              <Grid container spacing={2}>
                {appointments.map((appt) => {
                  const isFinal = isFinalStatus(appt.status);
                  return (
                    <Grid item xs={12} md={6} key={appt.id}>
                      <Card variant="outlined">
                        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              mb: 1,
                            }}
                          >
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {appt.inventory_items?.name || "Servicio"}
                            </Typography>
                            <Alert
                              severity="info"
                              icon={false}
                              sx={{ py: 0, px: 1, fontSize: "0.7rem" }}
                            >
                              {appt.status}
                            </Alert>
                          </Box>
                          <Typography variant="body2" color="textSecondary">
                            {new Date(appt.start_time).toLocaleString("es-AR", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </Typography>
                          <Divider sx={{ my: 1 }} />
                          <Typography variant="caption" sx={{ display: "block", mb: 1 }}>
                            Cliente:{" "}
                            <strong>
                              {appt.client_name + " " + appt.client_phone || "Desconocido"}
                            </strong>
                          </Typography>
                          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              disabled={isFinal || actionLoadingId === appt.id}
                              onClick={() => markAttended(appt.id)}
                            >
                              Asistió
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              disabled={
                                isFinal ||
                                actionLoadingId === appt.id ||
                                !appt.external_booking_id
                              }
                              onClick={() =>
                                markCancelled(appt.id, appt.external_booking_id)
                              }
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              disabled={isFinal || actionLoadingId === appt.id}
                              onClick={() => markNoShow(appt.id)}
                            >
                              No Show
                            </Button>
                            {appt.client_phone && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="success"
                                startIcon={<WhatsAppIcon />}
                                component="a"
                                href={`https://wa.me/${normalizePhone(
                                  appt.client_phone
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{ textTransform: "none" }}
                              >
                                WhatsApp
                              </Button>
                            )}
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* MODAL DE DIAGNÓSTICO CAL.COM */}
      <Dialog open={openDebugModal} onClose={() => setOpenDebugModal(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BugReportIcon color="primary" /> Diagnóstico de Conexión Cal.com
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>
            A continuación se muestra el resultado de la última operación con la API de Cal.com.
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8fafc', overflow: 'auto' }}>
            <pre style={{ margin: 0, fontSize: '0.85rem', fontFamily: 'monospace' }}>
              {debugInfo ? JSON.stringify(debugInfo, null, 2) : "No hay información disponible."}
            </pre>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDebugModal(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
