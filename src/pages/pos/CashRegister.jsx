import React, { useState, useEffect, useCallback } from 'react';
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
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockIcon from '@mui/icons-material/Lock';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { useCashRegister } from '../../hooks/useCashRegister';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

export default function CashRegister() {
  const { 
    loading, 
    checkActiveSession, 
    fetchAllActiveSessions,
    fetchSessionSummary,
    fetchSessionPayments,
    fetchLastClosedSession,
    openSession, 
    closeSession,
    createAdjustment
  } = useCashRegister();

  const { profile } = useAuthStore();
  const [businesses, setBusinesses] = useState([]);
  const [allSessions, setAllSessions] = useState({}); // { businessId: session }
  const [lastSessions, setLastSessions] = useState({}); // { businessId: lastClosedSession }
  const [businessMetrics, setBusinessMetrics] = useState({}); // { businessId: { payments, hourlyRate } }
  const [globalMetrics, setGlobalMetrics] = useState({ total: 0, hourlyRate: 0, byMethod: {} });
  
  // Estados para diálogos
  const [openModal, setOpenModal] = useState(false); // 'OPEN', 'CLOSE' o 'ADJUST'
  const [modalType, setModalType] = useState(null); 
  const [currentBusiness, setCurrentBusiness] = useState(null);
  
  const [openingBalance, setOpeningBalance] = useState('0');
  const [closingBalance, setClosingBalance] = useState('');
  const [adjustment, setAdjustment] = useState({ amount: '', type: 'WITHDRAWAL', reason: '' });
  const [closingSummary, setClosingSummary] = useState(null);
  const [notes, setNotes] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [isProcessing, setIsProcessing] = useState(false);

  const isOwner = profile?.app_role === 'OWNER';

  const methodLabels = {
    'CASH': 'Efectivo',
    'POINT_MP': 'MP Terminal (Manual)',
    'ONLINE_MP': 'MP Dispositivo / Online',
    'OTROS': 'Otros'
  };

  const loadDashboardData = useCallback(async () => {
    if (!profile?.account_id) return;
    setIsProcessing(true);
    try {
      // 1. Cargar Negocios según rol (Filtrado por vinculación)
      let bizData;
      if (profile.app_role === 'OWNER' || profile.app_role === 'ADMIN' || profile.app_role === 'DEVELOPER') {
        const { data } = await supabase
          .schema('core')
          .from('businesses')
          .select('*')
          .eq('account_id', profile.account_id)
          .eq('is_deleted', false);
        bizData = data;
      } else {
        const { data: assignments, error: assignError } = await supabase
          .schema('core')
          .from('employee_assignments')
          .select('business_id, businesses(*)')
          .eq('user_id', profile.id)
          .eq('is_deleted', false);
        
        if (assignError) throw assignError;
        bizData = assignments.map(a => a.businesses).filter(b => b && !b.is_deleted);
      }
      
      setBusinesses(bizData || []);

      // 2. Cargar todas las sesiones activas
      const activeSessions = await fetchAllActiveSessions();
      const sessionMap = {};
      activeSessions.forEach(s => { sessionMap[s.business_id] = s; });
      setAllSessions(sessionMap);

      // 3. Cargar últimos cierres y métricas por negocio
      const metricsMap = {};
      const lastSessionMap = {};
      let globalTotal = 0;
      let globalByMethod = {};
      let totalDurationHours = 0;

      await Promise.all((bizData || []).map(async (biz) => {
        // Obtener último cierre para saldo anterior
        const lastClosed = await fetchLastClosedSession(biz.id);
        if (lastClosed) lastSessionMap[biz.id] = lastClosed;

        const session = sessionMap[biz.id];
        if (session) {
          const payments = await fetchSessionPayments(session.created_at, biz.id);
          const totalBiz = payments.reduce((sum, p) => sum + p.total, 0);
          
          const openedAt = new Date(session.created_at);
          const now = new Date();
          const durationHours = Math.max((now - openedAt) / (1000 * 60 * 60), 0.1);
          const hourlyRate = totalBiz / durationHours;

          metricsMap[biz.id] = { payments, hourlyRate, total: totalBiz };
          
          globalTotal += totalBiz;
          totalDurationHours += durationHours;
          payments.forEach(p => {
            globalByMethod[p.method] = (globalByMethod[p.method] || 0) + p.total;
          });
        }
      }));

      setLastSessions(lastSessionMap);
      setBusinessMetrics(metricsMap);
      setGlobalMetrics({
        total: globalTotal,
        hourlyRate: totalDurationHours > 0 ? globalTotal / totalDurationHours : 0,
        byMethod: globalByMethod
      });

    } catch (err) {
      console.error("Error loading dashboard:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [profile?.account_id, profile?.id, profile?.app_role, fetchAllActiveSessions, fetchSessionPayments, fetchLastClosedSession]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleOpenModal = async (type, business) => {
    setCurrentBusiness(business);
    setModalType(type);
    
    if (type === 'OPEN') {
      const lastClose = lastSessions[business.id]?.closing_balance || 0;
      setOpeningBalance(lastClose.toString());
    }

    if (type === 'CLOSE') {
      setIsProcessing(true);
      const session = allSessions[business.id];
      const summary = await fetchSessionSummary(session.id);
      setClosingSummary(summary);
      setIsProcessing(false);
    }

    setClosingBalance('');
    setAdjustment({ amount: '', type: 'WITHDRAWAL', reason: '' });
    setNotes('');
    setOpenModal(true);
  };

  const handleActionOpen = async () => {
    setIsProcessing(true);
    const res = await openSession(currentBusiness.id, parseFloat(openingBalance), notes);
    if (res.success) {
      setSnackbar({ open: true, message: 'Caja abierta exitosamente.', severity: 'success' });
      setOpenModal(false);
      loadDashboardData();
    } else {
      setSnackbar({ open: true, message: `Error: ${res.error}`, severity: 'error' });
    }
    setIsProcessing(false);
  };

  const handleActionClose = async () => {
    setIsProcessing(true);
    const session = allSessions[currentBusiness.id];
    
    const res = await closeSession(
      session.id, 
      parseFloat(closingBalance || 0), 
      closingSummary?.expected_cash || 0,
      notes
    );
    
    if (res.success) {
      setSnackbar({ open: true, message: 'Caja cerrada exitosamente.', severity: 'success' });
      setOpenModal(false);
      setClosingSummary(null);
      loadDashboardData();
    } else {
      setSnackbar({ open: true, message: `Error: ${res.error}`, severity: 'error' });
    }
    setIsProcessing(false);
  };

  const handleActionAdjustment = async () => {
    if (!adjustment.amount || !adjustment.reason) {
      setSnackbar({ open: true, message: 'Monto y motivo son requeridos.', severity: 'warning' });
      return;
    }
    setIsProcessing(true);
    const session = allSessions[currentBusiness.id];
    const res = await createAdjustment(currentBusiness.id, session.id, adjustment);
    
    if (res.success) {
      setSnackbar({ open: true, message: 'Ajuste registrado correctamente.', severity: 'success' });
      setOpenModal(false);
      loadDashboardData();
    } else {
      setSnackbar({ open: true, message: `Error: ${res.error}`, severity: 'error' });
    }
    setIsProcessing(false);
  };

  return (
    <Box sx={{ flexGrow: 1, p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary' }}>
          Estado de Cajas
        </Typography>
        <IconButton onClick={loadDashboardData} disabled={isProcessing}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Resumen Global */}
      {(isOwner || profile?.app_role === 'ADMIN') && (
        <Paper sx={{ p: 3, mb: 4, borderRadius: 4, bgcolor: 'primary.main', color: 'white' }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={5}>
              <Typography variant="overline" sx={{ opacity: 0.8 }}>Ingresos Globales (Sesiones Activas)</Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                $ {Math.round(globalMetrics.total).toLocaleString()}
              </Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUpIcon />
                <Typography variant="overline" sx={{ opacity: 0.8 }}>$/h Global</Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                $ {Math.round(globalMetrics.hourlyRate).toLocaleString()}
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="overline" sx={{ opacity: 0.8 }}>Desglose Global</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                {Object.entries(globalMetrics.byMethod).map(([method, total]) => (
                  <Chip 
                    key={method} 
                    label={`${methodLabels[method] || method}: $${Math.round(total).toLocaleString()}`} 
                    size="small" 
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600 }} 
                  />
                ))}
              </Box>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Grid de Negocios */}
      <Grid container spacing={3}>
        {businesses.map((biz) => {
          const session = allSessions[biz.id];
          const metrics = businessMetrics[biz.id];
          const lastClose = lastSessions[biz.id];
          const isOpen = !!session;

          return (
            <Grid item xs={12} sm={6} md={4} key={biz.id}>
              <Card sx={{ height: '100%', borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <StorefrontIcon color="action" />
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>{biz.name}</Typography>
                    </Box>
                    <Chip 
                      label={isOpen ? "ABIERTA" : "CERRADA"} 
                      color={isOpen ? "success" : "default"} 
                      size="small" 
                      sx={{ fontWeight: 800 }}
                    />
                  </Box>

                  {lastClose && (
                    <Box sx={{ mb: 2, p: 1, bgcolor: '#f1f5f9', borderRadius: 1, display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="textSecondary">Cierre Anterior:</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>$ {lastClose.closing_balance.toLocaleString()}</Typography>
                    </Box>
                  )}

                  {isOpen ? (
                    <Box>
                      <Typography variant="caption" color="textSecondary">Rendimiento Actual:</Typography>
                      <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', mb: 2 }}>
                        $ {Math.round(metrics?.hourlyRate || 0).toLocaleString()} / h
                      </Typography>
                      
                      <Divider sx={{ my: 1.5 }} />
                      
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {metrics?.payments.map(p => (
                          <Box key={p.method} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="textSecondary">{methodLabels[p.method] || p.method}:</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>$ {Math.round(p.total).toLocaleString()}</Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{ py: 4, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2 }}>
                      <Typography variant="body2" color="textSecondary">Sin actividad reciente</Typography>
                    </Box>
                  )}
                </CardContent>
                
                <CardActions sx={{ p: 2, bgcolor: '#f8fafc', flexDirection: 'column', gap: 1 }}>
                  {isOpen ? (
                    <>
                      <Button 
                        fullWidth 
                        variant="contained" 
                        color="error" 
                        startIcon={<LockIcon />}
                        onClick={() => handleOpenModal('CLOSE', biz)}
                      >
                        Cerrar Caja
                      </Button>
                      <Button 
                        fullWidth 
                        variant="outlined" 
                        color="primary" 
                        startIcon={<AddCircleOutlineIcon />}
                        onClick={() => handleOpenModal('ADJUST', biz)}
                      >
                        Ajuste de Caja
                      </Button>
                    </>
                  ) : (
                    <Button 
                      fullWidth 
                      variant="contained" 
                      color="success" 
                      startIcon={<LockOpenIcon />}
                      onClick={() => handleOpenModal('OPEN', biz)}
                    >
                      Abrir Caja
                    </Button>
                  )}
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Modales */}
      <Dialog open={openModal} onClose={() => !isProcessing && setOpenModal(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 800 }}>
          {modalType === 'OPEN' && `Abrir Caja - ${currentBusiness?.name}`}
          {modalType === 'CLOSE' && `Cerrar Caja - ${currentBusiness?.name}`}
          {modalType === 'ADJUST' && `Ajuste de Caja - ${currentBusiness?.name}`}
        </DialogTitle>
        <DialogContent dividers>
          {modalType === 'OPEN' ? (
            <Box sx={{ pt: 1 }}>
              <TextField 
                fullWidth 
                label="Saldo Inicial (Fondo de Caja)" 
                type="number" 
                value={openingBalance} 
                onChange={(e) => setOpeningBalance(e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField 
                fullWidth 
                label="Notas de Apertura" 
                multiline 
                rows={2} 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
              />
            </Box>
          ) : modalType === 'CLOSE' ? (
            <Box sx={{ pt: 1 }}>
              {closingSummary && (
                <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#f8fafc' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Balance Detallado (Efectivo):</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Saldo Inicial:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>$ {closingSummary.opening_balance.toLocaleString()}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Ventas en Efectivo (+):</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>$ {closingSummary.total_sales_cash.toLocaleString()}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Aportes / Sobrantes (+):</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>$ {closingSummary.total_contributions.toLocaleString()}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Retiros / Faltantes (-):</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>$ {closingSummary.total_withdrawals.toLocaleString()}</Typography>
                    </Box>
                    <Divider sx={{ my: 0.5 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Efectivo Esperado:</Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'primary.main' }}>$ {closingSummary.expected_cash.toLocaleString()}</Typography>
                    </Box>
                  </Box>
                </Paper>
              )}
              
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>Saldo Final Real (Conteo Manual):</Typography>
              <TextField 
                fullWidth 
                required 
                placeholder="Ingrese el monto contado en caja"
                type="number" 
                value={closingBalance} 
                onChange={(e) => setClosingBalance(e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField 
                fullWidth 
                label="Notas de Cierre" 
                multiline 
                rows={2} 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
              />
            </Box>
          ) : (
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Ajuste</InputLabel>
                <Select
                  value={adjustment.type}
                  label="Tipo de Ajuste"
                  onChange={(e) => setAdjustment({...adjustment, type: e.target.value})}
                >
                  <MenuItem value="WITHDRAWAL">Retiro de Caja (-)</MenuItem>
                  <MenuItem value="CONTRIBUTION">Aporte a Caja (+)</MenuItem>
                  <MenuItem value="DIFF_POSITIVE">Diferencia a Favor (+)</MenuItem>
                  <MenuItem value="DIFF_NEGATIVE">Diferencia Negativa (-)</MenuItem>
                </Select>
              </FormControl>
              <TextField 
                fullWidth 
                label="Monto" 
                type="number" 
                value={adjustment.amount}
                onChange={(e) => setAdjustment({...adjustment, amount: e.target.value})}
              />
              <TextField 
                fullWidth 
                label="Motivo / Detalle" 
                multiline 
                rows={2} 
                value={adjustment.reason}
                onChange={(e) => setAdjustment({...adjustment, reason: e.target.value})}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setOpenModal(false)} disabled={isProcessing}>Cancelar</Button>
          <Button 
            variant="contained" 
            color={modalType === 'CLOSE' ? "error" : "primary"}
            onClick={
              modalType === 'OPEN' ? handleActionOpen : 
              modalType === 'CLOSE' ? handleActionClose : 
              handleActionAdjustment
            }
            disabled={
              isProcessing || 
              (modalType === 'CLOSE' && !closingBalance) ||
              (modalType === 'ADJUST' && (!adjustment.amount || !adjustment.reason))
            }
          >
            {isProcessing ? <CircularProgress size={24} color="inherit" /> : 
              (modalType === 'OPEN' ? "Abrir Ahora" : 
               modalType === 'CLOSE' ? "Confirmar Cierre" : "Registrar Ajuste")}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
