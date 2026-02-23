import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Grid, Paper, List, ListItem, ListItemText, ListItemSecondaryAction, IconButton, CircularProgress, Alert, MenuItem } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

export default function VentasConfig() {
  const { profile } = useAuthStore();
  const [devices, setDevices] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceId, setNewDeviceId] = useState('');
  const [selectedBusinessId, setSelectedBusinessId] = useState('');

  const fetchDevicesAndBusinesses = async () => {
    if (!profile?.account_id) return;
    setLoading(true);
    setError(null);
    try {
      const { data: devicesData, error: devicesError } = await supabase
        .schema('core')
        .from('point_devices')
        .select('*, businesses (name)')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      if (devicesError) throw devicesError;
      setDevices(devicesData);

      const { data: businessesData, error: businessesError } = await supabase
        .schema('core')
        .from('businesses')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      if (businessesError) throw businessesError;
      setBusinesses(businessesData);
      if (businessesData.length > 0) {
        setSelectedBusinessId(businessesData[0].id);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevicesAndBusinesses();
  }, [profile?.account_id]);

  const handleAddDevice = async (e) => {
    e.preventDefault();
    if (!newDeviceName || !newDeviceId || !selectedBusinessId) {
      setError("Todos los campos son obligatorios.");
      return;
    }

    setLoading(true);
    try {
      const { error: insertError } = await supabase.schema('core').from('point_devices').insert({
        account_id: profile.account_id,
        business_id: selectedBusinessId,
        name: newDeviceName,
        mp_device_id: newDeviceId,
      });

      if (insertError) throw insertError;
      
      // Reset form and refresh list
      setNewDeviceName('');
      setNewDeviceId('');
      await fetchDevicesAndBusinesses();

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (deviceId) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar este dispositivo?")) return;

    setLoading(true);
    try {
      const { error: updateError } = await supabase
        .schema('core')
        .from('point_devices')
        .update({ is_deleted: true })
        .eq('id', deviceId);

      if (updateError) throw updateError;
      await fetchDevicesAndBusinesses();

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Gestión de Dispositivos Point
      </Typography>
      
      {/* Formulario para agregar nuevo dispositivo */}
      <Paper component="form" onSubmit={handleAddDevice} sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField fullWidth label="Nombre del Dispositivo" value={newDeviceName} onChange={(e) => setNewDeviceName(e.target.value)} required />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="ID del Dispositivo (de MP)" value={newDeviceId} onChange={(e) => setNewDeviceId(e.target.value)} required />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField fullWidth select label="Asignar a Negocio" value={selectedBusinessId} onChange={(e) => setSelectedBusinessId(e.target.value)} required>
              {businesses.map((b) => (
                <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button type="submit" fullWidth variant="contained" startIcon={<AddCircleOutlineIcon />} disabled={loading}>
              Agregar
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      {/* Lista de dispositivos existentes */}
      <Typography variant="subtitle1" gutterBottom sx={{ mt: 3 }}>
        Dispositivos Vinculados
      </Typography>
      {loading ? <CircularProgress /> : (
        <List>
          {devices.map((device) => (
            <ListItem key={device.id} divider sx={{ bgcolor: 'background.paper' }}>
              <ListItemText
                primary={device.name}
                secondary={
                  <>
                    <Typography component="span" variant="body2" color="text.primary">ID: {device.mp_device_id}</Typography>
                    {" — Asignado a: "}{device.businesses?.name || 'N/A'}
                  </>
                }
              />
              <ListItemSecondaryAction>
                <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteDevice(device.id)} disabled={loading}>
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}
      {devices.length === 0 && !loading && <Typography variant="body2">No hay dispositivos vinculados.</Typography>}
    </Box>
  );
}
