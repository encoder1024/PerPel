import React from 'react';
import {
  Box,
  Grid,
  Typography,
  Paper,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import { useDashboard } from '../../hooks/useDashboard';
import { useAuthStore } from '../../stores/authStore';

const KPICard = ({ title, value, icon, color, subtitle }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Avatar sx={{ bgcolor: `${color}.light`, color: `${color}.main`, mr: 2 }}>
          {icon}
        </Avatar>
        <Typography variant="subtitle2" color="textSecondary" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
      </Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="textSecondary">
        {subtitle}
      </Typography>
    </CardContent>
  </Card>
);

// Simple Avatar replacement if MUI Avatar is not imported
const Avatar = ({ sx, children, color }) => (
  <Box sx={{ 
    width: 40, height: 40, borderRadius: '50%', 
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    ...sx 
  }}>
    {children}
  </Box>
);

export default function Dashboard() {
  const { profile } = useAuthStore();
  const { snapshot, salesHistory, loading, error, refresh } = useDashboard();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Error cargando el Dashboard: {error}</Alert>;
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Dashboard Principal
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Hola, {profile?.full_name}. Estos son los KPIs de tu cuenta.
          </Typography>
        </Box>
        <IconButton onClick={refresh}><RefreshIcon /></IconButton>
      </Box>

      {/* Fila de KPIs */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title="Ingresos Totales"
            value={`$ ${snapshot?.total_revenue?.toLocaleString() || '0'}`}
            icon={<TrendingUpIcon />}
            color="success"
            subtitle="Ingresos acumulados históricos"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title="Órdenes Totales"
            value={snapshot?.total_orders || '0'}
            icon={<ShoppingBagIcon />}
            color="primary"
            subtitle="Ventas procesadas exitosas"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title="Clientes Activos"
            value={snapshot?.total_active_customers || '0'}
            icon={<PeopleAltIcon />}
            color="secondary"
            subtitle="Clientes con al menos una compra"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title="Turnos Completados"
            value={snapshot?.total_completed_appointments || '0'}
            icon={<AssignmentTurnedInIcon />}
            color="warning"
            subtitle="Servicios prestados con éxito"
          />
        </Grid>
      </Grid>

      {/* Gráficos */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Tendencia de Ventas (30 días)</Typography>
            <ResponsiveContainer width="100%" height="80%">
              <AreaChart data={salesHistory}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e293b" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#1e293b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="report_date" 
                  tickFormatter={(str) => new Date(str).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <ChartTooltip />
                <Area 
                  type="monotone" 
                  dataKey="total_sales" 
                  stroke="#1e293b" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorSales)" 
                  name="Ventas ($)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: 400, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Distribución de Negocios</Typography>
            <Box sx={{ flexGrow: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesHistory.slice(-5)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="business_name" hide />
                  <YAxis />
                  <ChartTooltip />
                  <Bar dataKey="order_count" fill="#475569" name="Órdenes" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
            <Typography variant="caption" color="textSecondary" sx={{ mt: 2, textAlign: 'center' }}>
              Relación de órdenes por punto de venta activo.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
