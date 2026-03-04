import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Chip, 
  IconButton, 
  Tooltip, 
  Dialog, 
  DialogTitle, 
  DialogContent,
  CircularProgress,
  Alert,
  Grid,
  Button
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import InfoIcon from '@mui/icons-material/Info';
import RefreshIcon from '@mui/icons-material/Refresh';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedData, setSelectedData] = useState(null);
  const [error, setError] = useState(null);
  const { profile } = useAuthStore();

  const isAuthorized = profile?.app_role === 'OWNER' || profile?.app_role === 'AUDITOR';

  const fetchLogsAndUsers = useCallback(async () => {
    if (!isAuthorized || !profile?.account_id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // PASO 1: Obtener logs de auditoría (sin join)
      const { data: auditData, error: auditError } = await supabase
        .schema('logs')
        .from('audit_log')
        .select('*')
        .eq('account_id', profile?.account_id)
        .order('timestamp', { ascending: false })
        .limit(1000);

      if (auditError) throw auditError;

      if (auditData && auditData.length > 0) {
        // PASO 2: Obtener IDs de usuario únicos
        const userIds = [...new Set(auditData.map(log => log.user_id).filter(id => !!id))];
        
        let userMap = {};
        if (userIds.length > 0) {
          // PASO 3: Consultar perfiles de esos usuarios
          const { data: userData, error: userError } = await supabase
            .schema('core')
            .from('user_profiles')
            .select('id, email, full_name')
            .in('id', userIds);

          if (!userError && userData) {
            // Crear mapa para búsqueda rápida: { userId: { email, full_name } }
            userData.forEach(u => {
              userMap[u.id] = u;
            });
          }
        }

        // PASO 4: Combinar datos en el frontend
        const combinedData = auditData.map(log => ({
          ...log,
          user_info: userMap[log.user_id] || null
        }));

        setLogs(combinedData);
      } else {
        setLogs([]);
      }
    } catch (err) {
      console.error('Error fetching audit data:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id, isAuthorized]);

  useEffect(() => {
    fetchLogsAndUsers();
  }, [fetchLogsAndUsers]);

  if (!isAuthorized) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          No tienes permisos para acceder a este reporte. Esta sección está reservada para Propietarios y Auditores.
        </Alert>
      </Box>
    );
  }

  const columns = [
    { 
      field: 'timestamp', 
      headerName: 'Fecha/Hora', 
      width: 180, 
      valueGetter: (value, row) => value || row.created_at,
      valueFormatter: (value) => {
        if (!value) return 'N/A';
        const date = new Date(value);
        return isNaN(date.getTime()) ? 'Fecha Inválida' : date.toLocaleString();
      }
    },
    { 
      field: 'user', 
      headerName: 'Usuario', 
      width: 220,
      valueGetter: (value, row) => row.user_info?.email || row.user_info?.full_name || 'Sistema/Auto'
    },
    { field: 'table_name', headerName: 'Tabla', width: 150 },
    { 
      field: 'action', 
      headerName: 'Acción', 
      width: 130, 
      renderCell: (params) => {
        let color = 'default';
        const val = params.value;
        if (val === 'INSERT') color = 'success';
        if (val === 'UPDATE') color = 'info';
        if (val === 'DELETE') color = 'error';
        if (val === 'SOFT_DELETE') color = 'warning';
        
        return (
          <Chip 
            label={val} 
            size="small" 
            color={color}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        );
      }
    },
    { field: 'record_id', headerName: 'ID Registro', width: 300 },
    {
      field: 'details',
      headerName: 'Ver',
      type: 'actions',
      width: 80,
      getActions: (params) => [
        <Tooltip title="Ver detalle de cambios">
          <IconButton onClick={() => setSelectedData(params.row)}>
            <InfoIcon color="primary" />
          </IconButton>
        </Tooltip>
      ],
    },
  ];

  return (
    <Box sx={{ flexGrow: 1, p: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Registro de Auditoría
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Trazabilidad ISO 9000 - Registro histórico de cambios en la base de datos
          </Typography>
        </Box>
        <Button 
          variant="outlined" 
          startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />} 
          onClick={fetchLogsAndUsers}
          disabled={loading}
        >
          Refrescar
        </Button>
      </Box>
      
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ height: 700, width: '100%', borderRadius: 2, overflow: 'hidden' }}>
        <DataGrid
          rows={logs}
          columns={columns}
          loading={loading}
          slots={{ toolbar: GridToolbar }}
          disableRowSelectionOnClick
          density="compact"
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          pageSizeOptions={[25, 50, 100]}
        />
      </Paper>

      <Dialog open={!!selectedData} onClose={() => setSelectedData(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700 }}>
          Detalle del Cambio - {selectedData?.table_name} ({selectedData?.action})
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="primary">Registro ID:</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{selectedData?.record_id}</Typography>
          </Box>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Datos Anteriores:</Typography>
              <Paper sx={{ p: 2, bgcolor: '#f8fafc', overflow: 'auto', maxHeight: 400, border: '1px solid #e2e8f0' }}>
                <pre style={{ margin: 0, fontSize: '0.75rem' }}>{JSON.stringify(selectedData?.old_data, null, 2)}</pre>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Datos Nuevos:</Typography>
              <Paper sx={{ p: 2, bgcolor: '#f0fdf4', overflow: 'auto', maxHeight: 400, border: '1px solid #dcfce7' }}>
                <pre style={{ margin: 0, fontSize: '0.75rem' }}>{JSON.stringify(selectedData?.new_data, null, 2)}</pre>
              </Paper>
            </Grid>
          </Grid>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
