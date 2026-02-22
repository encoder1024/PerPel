import React from 'react';
import { Box, Typography } from '@mui/material';

export default function VentasConfig() {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Configuración de Ventas y Dispositivos
      </Typography>
      <Typography variant="body1">
        Aquí podrás gestionar los dispositivos de MercadoPago Point y otras configuraciones relacionadas con el POS.
      </Typography>
      {/* El gestor de dispositivos se implementará aquí */}
    </Box>
  );
}
