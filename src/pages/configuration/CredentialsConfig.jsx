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
  Chip
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import KeyIcon from '@mui/icons-material/Key';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

export default function CredentialsConfig() {
  const { profile } = useAuthStore();
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [name, setName] = useState('');
  const [apiName, setApiName] = useState('MERCADOPAGO');
  const [accessToken, setAccessToken] = useState('');

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

  const handleAddCredential = async (e) => {
    e.preventDefault();
    if (!name || !accessToken) {
      setError("Nombre y Token son obligatorios.");
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
          access_token: accessToken, // In a real scenario, this should be encrypted
          external_status: 'active'
        });

      if (insertError) throw insertError;

      setName('');
      setAccessToken('');
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

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        <KeyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Gestión de Credenciales de API
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        Configura aquí las cuentas de Mercado Pago, Alegra u otras APIs para tus sucursales.
      </Typography>

      <Paper component="form" onSubmit={handleAddCredential} sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              label="Nombre descriptivo"
              placeholder="Ej: MP Principal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Grid>
          <Grid item xs={12} sm={3}>
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
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Access Token / API Key"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              required
            />
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button
              type="submit"
              fullWidth
              variant="contained"
              startIcon={<AddCircleOutlineIcon />}
              disabled={loading}
            >
              Guardar
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
              <TableCell sx={{ fontWeight: 700 }}>Token (Censurado)</TableCell>
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
                    <Chip label={cred.external_status} size="small" color="success" />
                  </TableCell>
                  <TableCell>••••••••••••••••</TableCell>
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
