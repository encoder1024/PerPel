import React from 'react';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StorefrontIcon from '@mui/icons-material/Storefront';
import InventoryIcon from '@mui/icons-material/Inventory';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import PeopleIcon from '@mui/icons-material/People';
import BarChartIcon from '@mui/icons-material/BarChart';
import SettingsIcon from '@mui/icons-material/Settings';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import PaymentsIcon from '@mui/icons-material/Payments';
import AssessmentIcon from '@mui/icons-material/Assessment';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

export const navigationGroups = [
  {
    title: 'Salón',
    icon: <FaceRetouchingNaturalIcon />,
    items: [
      { text: 'Turnos', icon: <CalendarMonthIcon />, path: '/turnos', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
      { text: 'Monitoreo', icon: <MonitorHeartIcon />, path: '/monitoreo', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
      { text: 'Clientes', icon: <PeopleIcon />, path: '/clientes', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
    ]
  },
  {
    title: 'Finanzas',
    icon: <PaymentsIcon />,
    items: [
      { text: 'Ventas (POS)', icon: <ShoppingCartIcon />, path: '/ventas', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
      { text: 'Caja', icon: <AccountBalanceWalletIcon />, path: '/caja', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
      { text: 'Facturación', icon: <ReceiptIcon />, path: '/facturacion', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
    ]
  },
  {
    title: 'Logística',
    icon: <LocalShippingIcon />,
    items: [
      { text: 'Inventario', icon: <InventoryIcon />, path: '/inventario', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
      { text: 'Gestión de Stock', icon: <InventoryIcon />, path: '/stock', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
      { text: 'E-commerce', icon: <StorefrontIcon />, path: '/ecommerce', roles: ['OWNER', 'ADMIN'] },
    ]
  },
  {
    title: 'Análisis',
    icon: <AssessmentIcon />,
    items: [
      { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard', roles: ['OWNER', 'DEVELOPER'] },
      { text: 'Reportes', icon: <BarChartIcon />, path: '/reportes', roles: ['OWNER', 'AUDITOR', 'ADMIN'] },
    ]
  },
  {
    title: 'Sistema',
    icon: <AdminPanelSettingsIcon />,
    items: [
      { text: 'Configuración', icon: <SettingsIcon />, path: '/configuracion', roles: ['OWNER', 'ADMIN'] },
      { text: 'Roles', icon: <SettingsIcon />, path: '/rolerequest', roles: ['OWNER', 'ADMIN'] },
    ]
  }
];
