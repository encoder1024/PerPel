import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  Divider,
  CircularProgress,
  Alert,
  Snackbar,
  MenuItem,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import { useCashRegister } from '../../hooks/useCashRegister';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

export default function CashRegister() {
  const { 
    activeSession, 
    sessionSummary,
    loading, 
    checkActiveSession, 
    fetchSessionSummary,
    openSession, 
    closeSession 
  } = useCashRegister();

  const { profile } = useAuthStore();
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [closingBalance, setClosingBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [showCloseSummary, setShowCloseSummary] = useState(false);

  useEffect(() => {
    const fetchBusinesses = async () => {
      if (!profile?.account_id) return;
      const { data } = await supabase
        .schema('core')
        .from('businesses')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      
      if (data) {
        setBusinesses(data);
        if (data.length > 0) {
          setSelectedBusinessId(data[0].id);
        }
      }
    };
    fetchBusinesses();
  }, [profile?.account_id]);

  useEffect(() => {
    if (selectedBusinessId) {
      setShowCloseSummary(false);
      checkActiveSession(selectedBusinessId);
    }
  }, [selectedBusinessId, checkActiveSession]);

  const handleOpenCash = async () => {
    const res = await openSession(selectedBusinessId, parseFloat(openingBalance), notes);
    if (res.success) {
      setSnackbar({ open: true, message: 'Caja abierta exitosamente.', severity: 'success' });
      setNotes('');
    } else {
      setSnackbar({ open: true, message: `Error: ${res.error}`, severity: 'error' });
    }
  };

  const handleInitiateClose = () => {
    if (activeSession) {
      fetchSessionSummary(activeSession.id);
      setShowCloseSummary(true);
    }
  };

  const handleCloseCash = async () => {
    if (!sessionSummary) {
      setSnackbar({ open: true, message: 'Error: El resumen de caja no ha podido ser calculado.', severity: 'error' });
      return;
    }
    const res = await closeSession(
      activeSession.id, 
      parseFloat(closingBalance || 0), 
      sessionSummary.total_cash_sales,
      notes
    );
    if (res.success) {
      setSnackbar({ open: true, message: 'Caja cerrada exitosamente.', severity: 'success' });
      setNotes('');
      setClosingBalance('');
      setShowCloseSummary(false);
    } else {
      setSnackbar({ open: true, message: `Error: ${res.error}`, severity: 'error' });
    }
  };

  const expectedInCash = (activeSession?.opening_balance || 0) + (sessionSummary?.total_cash_sales || 0);
  const difference = parseFloat(closingBalance || 0) - expectedInCash;

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
        Gestión de Caja
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <TextField
              select
              fullWidth
              label="Seleccionar Negocio"
              value={selectedBusinessId}
              onChange={(e) => setSelectedBusinessId(e.target.value)}
              sx={{ mb: 3 }}
              disabled={!!activeSession || loading}
            >
              {businesses.map((b) => (
                <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
              ))}
            </TextField>

            <Divider sx={{ my: 2 }} />

            {loading && !activeSession && <Box sx={{display: 'flex', justifyContent: 'center'}}><CircularProgress/></Box>}

            {activeSession && !loading && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <LockOpenIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
                <Typography variant="h6" color="success.main" sx={{ fontWeight: 600 }}>Caja Abierta</Typography>
                <Typography variant="body2" color="textSecondary">Desde: {new Date(activeSession.created_at).toLocaleString()}</Typography>
                <Typography variant="body1" sx={{ mt: 2, fontWeight: 700 }}>Saldo Inicial: $ {activeSession.opening_balance.toFixed(2)}</Typography>
              </Box>
            )}
            
            {!activeSession && !loading && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <LockIcon color="error" sx={{ fontSize: 48, mb: 1 }} />
                <Typography variant="h6" color="error.main" sx={{ fontWeight: 600 }}>Caja Cerrada</Typography>
                <Typography variant="body2">Seleccione un negocio para abrir caja.</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            {activeSession ? (
              !showCloseSummary ? (
                <Button variant="contained" color="error" size="large" onClick={handleInitiateClose} disabled={loading}>
                  Iniciar Cierre de Caja
                </Button>
              ) : (
                <Box>
                  <Typography variant="h6" gutterBottom>Resumen y Cierre de Caja</Typography>
                  {loading && !sessionSummary ? <CircularProgress sx={{my:2}}/> :
                  <List dense sx={{ bgcolor: 'background.paper', my: 2, border: '1px solid #e2e8f0', borderRadius: 2 }}>
                    <ListItem>
                      <ListItemText primary="Saldo Inicial" />
                      <Typography variant="body1">$ {activeSession.opening_balance.toFixed(2)}</Typography>
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Ventas en Efectivo (Calculado)" />
                      <Typography variant="body1" color="success.dark">+ $ {(sessionSummary?.total_cash_sales || 0).toFixed(2)}</Typography>
                    </ListItem>
                    <Divider component="li" />
                    <ListItem sx={{bgcolor: '#f1f5f9'}}>
                      <ListItemText primary={<Typography fontWeight="bold">Total Esperado en Caja</Typography>} />
                      <Typography variant="h6" fontWeight="bold">= $ {expectedInCash.toFixed(2)}</Typography>
                    </ListItem>
                  </List>
                  }
                  <Grid container spacing={2} sx={{mt: 1}}>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth required label="Saldo Final (Conteo Manual)" type="number" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} placeholder="0.00" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', height: '100%', bgcolor: difference >= 0 ? '#f0fdf4' : '#fffbeb', borderColor: difference >= 0 ? 'success.main' : 'error.main' }}>
                          <Typography variant="overline" color="text.secondary">Diferencia</Typography>
                          <Typography variant="h6" fontWeight="bold" color={difference >= 0 ? 'success.dark' : 'error.dark'}>$ {difference.toFixed(2)}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12}>
                      <TextField fullWidth label="Notas de Cierre (Opcional)" multiline rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sx={{mt: 2}}>
                      <Button variant="contained" color="error" size="large" startIcon={<LockIcon />} onClick={handleCloseCash} disabled={loading || !closingBalance}>
                        Confirmar y Cerrar Turno
                      </Button>
                      <Button variant="text" onClick={() => setShowCloseSummary(false)} sx={{ml: 2}} disabled={loading}>
                        Cancelar
                      </Button>
                    </Grid>
                  </Grid>
                </Box>
              )
            ) : (
              <Box>
                <Typography variant="h6" gutterBottom>Abrir Caja</Typography>
                <Grid container spacing={2} sx={{mt: 1}}>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth label="Saldo Inicial (Fondo de Caja)" type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Notas de Apertura (Opcional)" multiline rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </Grid>
                  <Grid item xs={12}>
                    <Button variant="contained" color="success" size="large" startIcon={<LockOpenIcon />} onClick={handleOpenCash} disabled={loading || !selectedBusinessId}>
                      Abrir Caja
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
