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
import { DataGrid } from '@mui/x-data-grid';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import es from 'date-fns/locale/es';
import FilterListIcon from '@mui/icons-material/FilterList';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import CancelIcon from '@mui/icons-material/Cancel';
import ReceiptIcon from '@mui/icons-material/Receipt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
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
    valuationDetails,
    turnoverDetails,
    generateReport,
    cancelOrder
  } = useReports();

  const [reportType, setReportType] = useState('billing');
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState('ALL');
  const [openPendingModal, setOpenPendingModal] = useState(false);
  const [openEcommerceModal, setOpenEcommerceModal] = useState(false);
  const [openValuationModal, setOpenValuationModal] = useState(false);
  const [openTurnoverModal, setOpenTurnoverModal] = useState(false);

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
    } catch (err) { console.error(err); }
  };

  const handleSetToday = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay);
    setEndDate(today);
  };

  const handleCancelOrder = async (orderId, origin) => {
    if (window.confirm(`¿Estás seguro de que deseas anular la orden #${orderId.substring(0, 8)}? Esta acción liberará el stock y notificará a canales externos (Tiendanube) si corresponde.`)) {
      const res = await cancelOrder(orderId, origin);
      if (res.success) {
        alert("Orden anulada correctamente.");
        generateReport(reportType, selectedBusiness, startDate, endDate);
      } else {
        alert("Error al anular la orden: " + res.error);
      }
    }
  };

  const handleInvoiceOrder = async (orderId) => {
    alert(`Iniciando proceso de facturación para la orden #${orderId.substring(0, 8)}...`);
    try {
        const { data, error } = await supabase.functions.invoke('tfa-invoice-generator', {
            body: { orderId, action: 'create' }
        });
        if (error) throw error;
        if (data.error) throw new Error(data.error);
        alert("Factura generada con éxito.");
        generateReport(reportType, selectedBusiness, startDate, endDate);
    } catch (err) {
        alert("Error al facturar: " + err.message);
    }
  };

  const handleExportCSV = () => {
    if (!details || details.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    let headers = [];
    let keys = [];

    if (reportType === 'audit') {
      keys = Object.keys(details[0]);
      headers = keys.map(k => k.toUpperCase());
    } else if (reportType === 'products') {
      headers = ['SKU', 'Producto', 'Detalle Origen', 'Monto Total'];
      keys = ['sku', 'name', 'origin', 'amount'];
    } else {
      headers = ['Fecha', 'Concepto / Detalle', 'Origen', 'Monto'];
      keys = ['date', 'concept', 'origin', 'amount'];
    }

    const csvRows = [];
    csvRows.push(headers.join(';'));

    details.forEach(row => {
      const values = keys.map(key => {
        let val = row[key];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object' && !(val instanceof Date)) {
          val = JSON.stringify(val).replace(/;/g, ',');
        }
        if (typeof val === 'string') val = val.replace(/;/g, ',');
        if ((key === 'date' || key === 'created_at' || key === 'timestamp') && val) {
          try { val = format(new Date(val), 'dd/MM/yyyy HH:mm:ss'); } catch(e) {}
        }
        return val;
      });
      csvRows.push(values.join(';'));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `reporte_${reportType}_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              '&:hover': { bgcolor: kpi.clickable ? '#f8fafc' : 'inherit' },
              transition: 'background-color 0.2s'
            }}
            onClick={() => {
              if (kpi.clickable) {
                if (kpi.type === 'pending') setOpenPendingModal(true);
                if (kpi.type === 'ecommerce') setOpenEcommerceModal(true);
                if (kpi.type === 'valuation') setOpenValuationModal(true);
                if (kpi.type === 'turnover') setOpenTurnoverModal(true);
              }
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 700 }}>
                  {kpi.label}
                </Typography>
                {kpi.clickable && <TrendingUpIcon fontSize="small" color="action" sx={{ opacity: 0.5 }} />}
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {kpi.value}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  const billingColumns = [
    { 
      field: 'date', 
      headerName: 'Fecha', 
      width: 150,
      renderCell: (params) => params.value ? format(new Date(params.value), 'dd/MM HH:mm') : ''
    },
    { field: 'concept', headerName: 'Concepto / Factura', flex: 1 },
    { 
      field: 'origin', 
      headerName: 'Origen', 
      width: 130,
      renderCell: (params) => params.value ? (
        <Chip 
          label={params.value} 
          size="small" 
          variant="outlined" 
          color={params.value.includes('TN') ? 'info' : 'default'} 
        />
      ) : null
    },
    { 
      field: 'amount', 
      headerName: 'Monto', 
      width: 150, 
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => `$ ${parseFloat(value || 0).toLocaleString('es-AR')}`
    }
  ];

  const productColumns = [
    { field: 'sku', headerName: 'SKU', width: 130 },
    { field: 'name', headerName: 'Producto', flex: 1 },
    { field: 'origin', headerName: 'Origen (L | TN)', width: 180 },
    { 
      field: 'amount', 
      headerName: 'Monto Total', 
      width: 150, 
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => `$ ${parseFloat(value || 0).toLocaleString('es-AR')}`
    }
  ];

  const orderColumns = [
    { 
      field: 'date', 
      headerName: 'Fecha', 
      width: 150,
      renderCell: (params) => params.value ? format(new Date(params.value), 'dd/MM HH:mm') : ''
    },
    { field: 'concept', headerName: 'Cliente', flex: 1 },
    { 
      field: 'origin', 
      headerName: 'Origen y Estado', 
      width: 200,
      renderCell: (params) => (
        <Chip 
          label={params.value} 
          size="small" 
          variant="outlined" 
          color={params.value.includes('PAID') ? 'success' : (params.value.includes('CANCEL') ? 'error' : 'warning')} 
        />
      )
    },
    { 
      field: 'amount', 
      headerName: 'Total Orden', 
      width: 150, 
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (value) => `$ ${parseFloat(value || 0).toLocaleString('es-AR')}`
    }
  ];

  const stockColumns = [
    { 
      field: 'date', 
      headerName: 'Fecha', 
      width: 150,
      renderCell: (params) => params.value ? format(new Date(params.value), 'dd/MM HH:mm') : ''
    },
    { field: 'concept', headerName: 'Producto y Razón', flex: 1 },
    { 
      field: 'origin', 
      headerName: 'Tipo Movimiento', 
      width: 180,
      renderCell: (params) => (
        <Chip 
          label={params.value} 
          size="small" 
          variant="outlined" 
          color={params.value.includes('IN') || params.value.includes('RETURN') ? 'success' : (params.value.includes('OUT') ? 'error' : 'default')} 
        />
      )
    },
    { 
      field: 'amount', 
      headerName: 'Cantidad', 
      width: 120, 
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => (
        <Typography 
          variant="body2" 
          sx={{ 
            fontWeight: 700, 
            color: params.value > 0 ? 'success.main' : 'error.main' 
          }}
        >
          {params.value > 0 ? `+${params.value}` : params.value}
        </Typography>
      )
    }
  ];

  const auditColumns = [
    { 
      field: 'date', 
      headerName: 'Fecha y Hora', 
      width: 160,
      renderCell: (params) => params.value ? format(new Date(params.value), 'dd/MM HH:mm:ss') : ''
    },
    { field: 'concept', headerName: 'Acción y Tabla', flex: 1 },
    { field: 'origin', headerName: 'Responsable', width: 180 },
    { 
      field: 'business_name', 
      headerName: 'Negocio', 
      width: 150,
      renderCell: (params) => (
        <Chip 
          label={params.value} 
          size="small" 
          variant="filled" 
          color={params.value === 'GLOBAL / N/A' ? 'default' : 'secondary'} 
          sx={{ fontSize: '0.65rem', fontWeight: 700 }}
        />
      )
    }
  ];

  const allRowsHaveId = details.length === 0 || details.every(row => row && row.id !== undefined);

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
              <Tooltip title="Exportar a CSV">
                <IconButton 
                  color="primary" 
                  sx={{ border: '1px solid #e2e8f0', borderRadius: 1 }}
                  onClick={handleExportCSV}
                  disabled={loading || details.length === 0}
                >
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
            </Grid>
          </Grid>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>
        ) : (
          <>
            {renderKpiCards()}
            <Grid container spacing={3}>
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

              <Grid item xs={12} md={8}>
                <Paper variant="outlined" sx={{ height: 500, width: '100%' }}>
                  {allRowsHaveId && details.length > 0 ? (
                    <DataGrid
                      rows={details}
                      columns={
                        reportType === 'billing' ? billingColumns : 
                        reportType === 'products' ? productColumns : 
                        reportType === 'orders' ? orderColumns : 
                        reportType === 'stock' ? stockColumns : auditColumns
                      }
                      pageSizeOptions={[10, 25, 50]}
                      initialState={{
                        pagination: { paginationModel: { pageSize: 10 } },
                        sorting: { 
                          sortModel: [{ field: 'date', sort: 'desc' }] 
                        },
                      }}
                      density="compact"
                      disableRowSelectionOnClick
                    />
                  ) : (
                    <TableContainer sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography variant="body2" color="textSecondary">No hay registros para mostrar.</Typography>
                    </TableContainer>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </>
        )}

        {/* MODAL VALORACIÓN DE STOCK */}
        <Dialog open={openValuationModal} onClose={() => setOpenValuationModal(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, bgcolor: '#f1f5f9' }}>Desglose: Valoración Total del Stock</DialogTitle>
          <DialogContent dividers>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small" stickyHeader>
                <TableHead><TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Stock Actual</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Costo Unit.</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Subtotal</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {valuationDetails?.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{row.sku}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                      <TableCell align="right">{row.quantity}</TableCell>
                      <TableCell align="right">$ {row.cost.toLocaleString('es-AR')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>$ {row.total.toLocaleString('es-AR')}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                    <TableCell colSpan={4} align="right" sx={{ fontWeight: 800 }}>VALORACIÓN TOTAL:</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: 'primary.main' }}>
                      $ {valuationDetails.reduce((acc, curr) => acc + curr.total, 0).toLocaleString('es-AR')}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </DialogContent>
          <DialogActions><Button onClick={() => setOpenValuationModal(false)}>Cerrar</Button></DialogActions>
        </Dialog>

        {/* MODAL TOP 10 ROTACIÓN */}
        <Dialog open={openTurnoverModal} onClose={() => setOpenTurnoverModal(false)} maxWidth="lg" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, bgcolor: '#f3e5f5' }}>Top 10: Mayor Rotación de Stock</DialogTitle>
          <DialogContent dividers>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead><TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Stock Inicial</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Stock Final</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Unidades Movidas</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>% Rotación</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {turnoverDetails?.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{row.sku}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{row.item_name}</TableCell>
                      <TableCell align="right">{row.start_stock}</TableCell>
                      <TableCell align="right">{row.end_stock}</TableCell>
                      <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>{row.units_moved}</TableCell>
                      <TableCell align="right">
                        <Chip 
                          label={`${row.turnover_pct}%`} 
                          size="small" 
                          color="secondary" 
                          variant="filled" 
                          sx={{ fontWeight: 800 }} 
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {turnoverDetails?.length === 0 && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3 }}>No hay datos de rotación para este período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </DialogContent>
          <DialogActions><Button onClick={() => setOpenTurnoverModal(false)}>Cerrar</Button></DialogActions>
        </Dialog>

        {/* MODAL DESGLOSE PENDIENTES */}
        <Dialog open={openPendingModal} onClose={() => setOpenPendingModal(false)} maxWidth="lg" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, bgcolor: '#fffde7' }}>Desglose: Órdenes Pendientes de Facturar</DialogTitle>
          <DialogContent dividers>
            <TableContainer component={Paper} variant="outlined" sx={{ width: '100%', overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 1000 }}>
                <TableHead><TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700, width: 100 }}>Fecha</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 100 }}>Orden #</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Cliente</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 120 }}>Origen</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 100 }}>Estado</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 150 }}>Notas</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, width: 120 }}>Monto</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, width: 100 }}>Acciones</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {pendingDetails?.map((row, i) => (
                    <TableRow key={row.id || i}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.date}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{row.ref}</TableCell>
                      <TableCell>{row.concept}</TableCell>
                      <TableCell><Chip label={row.origin} size="small" variant="outlined" color={row.origin === 'TIENDANUBE' ? 'info' : 'default'} /></TableCell>
                      <TableCell>
                        <Chip 
                          label={row.status} 
                          size="small" 
                          color={row.status === 'PAID' ? 'success' : 'warning'} 
                          variant="outlined" 
                          sx={{ fontWeight: 700, fontSize: '0.65rem' }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{row.notes}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{row.amount}</TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            <Tooltip title="Generar Factura (TFA)">
                                <IconButton size="small" color="primary" onClick={() => handleInvoiceOrder(row.id)}>
                                    <ReceiptIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            {row.status !== 'PAID' && (
                              <Tooltip title="Anular Orden y Liberar Stock">
                                  <IconButton size="small" color="error" onClick={() => handleCancelOrder(row.id, row.origin)}>
                                      <CancelIcon fontSize="small" />
                                  </IconButton>
                              </Tooltip>
                            )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pendingDetails?.length > 0 && (
                    <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                      <TableCell colSpan={6} align="right" sx={{ fontWeight: 800 }}>TOTAL PENDIENTE:</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: 'error.main' }}>
                        $ {pendingDetails.reduce((acc, curr) => acc + curr.amountRaw, 0).toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </DialogContent>
          <DialogActions><Button onClick={() => setOpenPendingModal(false)}>Cerrar</Button></DialogActions>
        </Dialog>

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
                    <TableRow key={row.id || i}>
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
