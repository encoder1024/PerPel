import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Grid,
  Alert,
  Snackbar,
  CircularProgress,
} from '@mui/material';
import { DataGrid, GridActionsCellItem } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useInventory } from '../../hooks/useInventory';
import { useAuthStore } from '../../stores/authStore';

const initialFormState = {
  name: '',
  sku: '',
  item_type: 'PRODUCT',
  item_status: 'ACTIVE',
  selling_price: 0,
  cost_price: 0,
  description: '',
};

export default function Inventory() {
  const { items, loading, error, saveItem, deleteItem, refresh } = useInventory();
  const { profile } = useAuthStore();
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenDialog = (item = null) => {
    if (item) {
      setSelectedItem(item);
      setFormData({
        name: item.name,
        sku: item.sku || '',
        item_type: item.item_type,
        item_status: item.item_status,
        selling_price: item.selling_price,
        cost_price: item.cost_price,
        description: item.description || '',
      });
    } else {
      setSelectedItem(null);
      setFormData(initialFormState);
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedItem(null);
    setFormData(initialFormState);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'selling_price' || name === 'cost_price' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    console.log("Datos del item a crear:", formData);
    
    const itemToSave = selectedItem ? { ...formData, id: selectedItem.id } : formData;
    const response = await saveItem(itemToSave);

    if (response.success) {
      setSnackbar({
        open: true,
        message: response.offline ? 'Item guardado localmente (sin conexión).' : 'Item guardado con éxito.',
        severity: response.offline ? 'warning' : 'success',
      });
      handleCloseDialog();
    } else {
      setSnackbar({ open: true, message: 'Error al guardar: ' + response.error, severity: 'error' });
    }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Está seguro de eliminar este item?')) {
      const response = await deleteItem(id);
      if (response.success) {
        setSnackbar({
          open: true,
          message: response.offline ? 'Item marcado para eliminar localmente.' : 'Item eliminado con éxito.',
          severity: response.offline ? 'warning' : 'success',
        });
      } else {
        setSnackbar({ open: true, message: 'Error al eliminar: ' + response.error, severity: 'error' });
      }
    }
  };

  const columns = [
    { field: 'sku', headerName: 'SKU', width: 120 },
    { field: 'name', headerName: 'Nombre', flex: 1, minWidth: 200 },
    { 
      field: 'item_type', 
      headerName: 'Tipo', 
      width: 120,
      valueFormatter: (params) => params.value === 'PRODUCT' ? 'Producto' : 'Servicio'
    },
    { 
      field: 'selling_price', 
      headerName: 'Precio Venta', 
      width: 130,
      type: 'number',
      // valueFormatter: (params) => `$ ${params.value.toFixed(2)}`
    },
    { 
      field: 'item_status', 
      headerName: 'Estado', 
      width: 110,
      renderCell: (params) => (
        <Alert severity={params.value === 'ACTIVE' ? 'success' : 'warning'} icon={false} sx={{ py: 0, px: 1, fontSize: '0.75rem' }}>
          {params.value}
        </Alert>
      )
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Acciones',
      width: 100,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<EditIcon />}
          label="Editar"
          onClick={() => handleOpenDialog(params.row)}
        />,
        <GridActionsCellItem
          icon={<DeleteIcon />}
          label="Eliminar"
          onClick={() => handleDelete(params.id)}
        />,
      ],
    },
  ];

  return (
    <Box sx={{ width: '100%', p: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Gestión de Inventario
        </Typography>
        <Box>
          <IconButton onClick={refresh} sx={{ mr: 1 }}><RefreshIcon /></IconButton>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Nuevo Item
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ height: 650, width: '100%' }}>
        <DataGrid
          rows={items}
          columns={columns}
          loading={loading}
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
          }}
          disableRowSelectionOnClick
        />
      </Paper>

      {/* Modal para Crear / Editar */}
      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{selectedItem ? 'Editar Item' : 'Nuevo Item'}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid item xs={12} sm={8}>
                <TextField
                  fullWidth
                  required
                  name="name"
                  label="Nombre del Producto/Servicio"
                  value={formData.name}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  name="sku"
                  label="SKU / Código"
                  value={formData.sku}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  name="item_type"
                  label="Tipo"
                  value={formData.item_type}
                  onChange={handleChange}
                >
                  <MenuItem value="PRODUCT">Producto</MenuItem>
                  <MenuItem value="SERVICE">Servicio</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  select
                  name="item_status"
                  label="Estado"
                  value={formData.item_status}
                  onChange={handleChange}
                >
                  <MenuItem value="ACTIVE">Activo</MenuItem>
                  <MenuItem value="INACTIVE">Inactivo</MenuItem>
                  <MenuItem value="DISCONTINUE">Discontinuado</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  name="selling_price"
                  label="Precio de Venta"
                  value={formData.selling_price}
                  onChange={handleChange}
                  InputProps={{ startAdornment: '$ ' }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  name="cost_price"
                  label="Precio de Costo"
                  value={formData.cost_price}
                  onChange={handleChange}
                  InputProps={{ startAdornment: '$ ' }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  name="description"
                  label="Descripción"
                  value={formData.description}
                  onChange={handleChange}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2, px: 3 }}>
            <Button onClick={handleCloseDialog}>Cancelar</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSaving}
              startIcon={isSaving ? <CircularProgress size={20} /> : null}
            >
              {selectedItem ? 'Guardar Cambios' : 'Crear Item'}
            </Button>
          </DialogActions>
        </form>
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
