import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Box, Grid, Paper, List, ListItemButton, ListItemIcon, ListItemText, Typography, Divider } from '@mui/material';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import StorefrontIcon from '@mui/icons-material/Storefront';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import BarChartIcon from '@mui/icons-material/BarChart';
import InventoryIcon from '@mui/icons-material/Inventory';
import SettingsIcon from '@mui/icons-material/Settings';
import KeyIcon from '@mui/icons-material/Key';

const configSections = [
  { text: 'Ventas y Dispositivos', icon: <PointOfSaleIcon />, path: '/configuracion/ventas' },
  { text: 'Credenciales API', icon: <KeyIcon />, path: '/configuracion/credenciales' },
  { text: 'Stock', icon: <InventoryIcon />, path: '/configuracion/stock' },
  { text: 'Facturación', icon: <ReceiptIcon />, path: '/configuracion/facturacion' },
  { text: 'Turnos', icon: <CalendarMonthIcon />, path: '/configuracion/turnos' },
  { text: 'Reportes', icon: <BarChartIcon />, path: '/configuracion/reportes' },
  { text: 'E-commerce', icon: <StorefrontIcon />, path: '/configuracion/ecommerce' },
];

export default function ConfigurationLayout() {
  const location = useLocation();

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>
        <SettingsIcon sx={{ mr: 1, verticalAlign: 'middle' }}/>
        Configuración General
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 1 }}>
            <List component="nav">
              {configSections.map((section) => (
                <ListItemButton
                  key={section.text}
                  component={NavLink}
                  to={section.path}
                  sx={{
                    '&.active': {
                      backgroundColor: 'primary.main',
                      color: 'primary.contrastText',
                      '& .MuiListItemIcon-root': {
                        color: 'primary.contrastText',
                      },
                    },
                  }}
                >
                  <ListItemIcon>{section.icon}</ListItemIcon>
                  <ListItemText primary={section.text} />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </Grid>
        <Grid item xs={12} md={9}>
          <Paper sx={{ p: 3, minHeight: '60vh' }}>
            <Outlet /> 
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
