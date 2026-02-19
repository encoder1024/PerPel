import React from 'react';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StorefrontIcon from '@mui/icons-material/Storefront';
import InventoryIcon from '@mui/icons-material/Inventory';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PeopleIcon from '@mui/icons-material/People';
import BarChartIcon from '@mui/icons-material/BarChart';
import SettingsIcon from '@mui/icons-material/Settings';
import DashboardIcon from '@mui/icons-material/Dashboard';

export const navigationItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', roles: ['OWNER', 'DEVELOPER'] },
  { text: 'Ventas (POS)', icon: <ShoppingCartIcon />, path: '/ventas', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
  { text: 'E-commerce', icon: <StorefrontIcon />, path: '/ecommerce', roles: ['OWNER', 'ADMIN'] },
  { text: 'Inventario', icon: <InventoryIcon />, path: '/inventario', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
  { text: 'Facturación', icon: <ReceiptIcon />, path: '/facturacion', roles: ['OWNER', 'ADMIN'] },
  { text: 'Turnos', icon: <CalendarMonthIcon />, path: '/turnos', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
  { text: 'Clientes', icon: <PeopleIcon />, path: '/clientes', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
  { text: 'Reportes', icon: <BarChartIcon />, path: '/reportes', roles: ['OWNER', 'ADMIN', 'AUDITOR'] },
  { text: 'Configuración', icon: <SettingsIcon />, path: '/configuracion', roles: ['OWNER', 'ADMIN'] },
];
