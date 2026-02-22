import React from 'react';
import { Box, Typography } from '@mui/material';

export default function StockConfig() {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Configuración de Stock
      </Typography>
      <Typography variant="body1">
        Ajustes relacionados con la gestión de inventario y niveles de stock.
      </Typography>
    </Box>
  );
}
