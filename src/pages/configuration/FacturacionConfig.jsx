import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, Button, CircularProgress, Alert, Snackbar, MenuItem,
  FormControl, InputLabel, Select, Card, CardContent, Divider
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';
import { useInvoices } from '../../hooks/useInvoices';

export default function FacturacionConfig() {
  const { profile } = useAuthStore();
  const { fetchProvinces, fetchInvoiceTypes, fetchPaymentConditions } = useInvoices();
  
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refLoading, setRefLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  
  // Tablas de referencia TFA
  const [provinces, setProvinces] = useState([]);
  const [invoiceTypes, setInvoiceTypes] = useState([]);
  const [paymentConditions, setPaymentConditions] = useState([]);
  const [hasCredentials, setHasCredentials] = useState(true);

  const [formData, setFormData] = useState({
    default_punto_venta: 1,
    default_comprobante_tipo: '11',
    default_condicion_pago: 1,
    tfa_concepto: 1,
    tfa_provincia_id: 2,
    tfa_rubro: 'Ventas',
  });

  const fetchInitialData = async () => {
    if (!profile?.account_id) return;
    setLoading(true);
    try {
      const { data: bData, error: bError } = await supabase
        .schema('core')
        .from('businesses')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false)
        .order('name');

      if (bError) throw bError;
      setBusinesses(bData || []);
      
      if (bData?.length > 0) {
        setSelectedBusinessId(bData[0].id);
        setFormData({
          default_punto_venta: bData[0].default_punto_venta || 1,
          default_comprobante_tipo: bData[0].default_comprobante_tipo || '11',
          default_condicion_pago: bData[0].default_condicion_pago || 1,
          tfa_concepto: bData[0].tfa_concepto || 1,
          tfa_provincia_id: bData[0].tfa_provincia_id || 2,
          tfa_rubro: bData[0].tfa_rubro || 'Ventas',
        });
        
        loadTFAReferences(bData[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTFAReferences = async (businessId) => {
    setRefLoading(true);
    setHasCredentials(true);
    // Limpiar estados previos para forzar re-render de selectores
    setProvinces([]);
    setInvoiceTypes([]);
    setPaymentConditions([]);
    
    try {
      const [p, t, c] = await Promise.all([
        fetchProvinces(businessId),
        fetchInvoiceTypes(businessId),
        fetchPaymentConditions(businessId)
      ]);
      
      if (p.length === 0 && t.length === 0) {
        setHasCredentials(false);
      } else {
        setProvinces(p);
        setInvoiceTypes(t);
        setPaymentConditions(c);
      }
    } catch (err) {
      console.error("Error loading references:", err);
      setHasCredentials(false);
    } finally {
      setRefLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [profile?.account_id]);

  const handleBusinessChange = (e) => {
    const bId = e.target.value;
    setSelectedBusinessId(bId);
    const b = businesses.find(x => x.id === bId);
    if (b) {
      setFormData({
        default_punto_venta: b.default_punto_venta || 1,
        default_comprobante_tipo: b.default_comprobante_tipo || '11',
        default_condicion_pago: b.default_condicion_pago || 1,
        tfa_concepto: b.tfa_concepto || 1,
        tfa_provincia_id: b.tfa_provincia_id || 2,
        tfa_rubro: b.tfa_rubro || 'Ventas',
      });
      loadTFAReferences(bId);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .schema('core')
        .from('businesses')
        .update({
          default_punto_venta: parseInt(formData.default_punto_venta),
          default_comprobante_tipo: formData.default_comprobante_tipo,
          default_condicion_pago: parseInt(formData.default_condicion_pago),
          tfa_concepto: formData.tfa_concepto,
          tfa_provincia_id: formData.tfa_provincia_id,
          tfa_rubro: formData.tfa_rubro
        })
        .eq('id', selectedBusinessId);

      if (error) throw error;
      setBusinesses(businesses.map(b => b.id === selectedBusinessId ? { ...b, ...formData } : b));
      alert("Configuración guardada correctamente");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Configuración Fiscal Dinámica (TFA)</Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth>
            <InputLabel>Sucursal</InputLabel>
            <Select value={selectedBusinessId} label="Sucursal" onChange={handleBusinessChange}>
              {businesses.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card variant="outlined" sx={{ position: 'relative' }}>
            {refLoading && (
              <Box sx={{ 
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                bgcolor: 'rgba(255,255,255,0.7)', zIndex: 2,
                display: 'flex', justifyContent: 'center', alignItems: 'center' 
              }}>
                <CircularProgress size={40} />
              </Box>
            )}
            <CardContent>
              {!hasCredentials && (
                <Alert severity="warning" sx={{ mb: 3 }}>
                  Esta sucursal no tiene credenciales de TusFacturasApp asignadas o activas. 
                  Por favor, ve a la sección de Credenciales primero.
                </Alert>
              )}
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Punto de Venta" type="number" value={formData.default_punto_venta} onChange={e => setFormData({...formData, default_punto_venta: e.target.value})} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Comprobante por Defecto</InputLabel>
                    <Select value={formData.default_comprobante_tipo} label="Comprobante por Defecto" onChange={e => setFormData({...formData, default_comprobante_tipo: e.target.value})}>
                      {invoiceTypes.map(t => <MenuItem key={t.id} value={String(t.id)}>{t.nombre}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Condición de Pago por Defecto</InputLabel>
                    <Select value={formData.default_condicion_pago} label="Condición de Pago por Defecto" onChange={e => setFormData({...formData, default_condicion_pago: e.target.value})}>
                      {paymentConditions.map(c => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Provincia (AFIP)</InputLabel>
                    <Select value={formData.tfa_provincia_id} label="Provincia (AFIP)" onChange={e => setFormData({...formData, tfa_provincia_id: e.target.value})}>
                      {provinces.map(p => <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Rubro / Categoría" value={formData.tfa_rubro} onChange={e => setFormData({...formData, tfa_rubro: e.target.value})} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label="Concepto por Defecto"
                    value={formData.tfa_concepto}
                    onChange={(e) => setFormData({...formData, tfa_concepto: e.target.value})}
                  >
                    <MenuItem value={1}>Productos</MenuItem>
                    <MenuItem value={2}>Servicios</MenuItem>
                    <MenuItem value={3}>Ambos</MenuItem>
                  </TextField>
                </Grid>
              </Grid>
              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={isSaving || !hasCredentials}>Guardar Configuración</Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
