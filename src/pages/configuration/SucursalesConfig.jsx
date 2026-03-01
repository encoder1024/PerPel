import React, { useState } from 'react';
import {
  Box,
  Typography,
  Grid,
  Paper,
  Card,
  CardContent,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  Alert,
  CircularProgress,
  Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import StoreIcon from '@mui/icons-material/Store';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import BusinessIcon from '@mui/icons-material/Business';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { useBusinesses } from '../../hooks/useBusinesses';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

export default function SucursalesConfig() {
  const { profile } = useAuthStore();
  const { businesses, accountUsers, loading, error, assignEmployee, removeEmployee, refresh } = useBusinesses();

  const [openAddBusiness, setOpenAddBusiness] = useState(false);
  const [openAssignUser, setOpenAssignUser] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Form para nuevo negocio
  const [newBusiness, setNewBusiness] = useState({
    name: '',
    type: 'SALON',
    city: '',
    street: ''
  });

  const handleAddBusiness = async () => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .schema('core')
        .from('businesses')
        .insert({
          ...newBusiness,
          account_id: profile.account_id
        });
      if (error) throw error;
      setOpenAddBusiness(false);
      setNewBusiness({ name: '', type: 'SALON', city: '', street: '' });
      refresh();
    } catch (err) {
      alert("Error al crear sucursal: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignSubmit = async () => {
    if (!selectedUserId || !selectedBusiness) return;
    setActionLoading(true);
    const result = await assignEmployee(selectedUserId, selectedBusiness.id);
    if (result.success) {
      setOpenAssignUser(false);
      setSelectedUserId('');
    } else {
      alert("Error: " + result.message);
    }
    setActionLoading(false);
  };

  const handleRemoveClick = async (userId, businessId, userName) => {
    if (!window.confirm(`¿Remover a ${userName} de esta sucursal?`)) return;
    setActionLoading(true);
    const result = await removeEmployee(userId, businessId);
    if (!result.success) {
      alert("Error: " + result.message);
    }
    setActionLoading(false);
  };

  if (loading && businesses.length === 0) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Gestión de Sucursales y Staff</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenAddBusiness(true)}
        >
          Nueva Sucursal
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {businesses.map((business) => (
          <Grid item xs={12} md={6} key={business.id}>
            <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                    <StoreIcon />
                  </Avatar>
                  <Box>
                    <Typography variant="h6" component="div">
                      {business.name}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" sx={{ display: 'flex', alignItems: 'center' }}>
                      <LocationOnIcon sx={{ fontSize: 14, mr: 0.5 }} />
                      {business.city ? `${business.street}, ${business.city}` : 'Dirección no definida'}
                    </Typography>
                  </Box>
                  <Chip 
                    label={business.type} 
                    size="small" 
                    sx={{ ml: 'auto' }} 
                    color={business.type === 'SALON' ? 'secondary' : 'primary'} 
                  />
                </Box>

                <Divider sx={{ my: 1.5 }} />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Personal Asignado ({business.staff?.length || 0})
                  </Typography>
                  <Tooltip title="Asignar personal">
                    <IconButton 
                      size="small" 
                      color="primary" 
                      onClick={() => {
                        setSelectedBusiness(business);
                        setOpenAssignUser(true);
                      }}
                    >
                      <PersonAddIcon />
                    </IconButton>
                  </Tooltip>
                </Box>

                <List dense>
                  {business.staff?.length === 0 ? (
                    <Typography variant="body2" color="textDisabled" sx={{ fontStyle: 'italic', py: 1 }}>
                      No hay personal asignado a esta sucursal.
                    </Typography>
                  ) : (
                    business.staff.map((employee) => (
                      <ListItem key={employee.id} sx={{ px: 0 }}>
                        <ListItemAvatar>
                          <Avatar sx={{ width: 32, height: 32, fontSize: '0.8rem' }}>
                            {employee.full_name?.charAt(0) || employee.email?.charAt(0)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText 
                          primary={employee.full_name || employee.email}
                          secondary={employee.app_role}
                          primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        />
                        <ListItemSecondaryAction>
                          <IconButton 
                            edge="end" 
                            size="small" 
                            color="error"
                            onClick={() => handleRemoveClick(employee.id, business.id, employee.full_name || employee.email)}
                            disabled={actionLoading}
                          >
                            <DeleteIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Modal: Agregar Sucursal */}
      <Dialog open={openAddBusiness} onClose={() => setOpenAddBusiness(false)} fullWidth maxWidth="xs">
        <DialogTitle>Crear Nueva Sucursal</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Nombre del Local"
              value={newBusiness.name}
              onChange={(e) => setNewBusiness({ ...newBusiness, name: e.target.value })}
            />
            <FormControl fullWidth>
              <InputLabel>Tipo de Negocio</InputLabel>
              <Select
                value={newBusiness.type}
                label="Tipo de Negocio"
                onChange={(e) => setNewBusiness({ ...newBusiness, type: e.target.value })}
              >
                <MenuItem value="SALON">Peluquería / Salón</MenuItem>
                <MenuItem value="PERFUMERY">Perfumería</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="Ciudad"
              value={newBusiness.city}
              onChange={(e) => setNewBusiness({ ...newBusiness, city: e.target.value })}
            />
            <TextField
              fullWidth
              label="Dirección"
              value={newBusiness.street}
              onChange={(e) => setNewBusiness({ ...newBusiness, street: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddBusiness(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleAddBusiness} 
            disabled={!newBusiness.name || actionLoading}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Asignar Usuario */}
      <Dialog open={openAssignUser} onClose={() => setOpenAssignUser(false)} fullWidth maxWidth="xs">
        <DialogTitle>Asignar Staff a {selectedBusiness?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Typography variant="body2" sx={{ mb: 2 }} color="textSecondary">
              Selecciona un usuario de tu cuenta para asignarlo a esta sucursal.
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Usuario</InputLabel>
              <Select
                value={selectedUserId}
                label="Usuario"
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                {accountUsers
                  .filter(user => !selectedBusiness?.staff.find(s => s.id === user.id))
                  .map((user) => (
                    <MenuItem key={user.id} value={user.id}>
                      {user.full_name || user.email} ({user.app_role})
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAssignUser(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleAssignSubmit} 
            disabled={!selectedUserId || actionLoading}
          >
            Asignar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
