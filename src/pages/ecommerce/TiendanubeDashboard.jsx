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
  ListItemText
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SyncIcon from '@mui/icons-material/Sync';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
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

  useEffect(() => {
    fetchInitialData();
  }, [profile?.account_id]);

  const validateVariants = () => {
    const errors = [];
    variantList.forEach((v, index) => {
      const prefix = variantList.length > 1 ? `Variante ${index + 1}: ` : "";
      
      if (!v.nombre?.trim()) errors.push(`${prefix}El nombre es obligatorio.`);
      if (!v.sku?.trim()) errors.push(`${prefix}El SKU es obligatorio.`);
      if (!v.identificador_de_url?.trim()) errors.push(`${prefix}El identificador de URL (handle) es obligatorio.`);
      if (!v.imagen_url?.trim()) errors.push(`${prefix}Debe definir una URL de imagen (Supabase Storage).`);
      
      const precio = parseFloat(v.precio || 0);
      const oferta = v.precio_promocional ? parseFloat(v.precio_promocional) : null;
      const costo = parseFloat(v.costo || 0);

      if (precio <= 0) errors.push(`${prefix}El precio de venta debe ser mayor a 0.`);
      
      if (oferta !== null && !isNaN(oferta)) {
        if (oferta >= precio) errors.push(`${prefix}El precio de oferta (${oferta}) debe ser menor al precio de lista (${precio}).`);
        if (costo >= oferta) errors.push(`${prefix}El costo (${costo}) debe ser menor al precio de oferta (${oferta}).`);
      } else {
        if (costo >= precio) errors.push(`${prefix}El costo (${costo}) debe ser menor al precio de lista (${precio}).`);
      }

      [1, 2, 3].forEach(i => {
        if (v[`nombre_de_propiedad_${i}`] && !v[`valor_de_propiedad_${i}`]) {
          errors.push(`${prefix}La propiedad "${v[`nombre_de_propiedad_${i}`]}" debe tener un valor.`);
        }
      });
    });
    return errors;
  };

  const fetchInitialData = async () => {
    if (!profile?.account_id) return;
    setLoading(true);
    try {
      const { data: bizData, error: bizError } = await supabase
        .schema('core')
        .from('business_asign_credentials')
        .select(`business_id, businesses:business_id (id, name)`)
        .eq('account_id', profile.account_id)
        .eq('api_name', 'TIENDANUBE')
        .eq('is_active', true);
      
      if (bizError) throw bizError;
      const uniqueBusinesses = bizData.map(b => b.businesses).filter(b => b !== null);
      setBusinesses(uniqueBusinesses);
      
      if (uniqueBusinesses.length > 0) {
        setSelectedBusiness(uniqueBusinesses[0].id);
        await fetchSyncStatus(uniqueBusinesses[0].id);
      }
    } catch (err) {
      setError(err.message);
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

  const handleOpenPrepare = async (item) => {
    setLoading(true);
    try {
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
    newList[selectedVariantIndex] = { ...newList[selectedVariantIndex], [field]: value };
    setVariantList(newList);
  };

  const handleSavePreparation = async () => {
    const errors = validateVariants();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setSaving(true);
    setValidationErrors([]);
    try {
      const { error: upsertError } = await supabase
        .schema('core')
        .from('tiendanube_item_variants')
        .upsert(variantList);

      if (upsertError) throw upsertError;

      setMessage("Preparación de variantes guardada.");
      setOpenModal(false);
      await fetchSyncStatus(selectedBusiness);
    } catch (err) {
      setError("Error al guardar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async (itemId) => {
    setSyncingId(itemId);
    setError(null);
    setMessage(null);

    try {
      // 1. Obtener variantes de la DB para validar antes de enviar
      const { data: variants, error: fetchVarError } = await supabase
        .schema('core')
        .from('tiendanube_item_variants')
        .select('*')
        .eq('item_id', itemId)
        .eq('is_deleted', false);

      if (fetchVarError) throw fetchVarError;
      if (!variants || variants.length === 0) {
        throw new Error("El producto no tiene variantes preparadas. Use el botón de editar primero.");
      }

      // 2. Validar reglas de negocio
      const validationErrs = [];
      variants.forEach((v, index) => {
        const prefix = variants.length > 1 ? `Variante ${index + 1}: ` : "";
        if (!v.nombre?.trim()) validationErrs.push(`${prefix}El nombre es obligatorio.`);
        if (!v.sku?.trim()) validationErrs.push(`${prefix}El SKU es obligatorio.`);
        if (!v.identificador_de_url?.trim()) validationErrs.push(`${prefix}El handle es obligatorio.`);
        if (!v.imagen_url?.trim()) validationErrs.push(`${prefix}Falta la URL de imagen.`);
        
        const precio = parseFloat(v.precio || 0);
        const oferta = v.precio_promocional ? parseFloat(v.precio_promocional) : null;
        const costo = parseFloat(v.costo || 0);

        if (precio <= 0) validationErrs.push(`${prefix}Precio inválido.`);
        if (oferta !== null && !isNaN(oferta) && oferta >= precio) validationErrs.push(`${prefix}Precio de oferta inválido.`);
        if (costo >= (oferta || precio)) validationErrs.push(`${prefix}Costo inválido (debe ser menor al precio).`);
      });

      if (validationErrs.length > 0) {
        throw new Error("Validación fallida: " + validationErrs.join(" | "));
      }

      // 3. Llamada a la Edge Function (Usando fetch directo con anonKey para evitar 401)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/tn-product-upsert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`
        },
        body: JSON.stringify({ 
          itemId, 
          businessId: selectedBusiness,
          accountId: profile?.account_id 
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage(`Exportado con éxito a Tiendanube.`);
        await fetchSyncStatus(selectedBusiness);
      } else {
        throw new Error(data.message || "Error desconocido en el servidor");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncingId(null);
    }
  };

  const filteredItems = items.filter(item => {
    if (!filterText) return true;
    const search = filterText.toLowerCase();
    if (filterField === 'name') return item.name?.toLowerCase().includes(search);
    if (filterField === 'sku') return item.sku?.toLowerCase().includes(search);
    if (filterField === 'brand') return item.inventory_items_tn?.[0]?.brand?.toLowerCase().includes(search);
    if (filterField === 'tn_id') return item.inventory_items_tn?.[0]?.tn_product_id?.toString().includes(search);
    return true;
  });

  const activeVariant = variantList[selectedVariantIndex] || {};

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>Monitor de Sincronización Tiendanube</Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>Gestiona Aroma de Mujer y tus canales online.</Typography>

      <Grid container spacing={2} sx={{ mb: 4 }} alignItems="center">
        <Grid item xs={12} md={3}>
          <TextField select fullWidth label="Sucursal" value={selectedBusiness} onChange={(e) => { setSelectedBusiness(e.target.value); fetchSyncStatus(e.target.value); }}>
            {businesses.map((biz) => <MenuItem key={biz.id} value={biz.id}>{biz.name}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={12} md={2}>
          <TextField select fullWidth label="Buscar por..." value={filterField} onChange={(e) => setFilterField(e.target.value)}>
            <MenuItem value="name">Nombre</MenuItem>
            <MenuItem value="sku">SKU</MenuItem>
            <MenuItem value="brand">Marca</MenuItem>
            <MenuItem value="tn_id">ID Tiendanube</MenuItem>
          </TextField>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField fullWidth placeholder="Ingrese el texto a buscar..." value={filterText} onChange={(e) => setFilterText(e.target.value)} />
        </Grid>
        <Grid item xs={12} md={3} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => fetchSyncStatus(selectedBusiness)}>Refrescar</Button>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead sx={{ bgcolor: 'grey.50' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Precio</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.name}</Typography>
                  <Typography variant="caption" color="textSecondary">{item.inventory_items_tn?.[0]?.handle || 'Sin handle'}</Typography>
                </TableCell>
                <TableCell>{item.sku || '-'}</TableCell>
                <TableCell>${item.selling_price}</TableCell>
                <TableCell>
                  {item.inventory_items_tn?.[0]?.tn_product_id ? <Chip label="Sincronizado" color="success" size="small" /> : <Chip label="Pendiente" variant="outlined" size="small" />}
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                    <IconButton color="primary" onClick={() => handleOpenPrepare(item)}><EditIcon /></IconButton>
                    <Button size="small" variant="contained" onClick={() => handleExport(item.id)} disabled={syncingId !== null}>
                      {syncingId === item.id ? <CircularProgress size={16} color="inherit" /> : <CloudUploadIcon />}
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Preparar Producto: {editingItem?.name}</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', minHeight: '60vh', flexDirection: 'column' }}>
          {validationErrors.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <ul>{validationErrors.map((err, i) => <li key={i}>{err}</li>)}</ul>
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexGrow: 1 }}>
            <Box sx={{ width: 200, borderRight: 1, borderColor: 'divider', pr: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Variantes</Typography>
              <List size="small">
                {variantList.map((v, index) => (
                  <ListItem button key={index} selected={selectedVariantIndex === index} onClick={() => setSelectedVariantIndex(index)}>
                    <ListItemText primary={v.valor_de_propiedad_1 || `Variante ${index + 1}`} secondary={v.sku} />
                  </ListItem>
                ))}
              </List>
              <Button startIcon={<AddIcon />} fullWidth size="small" onClick={() => setVariantList([...variantList, { ...variantList[0], id: undefined, tn_variant_id: null }])}>Agregar Variante</Button>
            </Box>
            <Box sx={{ flexGrow: 1, pl: 3 }}>
              <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} variant="scrollable" scrollButtons="auto">
                <Tab label="Identificación y SEO" />
                <Tab label="Propiedades" />
                <Tab label="Precios y Costos" />
                <Tab label="Físicos y Stock" />
                <Tab label="Marca y Clase" />
                <Tab label="Media" />
              </Tabs>
              <TabPanel value={tabValue} index={0}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Identificador URL (Handle)" value={activeVariant.identificador_de_url || ''} onChange={(e) => updateVariantField('identificador_de_url', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Nombre en Tienda" value={activeVariant.nombre || ''} onChange={(e) => updateVariantField('nombre', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="SKU" value={activeVariant.sku || ''} onChange={(e) => updateVariantField('sku', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Código de Barras" value={activeVariant.codigo_de_barras || ''} onChange={(e) => updateVariantField('codigo_de_barras', e.target.value)} /></Grid>
                  <Grid item xs={12}><TextField fullWidth multiline rows={3} label="Descripción" value={activeVariant.descripcion || ''} onChange={(e) => updateVariantField('descripcion', e.target.value)} /></Grid>
                  <Grid item xs={12}><TextField fullWidth label="Tags (separados por coma)" value={activeVariant.tags || ''} onChange={(e) => updateVariantField('tags', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Título SEO" value={activeVariant.titulo_para_seo || ''} onChange={(e) => updateVariantField('titulo_para_seo', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Descripción SEO" value={activeVariant.descripcion_para_seo || ''} onChange={(e) => updateVariantField('descripcion_para_seo', e.target.value)} /></Grid>
                  <Grid item xs={6}><FormControlLabel control={<Switch checked={activeVariant.mostrar_en_tienda ?? true} onChange={(e) => updateVariantField('mostrar_en_tienda', e.target.checked)} />} label="Mostrar en Tienda" /></Grid>
                  <Grid item xs={6}><FormControlLabel control={<Switch checked={activeVariant.envio_sin_cargo ?? false} onChange={(e) => updateVariantField('envio_sin_cargo', e.target.checked)} />} label="Envío sin cargo" /></Grid>
                </Grid>
              </TabPanel>
              <TabPanel value={tabValue} index={1}>
                <Grid container spacing={2}>
                  {[1, 2, 3].map(i => (
                    <React.Fragment key={i}>
                      <Grid item xs={12} sm={6}><TextField fullWidth label={`Propiedad ${i}`} value={activeVariant[`nombre_de_propiedad_${i}`] || ''} onChange={(e) => updateVariantField(`nombre_de_propiedad_${i}`, e.target.value)} /></Grid>
                      <Grid item xs={12} sm={6}><TextField fullWidth label={`Valor ${i}`} value={activeVariant[`valor_de_propiedad_${i}`] || ''} onChange={(e) => updateVariantField(`valor_de_propiedad_${i}`, e.target.value)} /></Grid>
                    </React.Fragment>
                  ))}
                </Grid>
              </TabPanel>
              <TabPanel value={tabValue} index={2}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Precio" value={activeVariant.precio || ''} onChange={(e) => updateVariantField('precio', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Promocional" value={activeVariant.precio_promocional || ''} onChange={(e) => updateVariantField('precio_promocional', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Costo" value={activeVariant.costo || ''} onChange={(e) => updateVariantField('costo', e.target.value)} /></Grid>
                </Grid>
              </TabPanel>
              <TabPanel value={tabValue} index={3}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}><TextField fullWidth label="Stock Actual (ERP)" value={activeVariant.stock || 0} InputProps={{ readOnly: true }} /></Grid>
                  <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Peso (kg)" value={activeVariant.peso_kg || ''} onChange={(e) => updateVariantField('peso_kg', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Alto (cm)" value={activeVariant.alto_cm || ''} onChange={(e) => updateVariantField('alto_cm', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Ancho (cm)" value={activeVariant.ancho_cm || ''} onChange={(e) => updateVariantField('ancho_cm', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={4}><TextField fullWidth type="number" label="Profundidad (cm)" value={activeVariant.profundidad_cm || ''} onChange={(e) => updateVariantField('profundidad_cm', e.target.value)} /></Grid>
                </Grid>
              </TabPanel>
              <TabPanel value={tabValue} index={4}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Categorías" value={activeVariant.categorias || ''} onChange={(e) => updateVariantField('categorias', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Marca" value={activeVariant.marca || ''} onChange={(e) => updateVariantField('marca', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Producto Fásico" value={activeVariant.producto_fasico || ''} onChange={(e) => updateVariantField('producto_fasico', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="MPN" value={activeVariant.mpn_numero_de_pieza_del_fabricante || ''} onChange={(e) => updateVariantField('mpn_numero_de_pieza_del_fabricante', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Sexo" value={activeVariant.sexo || ''} onChange={(e) => updateVariantField('sexo', e.target.value)} /></Grid>
                  <Grid item xs={12} sm={6}><TextField fullWidth label="Rango de Edad" value={activeVariant.rango_de_edad || ''} onChange={(e) => updateVariantField('rango_de_edad', e.target.value)} /></Grid>
                </Grid>
              </TabPanel>
              <TabPanel value={tabValue} index={5}>
                <TextField fullWidth label="URL Imagen" value={activeVariant.imagen_url || ''} onChange={(e) => updateVariantField('imagen_url', e.target.value)} />
                {activeVariant.imagen_url && <Box sx={{ mt: 2, textAlign: 'center' }}><img src={activeVariant.imagen_url} alt="preview" style={{ maxWidth: '100%', maxHeight: 200 }} /></Box>}
              </TabPanel>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenModal(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSavePreparation} disabled={saving}>Guardar Localmente</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
