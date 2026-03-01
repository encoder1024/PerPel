import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  CircularProgress,
  Alert,
  MenuItem,
  Chip,
  Divider
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import KeyIcon from '@mui/icons-material/Key';
import LinkIcon from '@mui/icons-material/Link';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';
import config from '../../config';

export default function CredentialsConfig() {
  const { profile } = useAuthStore();
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [name, setName] = useState('');
  const [apiName, setApiName] = useState('MERCADOPAGO');
  const [accessToken, setAccessToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const fetchCredentials = async () => {
    if (!profile?.account_id) return;
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('business_credentials')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);

      if (fetchError) throw fetchError;
      setCredentials(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, [profile?.account_id]);

  const handleOAuthRedirect = (cred) => {
    if (!cred.client_id) {
      alert("Falta el Client ID para esta credencial.");
      return;
    }

    // Construir la URL de Mercado Pago usando el Client ID guardado en la DB
    // El 'state' lleva el ID de nuestra tabla para saber a quién actualizar al volver
    const mpUrl = `https://auth.mercadopago.com/authorization?client_id=${cred.client_id}&response_type=code&platform_id=mp&redirect_uri=${encodeURIComponent(config.mercadopago.redirectUri)}&state=${encodeURIComponent(`mp:${cred.id}`)}`;
    
    window.location.href = mpUrl;
  };

  const handleCalcomRedirect = async (cred) => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error("Sesión inválida. Inicia sesión nuevamente.");
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/calcom-oauth-start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ credentialId: cred.id, accessToken: sessionData.session.access_token }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Error al iniciar OAuth");

      if (payload?.url) {
        window.location.href = payload.url;
      } else {
        throw new Error("No se recibió URL de Cal.com");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddCredential = async (e) => {
    e.preventDefault();
    if (!name) {
      setError("El nombre es obligatorio.");
      return;
    }

    setLoading(true);
    try {
      const { error: insertError } = await supabase
        .schema('core')
        .from('business_credentials')
        .insert({
          account_id: profile.account_id,
          name,
          api_name: apiName,
          access_token: accessToken || null,
          client_id: clientId || null,
          client_secret: clientSecret || null,
          external_status: 'active',
          is_deleted: false
        });

      if (insertError) throw insertError;

      // Reset form
      setName('');
      setAccessToken('');
      setClientId('');
      setClientSecret('');
      await fetchCredentials();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar esta credencial?")) return;
    setLoading(true);
    try {
      const { error: deleteError } = await supabase
        .schema('core')
        .from('business_credentials')
        .update({ is_deleted: true })
        .eq('id', id);

      if (deleteError) throw deleteError;
      await fetchCredentials();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper to determine what fields to show
  const isOAuthApi = apiName === 'MERCADOPAGO' || apiName === 'CAL_COM';

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        <KeyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Gestión de Credenciales de API
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        Configura los accesos para tus integraciones. Las claves se guardan encriptadas (AES-256).
      </Typography>

      <Paper component="form" onSubmit={handleAddCredential} sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Nombre descriptivo"
              placeholder="Ej: MP Sucursal Centro"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              select
              label="Servicio API"
              value={apiName}
              onChange={(e) => setApiName(e.target.value)}
              required
            >
              <MenuItem value="MERCADOPAGO">Mercado Pago</MenuItem>
              <MenuItem value="ALEGRA">Alegra (Facturación)</MenuItem>
              <MenuItem value="ONESIGNAL">OneSignal</MenuItem>
              <MenuItem value="CAL_COM">Cal.com (Turnos)</MenuItem>
            </TextField>
          </Grid>

          {/* Campos dinámicos según el tipo de API */}
          {isOAuthApi ? (
            <>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Client Secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <Alert severity="info">
                  Para APIs OAuth como Mercado Pago, primero guarda el ID y Secret. Luego podrás vincular la cuenta.
                </Alert>
              </Grid>
            </>
          ) : (
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="API Token / Access Token"
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                required
              />
            </Grid>
          )}

          <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="contained"
              startIcon={<AddCircleOutlineIcon />}
              disabled={loading}
            >
              Guardar Credencial
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead sx={{ bgcolor: 'grey.50' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Nombre</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Servicio</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Configuración</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && credentials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center"><CircularProgress size={24} /></TableCell>
              </TableRow>
            ) : credentials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">No hay credenciales configuradas.</TableCell>
              </TableRow>
            ) : (
              credentials.map((cred) => (
                <TableRow key={cred.id}>
                  <TableCell>{cred.name}</TableCell>
                  <TableCell>
                    <Chip label={cred.api_name} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={cred.external_status || 'active'}
                      size="small"
                      color={cred.external_status === 'expired' ? 'error' : 'success'}
                    />
                  </TableCell>
                  <TableCell>
                    {cred.client_id ? (
                      <Box>
                        <Typography variant="caption" display="block">ID: {cred.client_id}</Typography>
                        {!cred.access_token && cred.api_name === 'MERCADOPAGO' && (
                          <Button 
                            size="small" 
                            startIcon={<LinkIcon />} 
                            variant="text" 
                            color="warning"
                            sx={{ fontSize: '0.7rem', p: 0 }}
                            onClick={() => handleOAuthRedirect(cred)}
                          >
                            Vincular Cuenta
                          </Button>
                        )}
                        {cred.api_name === 'CAL_COM' && (!cred.access_token || cred.external_status === 'expired') && (
                          <Button 
                            size="small" 
                            startIcon={<LinkIcon />} 
                            variant="text" 
                            color={cred.external_status === 'expired' ? 'error' : 'warning'}
                            sx={{ fontSize: '0.7rem', p: 0 }}
                            onClick={() => handleCalcomRedirect(cred)}
                          >
                            {cred.external_status === 'expired' ? 'Re-vincular Cal.com' : 'Vincular Cal.com'}
                          </Button>
                        )}
                      </Box>
                    ) : (
                      <Typography variant="caption">Token Estático</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton color="error" onClick={() => handleDelete(cred.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
