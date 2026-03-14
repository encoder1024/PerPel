import React, { useState, useEffect, useMemo } from 'react';
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
  TextField,
  Grid,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Divider,
  Avatar
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import StarIcon from '@mui/icons-material/Star';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

export default function Customers() {
  const { profile } = useAuthStore();
  const [customers, setCustomers] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [summary, setSummary] = useState({ total: 0, byBusiness: [] });
  const [topTen, setTopTen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchText] = useState('');

  // Form states
  const [openModal, setOpenModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    doc_number: '',
    address: '',
    category: 'NEW' // Default rank
  });

  useEffect(() => {
    if (profile?.account_id) {
      fetchData();
    }
  }, [profile?.account_id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Obtener Negocios
      const { data: bizData } = await supabase
        .schema('core')
        .from('businesses')
        .select('id, name')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      setBusinesses(bizData || []);

      // 2. Obtener Clientes con su origen y datos fiscales
      const { data: custData, error: custError } = await supabase
        .schema('core')
        .from('customers')
        .select(`
          *,
          business:business_id (name)
        `)
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      
      if (custError) throw custError;
      setCustomers(custData || []);

      // 3. Calcular Resumen por Negocio
      const counts = bizData.map(b => ({
        name: b.name,
        count: custData.filter(c => c.business_id === b.id).length
      }));
      setSummary({ total: custData.length, byBusiness: counts });

      // 4. Obtener Ranking Top 10 del Mes Actual
      // Nota: Esta consulta asume que existe la tabla orders vinculada
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      
      const { data: topData } = await supabase
        .schema('core')
        .from('orders')
        .select('client_id, customers!client_id(full_name, category)')
        .eq('account_id', profile.account_id)
        .gte('created_at', firstDayOfMonth);

      // Agrupar y clasificar (Lógica simplificada en JS por ahora)
      const ranking = {};
      topData?.forEach(o => {
        if (!o.client_id) return;
        ranking[o.client_id] = (ranking[o.client_id] || 0) + 1;
      });

      const sortedRanking = Object.entries(ranking)
        .map(([id, count]) => {
          const cust = custData.find(c => c.id === id);
          return {
            id,
            name: cust?.full_name || 'Desconocido',
            count,
            category: count > 4 ? 'VIP' : count >= 2 ? 'CASUAL' : 'NEW'
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setTopTen(sortedRanking);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        const { error } = await supabase
          .schema('core')
          .from('customers')
          .update(formData)
          .eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .schema('core')
          .from('customers')
          .insert([{ ...formData, account_id: profile.account_id }]);
        if (error) throw error;
      }
      setOpenModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro de eliminar este cliente?')) return;
    try {
      const { error } = await supabase
        .schema('core')
        .from('customers')
        .update({ is_deleted: true })
        .eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.doc_number?.includes(searchTerm)
  );

  const getRankColor = (rank) => {
    switch (rank) {
      case 'VIP': return 'secondary';
      case 'CASUAL': return 'primary';
      case 'NEW': return 'success';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Gestión de Clientes</Typography>

      {/* SECCIÓN RESUMEN Y RANKING */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card variant="outlined" sx={{ height: '100%', bgcolor: '#f8fafc' }}>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary">Total Clientes Activos</Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, my: 1 }}>{summary.total}</Typography>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>POR NEGOCIO:</Typography>
              {summary.byBusiness.map(b => (
                <Box key={b.name} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">{b.name}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{b.count}</Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <StarIcon color="warning" /> Ranking Top 10 del Mes
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
              {topTen.map((c, index) => (
                <Card key={c.id} sx={{ minWidth: 140, textAlign: 'center', p: 1, border: index === 0 ? '2px solid #ed6c02' : '1px solid #e2e8f0' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: '#ed6c02' }}>#{index + 1}</Typography>
                  <Avatar sx={{ mx: 'auto', my: 1, bgcolor: index === 0 ? '#ed6c02' : '#64748b' }}>{c.name[0]}</Avatar>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{c.name}</Typography>
                  <Typography variant="caption" color="textSecondary">{c.count} compras</Typography>
                  <Chip label={c.category} size="small" color={getRankColor(c.category)} sx={{ mt: 1, height: 20, fontSize: '0.65rem' }} />
                </Card>
              ))}
              {topTen.length === 0 && <Typography variant="body2" color="textSecondary" sx={{ py: 4, width: '100%', textAlign: 'center' }}>No hay actividad este mes.</Typography>}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* TABLA CRUD */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <TextField 
            size="small" 
            placeholder="Buscar por nombre, email o DNI..." 
            sx={{ width: 400 }} 
            value={searchTerm}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button 
            variant="contained" 
            startIcon={<PersonAddIcon />} 
            onClick={() => { setEditingCustomer(null); setFormData({ full_name: '', email: '', phone_number: '', doc_number: '', address: '', category: 'NEW' }); setOpenModal(true); }}
          >
            Nuevo Cliente
          </Button>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f1f5f9' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Cliente</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Contacto</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Origen</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Clasificación</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Negocio</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} sx={{ my: 2 }} /></TableCell></TableRow>
              ) : filteredCustomers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.full_name}</Typography>
                    <Typography variant="caption" color="textSecondary">{c.doc_number || 'Sin DNI'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" display="block">{c.email}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="caption">{c.phone_number}</Typography>
                      {c.phone_number && <IconButton size="small" href={`https://wa.me/${c.phone_number}`} target="_blank"><WhatsAppIcon sx={{ fontSize: 14, color: '#25D366' }} /></IconButton>}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={c.category === 'NEW_TN' || c.origin === 'TIENDANUBE' ? 'TIENDANUBE' : 'LOCAL'} 
                      size="small" 
                      variant="outlined"
                      color={c.origin === 'TIENDANUBE' ? 'info' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={c.category} size="small" color={getRankColor(c.category)} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{c.business?.name || '-'}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => { setEditingCustomer(c); setFormData(c); setOpenModal(true); }}><EditIcon sx={{ fontSize: 18 }} /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(c.id)}><DeleteIcon sx={{ fontSize: 18 }} /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* MODAL EDITAR/NUEVO */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editingCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
        <form onSubmit={handleSave}>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12}><TextField fullWidth label="Nombre Completo" value={formData.full_name} onChange={(e) => setFormData({...formData, full_name: e.target.value})} required /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="Email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="Teléfono" value={formData.phone_number} onChange={(e) => setFormData({...formData, phone_number: e.target.value})} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="DNI/CUIT" value={formData.doc_number} onChange={(e) => setFormData({...formData, doc_number: e.target.value})} /></Grid>
              <Grid item xs={12} sm={6}>
                <TextField select fullWidth label="Categoría" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>
                  <MenuItem value="VIP">VIP (Muy importante)</MenuItem>
                  <MenuItem value="CASUAL">CASUAL (Habitual)</MenuItem>
                  <MenuItem value="ONTIME">ONTIME (Puntual)</MenuItem>
                  <MenuItem value="NEW">NUEVO (Local)</MenuItem>
                  <MenuItem value="NEW _TN">TIENDANUBE (Nuevo)</MenuItem>
                  <MenuItem value="INACTIVE">INACTIVO</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12}><TextField fullWidth label="Dirección" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} /></Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenModal(false)}>Cancelar</Button>
            <Button type="submit" variant="contained">Guardar</Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
