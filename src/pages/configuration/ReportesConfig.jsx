import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

export default function ReportesConfig() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        Configuración de Reportes
      </Typography>
      
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc' }}>
        <Typography variant="body1" color="textSecondary">
          En esta sección se dispondrán las configuraciones especiales para los reportes más adelante.
        </Typography>
      </Paper>
    </Box>
  );
}
