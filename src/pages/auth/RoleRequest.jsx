import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Snackbar,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Divider
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EditIcon from '@mui/icons-material/Edit';
import { useRoleRequest } from '../../hooks/useRoleRequest';
import { useAuthStore } from '../../stores/authStore';

export const RoleRequest = () => {
  const { profile } = useAuthStore();
  const {
    roleRequests,
    businesses,
    registrationCode,
    loading,
    error,
    approveRequest,
    rejectRequest,
    updateRegistrationCode,
    isOwner,
    isAdmin,
  } = useRoleRequest();

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');

  const [openApproveModal, setOpenApproveModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [selectedRoleForApproval, setSelectedRoleForApproval] = useState('');
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [approving, setApproving] = useState(false); // Estado para el proceso de aprobación

  const [newRegistrationCode, setNewRegistrationCode] = useState('');
  const [editingRegistrationCode, setEditingRegistrationCode] = useState(false);

  // Manejadores de Snackbar
  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  // Manejadores de Aprobación/Rechazo
  const handleApproveClick = (requestId, requestedRole) => {
    setSelectedRequestId(requestId);
    setSelectedRoleForApproval(requestedRole);
    // Ahora ADMIN, EMPLOYEE y CLIENT requieren asignación a negocio
    if (['ADMIN', 'EMPLOYEE', 'CLIENT'].includes(requestedRole)) {
      setOpenApproveModal(true);
    } else {
      handleApproveConfirm(requestId, null);
    }
  };

  const handleApproveConfirm = async (requestId, businessId) => {
    setApproving(true);
    const result = await approveRequest(requestId, businessId);
    if (result.success) {
      setSnackbarMessage(result.message);
      setSnackbarSeverity('success');
      setOpenApproveModal(false);
      setSelectedBusinessId(''); // Resetear después de usar
    } else {
      setSnackbarMessage(result.message || 'Error al aprobar solicitud.');
      setSnackbarSeverity('error');
    }
    setSnackbarOpen(true);
    setApproving(false);
  };

  const handleRejectClick = async (requestId) => {
    if (!window.confirm('¿Estás seguro de rechazar esta solicitud de rol?')) return;
    setApproving(true); // Usamos el mismo estado de loading para ambas acciones
    const result = await rejectRequest(requestId);
    if (result.success) {
      setSnackbarMessage(result.message);
      setSnackbarSeverity('success');
    } else {
      setSnackbarMessage(result.message || 'Error al rechazar solicitud.');
      setSnackbarSeverity('error');
    }
    setSnackbarOpen(true);
    setApproving(false);
  };

  // Manejadores del Código de Registro
  const handleUpdateCodeClick = async () => {
    if (!newRegistrationCode) {
      setSnackbarMessage('El código no puede estar vacío.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }
    setApproving(true); // Usamos el mismo estado de loading
    const result = await updateRegistrationCode(newRegistrationCode);
    if (result.success) {
      setSnackbarMessage(result.message);
      setSnackbarSeverity('success');
      setEditingRegistrationCode(false); // Salir del modo edición
    } else {
      setSnackbarMessage(result.message || 'Error al actualizar código.');
      setSnackbarSeverity('error');
    }
    setSnackbarOpen(true);
    setApproving(false);
  };


  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Gestión de Solicitudes de Rol
      </Typography>
      <Typography variant="body1" paragraph>
        Aquí puedes aprobar o rechazar las solicitudes de roles de usuarios que desean unirse a tu cuenta.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Sección de Código de Registro */}
      {isOwner && (
        <Paper elevation={1} sx={{ p: 3, mb: 4 }}>
          <Typography variant="h6" gutterBottom>Código de Registro de Cuenta</Typography>
          <Typography variant="body2" color="textSecondary" paragraph>
            Este código permite a nuevos usuarios solicitar unirse a tu cuenta.
          </Typography>
          {!editingRegistrationCode ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Chip label={registrationCode || 'No definido'} color="info" variant="outlined" sx={{ fontSize: '1rem', p: 1 }} />
              <Button size="small" startIcon={<EditIcon />} onClick={() => { setEditingRegistrationCode(true); setNewRegistrationCode(registrationCode); }}>
                Editar Código
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <TextField
                label="Nuevo Código"
                value={newRegistrationCode}
                onChange={(e) => setNewRegistrationCode(e.target.value)}
                size="small"
                variant="outlined"
              />
              <Button variant="contained" size="small" onClick={handleUpdateCodeClick} disabled={approving}>
                Guardar
              </Button>
              <Button variant="outlined" size="small" onClick={() => setEditingRegistrationCode(false)} disabled={approving}>
                Cancelar
              </Button>
            </Box>
          )}
        </Paper>
      )}

      <Divider sx={{ my: 4 }} />

      {/* Solicitudes de Rol Pendientes */}
      <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>
        Solicitudes Pendientes ({roleRequests.length})
      </Typography>

      {loading && !approving ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
      ) : roleRequests.length === 0 ? (
        <Alert severity="info">No hay solicitudes de rol pendientes para tu cuenta.</Alert>
      ) : (
        <TableContainer component={Paper} elevation={1}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 700 }}>Usuario</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Rol Solicitado</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Fecha Solicitud</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roleRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Typography variant="body1">{request.user?.full_name || request.user?.email || 'N/A'}</Typography>
                    <Typography variant="caption" color="textSecondary">{request.user?.email || 'ID: ' + request.user?.id}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={request.requested_role}
                      color={request.requested_role === 'OWNER' ? 'error' : request.requested_role === 'ADMIN' ? 'warning' : 'primary'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(request.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      startIcon={<CheckCircleIcon />}
                      sx={{ mr: 1 }}
                      onClick={() => handleApproveClick(request.id, request.requested_role)}
                      disabled={approving || (request.requested_role === 'ADMIN' && !isOwner)} // Solo OWNER puede aprobar ADMIN
                    >
                      Aprobar
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<CancelIcon />}
                      onClick={() => handleRejectClick(request.id)}
                      disabled={approving}
                    >
                      Rechazar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Modal para Aprobar Empleado */}
      <Dialog open={openApproveModal} onClose={() => setOpenApproveModal(false)}>
        <DialogTitle>Aprobar Solicitud de {selectedRoleForApproval}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Selecciona el negocio al que se asignará este nuevo {selectedRoleForApproval.toLowerCase()}.
          </Typography>
          <FormControl fullWidth>
            <InputLabel>Negocio</InputLabel>
            <Select
              value={selectedBusinessId}
              label="Negocio"
              onChange={(e) => setSelectedBusinessId(e.target.value)}
            >
              <MenuItem value=""><em>Ninguno</em></MenuItem>
              {businesses.map((business) => (
                <MenuItem key={business.id} value={business.id}>
                  {business.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenApproveModal(false)} disabled={approving}>Cancelar</Button>
          <Button
            onClick={() => handleApproveConfirm(selectedRequestId, selectedBusinessId)}
            variant="contained"
            disabled={approving || !selectedBusinessId}
          >
            {approving ? <CircularProgress size={24} color="inherit" /> : 'Confirmar Aprobación'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default RoleRequest;
