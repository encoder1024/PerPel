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
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
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
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';
import PaymentGateway from '../../components/common/PaymentGateway';
import { useCashRegister } from '../../hooks/useCashRegister';
import { useMercadoPagoPoint } from '../../hooks/useMercadoPagoPoint';


export default function POS() {
  const { items, loading: inventoryLoading, refresh } = useInventory();
  const {
    cart,
    loading: posLoading,
    addToCart,
    removeFromCart,
    updateQuantity,
    calculateTotal,
    createOrder,
    cancelOrder,
    processManualPayment,
    clearCart,
  } = usePOS();
  
  const { activeSession, checkActiveSession } = useCashRegister();
  const { profile } = useAuthStore();
  const { loading: mpPointLoading, error: mpPointError, createPointPaymentIntent } = useMercadoPagoPoint();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [customerInfo, setCustomerInfo] = useState({
    name: 'Consumidor Final',
    docType: '99',
    docNumber: '0',
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Payment Flow State
  const [orderCreated, setOrderCreated] = useState(null);
  const [openPaymentDialog, setOpenPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null); // 'CASH', 'MANUAL_MP', 'ONLINE_MP', 'POINT_MP'
  const [pointDevices, setPointDevices] = useState([]);
  const [selectedPointDeviceId, setSelectedPointDeviceId] = useState('');
  const [intentStatus, setIntentStatus] = useState(null); // 'WAITING', 'SUCCESS', 'ERROR'

  // Fetch businesses for the account
  useEffect(() => {
    const fetchBusinesses = async () => {
      console.log("POS: ", profile);
      const { data, error } = await supabase
        .schema('core')
        .from('businesses')
        .select('*')
        .eq('account_id', profile?.account_id)
        .eq('is_deleted', false); // Corrected from is_deleted to deleted based on schema

      console.log("negocios: ", data)
      
      if (data) {
        setBusinesses(data);
        if (data.length > 0) {
          setSelectedBusinessId(data[0].id);
          checkActiveSession(data[0].id); // Check session for initial business
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

    const response = await createOrder({ ...customerInfo, business_id: selectedBusinessId });
    if (response.success) {
      setOrderCreated({ 
        id: response.orderId, 
        offline: !!response.offline,
        items: [...cart], // Guardamos copia del carrito para liberar stock si se cancela
        businessId: selectedBusinessId
      });
      setOpenPaymentDialog(true);
      setPaymentMethod(null); // Reset payment method selection
      
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
      // No limpiamos el carrito para que el usuario pueda editarlo
    } else {
      setSnackbar({ open: true, message: 'Error al cancelar: ' + res.error, severity: 'error' });
    }
  };

  const handleManualPayment = async (method) => {
    if (!orderCreated) return;

    // VALIDACIÓN DE CAJA PARA EFECTIVO
    if (method === 'CASH' && !activeSession) {
      setSnackbar({ 
        open: true, 
        message: 'No hay una sesión de caja abierta para este negocio. Debes abrir caja primero.', 
        severity: 'error' 
      });
      return;
    }

    // This is now for CASH only. The other manual button will trigger the Point flow.
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
        setSnackbar({ open: true, message: 'No hay dispositivos Point activos para este negocio. Agrégalos en la sección de Configuración.', severity: 'warning' });
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
      setSnackbar({ open: true, message: 'Cobro enviado a la terminal. Esperando pago del cliente...', severity: 'info' });
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
              <Grid container spacing={1} sx={{ mb: 2 }}>
                <Grid item xs={12}>
                   <TextField
                     fullWidth
                     label="Cliente"
                     size="small"
                     value={customerInfo.name}
                     onChange={(e) => setCustomerInfo({...customerInfo, name: e.target.value})}
                   />
                </Grid>
                <Grid item xs={4}>
                   <TextField
                     fullWidth
                     select
                     label="Tipo Doc"
                     size="small"
                     value={customerInfo.docType}
                     onChange={(e) => setCustomerInfo({...customerInfo, docType: e.target.value})}
                   >
                     <MenuItem value="96">DNI</MenuItem>
                     <MenuItem value="80">CUIT</MenuItem>
                     <MenuItem value="99">C. Final</MenuItem>
                   </TextField>
                </Grid>
                <Grid item xs={8}>
                   <TextField
                     fullWidth
                     label="Nro Documento"
                     size="small"
                     value={customerInfo.docNumber}
                     onChange={(e) => setCustomerInfo({...customerInfo, docNumber: e.target.value})}
                   />
                </Grid>
              </Grid>

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