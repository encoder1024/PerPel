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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Collapse,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
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
  LineChart,
  Line,
} from 'recharts';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import { useDashboard } from '../../hooks/useDashboard';
import { useAuthStore } from '../../stores/authStore';

const KPICard = ({ title, value, icon, color, subtitle, onClick }) => (
  <Card 
    variant="outlined" 
    sx={{ 
      height: '100%', 
      cursor: onClick ? 'pointer' : 'default',
      transition: '0.3s',
      '&:hover': onClick ? { boxShadow: 4, transform: 'translateY(-4px)', borderColor: 'primary.main' } : {} 
    }}
    onClick={onClick}
  >
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Box sx={{ 
          width: 40, height: 40, borderRadius: '50%', 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: `${color}.light`, color: `${color}.main`, mr: 2 
        }}>
          {icon}
        </Box>
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

const Row = ({ row, type }) => {
  const [open, setOpen] = React.useState(false);

  return (
    <React.Fragment>
      <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          {type === 'daily' && (
            <IconButton
              aria-label="expand row"
              size="small"
              onClick={() => setOpen(!open)}
            >
              {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
          )}
        </TableCell>
        <TableCell component="th" scope="row">
          {type === 'daily' 
            ? new Date(row.date).toLocaleDateString('es-AR', { dateStyle: 'long' })
            : row.name}
        </TableCell>
        <TableCell align="right">$ {row.value.toLocaleString()}</TableCell>
      </TableRow>
      {type === 'daily' && (
        <TableRow>
          <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
            <Collapse in={open} timeout="auto" unmountOnExit>
              <Box sx={{ margin: 1 }}>
                <Typography variant="subtitle2" gutterBottom component="div" sx={{ fontWeight: 600 }}>
                  Desglose por Negocio / Tiendanube
                </Typography>
                <Table size="small" aria-label="purchases">
                  <TableBody>
                    {row.breakdown.map((item) => (
                      <TableRow key={item.name}>
                        <TableCell component="th" scope="row">
                          {item.name}
                        </TableCell>
                        <TableCell align="right">$ {item.value.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
};

export default function Dashboard() {
  const { profile } = useAuthStore();
  const { 
    snapshot, 
    salesHistory, 
    businessDistribution, 
    totalRevenue30Days, 
    revenueDetails, 
    allOrdersDetails,
    loading, 
    error, 
    refresh 
  } = useDashboard();

  const [revenueModalOpen, setRevenueModalOpen] = React.useState(false);
  const [ordersModalOpen, setOrdersModalOpen] = React.useState(false);
  const [tabValue, setTabValue] = React.useState(0);

  // Paleta de colores consistente
  const colorMap = {
    'Aroma de mujer': '#2196f3', // Azul solicitado
    'Alexis Estilista': '#1e293b', // Dark slate
    'Tiendanube': '#d97706', // Amber/Orange
    'Desconocido': '#94a3b8',
    'Local Desconocido': '#94a3b8'
  };

  const statusColors = {
    'PAID': '#4caf50',
    'PENDING': '#ff9800',
    'CANCELLED': '#f44336',
    'ERROR': '#d32f2f',
    'ABANDONED': '#9e9e9e'
  };

  // Lógica de procesamiento para el modal de Ingresos
  const processedRevenue = React.useMemo(() => {
    if (!revenueDetails?.length) return { weekly: [], daily: [], hourly: [], byBusiness: [], businessNames: [] };

    const weekly = {};
    const dailyMap = {};
    const hourly = {};
    const byBusiness = {};
    const bizNamesSet = new Set();

    revenueDetails.forEach(order => {
      const date = new Date(order.created_at);
      const amount = Number(order.total_amount);
      const isTiendanube = order.origin === 'TIENDANUBE';
      const bizName = isTiendanube ? 'Tiendanube' : (order.businesses?.name || 'Local Desconocido');
      
      bizNamesSet.add(bizName);

      byBusiness[bizName] = (byBusiness[bizName] || 0) + amount;

      const dayKey = date.toISOString().split('T')[0];
      if (!dailyMap[dayKey]) {
        dailyMap[dayKey] = { date: dayKey, total: 0, breakdown: {} };
      }
      dailyMap[dayKey].total += amount;
      dailyMap[dayKey].breakdown[bizName] = (dailyMap[dayKey].breakdown[bizName] || 0) + amount;

      // Por Semana
      const d = new Date(date);
      const day = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - day + 1);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const tempDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = tempDate.getUTCDay() || 7;
      tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);

      const rangeLabel = `${monday.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} al ${sunday.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`;
      const weekKey = `Semana ${weekNo} (${rangeLabel})`;
      weekly[weekKey] = (weekly[weekKey] || 0) + amount;

      const hourKey = `${date.getHours().toString().padStart(2, '0')}:00 HS`;
      hourly[hourKey] = (hourly[hourKey] || 0) + amount;
    });

    const dailyArray = Object.entries(dailyMap).map(([key, data]) => {
      const item = { date: key, value: data.total };
      Object.entries(data.breakdown).forEach(([name, val]) => {
        item[name] = val;
      });
      item.breakdown = Object.entries(data.breakdown).map(([name, value]) => ({ name, value }));
      return item;
    }).sort((a, b) => a.date.localeCompare(b.date));

    return {
      byBusiness: Object.entries(byBusiness).map(([name, value]) => ({ name, value })),
      weekly: Object.entries(weekly).map(([name, value]) => ({ name, value })),
      daily: dailyArray,
      hourly: Object.entries(hourly).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name)),
      businessNames: Array.from(bizNamesSet)
    };
  }, [revenueDetails]);

  // Lógica de procesamiento para el modal de Órdenes (5 semanas)
  const processedOrders = React.useMemo(() => {
    if (!allOrdersDetails?.length) return [];

    const weeksMap = {};

    allOrdersDetails.forEach(order => {
      const date = new Date(order.created_at);
      const status = order.status || 'PENDING';

      // Identificar semana
      const d = new Date(date);
      const day = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - day + 1);
      
      const tempDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = tempDate.getUTCDay() || 7;
      tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
      
      const weekKey = `Sem. ${weekNo}`;
      
      if (!weeksMap[weekKey]) {
        weeksMap[weekKey] = { 
          name: weekKey, 
          monday: monday.getTime(),
          PAID: 0, PENDING: 0, CANCELLED: 0, ERROR: 0, ABANDONED: 0 
        };
      }
      weeksMap[weekKey][status] = (weeksMap[weekKey][status] || 0) + 1;
    });

    // Ordenar por fecha y tomar las últimas 5
    return Object.values(weeksMap)
      .sort((a, b) => a.monday - b.monday)
      .slice(-5);
  }, [allOrdersDetails]);

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
            title="Ingresos (30 días)"
            value={`$ ${totalRevenue30Days?.toLocaleString() || '0'}`}
            icon={<TrendingUpIcon />}
            color="success"
            subtitle="Clic para ver desgloses"
            onClick={() => setRevenueModalOpen(true)}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KPICard
            title="Órdenes Totales"
            value={snapshot?.total_orders || '0'}
            icon={<ShoppingBagIcon />}
            color="primary"
            subtitle="Clic para ver estados por semana"
            onClick={() => setOrdersModalOpen(true)}
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

      {/* Gráficos Principales */}
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
                <BarChart data={businessDistribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <ChartTooltip />
                  <Legend />
                  <Bar dataKey="order_count" name="Órdenes" radius={[4, 4, 0, 0]}>
                    {businessDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={colorMap[entry.name] || (index % 2 === 0 ? '#1e293b' : '#475569')} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
            <Typography variant="caption" color="textSecondary" sx={{ mt: 2, textAlign: 'center' }}>
              Relación de órdenes por punto de venta (30 días).
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Modal de Detalles de Ingresos */}
      <Dialog 
        open={revenueModalOpen} 
        onClose={() => setRevenueModalOpen(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'primary.main', color: 'white', py: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Detalle de Ingresos (Últimos 30 días)</Typography>
          <IconButton onClick={() => setRevenueModalOpen(false)} size="small" sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1 }}>
            <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} aria-label="desglose de ingresos">
              <Tab label="Negocio" />
              <Tab label="Semana" />
              <Tab label="Día" />
              <Tab label="Hora" />
            </Tabs>
          </Box>
          <Box sx={{ p: 3 }}>
            {tabValue === 3 && (
              <Box sx={{ height: 250, mb: 4, mt: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'textSecondary' }}>
                  Tendencia de ingresos por franja horaria
                </Typography>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={processedRevenue.hourly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <ChartTooltip />
                    <Bar dataKey="value" name="Ingreso ($)" fill="#1e293b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}

            {tabValue === 2 && (
              <Box sx={{ height: 300, mb: 4, mt: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'textSecondary' }}>
                  Tendencia diaria por canal de venta
                </Typography>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={processedRevenue.daily}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10 }} 
                      tickFormatter={(str) => new Date(str).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <ChartTooltip 
                      labelFormatter={(label) => new Date(label).toLocaleDateString('es-AR', { dateStyle: 'full' })}
                    />
                    <Legend />
                    {processedRevenue.businessNames.map((name) => (
                      <Line 
                        key={name} 
                        type="monotone" 
                        dataKey={name} 
                        stroke={colorMap[name] || '#09f033'} 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            )}

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: 'grey.100' }}>
                  <TableRow>
                    <TableCell />
                    <TableCell sx={{ fontWeight: 700 }}>Concepto</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Ingreso ($)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tabValue === 0 && processedRevenue.byBusiness.map((row) => (
                    <Row key={row.name} row={row} type="business" />
                  ))}
                  {tabValue === 1 && processedRevenue.weekly.map((row) => (
                    <Row key={row.name} row={row} type="weekly" />
                  ))}
                  {tabValue === 2 && [...processedRevenue.daily].reverse().map((row) => (
                    <Row key={row.date} row={row} type="daily" />
                  ))}
                  {tabValue === 3 && processedRevenue.hourly.map((row) => (
                    <Row key={row.name} row={row} type="hourly" />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'grey.50' }}>
          <Button onClick={() => setRevenueModalOpen(false)} variant="contained">Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal de Detalles de Órdenes (Estados por Semana) */}
      <Dialog 
        open={ordersModalOpen} 
        onClose={() => setOrdersModalOpen(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'primary.dark', color: 'white', py: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Estados de Órdenes (Últimas 5 semanas)</Typography>
          <IconButton onClick={() => setOrdersModalOpen(false)} size="small" sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Box sx={{ height: 400, mt: 2 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={processedOrders}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="PAID" name="Pagadas" stackId="a" fill={statusColors.PAID} radius={[0, 0, 0, 0]} />
                <Bar dataKey="PENDING" name="Pendientes" stackId="a" fill={statusColors.PENDING} />
                <Bar dataKey="CANCELLED" name="Anuladas" stackId="a" fill={statusColors.CANCELLED} />
                <Bar dataKey="ERROR" name="Error" stackId="a" fill={statusColors.ERROR} />
                <Bar dataKey="ABANDONED" name="Abandonadas" stackId="a" fill={statusColors.ABANDONED} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Typography variant="caption" color="textSecondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>
            Distribución semanal de estados de órdenes generadas.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'grey.50' }}>
          <Button onClick={() => setOrdersModalOpen(false)} variant="contained" color="primary">Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
