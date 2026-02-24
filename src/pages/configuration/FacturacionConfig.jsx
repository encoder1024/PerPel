import React from 'react';
import { Box, Typography } from '@mui/material';

export default function FacturacionConfig() {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Configuración de Facturación
      </Typography>
      <Typography variant="body1">
        Ajustes relacionados con la integración de facturación electrónica (ej. Alegra, AFIP).
      </Typography>
    </Box>
  );
}
