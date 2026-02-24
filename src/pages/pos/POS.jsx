import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Typography,
  Paper,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Divider,
  Card,
  CardContent,
  CardActionArea,
  InputAdornment,
  MenuItem,
  CircularProgress,
  Snackbar,
  Alert,
  Avatar,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PaymentsIcon from '@mui/icons-material/Payments';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import CancelIcon from '@mui/icons-material/Cancel';
import { useInventory } from '../../hooks/useInventory';
import { usePOS } from '../../hooks/usePOS';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';
import { useOffline } from '../../hooks/useOffline';
import PaymentGateway from '../../components/common/PaymentGateway';
import { useCashRegister } from '../../hooks/useCashRegister';
import { useMercadoPagoPoint } from '../../hooks/useMercadoPagoPoint';

// Default "Consumidor Final" object
const CONSUMIDOR_FINAL = {
  id: '00000000-0000-0000-0000-000000000000',
  full_name: 'Consumidor Final',
  doc_type: '99',
  doc_number: '0',
  iva_condition: 'Consumidor Final'
};

export default function POS() {
  const { items, loading: inventoryLoading, refresh } = useInventory();
  const {
    cart,
    selectedCustomer,
    setSelectedCustomer,
    loading: posLoading,
    addToCart,
    removeFromCart,
    updateQuantity,
    calculateTotal,
    createOrder,
    cancelOrder,
    processManualPayment,
    clearCart,
    findProductBySKU,
    findProductRemote,
    createCustomer
  } = usePOS();
  
  const { activeSession, checkActiveSession } = useCashRegister();
  const { profile } = useAuthStore();
  const { db } = useOffline();
  const { loading: mpPointLoading, error: mpPointError, createPointPaymentIntent } = useMercadoPagoPoint();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  
  // Customer Selector State
  const [customerOptions, setCustomerOptions] = useState([CONSUMIDOR_FINAL]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [openCustomerModal, setOpenCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    full_name: '',
    doc_type: '96',
    doc_number: '',
    email: '',
    phone_number: ''
  });

  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Scan state
  const [lastScannedSku, setLastScannedSku] = useState(null);
  const [openScanConfirm, setOpenScanConfirm] = useState(false);

  // Initialize customer selector
  useEffect(() => {
    if (!selectedCustomer) {
        setSelectedCustomer(CONSUMIDOR_FINAL);
    }
  }, [selectedCustomer, setSelectedCustomer]);

  // Fetch customers from RxDB for Autocomplete
  useEffect(() => {
    const searchCustomers = async () => {
      if (!db || !profile?.account_id) return;
      
      try {
        const query = {
          selector: {
            account_id: profile.account_id,
            is_deleted: false
          }
        };

        if (customerSearch && customerSearch.length >= 2) {
          query.selector.$or = [
            { full_name: { $regex: new RegExp(customerSearch, 'i') } },
            { doc_number: { $regex: new RegExp(customerSearch, 'i') } }
          ];
        }

        const results = await db.customers.find(query).exec();
        const list = results.map(d => d.toJSON());
        
        setCustomerOptions([CONSUMIDOR_FINAL, ...list]);
      } catch (err) {
        console.error("RxDB Search Error:", err);
      }
    };

    searchCustomers();
  }, [db, customerSearch, profile?.account_id]);

  // Payment Flow State
  const [orderCreated, setOrderCreated] = useState(null);
  const [openPaymentDialog, setOpenPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null); // 'CASH', 'MANUAL_MP', 'ONLINE_MP', 'POINT_MP'
  const [pointDevices, setPointDevices] = useState([]);
  const [selectedPointDeviceId, setSelectedPointDeviceId] = useState('');
  const [intentStatus, setIntentStatus] = useState(null); // 'WAITING', 'SUCCESS', 'ERROR'

  // Barcode Scanning logic
  useBarcodeScanner(async (code) => {
    const res = await findProductBySKU(code);
    if (res.success) {
      addToCart(res.item);
      setSnackbar({ open: true, message: `Añadido: ${res.item.name}`, severity: 'success' });
    } else if (res.code === 'NOT_FOUND_LOCAL') {
      setLastScannedSku(code);
      setOpenScanConfirm(true);
    } else {
      setSnackbar({ open: true, message: res.error || 'Error en escaneo.', severity: 'error' });
    }
  });

  const handleRemoteSearch = async () => {
    if (!lastScannedSku) return;
    const res = await findProductRemote(lastScannedSku);
    if (res.success) {
      addToCart(res.item);
      setSnackbar({ open: true, message: `Encontrado en servidor y añadido: ${res.item.name}`, severity: 'success' });
      setOpenScanConfirm(false);
      setLastScannedSku(null);
    } else {
      setSnackbar({ open: true, message: res.error, severity: 'error' });
      setOpenScanConfirm(false);
      setLastScannedSku(null);
    }
  };

  const handleQuickAddCustomer = async () => {
    if (!newCustomer.full_name || !newCustomer.doc_number) {
        setSnackbar({ open: true, message: 'Nombre y Documento son requeridos.', severity: 'error' });
        return;
    }

    const res = await createCustomer({
        ...newCustomer,
        business_id: selectedBusinessId
    });

    if (res.success) {
        setSnackbar({ open: true, message: 'Cliente registrado y seleccionado.', severity: 'success' });
        setOpenCustomerModal(false);
        setNewCustomer({ full_name: '', doc_type: '96', doc_number: '', email: '', phone_number: '' });
    } else {
        setSnackbar({ open: true, message: 'Error: ' + res.error, severity: 'error' });
    }
  };

  // Fetch businesses for the account
  useEffect(() => {
    const fetchBusinesses = async () => {
      const { data, error } = await supabase
        .schema('core')
        .from('businesses')
        .select('*')
        .eq('account_id', profile?.account_id)
        .eq('is_deleted', false);

      if (data) {
        setBusinesses(data);
        if (data.length > 0) {
          setSelectedBusinessId(data[0].id);
          checkActiveSession(data[0].id);
        }
      }
    };
    if (profile?.account_id) fetchBusinesses();
  }, [profile?.account_id, checkActiveSession]);

  // Check session when business changes
  useEffect(() => {
    if (selectedBusinessId) {
      checkActiveSession(selectedBusinessId);
    }
  }, [selectedBusinessId, checkActiveSession]);

  const filteredItems = items.filter(
    (item) =>
      item.item_status === 'ACTIVE' &&
      (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleCheckout = async () => {
    if (!selectedBusinessId) {
      setSnackbar({ open: true, message: 'Por favor selecciona un negocio.', severity: 'error' });
      return;
    }

    const response = await createOrder({ business_id: selectedBusinessId });
    if (response.success) {
      setOrderCreated({ 
        id: response.orderId, 
        offline: !!response.offline,
        items: [...cart],
        businessId: selectedBusinessId
      });
      setOpenPaymentDialog(true);
      setPaymentMethod(null);
      
      setSnackbar({
        open: true,
        message: response.offline ? 'Orden registrada localmente.' : 'Orden creada exitosamente.',
        severity: response.offline ? 'warning' : 'success',
      });
    } else {
      setSnackbar({ open: true, message: 'Error: ' + response.error, severity: 'error' });
    }
  };

  const handleCancelOrder = async () => {
    if (!orderCreated) return;
    
    const res = await cancelOrder(orderCreated.id, orderCreated.businessId, orderCreated.items);
    if (res.success) {
      setSnackbar({ open: true, message: 'Orden cancelada y stock liberado.', severity: 'info' });
      setOpenPaymentDialog(false);
      setOrderCreated(null);
    } else {
      setSnackbar({ open: true, message: 'Error al cancelar: ' + res.error, severity: 'error' });
    }
  };

  const handleManualPayment = async (method) => {
    if (!orderCreated) return;

    if (method === 'CASH' && !activeSession) {
      setSnackbar({ 
        open: true, 
        message: 'No hay una sesión de caja abierta para este negocio. Debes abrir caja primero.', 
        severity: 'error' 
      });
      return;
    }

    const res = await processManualPayment(orderCreated.id, {
      amount: calculateTotal(),
      method: method,
      type: 'point'
    });

    if (res.success) {
      setSnackbar({ open: true, message: 'Venta completada con éxito.', severity: 'success' });
      handleClosePayment();
    } else {
      setSnackbar({ open: true, message: 'Error al procesar pago: ' + res.error, severity: 'error' });
    }
  };

  const handleSelectPaymentMethod = async (method) => {
    setPaymentMethod(method);
    if (method === 'POINT_MP') {
      setIntentStatus(null);
      const { data, error } = await supabase
        .schema('core')
        .from('point_devices')
        .select('id, name')
        .eq('business_id', selectedBusinessId)
        .eq('account_id', profile?.account_id)
        .eq('status', 'ACTIVE')
        .eq('is_deleted', false);

      if (error) {
        setSnackbar({ open: true, message: `Error al cargar dispositivos: ${error.message}`, severity: 'error' });
        return;
      }
      
      setPointDevices(data);
      if (data.length > 0) {
        setSelectedPointDeviceId(data[0].id);
      } else {
        setSnackbar({ open: true, message: 'No hay dispositivos Point activos para este negocio.', severity: 'warning' });
      }
    }
  };

  const handleSendPointIntent = async () => {
    if (!orderCreated?.id || !selectedPointDeviceId) {
      setSnackbar({ open: true, message: 'Falta la orden o el dispositivo seleccionado.', severity: 'error' });
      return;
    }
    setIntentStatus('WAITING');
    const result = await createPointPaymentIntent(orderCreated.id, selectedPointDeviceId);
    if (result.success) {
      setSnackbar({ open: true, message: 'Cobro enviado a la terminal.', severity: 'info' });
    } else {
      setIntentStatus('ERROR');
      setSnackbar({ open: true, message: `Error al enviar cobro: ${result.error}`, severity: 'error' });
    }
  };

  const handleClosePayment = () => {
    setOpenPaymentDialog(false);
    setOrderCreated(null);
    clearCart();
    setPaymentMethod(null);
    setPointDevices([]);
    setSelectedPointDeviceId('');
    setIntentStatus(null);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Grid container spacing={2}>
        {/* Catálogo de Productos */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, height: 'calc(100vh - 120px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                placeholder="Buscar productos por nombre o SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                select
                sx={{ minWidth: 200 }}
                label="Negocio / Local"
                value={selectedBusinessId}
                onChange={(e) => setSelectedBusinessId(e.target.value)}
              >
                {businesses.map((b) => (
                  <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                ))}
              </TextField>
            </Box>

            {inventoryLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
            ) : (
              <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                <Grid container spacing={1.5}>
                  {filteredItems.map((item) => (
                    <Grid item xs={12} sm={6} md={4} key={item.id}>
                      <Card variant="outlined">
                        <CardActionArea onClick={() => addToCart(item)}>
                          <CardContent sx={{ p: 1.5 }}>
                            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>{item.name}</Typography>
                            <Typography variant="body2" color="textSecondary">{item.sku || '-'}</Typography>
                            <Typography variant="h6" sx={{ mt: 1, color: 'primary.main', fontWeight: 700 }}>
                              $ {item.selling_price.toFixed(2)}
                            </Typography>
                          </CardContent>
                        </CardActionArea>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Carrito de Compras */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Badge badgeContent={cart.length} color="primary" sx={{ mr: 2 }}>
                <ShoppingCartIcon color="action" />
              </Badge>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Carrito</Typography>
            </Box>

            <Divider />

            <List sx={{ flexGrow: 1, overflowY: 'auto', py: 1 }}>
              {cart.map((item) => (
                <ListItem key={item.id} divider disablePadding sx={{ py: 1 }}>
                  <ListItemText
                    primary={item.name}
                    secondary={`$ ${item.selling_price.toFixed(2)} x ${item.quantity}`}
                  />
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <IconButton size="small" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                        <RemoveIcon fontSize="small" />
                      </IconButton>
                      <Typography sx={{ mx: 1, fontWeight: 600 }}>{item.quantity}</Typography>
                      <IconButton size="small" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                        <AddIcon fontSize="small" />
                      </IconButton>
                      <IconButton edge="end" size="small" onClick={() => removeFromCart(item.id)} sx={{ ml: 1, color: 'error.main' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
              {cart.length === 0 && (
                <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', mt: 4 }}>
                  El carrito está vacío
                </Typography>
              )}
            </List>

            <Box sx={{ mt: 'auto', pt: 2, borderTop: '2px solid #e2e8f0' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Autocomplete
                  fullWidth
                  options={customerOptions}
                  getOptionLabel={(option) => {
                    const name = option.full_name || '';
                    const doc = option.doc_number || '';
                    const displayDoc = doc.length > 3 ? doc.slice(-3) : doc;
                    return doc ? `${name} (${displayDoc})` : name;
                  }}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  value={selectedCustomer}
                  onChange={(event, newValue) => {
                    setSelectedCustomer(newValue || CONSUMIDOR_FINAL);
                  }}
                  onInputChange={(event, newInputValue) => {
                    setCustomerSearch(newInputValue);
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Cliente" size="small" />
                  )}
                />
                <Tooltip title="Nuevo Cliente">
                  <IconButton color="primary" onClick={() => setOpenCustomerModal(true)}>
                    <PersonAddIcon />
                  </IconButton>
                </Tooltip>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Total:</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main' }}>
                  $ {calculateTotal().toFixed(2)}
                </Typography>
              </Box>

              <Button
                fullWidth
                variant="contained"
                size="large"
                startIcon={<PointOfSaleIcon />}
                disabled={cart.length === 0 || posLoading}
                onClick={handleCheckout}
                sx={{ py: 1.5, fontWeight: 700 }}
              >
                {posLoading ? <CircularProgress size={24} color="inherit" /> : 'Confirmar Venta'}
              </Button>
              <Button
                fullWidth
                variant="text"
                color="error"
                size="small"
                sx={{ mt: 1 }}
                onClick={clearCart}
                disabled={cart.length === 0}
              >
                Vaciar Carrito
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Modal de Nuevo Cliente */}
      <Dialog open={openCustomerModal} onClose={() => setOpenCustomerModal(false)}>
        <DialogTitle>Registrar Nuevo Cliente</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Nombre Completo"
              value={newCustomer.full_name}
              onChange={(e) => setNewCustomer({...newCustomer, full_name: e.target.value})}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                select
                sx={{ width: 120 }}
                label="Tipo Doc"
                value={newCustomer.doc_type}
                onChange={(e) => setNewCustomer({...newCustomer, doc_type: e.target.value})}
              >
                <MenuItem value="96">DNI</MenuItem>
                <MenuItem value="80">CUIT</MenuItem>
              </TextField>
              <TextField
                fullWidth
                label="Nro Documento"
                value={newCustomer.doc_number}
                onChange={(e) => setNewCustomer({...newCustomer, doc_number: e.target.value})}
              />
            </Box>
            <TextField
              fullWidth
              label="Email (Opcional)"
              value={newCustomer.email}
              onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
            />
            <TextField
              fullWidth
              label="Teléfono (Opcional)"
              value={newCustomer.phone_number}
              onChange={(e) => setNewCustomer({...newCustomer, phone_number: e.target.value})}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCustomerModal(false)}>Cancelar</Button>
          <Button onClick={handleQuickAddCustomer} variant="contained">Guardar y Seleccionar</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de Búsqueda Remota si no se encuentra localmente */}
      <Dialog open={openScanConfirm} onClose={() => setOpenScanConfirm(false)}>
        <DialogTitle>Producto no encontrado localmente</DialogTitle>
        <DialogContent>
          <Typography>
            El código <b>{lastScannedSku}</b> no se encontró en la base de datos local (RxDB).
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            ¿Deseas buscarlo en el servidor de Supabase? (Requiere conexión a internet)
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenScanConfirm(false)}>Cancelar</Button>
          <Button onClick={handleRemoteSearch} variant="contained" color="primary">
            Buscar en Servidor
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de Pago / Confirmación */}
      <Dialog open={openPaymentDialog} onClose={() => {}} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: 'center', fontWeight: 700 }}>
          {orderCreated?.offline ? 'Venta Offline Registrada' : 'Finalizar Venta'}
        </DialogTitle>
        <DialogContent sx={{ pb: 4 }}>
          {orderCreated?.offline ? (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircleIcon color="warning" sx={{ fontSize: 64, mb: 2 }} />
              <Typography variant="h6" gutterBottom>Orden #{orderCreated.id.split('-')[0]}</Typography>
              <Typography variant="body1">
                La venta se ha guardado localmente. Se sincronizará automáticamente cuando recuperes la conexión.
              </Typography>
            </Box>
          ) : (
            <Box>
              <Box sx={{ mb: 3, p: 2, bgcolor: '#f1f5f9', borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="subtitle2" color="textSecondary">Total a Cobrar:</Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
                  $ {calculateTotal().toFixed(2)}
                </Typography>
              </Box>

              {!paymentMethod ? (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Button fullWidth variant="outlined" size="large" startIcon={<PaymentsIcon />} onClick={() => handleManualPayment('CASH')} sx={{ py: 2, justifyContent: 'flex-start', px: 3 }}>
                      Efectivo
                    </Button>
                  </Grid>
                  <Grid item xs={12}>
                    <Button fullWidth variant="outlined" size="large" startIcon={<CreditCardIcon />} onClick={() => handleSelectPaymentMethod('POINT_MP')} sx={{ py: 2, justifyContent: 'flex-start', px: 3 }}>
                      MercadoPago Point (Terminal)
                    </Button>
                  </Grid>
                  <Grid item xs={12}>
                    <Button fullWidth variant="contained" size="large" startIcon={<ShoppingCartIcon />} onClick={() => handleSelectPaymentMethod('ONLINE_MP')} sx={{ py: 2, justifyContent: 'flex-start', px: 3 }}>
                      MercadoPago Online (Bricks)
                    </Button>
                  </Grid>
                </Grid>
              ) : paymentMethod === 'ONLINE_MP' ? (
                <Box>
                   <Button size="small" onClick={() => setPaymentMethod(null)} sx={{ mb: 2 }}>← Volver a opciones de pago</Button>
                   <PaymentGateway 
                    items={orderCreated?.items}
                    orderId={orderCreated?.id}
                    payerEmail={profile?.email}
                    accountId={profile?.account_id} 
                    onPaymentSuccess={handleClosePayment} 
                  />
                </Box>
              ) : paymentMethod === 'POINT_MP' && (
                <Box>
                  <Button size="small" onClick={() => setPaymentMethod(null)} sx={{ mb: 2 }}>← Volver a opciones de pago</Button>
                  <Typography variant="h6" sx={{mb: 2}}>Pagar con Terminal Point</Typography>
                  
                  {intentStatus === 'WAITING' ? (
                    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', p: 4}}>
                      <CircularProgress />
                      <Typography variant="body1" sx={{mt: 2}}>Esperando pago en la terminal...</Typography>
                      <Typography variant="body2" color="text.secondary">El estado se actualizará automáticamente.</Typography>
                    </Box>
                  ) : (
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <TextField fullWidth select label="Seleccionar Terminal" value={selectedPointDeviceId} onChange={(e) => setSelectedPointDeviceId(e.target.value)} disabled={pointDevices.length === 0}>
                          {pointDevices.map((d) => (
                            <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid item xs={12}>
                        <Button fullWidth variant="contained" onClick={handleSendPointIntent} disabled={mpPointLoading || !selectedPointDeviceId}>
                          {mpPointLoading ? <CircularProgress size={24} /> : 'Enviar Cobro a Terminal'}
                        </Button>
                      </Grid>
                      {intentStatus === 'ERROR' && <Grid item xs={12}><Alert severity="error">{mpPointError}</Alert></Grid>}
                    </Grid>
                  )}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, flexDirection: 'column', gap: 1 }}>
          {!paymentMethod && !orderCreated?.offline && (
            <Button 
              onClick={handleCancelOrder} 
              fullWidth 
              variant="text" 
              color="error"
              startIcon={<CancelIcon />}
              disabled={posLoading}
            >
              Cancelar Orden y Liberar Stock
            </Button>
          )}
          {orderCreated?.offline && (
             <Button onClick={handleClosePayment} fullWidth variant="contained">
               Aceptar
             </Button>
          )}
          {(!orderCreated?.offline && !paymentMethod) && (
             <Button onClick={() => setOpenPaymentDialog(false)} fullWidth variant="outlined" color="inherit">
                Pagar Después
             </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
