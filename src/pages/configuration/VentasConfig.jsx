import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
  MenuItem,
  Divider,
  Chip,
  Tooltip
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

export default function VentasConfig() {
  const { profile } = useAuthStore();
  const [devices, setDevices] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state para dispositivos
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceId, setNewDeviceId] = useState('');
  const [selectedBusinessId, setSelectedBusinessId] = useState('');

  const fetchData = async () => {
    if (!profile?.account_id) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Dispositivos Point
      const { data: devicesData, error: devicesError } = await supabase
        .schema('core')
        .from('point_devices')
        .select('*, businesses (name)')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      if (devicesError) throw devicesError;
      setDevices(devicesData);

      // 2. Negocios
      const { data: businessesData, error: businessesError } = await supabase
        .schema('core')
        .from('businesses')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      if (businessesError) throw businessesError;
      setBusinesses(businessesData);
      if (businessesData.length > 0 && !selectedBusinessId) {
        setSelectedBusinessId(businessesData[0].id);
      }

      // 3. Credenciales Disponibles
      const { data: credsData, error: credsError } = await supabase
        .schema('core')
        .from('business_credentials')
        .select('id, name, api_name')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      if (credsError) throw credsError;
      setCredentials(credsData);

      // 4. Asignaciones Actuales
      const { data: assignsData, error: assignsError } = await supabase
        .schema('core')
        .from('business_asign_credentials')
        .select('*, business_credentials(name, api_name)')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      if (assignsError) throw assignsError;
      setAssignments(assignsData);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [profile?.account_id]);

  const handleAddAssignment = async (businessId, credentialId) => {
    if (!credentialId) return;
    setLoading(true);
    try {
      const { error: insertError } = await supabase
        .schema('core')
        .from('business_asign_credentials')
        .insert({
          account_id: profile.account_id,
          business_id: businessId,
          credential_id: credentialId
        });

      if (insertError) throw insertError;
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAssignment = async (assignId) => {
    if (!window.confirm("¿Desvincular esta credencial de este negocio?")) return;
    setLoading(true);
    try {
      const { error: deleteError } = await supabase
        .schema('core')
        .from('business_asign_credentials')
        .update({ is_deleted: true })
        .eq('id', assignId);

      if (deleteError) throw deleteError;
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDevice = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error: insertError } = await supabase.schema('core').from('point_devices').insert({
        account_id: profile.account_id,
        business_id: selectedBusinessId,
        name: newDeviceName,
        mp_device_id: newDeviceId,
      });
      if (insertError) throw insertError;
      setNewDeviceName('');
      setNewDeviceId('');
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (deviceId) => {
    if (!window.confirm("¿Eliminar este dispositivo?")) return;
    setLoading(true);
    try {
      await supabase.schema('core').from('point_devices').update({ is_deleted: true }).eq('id', deviceId);
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Gestión de Dispositivos Point</Typography>
      
      <Paper component="form" onSubmit={handleAddDevice} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField fullWidth label="Nombre" value={newDeviceName} onChange={(e) => setNewDeviceName(e.target.value)} required />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="ID de MP" value={newDeviceId} onChange={(e) => setNewDeviceId(e.target.value)} required />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField fullWidth select label="Negocio" value={selectedBusinessId} onChange={(e) => setSelectedBusinessId(e.target.value)} required>
              {businesses.map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button type="submit" fullWidth variant="contained" disabled={loading}>Agregar</Button>
          </Grid>
        </Grid>
      </Paper>

      {loading && businesses.length === 0 ? <CircularProgress /> : (
        <List sx={{ mb: 4 }}>
          {devices.map((device) => (
            <ListItem key={device.id} divider sx={{ bgcolor: 'background.paper' }}>
              <ListItemText primary={device.name} secondary={`ID: ${device.mp_device_id} — En: ${device.businesses?.name}`} />
              <ListItemSecondaryAction>
                <IconButton onClick={() => handleDeleteDevice(device.id)} color="error"><DeleteIcon /></IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      <Divider sx={{ my: 4 }} />

      <Typography variant="h6" gutterBottom>Sucursales e Integraciones API</Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        Conecta tus sucursales con las cuentas de Mercado Pago, Alegra, etc.
      </Typography>

      <Grid container spacing={3}>
        {businesses.map((business) => (
          <Grid item xs={12} md={6} key={business.id}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{business.name}</Typography>
              
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="caption" color="textSecondary">Integraciones Activas:</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                  {assignments.filter(a => a.business_id === business.id).length === 0 ? (
                    <Typography variant="body2" color="textDisabled">Ninguna conexión activa.</Typography>
                  ) : (
                    assignments.filter(a => a.business_id === business.id).map(a => (
                      <Chip
                        key={a.id}
                        label={`${a.business_credentials.name} (${a.business_credentials.api_name})`}
                        onDelete={() => handleRemoveAssignment(a.id)}
                        color="primary"
                        variant="outlined"
                        size="small"
                      />
                    ))
                  )}
                </Box>
              </Box>

              <TextField
                fullWidth
                select
                size="small"
                label="Añadir Integración"
                value=""
                onChange={(e) => handleAddAssignment(business.id, e.target.value)}
                disabled={loading || credentials.length === 0}
              >
                <MenuItem value="" disabled><em>Selecciona una credencial...</em></MenuItem>
                {credentials
                  .filter(c => !assignments.find(a => a.business_id === business.id && a.credential_id === c.id))
                  .map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name} ({c.api_name})</MenuItem>
                  ))
                }
              </TextField>
            </Paper>
          </Grid>
        ))}
      </Grid>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Box>
  );
}
