import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Chip, IconButton, Tooltip, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import InfoIcon from '@mui/icons-material/Info';
import { supabase } from '../../services/supabaseClient';
import { useAuthStore } from '../../stores/authStore';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedData, setSelectedData] = useState(null);
  const { profile } = useAuthStore();

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('audit_log', { schema: 'logs' })
        .select('*')
        .eq('account_id', profile?.account_id)
        .order('timestamp', { ascending: false })
        .limit(500);

      if (data) setLogs(data);
      setLoading(false);
    };

    if (profile?.account_id) fetchLogs();
  }, [profile?.account_id]);

  const columns = [
    { field: 'timestamp', headerName: 'Fecha/Hora', width: 180, 
      valueFormatter: (params) => new Date(params.value).toLocaleString() },
    { field: 'table_name', headerName: 'Tabla', width: 150 },
    { field: 'action', headerName: 'Acción', width: 120, renderCell: (params) => (
      <Chip 
        label={params.value} 
        size="small" 
        color={params.value === 'INSERT' ? 'success' : params.value === 'UPDATE' ? 'info' : 'error'}
      />
    )},
    { field: 'record_id', headerName: 'ID Registro', width: 120 },
    {
      field: 'details',
      headerName: 'Detalles',
      type: 'actions',
      width: 100,
      getActions: (params) => [
        <Tooltip title="Ver JSON de cambios">
          <IconButton onClick={() => setSelectedData(params.row)}>
            <InfoIcon />
          </IconButton>
        </Tooltip>
      ],
    },
  ];

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Registro de Auditoría (Trazabilidad ISO 9000)</Typography>
      
      <Paper sx={{ height: 650, width: '100%' }}>
        <DataGrid
          rows={logs}
          columns={columns}
          loading={loading}
          slots={{ toolbar: GridToolbar }}
          disableRowSelectionOnClick
        />
      </Paper>

      <Dialog open={!!selectedData} onClose={() => setSelectedData(null)} fullWidth maxWidth="md">
        <DialogTitle>Detalle del Cambio - {selectedData?.table_name}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Datos Anteriores (JSON):</Typography>
          <Paper sx={{ p: 2, bgcolor: '#f1f5f9', overflow: 'auto', maxHeight: 200, mb: 2 }}>
            <pre style={{ margin: 0 }}>{JSON.stringify(selectedData?.old_data, null, 2)}</pre>
          </Paper>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Datos Nuevos (JSON):</Typography>
          <Paper sx={{ p: 2, bgcolor: '#f1f5f9', overflow: 'auto', maxHeight: 200 }}>
            <pre style={{ margin: 0 }}>{JSON.stringify(selectedData?.new_data, null, 2)}</pre>
          </Paper>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
