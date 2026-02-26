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
} from "@mui/material";
import { supabase } from "../../services/supabaseClient";
import { useAuthStore } from "../../stores/authStore";
import Cal, { getCalApi } from "@calcom/embed-react";

export default function Appointments() {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState(null);

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

    // Fetch existing appointments for the account
    const fetchAppointments = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from("appointments")
          .select(
            `
            id,
            start_time,
            status,
            inventory_items (name),
            user_profiles!client_id (full_name)
          `,
          )
          .eq("account_id", profile?.account_id)
          .order("start_time", { ascending: true })
          .limit(10);

        if (fetchError) throw fetchError;
        setAppointments(data);
      } catch (err) {
        console.error("Error fetching appointments:", err.message);
        setError("No se pudieron cargar los turnos recientes.");
      } finally {
        setLoading(false);
      }
    };

    if (profile?.account_id) fetchAppointments();

    return () => {
      document.body.removeChild(script);
    };
  }, [profile?.account_id]);

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Gestión de Turnos y Agendamiento
      </Typography>

      <Grid container spacing={3}>
        {/* Lado Izquierdo: Embebed de Cal.com */}
        <Grid item xs={12} lg={8}>
          <Paper
            sx={{ p: 0, overflow: "hidden", height: 650, borderRadius: 2 }}
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
              />
              ;
            </Box>
          </Paper>
          <Alert severity="info" sx={{ mt: 2 }}>
            Los turnos agendados aquí se sincronizarán automáticamente con el
            sistema mediante Webhooks.
          </Alert>
        </Grid>

        {/* Lado Derecho: Turnos Recientes */}
        <Grid item xs={12} lg={4}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Próximos Turnos
          </Typography>
          <Paper
            sx={{ p: 2, height: "auto", maxHeight: 650, overflowY: "auto" }}
          >
            {loading ? (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <CircularProgress />
              </Box>
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
              appointments.map((appt) => (
                <Card key={appt.id} variant="outlined" sx={{ mb: 2 }}>
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
                    <Typography variant="caption" sx={{ display: "block" }}>
                      Cliente:{" "}
                      <strong>
                        {appt.user_profiles?.full_name || "Desconocido"}
                      </strong>
                    </Typography>
                  </CardContent>
                </Card>
              ))
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
