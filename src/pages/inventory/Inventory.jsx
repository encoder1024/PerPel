import React, { useState, useEffect } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
} from "@mui/material";
import { DataGrid, GridActionsCellItem } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import * as XLSX from "xlsx";
import { useInventory } from "../../hooks/useInventory";
import { useAuthStore } from "../../stores/authStore";

const initialFormState = {
  name: "",
  sku: "",
  item_type: "PRODUCT",
  item_status: "ACTIVE",
  selling_price: 0,
  cost_price: 0,
  description: "",
};

export default function Inventory() {
  const { items, loading, error, saveItem, deleteItem, refresh } =
    useInventory();
  const { profile } = useAuthStore();
  const [openDialog, setOpenDialog] = useState(false);
  const [openBulkModal, setOpenBulkModal] = useState(false); // Modal para carga masiva
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [bulkData, setBulkData] = useState([]); // Datos del Excel
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenDialog = (item = null) => {
    if (item) {
      setSelectedItem(item);
      setFormData({
        name: item.name,
        sku: item.sku || "",
        item_type: item.item_type,
        item_status: item.item_status,
        selling_price: item.selling_price,
        cost_price: item.cost_price,
        description: item.description || "",
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
      [name]:
        name === "selling_price" || name === "cost_price"
          ? parseFloat(value) || 0
          : value,
    }));
  };

  // --- LÓGICA DE CARGA MASIVA (TICKET 1) ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      
      // Validación básica de columnas (basado en el Excel de ejemplo)
      if (data.length > 0) {
        const requiredCols = ["Nombre", "SKU", "Precio"];
        const headers = Object.keys(data[0]);
        const hasRequired = requiredCols.every(col => headers.includes(col));
        
        if (!hasRequired) {
          setSnackbar({
            open: true,
            message: "El archivo no tiene el formato correcto. Faltan columnas requeridas.",
            severity: "error"
          });
          return;
        }
        setBulkData(data);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirmBulkLoad = async () => {
    setIsProcessingBulk(true);
    // TODO: Implementar llamada a RPC bulk_upsert_inventory_items (Ticket 2)
    setTimeout(() => {
      setSnackbar({
        open: true,
        message: "Funcionalidad de guardado masivo en desarrollo (Ticket 2).",
        severity: "info"
      });
      setIsProcessingBulk(false);
      setOpenBulkModal(false);
    }, 1500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const itemToSave = selectedItem
      ? { ...formData, id: selectedItem.id }
      : formData;
    const response = await saveItem(itemToSave);

    if (response.success) {
      setSnackbar({
        open: true,
        message: response.offline
          ? "Item guardado localmente."
          : "Item guardado con éxito.",
        severity: response.offline ? "warning" : "success",
      });
      handleCloseDialog();
    } else {
      setSnackbar({
        open: true,
        message: "Error al guardar: " + response.error,
        severity: "error",
      });
    }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar este item?")) {
      const response = await deleteItem(id);
      if (response.success) {
        setSnackbar({
          open: true,
          message: response.offline
            ? "Item marcado para eliminar localmente."
            : "Item eliminado con éxito.",
          severity: response.offline ? "warning" : "success",
        });
      } else {
        setSnackbar({
          open: true,
          message: "Error al eliminar: " + response.error,
          severity: "error",
        });
      }
    }
  };

  const columns = [
    { field: "sku", headerName: "SKU", width: 120 },
    { field: "name", headerName: "Nombre", flex: 1, minWidth: 200 },
    {
      field: "item_type",
      headerName: "Tipo",
      width: 120,
      valueFormatter: (params) => params === "PRODUCT" ? "Producto" : "Servicio",
    },
    {
      field: "selling_price",
      headerName: "Precio Venta",
      width: 130,
      type: "number",
      valueFormatter: (params) => `$ ${params.toFixed(2)}`,
    },
    {
      field: "item_status",
      headerName: "Estado",
      width: 110,
      renderCell: (params) => (
        <Alert
          severity={params.value === "ACTIVE" ? "success" : "warning"}
          icon={false}
          sx={{ py: 0, px: 1, fontSize: "0.75rem" }}
        >
          {params.value}
        </Alert>
      ),
    },
    {
      field: "actions",
      type: "actions",
      headerName: "Acciones",
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
    <Box sx={{ width: "100%", p: 1 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Gestión de Inventario
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton onClick={refresh}>
            <RefreshIcon />
          </IconButton>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<CloudUploadIcon />}
            onClick={() => setOpenBulkModal(true)}
          >
            Carga Masiva
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Nuevo Item
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ height: 650, width: "100%" }}>
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

      {/* Modal para Crear / Editar Individual */}
      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{selectedItem ? "Editar Item" : "Nuevo Item"}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={8}><TextField fullWidth required name="name" label="Nombre" value={formData.name} onChange={handleChange} /></Grid>
              <Grid item xs={12} sm={4}><TextField fullWidth name="sku" label="SKU" value={formData.sku} onChange={handleChange} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth select name="item_type" label="Tipo" value={formData.item_type} onChange={handleChange}><MenuItem value="PRODUCT">Producto</MenuItem><MenuItem value="SERVICE">Servicio</MenuItem></TextField></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth select name="item_status" label="Estado" value={formData.item_status} onChange={handleChange}><MenuItem value="ACTIVE">Activo</MenuItem><MenuItem value="INACTIVE">Inactivo</MenuItem></TextField></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth type="number" name="selling_price" label="P. Venta" value={formData.selling_price} onChange={handleChange} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth type="number" name="cost_price" label="P. Costo" value={formData.cost_price} onChange={handleChange} /></Grid>
              <Grid item xs={12}><TextField fullWidth multiline rows={2} name="description" label="Descripción" value={formData.description} onChange={handleChange} /></Grid>
            </Grid>
          </DialogContent>
          <DialogActions><Button onClick={handleCloseDialog}>Cancelar</Button><Button type="submit" variant="contained" disabled={isSaving}>{selectedItem ? "Guardar" : "Crear"}</Button></DialogActions>
        </form>
      </Dialog>

      {/* MODAL CARGA MASIVA (TICKET 1) */}
      <Dialog open={openBulkModal} onClose={() => setOpenBulkModal(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700 }}>Carga Masiva de Ítems (Excel)</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mb: 3, p: 2, border: '2px dashed #ccc', borderRadius: 2, textAlign: 'center' }}>
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="bulk-excel-upload"
            />
            <label htmlFor="bulk-excel-upload">
              <Button variant="contained" component="span" startIcon={<CloudUploadIcon />} sx={{ mb: 1 }}>
                Seleccionar Archivo Excel
              </Button>
            </label>
            <Typography variant="body2" color="textSecondary">
              Formatos soportados: .xlsx, .xls
            </Typography>
          </Box>

          {bulkData.length > 0 && (
            <Box>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
                Vista previa (Primeros 5 registros):
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Nombre</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Precio</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Tienda</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bulkData.slice(0, 5).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row["SKU"] || "-"}</TableCell>
                        <TableCell>{row["Nombre"] || "-"}</TableCell>
                        <TableCell align="right">{row["Precio"] || 0}</TableCell>
                        <TableCell align="center">{row["Mostrar en tienda"] || "NO"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Alert severity="info">
                Se han detectado <strong>{bulkData.length}</strong> productos listos para procesar.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenBulkModal(false); setBulkData([]); }}>Cancelar</Button>
          <Button 
            variant="contained" 
            color="primary" 
            disabled={bulkData.length === 0 || isProcessingBulk}
            onClick={handleConfirmBulkLoad}
            startIcon={isProcessingBulk ? <CircularProgress size={20} /> : null}
          >
            {isProcessingBulk ? "Procesando..." : "Confirmar Carga"}
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
