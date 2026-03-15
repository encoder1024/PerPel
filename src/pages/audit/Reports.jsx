import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  MenuItem,
  TextField,
  Button,
  Divider,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import es from 'date-fns/locale/es';
import FilterListIcon from '@mui/icons-material/FilterList';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import BugReportIcon from '@mui/icons-material/BugReport';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';
import { useReports } from '../../hooks/useReports';

const REPORT_TYPES = [
  { id: 'billing', label: 'Ventas por Facturación' },
  { id: 'products', label: 'Ventas por Producto' },
  { id: 'orders', label: 'Órdenes (Estado y Conversión)' },
  { id: 'stock', label: 'Movimientos de Stock' },
  { id: 'audit', label: 'Auditoría de Sistema' },
];

export default function Reports() {
  const { profile } = useAuthStore();
  const { 
    loading, 
    error, 
    kpis, 
    top5, 
    details, 
    pendingDetails,
    ecommerceDetails,
    generateReport 
  } = useReports();

  const [reportType, setReportType] = useState('billing');
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState('ALL');
  const [openPendingModal, setOpenPendingModal] = useState(false);
  const [openEcommerceModal, setOpenEcommerceModal] = useState(false);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(0); 
    return d;
  });

  useEffect(() => {
    fetchInitialData();
  }, [profile?.account_id]);

  useEffect(() => {
    if (profile?.account_id) {
      generateReport(reportType, selectedBusiness, startDate, endDate);
    }
  }, [reportType, selectedBusiness, startDate, endDate, generateReport, profile?.account_id]);

  const fetchInitialData = async () => {
    try {
      const { data } = await supabase.schema('core').from('businesses').select('id, name').eq('account_id', profile.account_id).eq('is_deleted', false);
      setBusinesses(data || []);
    } catch (err) { console.error(err); setError("Error al cargar sucursales."); }
  };

  const handleSetToday = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay);
    setEndDate(today);
  };

  const renderKpiCards = () => (
    <Grid container spacing={3} sx={{ mb: 4 }}>
      {kpis.map((kpi, index) => (
        <Grid item xs={12} md={3} key={index}>
          <Card 
            variant="outlined" 
            sx={{ 
              borderLeft: `6px solid`, 
              borderColor: `${kpi.color || 'primary'}.main`,
              cursor: kpi.clickable ? 'pointer' : 'default',
              '&:hover': { bgcolor: kpi.clickable ? '#fffde7' : 'inherit' },
              transition: 'background-color 0.2s'
            }}
            onClick={() => {
              if (kpi.clickable) {
                if (kpi.type === 'pending') setOpenPendingModal(true);
                if (kpi.type === 'ecommerce') setOpenEcommerceModal(true);
              }
            }}
          >
            <CardContent>
              <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 700 }}>
                {kpi.label}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {kpi.value}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
          Centro de Reportes y Análisis
        </Typography>

        <Paper variant="outlined" sx={{ p: 2, mb: 4, bgcolor: '#f8fafc' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <TextField select fullWidth size="small" label="Seleccionar Reporte" value={reportType} onChange={(e) => setReportType(e.target.value)}>
                {REPORT_TYPES.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField select fullWidth size="small" label="Sucursal / Canal" value={selectedBusiness} onChange={(e) => setSelectedBusiness(e.target.value)}>
                <MenuItem value="ALL">Todas las Sucursales</MenuItem>
                {businesses.map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <DatePicker label="Desde" value={startDate} onChange={(newValue) => setStartDate(newValue)} slotProps={{ textField: { size: 'small', fullWidth: true } }} />
            </Grid>
            <Grid item xs={12} md={2}>
              <DatePicker label="Hasta" value={endDate} onChange={(newValue) => setEndDate(newValue)} slotProps={{ textField: { size: 'small', fullWidth: true } }} />
            </Grid>
            <Grid item xs={12} md={2} sx={{ display: 'flex', gap: 1 }}>
              <Button fullWidth variant="contained" color="secondary" startIcon={<RefreshIcon />} onClick={handleSetToday} disabled={loading}>Ver Hoy</Button>
              <Tooltip title="Exportar a CSV"><IconButton color="primary" sx={{ border: '1px solid #e2e8f0', borderRadius: 1 }}><DownloadIcon /></IconButton></Tooltip>
            </Grid>
          </Grid>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {/* CONTENIDO DEL REPORTE */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>
        ) : (
          <>
            {renderKpiCards()}
            <Grid container spacing={3}>
              {/* TOP 5 RESUMEN */}
              <Grid item xs={12} md={4}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>Resumen Top 5</Typography>
                  <Divider sx={{ mb: 2 }} />
                  {top5.length > 0 ? (
                    <Table size="small">
                      <TableBody>
                        {top5.map((item, i) => (
                          <TableRow key={i}>
                            <TableCell sx={{ border: 0, py: 0.5, fontWeight: 600 }}>{item.label}</TableCell>
                            <TableCell align="right" sx={{ border: 0, py: 0.5, whiteSpace: 'nowrap' }}>{item.value}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Typography variant="body2" color="textSecondary" align="center">Sin datos de ranking.</Typography>
                  )}
                </Paper>
              </Grid>

              {/* TABLA DE DETALLES */}
              <Grid item xs={12} md={8}>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                        <TableCell sx={{ fontWeight: 700 }}>{reportType === 'products' ? 'SKU' : 'Fecha'}</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{reportType === 'products' ? 'Producto' : 'Concepto / Cliente'}</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Origen</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, width: 160 }}>Monto</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {details.length > 0 ? details.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{reportType === 'products' ? row.sku : row.date}</TableCell>
                          <TableCell>{reportType === 'products' ? row.name : row.concept}</TableCell>
                          <TableCell><Chip label={row.origin} size="small" variant="outlined" color={row.origin.includes('TN') ? 'info' : 'default'} /></TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{row.amount}</TableCell>
                        </TableRow>
                      )) : <TableRow><TableCell colSpan={4} align="center" sx={{ py: 5 }}>No hay registros.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </>
        )}

        {/* MODAL DESGLOSE PENDIENTES */}
        <Dialog open={openPendingModal} onClose={() => setOpenPendingModal(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, bgcolor: '#fffde7' }}>Desglose: Órdenes Pendientes de Facturar</DialogTitle>
          <DialogContent dividers>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead><TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Orden #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Cliente</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Origen</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Monto</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {pendingDetails?.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{row.ref}</TableCell>
                      <TableCell>{row.concept}</TableCell>
                      <TableCell><Chip label={row.origin} size="small" variant="outlined" color={row.origin === 'TIENDANUBE' ? 'info' : 'default'} /></TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{row.amount}</TableCell>
                    </TableRow>
                  ))}
                  {pendingDetails?.length > 0 && (
                    <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                      <TableCell colSpan={4} align="right" sx={{ fontWeight: 800 }}>TOTAL PENDIENTE:</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: 'error.main' }}>
                        $ {pendingDetails.reduce((acc, curr) => acc + curr.amountRaw, 0).toLocaleString('es-AR')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </DialogContent>
          <DialogActions><Button onClick={() => setOpenPendingModal(false)}>Cerrar</Button></DialogActions>
        </Dialog>

        {/* MODAL DESGLOSE E-COMMERCE */}
        <Dialog open={openEcommerceModal} onClose={() => setOpenEcommerceModal(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, bgcolor: '#e3f2fd' }}>Desglose: Ventas Tiendanube</DialogTitle>
          <DialogContent dividers>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead><TableRow sx={{ bgcolor: '#f1f5f9' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Ref TN</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Productos</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Monto</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {ecommerceDetails?.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{row.ref}</TableCell>
                      <TableCell>{row.concept}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{row.amount}</TableCell>
                    </TableRow>
                  ))}
                  {ecommerceDetails?.length > 0 && (
                    <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                      <TableCell colSpan={3} align="right" sx={{ fontWeight: 800 }}>TOTAL E-COMMERCE:</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: 'primary.main' }}>
                        $ {ecommerceDetails.reduce((acc, curr) => acc + curr.amountRaw, 0).toLocaleString('es-AR')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </DialogContent>
          <DialogActions><Button onClick={() => setOpenEcommerceModal(false)}>Cerrar</Button></DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
}
