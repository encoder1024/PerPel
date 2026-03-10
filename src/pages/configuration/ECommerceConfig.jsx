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
  Breadcrumbs,
  Link
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

export default function ECommerceConfig() {
  const { profile } = useAuthStore();
  const [categories, setCategories] = useState([]);
  const [localCategories, setLocalCategories] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, [profile?.account_id]);

  const fetchInitialData = async () => {
    if (!profile?.account_id) return;
    setLoading(true);
    try {
      // 1. Negocios con TN
      const { data: bizData } = await supabase
        .schema('core')
        .from('business_asign_credentials')
        .select(`business_id, businesses:business_id (id, name)`)
        .eq('account_id', profile.account_id)
        .eq('api_name', 'TIENDANUBE')
        .eq('is_active', true);
      
      const uniqueBusinesses = bizData?.map(b => b.businesses).filter(b => b !== null) || [];
      setBusinesses(uniqueBusinesses);
      
      if (uniqueBusinesses.length > 0) {
        setSelectedBusiness(uniqueBusinesses[0].id);
        await fetchCategories(uniqueBusinesses[0].id);
      }

      // 2. Categorías Locales para el Mapeo
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/tn-category-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`
        },
        body: JSON.stringify({ 
          businessId: selectedBusiness,
          accountId: profile?.account_id 
        }),
      });

      const data = await res.json();

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
    // 1. Obtener raíces y ordenarlas alfabéticamente
    const roots = flatList
      .filter(c => c.tn_parent_id === 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    const result = [];
    roots.forEach(root => {
      result.push(root);
      // 2. Obtener hijos de esta raíz y ordenarlos alfabéticamente
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
            {businesses.map((biz) => (
              <MenuItem key={biz.id} value={biz.id}>{biz.name}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={8} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button 
            variant="contained" 
            startIcon={syncing ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />} 
            onClick={handleSyncCategories}
            disabled={syncing || !selectedBusiness}
          >
            Sincronizar con Tiendanube
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
              <TableRow><TableCell colSpan={4} align="center">Pulsa "Sincronizar" para traer las categorías de tu tienda online.</TableCell></TableRow>
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
    </Box>
  );
}
