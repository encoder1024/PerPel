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
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import StoreIcon from '@mui/icons-material/Store';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import BusinessIcon from '@mui/icons-material/Business';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PeopleIcon from '@mui/icons-material/People';
import { useBusinesses } from '../../hooks/useBusinesses';
import { useAuthStore } from '../../stores/authStore';

export default function SucursalesConfig() {
  const { profile } = useAuthStore();
  const { 
    businesses, 
    accountUsers, 
    loading, 
    error, 
    createBusiness,
    updateBusiness,
    deleteBusiness,
    updateUserProfile,
    deleteUserProfile,
    assignEmployee, 
    removeEmployee, 
    refresh 
  } = useBusinesses();

  // Estados para Negocios
  const [openBusinessDialog, setOpenBusinessDialog] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(null);
  const [businessForm, setBusinessForm] = useState({
    name: '',
    type: 'SALON',
    city: '',
    street: ''
  });

  // Estados para Staff (Asignación)
  const [openAssignUser, setOpenAssignUser] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');

  // Estados para Staff (CRUD de Usuarios)
  const [openStaffManager, setOpenStaffManager] = useState(false);
  const [openUserEditor, setOpenUserEditor] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    full_name: '',
    app_role: 'EMPLOYEE'
  });

  const [actionLoading, setActionLoading] = useState(false);

  const canManageUsers = profile?.app_role === 'OWNER' || profile?.app_role === 'ADMIN';

  // --- Handlers para Negocios ---
  const handleOpenBusinessDialog = (business = null) => {
    if (business) {
      setEditingBusiness(business);
      setBusinessForm({
        name: business.name,
        type: business.type,
        city: business.city || '',
        street: business.street || ''
      });
    } else {
      setEditingBusiness(null);
      setBusinessForm({ name: '', type: 'SALON', city: '', street: '' });
    }
    setOpenBusinessDialog(true);
  };

  const handleSaveBusiness = async () => {
    setActionLoading(true);
    let result;
    if (editingBusiness) {
      result = await updateBusiness(editingBusiness.id, businessForm);
    } else {
      result = await createBusiness(businessForm);
    }

    if (result.success) {
      setOpenBusinessDialog(false);
    } else {
      alert("Error: " + result.message);
    }
    setActionLoading(false);
  };

  const handleDeleteBusiness = async (id, name) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la sucursal "${name}"?`)) return;
    setActionLoading(true);
    const result = await deleteBusiness(id);
    if (!result.success) alert("Error: " + result.message);
    setActionLoading(false);
  };

  // --- Handlers para Staff (Asignación) ---
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

  const handleRemoveAssignment = async (userId, businessId, userName) => {
    if (!window.confirm(`¿Remover a ${userName} de esta sucursal?`)) return;
    setActionLoading(true);
    const result = await removeEmployee(userId, businessId);
    if (!result.success) alert("Error: " + result.message);
    setActionLoading(false);
  };

  // --- Handlers para Staff (CRUD Usuarios) ---
  const handleEditUser = (user) => {
    setEditingUser(user);
    setUserForm({
      full_name: user.full_name || '',
      app_role: user.app_role || 'EMPLOYEE'
    });
    setOpenUserEditor(true);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;
    setActionLoading(true);
    const result = await updateUserProfile(editingUser.id, userForm);
    if (result.success) {
      setOpenUserEditor(false);
    } else {
      alert("Error: " + result.message);
    }
    setActionLoading(false);
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el usuario "${userName}" de esta cuenta? Se removerán todas sus asignaciones.`)) return;
    setActionLoading(true);
    const result = await deleteUserProfile(userId);
    if (!result.success) alert("Error: " + result.message);
    setActionLoading(false);
  };

  if (loading && businesses.length === 0) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Configuración de Sucursales y Staff</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<PeopleIcon />}
            onClick={() => setOpenStaffManager(true)}
          >
            Gestionar Staff
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenBusinessDialog()}
          >
            Nueva Sucursal
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {businesses.map((business) => (
          <Grid item xs={12} md={6} key={business.id}>
            <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                    <StoreIcon />
                  </Avatar>
                  <Box sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="h6" component="div">
                        {business.name}
                      </Typography>
                      <Chip 
                        label={business.type} 
                        size="small" 
                        color={business.type === 'SALON' ? 'secondary' : 'primary'} 
                      />
                    </Box>
                    <Typography variant="caption" color="textSecondary" sx={{ display: 'flex', alignItems: 'center' }}>
                      <LocationOnIcon sx={{ fontSize: 14, mr: 0.5 }} />
                      {business.city ? `${business.street}, ${business.city}` : 'Dirección no definida'}
                    </Typography>
                  </Box>
                  <Box>
                    <IconButton size="small" onClick={() => handleOpenBusinessDialog(business)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeleteBusiness(business.id, business.name)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
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
                            onClick={() => handleRemoveAssignment(employee.id, business.id, employee.full_name || employee.email)}
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

      {/* Modal: Crear/Editar Sucursal */}
      <Dialog open={openBusinessDialog} onClose={() => setOpenBusinessDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editingBusiness ? 'Editar Sucursal' : 'Crear Nueva Sucursal'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Nombre del Local"
              value={businessForm.name}
              onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })}
            />
            <FormControl fullWidth>
              <InputLabel>Tipo de Negocio</InputLabel>
              <Select
                value={businessForm.type}
                label="Tipo de Negocio"
                onChange={(e) => setBusinessForm({ ...businessForm, type: e.target.value })}
              >
                <MenuItem value="SALON">Peluquería / Salón</MenuItem>
                <MenuItem value="PERFUMERY">Perfumería</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="Ciudad"
              value={businessForm.city}
              onChange={(e) => setBusinessForm({ ...businessForm, city: e.target.value })}
            />
            <TextField
              fullWidth
              label="Dirección"
              value={businessForm.street}
              onChange={(e) => setBusinessForm({ ...businessForm, street: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenBusinessDialog(false)}>Cancelar</Button>
          <Button 
            variant="contained" 
            onClick={handleSaveBusiness} 
            disabled={!businessForm.name || actionLoading}
          >
            {editingBusiness ? 'Guardar Cambios' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Asignar Usuario a Sucursal */}
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

      {/* Modal: Gestionar Staff de la Cuenta (Full CRUD) */}
      <Dialog open={openStaffManager} onClose={() => setOpenStaffManager(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Personal de la Cuenta
          <Typography variant="caption" color="textSecondary">
            Total Usuarios: {accountUsers.length}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Aquí puedes editar los roles y perfiles de todos los usuarios vinculados a tu cuenta.
            Para añadir nuevos usuarios, pídeles que se registren usando el código de tu cuenta.
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nombre / Email</TableCell>
                  <TableCell>Rol</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accountUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{user.full_name || 'Sin nombre'}</Typography>
                      <Typography variant="caption" color="textSecondary">{user.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={user.app_role} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      {canManageUsers && user.id !== profile.id && (
                        <>
                          <IconButton size="small" color="primary" onClick={() => handleEditUser(user)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDeleteUser(user.id, user.full_name || user.email)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </>
                      )}
                      {user.id === profile.id && <Typography variant="caption" color="textSecondary">Tú (Owner)</Typography>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenStaffManager(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal: Editor de Usuario */}
      <Dialog open={openUserEditor} onClose={() => setOpenUserEditor(false)} fullWidth maxWidth="xs">
        <DialogTitle>Editar Usuario</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Nombre Completo"
              value={userForm.full_name}
              onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
            />
            <FormControl fullWidth>
              <InputLabel>Rol</InputLabel>
              <Select
                value={userForm.app_role}
                label="Rol"
                onChange={(e) => setUserForm({ ...userForm, app_role: e.target.value })}
              >
                <MenuItem value="OWNER">Owner (Dueño)</MenuItem>
                <MenuItem value="ADMIN">Admin</MenuItem>
                <MenuItem value="EMPLOYEE">Empleado</MenuItem>
                <MenuItem value="AUDITOR">Auditor</MenuItem>
                <MenuItem value="DEVELOPER">Developer</MenuItem>
                <MenuItem value="CLIENT">Cliente</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenUserEditor(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveUser} disabled={actionLoading}>
            Guardar Cambios
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
