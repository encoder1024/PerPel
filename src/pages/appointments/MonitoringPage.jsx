import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SettingsIcon from '@mui/icons-material/Settings';
import { useMonitoring } from '../../hooks/useMonitoring';
import { useAuthStore } from '../../stores/authStore';
import { useProfessionals } from '../../hooks/useProfessionals';
import BoxesConfigModal from '../configuration/BoxesConfigModal';

const Timer = ({ startTime }) => {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      const start = new Date(startTime);
      const now = new Date();
      const diff = Math.floor((now - start) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(`${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <Typography variant="h4" color="primary">{elapsed}</Typography>;
};

export default function MonitoringPage() {
  const { profile } = useAuthStore();
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const { boxes, activeAppointments, loading, error, startService, endService } = useMonitoring(selectedBusinessId);
  const { professionals } = useProfessionals();
  const [openConfig, setOpenConfig] = useState(false);
  
  // Estados para iniciar servicio
  const [openStartDialog, setOpenStartDialog] = useState(false);
  const [selectedBox, setSelectedBox] = useState(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [selectedProfId, setSelectedProfId] = useState('');

  // Cargar negocios (podría reusar useAppointments o useBusinesses)
  const [businesses, setBusinesses] = useState([]);
  useEffect(() => {
    const fetchBiz = async () => {
      const { data } = await import('../../services/supabaseClient').then(m => 
        m.supabase.schema('core').from('businesses').select('id, name').eq('account_id', profile.account_id).eq('is_deleted', false)
      );
      setBusinesses(data || []);
      if (data?.length > 0) setSelectedBusinessId(data[0].id);
    };
    if (profile?.account_id) fetchBiz();
  }, [profile?.account_id]);

  const handleStartService = (box) => {
    setSelectedBox(box);
    setOpenStartDialog(true);
  };

  const onConfirmStart = async () => {
    const res = await startService(selectedAppointmentId, selectedBox.id, selectedProfId);
    if (res.success) {
      setOpenStartDialog(false);
      setSelectedAppointmentId('');
      setSelectedProfId('');
    }
  };

  if (loading && !businesses.length) return <CircularProgress />;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Monitoreo de Boxes</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Sucursal</InputLabel>
            <Select value={selectedBusinessId} label="Sucursal" onChange={(e) => setSelectedBusinessId(e.target.value)}>
              {businesses.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="outlined" startIcon={<SettingsIcon />} onClick={() => setOpenConfig(true)}>Configurar</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {boxes.map((box) => {
          const appointment = activeAppointments.find(a => a.box_id === box.id && a.status === 'IN_PROGRESS');
          return (
            <Grid item xs={12} sm={6} md={4} key={box.id}>
              <Card sx={{ 
                height: '100%', 
                borderLeft: 6, 
                borderColor: appointment ? '#4caf50' : '#212121', // Verde vs Gris Oscuro/Negro
                bgcolor: appointment ? 'rgba(76, 175, 80, 0.04)' : '#fafafa'
              }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6">{box.name}</Typography>
                    <Chip 
                      label={appointment ? 'EN PRODUCCIÓN' : 'VACÍO'} 
                      sx={{ 
                        bgcolor: appointment ? '#4caf50' : '#212121', 
                        color: '#fff',
                        fontWeight: 'bold'
                      }} 
                      size="small" 
                    />
                  </Box>

                  {appointment ? (
                    <Box>
                      <Typography variant="body2" color="textSecondary">Cliente:</Typography>
                      <Typography variant="h6" sx={{ color: '#2e7d32' }}>{appointment.client_name}</Typography>
                      <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>Servicio:</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>{appointment.service?.name}</Typography>
                      <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>Profesional:</Typography>
                      <Typography variant="body1">{appointment.professional?.full_name}</Typography>
                      
                      <Box sx={{ textAlign: 'center', my: 3 }}>
                        <Typography variant="overline" sx={{ color: '#2e7d32', fontWeight: 'bold' }}>Tiempo de Atención</Typography>
                        <Timer startTime={appointment.actual_start_time} />
                      </Box>

                      <Button 
                        fullWidth 
                        variant="contained" 
                        sx={{ bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' } }}
                        startIcon={<CheckCircleIcon />}
                        onClick={() => endService(appointment.id)}
                      >
                        Finalizar Servicio
                      </Button>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', py: 4 }}>
                      <Typography variant="body1" color="textSecondary" align="center" gutterBottom>Box disponible</Typography>
                      <Button 
                        variant="outlined" 
                        startIcon={<PlayArrowIcon />} 
                        onClick={() => handleStartService(box)}
                      >
                        Iniciar Servicio
                      </Button>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Dialog para iniciar servicio */}
      <Dialog open={openStartDialog} onClose={() => setOpenStartDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>Iniciar Servicio en {selectedBox?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Turno / Cliente</InputLabel>
              <Select 
                value={selectedAppointmentId} 
                label="Turno / Cliente" 
                onChange={(e) => setSelectedAppointmentId(e.target.value)}
              >
                {activeAppointments.filter(a => a.status === 'SCHEDULED').map(a => (
                  <MenuItem key={a.id} value={a.id}>{a.client_name} - {a.service?.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Profesional</InputLabel>
              <Select 
                value={selectedProfId} 
                label="Profesional" 
                onChange={(e) => setSelectedProfId(e.target.value)}
              >
                {professionals.map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenStartDialog(false)}>Cancelar</Button>
          <Button variant="contained" onClick={onConfirmStart} disabled={!selectedAppointmentId || !selectedProfId}>Iniciar</Button>
        </DialogActions>
      </Dialog>

      <BoxesConfigModal 
        open={openConfig} 
        onClose={() => setOpenConfig(false)} 
        businessId={selectedBusinessId} 
      />
    </Box>
  );
}
