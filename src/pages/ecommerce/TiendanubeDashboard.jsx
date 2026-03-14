import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  MenuItem,
  TextField,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  Select,
  OutlinedInput,
  Checkbox,
  Avatar,
  ListItemAvatar
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SyncIcon from '@mui/icons-material/Sync';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function TiendanubeDashboard() {
  const { profile } = useAuthStore();
  const [items, setItems] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Search/Filter State
  const [filterField, setFilterField] = useState('name');
  const [filterText, setFilterText] = useState('');

  // Modal State
  const [openModal, setOpenModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [variantList, setVariantList] = useState([]);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [tabValue, setTabValue] = useState(0);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [tnCategories, setTnCategories] = useState([]);

  // Estados para Monitor de Órdenes
  const [openOrderModal, setOpenOrderModal] = useState(false);
  const [ordersData, setOrdersData] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, [profile?.account_id]);

  const fetchInitialData = async () => {
    if (!profile?.account_id) return;
    setLoading(true);
    try {
      const { data: assignData, error: bizError } = await supabase
        .schema('core')
        .from('business_asign_credentials')
        .select(`
          business_id,
          businesses:business_id (id, name),
          credential:credential_id (api_name, external_status)
        `)
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      
      if (bizError) throw bizError;

      const tnBusinesses = assignData
        ?.filter(a => a.credential?.api_name === 'TIENDANUBE' && a.credential?.external_status === 'active')
        .map(a => a.businesses)
        .filter(b => b !== null) || [];

      setBusinesses(tnBusinesses);
      
      if (tnBusinesses.length > 0) {
        setSelectedBusiness(tnBusinesses[0].id);
        await fetchSyncStatus(tnBusinesses[0].id);
      }
    } catch (err) {
      setError("Error al cargar negocios: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSyncStatus = async (businessId) => {
    if (!businessId) return;
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('inventory_items')
        .select(`
          id, name, sku, selling_price,
          inventory_items_tn (tn_product_id, handle),
          tiendanube_sync_map (sync_status, last_sync_at, error_log)
        `)
        .eq('account_id', profile.account_id)
        .eq('business_id', businessId)
        .eq('is_deleted', false)
        .order('name');

      if (fetchError) throw fetchError;
      setItems(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMonitorOrders = async () => {
    setLoadingOrders(true);
    setOpenOrderModal(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tn-debug-orders', {
        body: { businessId: selectedBusiness },
      });

      if (invokeError) throw invokeError;
      setOrdersData(data.orders || []);
    } catch (err) {
      setError("Error en Monitor de Órdenes: " + err.message);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleForceSyncOrder = async (tnOrderId) => {
    setMessage(null);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tn-force-sync-order', {
        body: { businessId: selectedBusiness, tnOrderId },
      });

      if (invokeError) throw invokeError;
      if (data.success) {
        setMessage(`Orden ${tnOrderId} enviada a cola de procesamiento.`);
        // Actualizar el estado localmente para reflejar que se está procesando
        setOrdersData(ordersData.map(o => o.id === tnOrderId ? { ...o, exists_in_erp: true } : o));
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError("Error al forzar sincronización: " + err.message);
    }
  };

  const handleOpenPrepare = async (item) => {
    setLoading(true);
    try {
      await fetchTnCategories(selectedBusiness);
      const { data: variants } = await supabase
        .schema('core')
        .from('tiendanube_item_variants')
        .select('*')
        .eq('item_id', item.id)
        .eq('is_deleted', false);

      const { data: stockData } = await supabase
        .schema('core')
        .from('stock_levels')
        .select('quantity')
        .eq('item_id', item.id)
        .eq('business_id', selectedBusiness)
        .maybeSingle();

      const realStock = stockData?.quantity || 0;
      setEditingItem(item);
      if (!variants || variants.length === 0) {
        setVariantList([{
          id: crypto.randomUUID(),
          item_id: item.id,
          account_id: profile.account_id,
          business_id: selectedBusiness,
          nombre: item.name,
          sku: item.sku,
          precio: item.selling_price,
          stock: realStock,
          mostrar_en_tienda: true,
          identificador_de_url: item.name.toLowerCase().replace(/ /g, '-'),
          is_deleted: false
        }]);
      } else {
        setVariantList(variants.map(v => ({ ...v, stock: realStock })));
      }
      setSelectedVariantIndex(0);
      setValidationErrors([]);
      setOpenModal(true);
    } catch (err) {
      setError("Error al cargar variantes: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateVariantField = (field, value) => {
    const newList = [...variantList];
    if (field === 'identificador_de_url') {
      newList.forEach((v, i) => { newList[i] = { ...newList[i], [field]: value }; });
    } else {
      newList[selectedVariantIndex] = { ...newList[selectedVariantIndex], [field]: value };
    }
    setVariantList(newList);
  };

  const handleSavePreparation = async () => {
    const errors = validateVariants();
    if (errors.length > 0) { setValidationErrors(errors); return; }
    setSaving(true);
    try {
      const { error: upsertError } = await supabase.schema('core').from('tiendanube_item_variants').upsert(variantList);
      if (upsertError) throw upsertError;
      setMessage("Preparación de variantes guardada.");
      setOpenModal(false);
      await fetchSyncStatus(selectedBusiness);
    } catch (err) {
      setError("Error al guardar: " + err.message);
    } finally { setSaving(false); }
  };

  const handleExport = async (itemId) => {
    setSyncingId(itemId); setError(null); setMessage(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tn-product-upsert', {
        body: { itemId, businessId: selectedBusiness, accountId: profile?.account_id },
      });
      if (invokeError) throw invokeError;
      if (data.success) {
        setMessage(`Exportado con éxito.`);
        await fetchSyncStatus(selectedBusiness);
      } else throw new Error(data.message);
    } catch (err) { setError(err.message); } finally { setSyncingId(null); }
  };

  const handleDeleteFromTN = async (itemId) => {
    if (!window.confirm("¿Está seguro?")) return;
    setSyncingId(itemId);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tn-product-upsert', {
        body: { itemId, businessId: selectedBusiness, accountId: profile?.account_id, action: 'DELETE' },
      });
      if (invokeError) throw invokeError;
      if (data.success) {
        setMessage(`Eliminado con éxito.`);
        await fetchSyncStatus(selectedBusiness);
      } else throw new Error(data.message);
    } catch (err) { setError(err.message); } finally { setSyncingId(null); }
  };

  const fetchTnCategories = async (businessId) => {
    try {
      const { data } = await supabase.schema('core').from('tiendanube_categorias').select('tn_category_id, name').eq('business_id', businessId).eq('is_deleted', false);
      setTnCategories(data || []);
    } catch (err) { console.error(err); }
  };

  const validateVariants = () => {
    const errors = [];
    variantList.forEach((v, index) => {
      const prefix = variantList.length > 1 ? `Variante ${index + 1}: ` : "";
      if (!v.nombre?.trim()) errors.push(`${prefix}El nombre es obligatorio.`);
      if (!v.sku?.trim()) errors.push(`${prefix}El SKU es obligatorio.`);
      if (!v.identificador_de_url?.trim()) errors.push(`${prefix}El identificador de URL es obligatorio.`);
      if (!v.imagen_url?.trim()) errors.push(`${prefix}Falta URL de imagen.`);
    });
    return errors;
  };

  const filteredItems = items.filter(item => {
    if (!filterText) return true;
    const search = filterText.toLowerCase();
    if (filterField === 'name') return item.name?.toLowerCase().includes(search);
    if (filterField === 'sku') return item.sku?.toLowerCase().includes(search);
    return true;
  });

  const activeVariant = variantList[selectedVariantIndex] || {};

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>Monitor Tiendanube</Typography>

      <Grid container spacing={2} sx={{ mb: 4 }} alignItems="center">
        <Grid item xs={12} md={3}>
          <TextField select fullWidth label="Sucursal" value={selectedBusiness} onChange={(e) => { setSelectedBusiness(e.target.value); fetchSyncStatus(e.target.value); }}>
            {businesses.map((biz) => <MenuItem key={biz.id} value={biz.id}>{biz.name}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12} md={5}>
          <TextField fullWidth placeholder="Buscar..." value={filterText} onChange={(e) => setFilterText(e.target.value)} />
        </Grid>
        <Grid item xs={12} md={4} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button 
            variant="outlined" color="primary" startIcon={<ReceiptLongIcon />} 
            onClick={handleMonitorOrders} disabled={!selectedBusiness}
          >
            Monitor de Órdenes
          </Button>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => fetchSyncStatus(selectedBusiness)}>Refrescar</Button>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead sx={{ bgcolor: 'grey.50' }}><TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Precio</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
            <TableCell align="right" sx={{ fontWeight: 700 }}>Acciones</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {filteredItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.sku}</TableCell>
                <TableCell>${item.selling_price}</TableCell>
                <TableCell>
                  <Chip label={item.tiendanube_sync_map?.sync_status || 'Pendiente'} 
                        color={item.tiendanube_sync_map?.sync_status === 'SYNCED' ? 'success' : 'default'} size="small" />
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                    <IconButton onClick={() => handleOpenPrepare(item)} color="primary"><EditIcon /></IconButton>
                    <IconButton onClick={() => handleExport(item.id)} color="info"><CloudUploadIcon /></IconButton>
                    {item.inventory_items_tn?.tn_product_id && (
                      <IconButton onClick={() => handleDeleteFromTN(item.id)} color="error"><DeleteIcon /></IconButton>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* MODAL MONITOR DE ÓRDENES */}
      <Dialog open={openOrderModal} onClose={() => setOpenOrderModal(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Monitor de Órdenes en Tiendanube</DialogTitle>
        <DialogContent dividers>
          {loadingOrders ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: 'grey.100' }}><TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Orden TN</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Cliente</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Monto</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Estado Pago</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>En ERP?</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Acción</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {ordersData.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>#{order.number}</TableCell>
                      <TableCell>{order.contact_name}</TableCell>
                      <TableCell>${order.total}</TableCell>
                      <TableCell>
                        <Chip label={order.payment_status} color={order.payment_status === 'paid' ? 'success' : 'warning'} size="small" />
                      </TableCell>
                      <TableCell>
                        {order.exists_in_erp ? <Chip label="SÍ" color="success" size="small" variant="outlined" /> : <Chip label="NO" color="error" size="small" variant="outlined" />}
                      </TableCell>
                      <TableCell align="right">
                        {!order.exists_in_erp && (
                          <Button 
                            size="small" 
                            variant="contained" 
                            color="primary" 
                            startIcon={<SyncIcon />}
                            onClick={() => handleForceSyncOrder(order.id)}
                          >
                            Sincronizar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {ordersData.length === 0 && <TableRow><TableCell colSpan={5} align="center">No se encontraron órdenes recientes.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenOrderModal(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* MODAL DE PREPARACIÓN */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Preparar Producto: {editingItem?.name}</DialogTitle>
        <DialogContent dividers>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} variant="scrollable" scrollButtons="auto">
            <Tab label="Identificación y SEO" />
            <Tab label="Precios y Stock" />
            <Tab label="Marca y Clase" />
            <Tab label="Media" />
          </Tabs>
          <TabPanel value={tabValue} index={0}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}><TextField fullWidth label="Identificador URL" value={activeVariant.identificador_de_url || ''} onChange={(e) => updateVariantField('identificador_de_url', e.target.value)} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="Nombre en Tienda" value={activeVariant.nombre || ''} onChange={(e) => updateVariantField('nombre', e.target.value)} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="SKU" value={activeVariant.sku || ''} onChange={(e) => updateVariantField('sku', e.target.value)} /></Grid>
              <Grid item xs={12}><TextField fullWidth multiline rows={3} label="Descripción" value={activeVariant.descripcion || ''} onChange={(e) => updateVariantField('descripcion', e.target.value)} /></Grid>
            </Grid>
          </TabPanel>
          <TabPanel value={tabValue} index={1}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Precio" value={activeVariant.precio || ''} onChange={(e) => updateVariantField('precio', e.target.value)} /></Grid>
              <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Stock (Manual)" value={activeVariant.stock || 0} /></Grid>
            </Grid>
          </TabPanel>
          <TabPanel value={tabValue} index={2}>
            <Grid item xs={12} sm={6}><TextField fullWidth label="Marca" value={activeVariant.marca || ''} onChange={(e) => updateVariantField('marca', e.target.value)} /></Grid>
          </TabPanel>
          <TabPanel value={tabValue} index={3}>
            <TextField fullWidth label="URL Imagen" value={activeVariant.imagen_url || ''} onChange={(e) => updateVariantField('imagen_url', e.target.value)} />
          </TabPanel>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenModal(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSavePreparation} disabled={saving}>Guardar Localmente</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
