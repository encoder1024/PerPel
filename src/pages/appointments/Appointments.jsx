import React, { useEffect } from "react";
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
} from "@mui/material";
import Cal, { getCalApi } from "@calcom/embed-react";
import { useAppointments } from "../../hooks/useAppointments";

export default function Appointments() {
  const {
    businesses,
    selectedBusinessId,
    setSelectedBusinessId,
    appointments,
    loading,
    error,
    actionLoadingId,
    markAttended,
    markCancelled,
    markNoShow,
    isOwnerAdmin,
    isFinalStatus,
    calcomExpired,
  } = useAppointments();

  // In a real scenario, this would be the Cal.com link of the business or employee
  const CAL_COM_LINK =
    "https://cal.com/andres-ferrer-yknamm/62edd46d-ec20-4178-b7d0-48ba8b080586";

  useEffect(() => {
    (async function () {
      const cal = await getCalApi({
        namespace: "62edd46d-ec20-4178-b7d0-48ba8b080586",
      });
      cal("ui", { hideEventTypeDetails: false, layout: "week_view" });
    })();
  }, []);

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

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Gestión de Turnos y Agendamiento
      </Typography>

      <Grid container spacing={3}>
        {calcomExpired && (
          <Grid item xs={12}>
            <Alert severity="warning">
              La credencial de Cal.com estÃ¡ expirada. Re-vinculÃ¡ la cuenta en
              ConfiguraciÃ³n â†’ Credenciales.
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
              <Cal
                namespace="62edd46d-ec20-4178-b7d0-48ba8b080586"
                calLink="andres-ferrer-yknamm/62edd46d-ec20-4178-b7d0-48ba8b080586"
                style={{ width: "100%", height: "100%", overflow: "scroll" }}
                config={{
                  layout: "week_view",
                  useSlotsViewOnSmallScreen: "true",
                }}
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
            {isOwnerAdmin && businesses.length > 0 && (
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
                              {appt.user_profiles?.full_name || "Desconocido"}
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
                              disabled={isFinal || actionLoadingId === appt.id}
                              onClick={() => markCancelled(appt.id)}
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
    </Box>
  );
}
