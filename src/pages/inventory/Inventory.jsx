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
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SyncIcon from "@mui/icons-material/Sync";
import * as XLSX from "xlsx";
import { useInventory } from "../../hooks/useInventory";
import { useAuthStore } from "../../stores/authStore";
import { supabase } from "../../services/supabaseClient";
import { useOffline } from "../../hooks/useOffline";

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
  const { db, isOnline } = useOffline();
  const [businesses, setBusinesses] = useState([]); // Lista de negocios
  const [selectedBulkBusiness, setSelectedBulkBusiness] = useState(""); // Negocio para carga masiva
  
  const [openDialog, setOpenDialog] = useState(false);
  const [openBulkModal, setOpenBulkModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [bulkData, setBulkData] = useState([]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [isSyncingTN, setIsSyncingTN] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [isSaving, setIsSaving] = useState(false);

  // Cargar negocios al iniciar
  useEffect(() => {
    const fetchBusinesses = async () => {
      if (!profile?.account_id) return;
      if (isOnline) {
        const { data } = await supabase
          .schema('core')
          .from('businesses')
          .select('id, name, account_id, is_deleted')
          .eq('account_id', profile.account_id)
          .eq('is_deleted', false);
        setBusinesses(data || []);
        if (db && data?.length) {
          await db.businesses.bulkUpsert(data);
        }
        // Pre-seleccionar si solo hay uno o si el perfil tiene uno
        if (data?.length === 1) setSelectedBulkBusiness(data[0].id);
        else if (profile.business_id) setSelectedBulkBusiness(profile.business_id);
      } else if (db) {
        const localBusinesses = await db.businesses.find({
          selector: { account_id: profile.account_id, is_deleted: false }
        }).exec();
        const mapped = localBusinesses.map((d) => d.toJSON());
        setBusinesses(mapped);
        if (mapped.length === 1) setSelectedBulkBusiness(mapped[0].id);
        else if (profile.business_id) setSelectedBulkBusiness(profile.business_id);
      }
    };
    if (profile?.account_id) fetchBusinesses();
  }, [profile, db, isOnline]);

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
        setBulkResult(null);
        setSyncResult(null);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirmBulkLoad = async () => {
    if (bulkData.length === 0 || !selectedBulkBusiness) return;
    setIsProcessingBulk(true);

    try {
      const { data, error: rpcError } = await supabase.rpc('bulk_upsert_inventory_items', {
        p_items: bulkData,
        p_account_id: profile.account_id,
        p_business_id: selectedBulkBusiness, // Usamos el negocio seleccionado en el modal
        p_user_id: profile.id
      });

      if (rpcError) throw rpcError;

      if (data.status === 'success') {
        setBulkResult(data);
        setSnackbar({ open: true, message: "Carga masiva completada.", severity: "success" });
        refresh();
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setSnackbar({ open: true, message: "Error: " + err.message, severity: "error" });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleSyncTiendanube = async () => {
    setIsSyncingTN(true);
    setSyncResult(null);

    try {
      const { data, error: funcError } = await supabase.functions.invoke('tn-bulk-sync', {
        body: { 
          businessId: selectedBulkBusiness,
          accountId: profile.account_id
        }
      });

      if (funcError) throw funcError;

      if (data.success) {
        setSyncResult(data);
        setSnackbar({
          open: true,
          message: `Sincronización finalizada: ${data.processed} ítems procesados.`,
          severity: "success"
        });
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: "Error al sincronizar con Tiendanube: " + err.message,
        severity: "error"
      });
    } finally {
      setIsSyncingTN(false);
    }
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
        message: response.offline ? "Item guardado localmente." : "Item guardado con éxito.",
        severity: response.offline ? "warning" : "success",
      });
      handleCloseDialog();
    } else {
      setSnackbar({ open: true, message: "Error al guardar: " + response.error, severity: "error" });
    }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar este item?")) {
      const response = await deleteItem(id);
      if (response.success) {
        setSnackbar({
          open: true,
          message: response.offline ? "Item marcado para eliminar localmente." : "Item eliminado con éxito.",
          severity: response.offline ? "warning" : "success",
        });
      } else {
        setSnackbar({
          open: true,
          message: "Error al eliminar: " + response.error,
          severity: "error"
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
        <GridActionsCellItem icon={<EditIcon />} label="Editar" onClick={() => handleOpenDialog(params.row)} />,
        <GridActionsCellItem icon={<DeleteIcon />} label="Eliminar" onClick={() => handleDelete(params.id)} />,
      ],
    },
  ];

  return (
    <Box sx={{ width: "100%", p: 1 }}>
      <Box sx={{ display: "flex", justifyBetween: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>Gestión de Inventario</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton onClick={refresh}><RefreshIcon /></IconButton>
          <Button variant="outlined" color="secondary" startIcon={<CloudUploadIcon />} onClick={() => { setOpenBulkModal(true); setBulkData([]); setBulkResult(null); setSyncResult(null); }}>Carga Masiva</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Nuevo Item</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ height: 650, width: "100%" }}>
        <DataGrid rows={items} columns={columns} loading={loading} pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 10 } } }} disableRowSelectionOnClick />
      </Paper>

      {/* Modal Carga Masiva */}
      <Dialog open={openBulkModal} onClose={() => setOpenBulkModal(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700 }}>Carga Masiva de Ítems (Excel)</DialogTitle>
        <DialogContent dividers>
          {!bulkResult ? (
            <>
              <Box sx={{ mb: 3, p: 4, border: '2px dashed #ccc', borderRadius: 2, textAlign: 'center', bgcolor: '#f8fafc' }}>
                <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} style={{ display: 'none' }} id="bulk-excel-upload" />
                <label htmlFor="bulk-excel-upload">
                  <Button variant="contained" component="span" startIcon={<CloudUploadIcon />} sx={{ mb: 1 }}>Seleccionar Archivo Excel</Button>
                </label>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>Formatos soportados: .xlsx, .xls</Typography>
                
                <Divider sx={{ my: 2 }} />
                
                <Typography variant="subtitle2" gutterBottom align="left">1. Seleccione la sucursal para estos ítems:</Typography>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Sucursal / Local"
                  value={selectedBulkBusiness}
                  onChange={(e) => setSelectedBulkBusiness(e.target.value)}
                  sx={{ textAlign: 'left' }}
                >
                  {businesses.map((b) => (
                    <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                  ))}
                </TextField>
              </Box>

              {bulkData.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>Vista previa (5 registros):</Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead><TableRow sx={{ bgcolor: '#f5f5f5' }}><TableCell sx={{ fontWeight: 700 }}>SKU</TableCell><TableCell sx={{ fontWeight: 700 }}>Nombre</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Precio</TableCell><TableCell align="center" sx={{ fontWeight: 700 }}>Tienda</TableCell></TableRow></TableHead>
                      <TableBody>
                        {bulkData.slice(0, 5).map((row, index) => (
                          <TableRow key={index}><TableCell>{row["SKU"] || "-"}</TableCell><TableCell>{row["Nombre"] || "-"}</TableCell><TableCell align="right">{row["Precio"] || 0}</TableCell><TableCell align="center">{row["Mostrar en tienda"] || "NO"}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Alert severity="info" sx={{ mt: 2 }}>Se han detectado <strong>{bulkData.length}</strong> productos listos para procesar.</Alert>
                </Box>
              )}
            </>
          ) : (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircleOutlineIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
              <Typography variant="h6">¡Carga en Base de Datos Exitosa!</Typography>
              <Grid container spacing={2} sx={{ mt: 2, mb: 4 }}>
                <Grid item xs={6} md={3}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h5" color="primary">{bulkResult.created}</Typography><Typography variant="caption">Nuevos</Typography></Paper></Grid>
                <Grid item xs={6} md={3}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h5" color="primary">{bulkResult.updated}</Typography><Typography variant="caption">Actualizados</Typography></Paper></Grid>
                <Grid item xs={6} md={3}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h5" color="success.main">{bulkResult.stock_initialised}</Typography><Typography variant="caption">Con Stock Inicial</Typography></Paper></Grid>
                <Grid item xs={6} md={3}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h5" color="secondary">{bulkResult.tn_linked}</Typography><Typography variant="caption">Vinc. Tiendanube</Typography></Paper></Grid>
              </Grid>

              {bulkResult.tn_linked > 0 && !syncResult && (
                <Box sx={{ p: 3, bgcolor: '#f3e5f5', borderRadius: 2 }}>
                  <Typography variant="body1" gutterBottom sx={{ fontWeight: 600 }}>Sincronización con Tiendanube</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>¿Deseas enviar estos productos ahora mismo a tu tienda online?</Typography>
                  <Button 
                    variant="contained" 
                    color="secondary" 
                    onClick={handleSyncTiendanube} 
                    disabled={isSyncingTN}
                    startIcon={isSyncingTN ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />}
                  >
                    {isSyncingTN ? "Sincronizando productos uno a uno..." : "Sincronizar ahora con Tiendanube"}
                  </Button>
                </Box>
              )}

              {syncResult && (
                <Alert severity="success" sx={{ textAlign: 'left', mt: 2 }}>
                  <strong>Sincronización externa finalizada:</strong>
                  <ul>
                    <li>Procesados: {syncResult.processed}</li>
                    <li>Exitosos: {syncResult.details?.filter(d => d.status === 'SUCCESS').length}</li>
                    <li>Fallidos: {syncResult.details?.filter(d => d.status !== 'SUCCESS').length}</li>
                  </ul>
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenBulkModal(false); setBulkData([]); setBulkResult(null); setSyncResult(null); }}>Cerrar</Button>
          {!bulkResult && (
            <Button 
              variant="contained" 
              color="primary" 
              disabled={bulkData.length === 0 || isProcessingBulk || !selectedBulkBusiness} 
              onClick={handleConfirmBulkLoad} 
              startIcon={isProcessingBulk ? <CircularProgress size={20} /> : null}
            >
              {isProcessingBulk ? "Procesando..." : "Confirmar Carga"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

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

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
