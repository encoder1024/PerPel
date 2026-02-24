import React, { useState } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Snackbar,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import { useAuthStore } from '../../stores/authStore';
import { useStock } from '../../hooks/useStock';

export default function StockManagement() {
  const { profile } = useAuthStore();
  const {
    businesses,
    selectedBusinessId,
    setSelectedBusinessId,
    filteredStock,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    adjustStock,
  } = useStock();

  // State for Adjustment Dialog
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [movementType, setMovementType] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Snackbar state
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const handleOpenDialog = (item) => {
    setSelectedItem(item);
    setOpenDialog(true);
    setQuantity('');
    setReason('');
    // Default movement types based on role for the UI
    if (profile?.app_role === 'EMPLOYEE') {
      setMovementType('PURCHASE_IN'); // Default for ingress
    } else {
      setMovementType('ADJUSTMENT_IN'); // Default for Admin/Owner
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedItem(null);
  };

  const handleSubmit = async () => {
    if (!quantity || !movementType || !reason) {
      setSnackbar({ open: true, message: 'Por favor complete todos los campos.', severity: 'error' });
      return;
    }

    setSubmitting(true);
    
    // Convert positive quantity to negative if it's an "OUT" movement
    let finalQuantityChange = parseInt(quantity);
    if (movementType.includes('_OUT') || movementType.includes('TESTING_STOCK')) { // TESTING_STOCK is also an outgoing movement
      finalQuantityChange = -Math.abs(finalQuantityChange);
    }
    // For INITIAL_STOCK, the quantity_change is always positive and directly sets the stock.
    // The RPC already handles this. We just need to ensure quantity is positive.
    if (movementType === 'INITIAL_STOCK') {
      finalQuantityChange = Math.abs(finalQuantityChange);
    }


    const result = await adjustStock({
      itemId: selectedItem.id,
      quantityChange: finalQuantityChange,
      movementType,
      reason,
    });

    setSubmitting(false);

    if (result.status === 'success') {
      setSnackbar({ open: true, message: 'Stock actualizado con éxito.', severity: 'success' });
      handleCloseDialog();
    } else {
      setSnackbar({ open: true, message: `Error: ${result.message}`, severity: 'error' });
    }
  };

  const isEmployee = profile?.app_role === 'EMPLOYEE';
  const isAdminOrOwner = ['ADMIN', 'OWNER'].includes(profile?.app_role);

  // Dynamically generate menu items based on role
  const getMovementTypeOptions = () => {
    const options = [];
    if (isEmployee) {
      options.push(
        <MenuItem key="PURCHASE_IN" value="PURCHASE_IN">Ingreso (Compra/Entrada)</MenuItem>,
        <MenuItem key="RETURN_IN" value="RETURN_IN">Ingreso (Devolución)</MenuItem>,
        <MenuItem key="WASTE_OUT" value="WASTE_OUT">Egreso (Desecho/Pérdida)</MenuItem>,
        <MenuItem key="TESTING_STOCK" value="TESTING_STOCK">Egreso (Tester/Muestra)</MenuItem>,
      );
    }
    if (isAdminOrOwner) {
      options.push(
        <MenuItem key="INITIAL_STOCK" value="INITIAL_STOCK">Carga Inicial de Stock</MenuItem>,
        <MenuItem key="ADJUSTMENT_IN" value="ADJUSTMENT_IN">Ajuste Manual (Ingreso)</MenuItem>,
        <MenuItem key="ADJUSTMENT_OUT" value="ADJUSTMENT_OUT">Ajuste Manual (Egreso)</MenuItem>,
        <MenuItem key="RELOCATED_OUT" value="RELOCATED_OUT">Traslado (Salida)</MenuItem>,
        <MenuItem key="PURCHASE_IN" value="PURCHASE_IN">Compra (Ingreso)</MenuItem>,
      );
    }
    return options;
  };

  if (loading && !businesses.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 600 }}>
        Gestión de Stock
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
        <FormControl sx={{ minWidth: 250 }}>
          <InputLabel id="business-select-label">Negocio</InputLabel>
          <Select
            labelId="business-select-label"
            value={selectedBusinessId}
            label="Negocio"
            onChange={(e) => setSelectedBusinessId(e.target.value)}
          >
            {businesses.map((business) => (
              <MenuItem key={business.id} value={business.id}>
                {business.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Buscar por nombre, SKU o categoría..."
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ flexGrow: 1 }}
        />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
        <TableContainer sx={{ maxHeight: '70vh' }}>
          <Table stickyHeader aria-label="stock table">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Categoría</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Stock Actual</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Acción</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredStock.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                      {item.sku || 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>{item.category_name}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body1" sx={{ fontWeight: 700, color: item.current_stock < 5 ? 'error.main' : 'inherit' }}>
                      {item.current_stock}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Realizar Ajuste de Stock">
                      <IconButton 
                        size="small" 
                        color="primary" 
                        onClick={() => handleOpenDialog(item)}
                        disabled={loading}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && filteredStock.length === 0 && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No se encontraron productos.</Typography>
          </Box>
        )}
      </Paper>

      {/* Adjustment Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {selectedItem?.name}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Stock actual: <strong>{selectedItem?.current_stock}</strong>
            </Typography>

            <FormControl fullWidth size="small">
              <InputLabel id="move-type-label">Tipo de Movimiento</InputLabel>
              <Select
                labelId="move-type-label"
                value={movementType}
                label="Tipo de Movimiento"
                onChange={(e) => setMovementType(e.target.value)}
              >
                <MenuItem value="">
                  <em>Selecciona un tipo de movimiento</em>
                </MenuItem>
                {getMovementTypeOptions()} {/* Render dynamically generated options */}
              </Select>
            </FormControl>

            <TextField
              label="Cantidad"
              type="number"
              fullWidth
              size="small"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputProps={{ min: 1 }}
              helperText="Indique el valor positivo del cambio."
            />

            <TextField
              label="Motivo / Nota"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Recepción de pedido #123"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleCloseDialog} color="inherit">Cancelar</Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            disabled={submitting}
            sx={{ minWidth: 100 }}
          >
            {submitting ? <CircularProgress size={24} /> : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={4000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
