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
  MenuItem,
  TextField,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import AddLinkIcon from '@mui/icons-material/AddLink';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';
import { useBusinesses } from '../../hooks/useBusinesses';

export default function ECommerceConfig() {
  const { profile } = useAuthStore();
  const { businesses: allBusinesses } = useBusinesses();
  const [categories, setCategories] = useState([]);
  const [localCategories, setLocalCategories] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Estados para el Modal de Vinculación
  const [openModal, setOpenModal] = useState(false);
  const [modalBusinessId, setModalBusinessId] = useState('');
  const [tiendaId, setTiendaId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, [profile?.account_id]);

  const fetchInitialData = async () => {
    if (!profile?.account_id) return;
    setLoading(true);
    try {
      // 1. Obtener todos los negocios de la cuenta
      const { data: bizData, error: bizError } = await supabase
        .schema('core')
        .from('businesses')
        .select('id, name')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);

      if (bizError) throw bizError;

      // 2. Obtener las credenciales de TIENDANUBE vinculadas a estos negocios
      const { data: assignData, error: assignError } = await supabase
        .schema('core')
        .from('business_asign_credentials')
        .select(`
          business_id,
          credential:credential_id (
            id, 
            api_name, 
            external_status, 
            access_token
          )
        `)
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false)
        .eq('api_name', 'TIENDANUBE'); // Filtro opcional si la tabla lo soporta

      if (assignError) throw assignError;

      // 3. Cruzar datos para determinar el estado de conexión
      const mappedBusinesses = bizData.map(b => {
        // Buscamos si este negocio tiene una asignación de TN
        const assignment = assignData?.find(a => a.business_id === b.id && a.credential?.api_name === 'TIENDANUBE');
        const tnCred = assignment?.credential;
        
        let status = 'disconnected'; // Rojo por defecto
        
        if (tnCred) {
          if (tnCred.external_status === 'active' && tnCred.access_token) {
            status = 'connected'; // Verde
          } else if (tnCred.external_status === 'pending_auth') {
            status = 'pending'; // Amarillo
          }
        }

        return { ...b, connectionStatus: status };
      });

      setBusinesses(mappedBusinesses);
      
      // Seleccionar el primero si no hay uno seleccionado o el actual ya no existe
      if (mappedBusinesses.length > 0) {
        const toSelect = selectedBusiness && mappedBusinesses.find(b => b.id === selectedBusiness) 
          ? selectedBusiness 
          : mappedBusinesses[0].id;
        
        setSelectedBusiness(toSelect);
        await fetchCategories(toSelect);
      }

      // 4. Categorías Locales para el Mapeo
      const { data: localCatData } = await supabase
        .schema('core')
        .from('item_categories')
        .select('id, name')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      
      setLocalCategories(localCatData || []);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusChip = () => {
    const currentBiz = businesses.find(b => b.id === selectedBusiness);
    if (!currentBiz) return null;

    switch (currentBiz.connectionStatus) {
      case 'connected':
        return <Chip label="Vinculado OK" color="success" size="small" variant="filled" sx={{ fontWeight: 700 }} />;
      case 'pending':
        return <Chip label="En Proceso" color="warning" size="small" variant="filled" sx={{ fontWeight: 700 }} />;
      default:
        return <Chip label="No Vinculado" color="error" size="small" variant="filled" sx={{ fontWeight: 700 }} />;
    }
  };

  const fetchCategories = async (businessId) => {
    setLoading(true);
    try {
      const { data, error: catError } = await supabase
        .schema('core')
        .from('tiendanube_categorias')
        .select('*')
        .eq('business_id', businessId)
        .eq('is_deleted', false)
        .order('tn_parent_id', { ascending: true })
        .order('name', { ascending: true });

      if (catError) throw catError;
      setCategories(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCategories = async () => {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tn-category-sync', {
        body: { 
          businessId: selectedBusiness,
          accountId: profile?.account_id 
        },
      });

      if (invokeError) throw invokeError;

      if (data.success) {
        setMessage(`Sincronización completada: ${data.count} categorías procesadas.`);
        await fetchCategories(selectedBusiness);
      } else {
        throw new Error(data.message || "Error desconocido al sincronizar");
      }
    } catch (err) {
      setError("Error al sincronizar con Tiendanube: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleLinkTiendanube = async () => {
    if (!modalBusinessId || !tiendaId || !clientSecret) {
      setError("Todos los campos son obligatorios.");
      return;
    }

    setLinking(true);
    setError(null);
    try {
      // Verificar que el usuario esté autenticado antes de invocar
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Sesión expirada. Por favor, vuelve a iniciar sesión.");
      }

      const { data, error: invokeError } = await supabase.functions.invoke('tn-oauth-start', {
        body: {
          account_id: profile.account_id,
          business_id: modalBusinessId,
          client_id: tiendaId,
          client_secret: clientSecret
        },
      });

      if (invokeError) throw invokeError;

      if (data && data.url) {
        // Redirigir a Tiendanube para autorizar
        window.location.href = data.url;
      } else {
        throw new Error(data?.error || "Error al iniciar vinculación");
      }
    } catch (err) {
      setError("Error al vincular: " + err.message);
      setLinking(false);
    }
  };

  const handleMapCategory = async (id, localId) => {
    try {
      const { error: updateError } = await supabase
        .schema('core')
        .from('tiendanube_categorias')
        .update({ category_id: localId || null })
        .eq('id', id);

      if (updateError) throw updateError;
      
      setCategories(categories.map(c => c.id === id ? { ...c, category_id: localId } : c));
    } catch (err) {
      setError("Error al guardar mapeo: " + err.message);
    }
  };

  const organizeCategories = (flatList) => {
    const roots = flatList
      .filter(c => c.tn_parent_id === 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    const result = [];
    roots.forEach(root => {
      result.push(root);
      const children = flatList
        .filter(c => c.tn_parent_id === root.tn_category_id)
        .sort((a, b) => a.name.localeCompare(b.name));
      
      result.push(...children);
    });

    return result;
  };

  const displayedCategories = organizeCategories(categories);

  return (
    <Box sx={{ p: 1 }}>

      <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
        Configuración de Categorías E-commerce
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        Vincula tus categorías locales con las de Tiendanube para una exportación correcta de productos.
      </Typography>

      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2">Estado de Conexión:</Typography>
        {getStatusChip()}
      </Box>

      <Grid container spacing={2} sx={{ mb: 4 }} alignItems="center">
        <Grid item xs={12} md={4}>
          <TextField
            select
            fullWidth
            label="Sucursal"
            value={selectedBusiness}
            onChange={(e) => {
              setSelectedBusiness(e.target.value);
              fetchCategories(e.target.value);
            }}
          >
            {businesses.length > 0 ? (
              businesses.map((biz) => (
                <MenuItem key={biz.id} value={biz.id}>{biz.name}</MenuItem>
              ))
            ) : (
              <MenuItem disabled value=""><em>No hay sucursales vinculadas</em></MenuItem>
            )}
          </TextField>
        </Grid>
        <Grid item xs={12} md={8} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<AddLinkIcon />}
            onClick={() => setOpenModal(true)}
          >
            Vincular Tiendanube
          </Button>
          <Button 
            variant="contained" 
            startIcon={syncing ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />} 
            onClick={handleSyncCategories}
            disabled={syncing || !selectedBusiness}
          >
            Sincronizar Categorías
          </Button>
        </Grid>
      </Grid>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: 'grey.50' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Categoría en Tiendanube</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Jerarquía</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>ID TN</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Mapeo ERP (Local)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && categories.length === 0 ? (
              <TableRow><TableCell colSpan={4} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : categories.length === 0 ? (
              <TableRow><TableCell colSpan={4} align="center">
                {selectedBusiness 
                  ? "Pulsa 'Sincronizar' para traer las categorías de tu tienda online."
                  : "Selecciona o vincula una sucursal para gestionar categorías."
                }
              </TableCell></TableRow>
            ) : (
              displayedCategories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell sx={{ 
                    fontWeight: cat.tn_parent_id === 0 ? 700 : 400,
                    pl: cat.tn_parent_id === 0 ? 2 : 4
                  }}>
                    {cat.tn_parent_id !== 0 && "↳ "} {cat.name}
                  </TableCell>
                  <TableCell>
                    {cat.tn_parent_id === 0 ? <Chip label="Raíz" size="small" /> : <Typography variant="caption">Subcategoría</Typography>}
                  </TableCell>
                  <TableCell>{cat.tn_category_id}</TableCell>
                  <TableCell>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      placeholder="Seleccionar categoría ERP"
                      value={cat.category_id || ''}
                      onChange={(e) => handleMapCategory(cat.id, e.target.value)}
                    >
                      <MenuItem value=""><em>Ninguna (Sin mapeo)</em></MenuItem>
                      {localCategories.map((local) => (
                        <MenuItem key={local.id} value={local.id}>{local.name}</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* MODAL DE VINCULACIÓN */}
      <Dialog open={openModal} onClose={() => !linking && setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Vincular Tienda Online (Tiendanube)
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            Para obtener el token de acceso, ingresa las credenciales de tu "Aplicación Privada" creada en el panel de Tiendanube.
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                select
                fullWidth
                label="Sucursal a Vincular"
                value={modalBusinessId}
                onChange={(e) => setModalBusinessId(e.target.value)}
                required
              >
                {allBusinesses.map((biz) => (
                  <MenuItem key={biz.id} value={biz.id}>{biz.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Tienda ID (Client ID)"
                placeholder="Ej: 123456"
                value={tiendaId}
                onChange={(e) => setTiendaId(e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Client Secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                required
                InputProps={{
                  endAdornment: (
                    <Tooltip title="Obtenlo en el panel de Tiendanube > Mis Aplicaciones">
                      <IconButton size="small"><HelpOutlineIcon /></IconButton>
                    </Tooltip>
                  )
                }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)} disabled={linking}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleLinkTiendanube} 
            disabled={linking || !modalBusinessId || !tiendaId || !clientSecret}
            startIcon={linking && <CircularProgress size={20} color="inherit" />}
          >
            {linking ? "Iniciando..." : "Generar Conexión"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
