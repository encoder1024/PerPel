import React from 'react';
import { Box, Typography } from '@mui/material';

export default function TurnosConfig() {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Configuración de Turnos
      </Typography>
      <Typography variant="body1">
        Ajustes relacionados con la integración de agendamiento (ej. Cal.com).
      </Typography>
    </Box>
  );
}
