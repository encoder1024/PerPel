import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Grid, FormControl, InputLabel, Select, MenuItem, Divider } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import { useNavigate } from 'react-router-dom';
import BoxesConfigModal from './BoxesConfigModal';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../services/supabaseClient';

export default function TurnosConfig() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [openConfig, setOpenConfig] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');

  useEffect(() => {
    const fetchBiz = async () => {
      const { data } = await supabase.schema('core').from('businesses').select('id, name').eq('account_id', profile.account_id).eq('is_deleted', false);
      setBusinesses(data || []);
      if (data?.length > 0) setSelectedBusinessId(data[0].id);
    };
    if (profile?.account_id) fetchBiz();
  }, [profile?.account_id]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Configuración de Turnos y Monitoreo
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Gestión de Boxes</Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Defina la cantidad de boxes de trabajo y los profesionales independientes que brindan servicios en su negocio.
            </Typography>
            
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Seleccionar Sucursal</InputLabel>
              <Select 
                value={selectedBusinessId} 
                label="Seleccionar Sucursal" 
                onChange={(e) => setSelectedBusinessId(e.target.value)}
              >
                {businesses.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
              </Select>
            </FormControl>

            <Button 
              variant="contained" 
              startIcon={<SettingsIcon />} 
              onClick={() => setOpenConfig(true)}
              disabled={!selectedBusinessId}
              fullWidth
            >
              Gestionar Boxes y Profesionales
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Acceso Rápido</Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Acceda directamente al tablero de monitoreo en tiempo real para supervisar la atención.
            </Typography>
            <Button 
              variant="outlined" 
              startIcon={<MonitorHeartIcon />} 
              onClick={() => navigate('/monitoreo')}
              fullWidth
            >
              Ir al Monitoreo
            </Button>
          </Paper>
        </Grid>
      </Grid>

      <BoxesConfigModal 
        open={openConfig} 
        onClose={() => setOpenConfig(false)} 
        businessId={selectedBusinessId} 
      />
    </Box>
  );
}
