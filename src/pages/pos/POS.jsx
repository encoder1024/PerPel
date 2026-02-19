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
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useInventory } from '../../hooks/useInventory';
import { usePOS } from '../../hooks/usePOS';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';
import PaymentGateway from '../../components/common/PaymentGateway';

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
    clearCart,
  } = usePOS();
  
  const { profile } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [customerInfo, setCustomerInfo] = useState({
    name: 'Consumidor Final',
    docType: '99',
    docNumber: '0',
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Nuevo estado para el proceso de pago
  const [orderCreated, setOrderCreated] = useState(null); // { id, offline }
  const [openPaymentDialog, setOpenPaymentDialog] = useState(false);

  // Fetch businesses for the account
  useEffect(() => {
    const fetchBusinesses = async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('account_id', profile?.account_id)
        .eq('deleted', false);
      
      if (data) {
        setBusinesses(data);
        if (data.length > 0) setSelectedBusinessId(data[0].id);
      }
    };
    if (profile?.account_id) fetchBusinesses();
  }, [profile?.account_id]);

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
      setOrderCreated({ id: response.orderId, offline: !!response.offline });
      setOpenPaymentDialog(true);
      
      setSnackbar({
        open: true,
        message: response.offline ? 'Orden registrada localmente.' : 'Orden creada exitosamente.',
        severity: response.offline ? 'warning' : 'success',
      });
    } else {
      setSnackbar({ open: true, message: 'Error: ' + response.error, severity: 'error' });
    }
  };

  const handleClosePayment = () => {
    setOpenPaymentDialog(false);
    setOrderCreated(null);
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
      <Dialog open={openPaymentDialog} onClose={handleClosePayment} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: 'center' }}>
          {orderCreated?.offline ? 'Venta Offline Registrada' : 'Finalizar Pago'}
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
              <Typography variant="body2" sx={{ mb: 2, textAlign: 'center' }}>
                Orden creada con éxito. Selecciona el medio de pago electrónico:
              </Typography>
              <PaymentGateway 
                orderId={orderCreated?.id} 
                onPaymentSuccess={handleClosePayment} 
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePayment} fullWidth variant="outlined">
            Cerrar
          </Button>
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