import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { Box, CircularProgress } from "@mui/material"; // Import Box and CircularProgress
import theme from "./theme/theme";
import { AuthProvider } from "./components/auth/AuthProvider";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import MainLayout from "./components/layout/MainLayout";
import SignIn from "./pages/auth/SignIn";
import SignUp from "./pages/auth/SignUp";
import Inventory from "./pages/inventory/Inventory";
import StockManagement from "./pages/inventory/StockManagement"; // Import StockManagement
import POS from './pages/pos/POS';
import CashRegister from './pages/pos/CashRegister';
import Appointments from './pages/appointments/Appointments';
import Customers from './pages/customers/Customers';
import Invoices from './pages/invoices/Invoices';
import Dashboard from "./pages/dashboard/Dashboard";
import Reports from "./pages/audit/Reports";
import RoleRequest  from "./pages/auth/RoleRequest";
import ConfigurationLayout from "./pages/configuration/ConfigurationLayout";
import VentasConfig from "./pages/configuration/VentasConfig";
import SucursalesConfig from "./pages/configuration/SucursalesConfig";
import CredentialsConfig from "./pages/configuration/CredentialsConfig";
import StockConfig from "./pages/configuration/StockConfig";
import FacturacionConfig from "./pages/configuration/FacturacionConfig";
import TurnosConfig from "./pages/configuration/TurnosConfig";
import ReportesConfig from "./pages/configuration/ReportesConfig";
import ECommerceConfig from "./pages/configuration/ECommerceConfig";
import OAuthCallback from "./pages/configuration/OAuthCallback";
import TiendanubeDashboard from "./pages/ecommerce/TiendanubeDashboard";

import { syncService } from "./services/syncService";

import { notificationService } from "./services/notificationService";

import { useAuthStore } from "./stores/authStore";

// PÃ¡ginas temporales para la Fase 2
import { Perfil } from "./components/auth/Perfil";

// Componente para redirecciÃ³n dinÃ¡mica basada en el ROL (Fase 7 - Final)
const RoleRedirect = () => {
  const { user, profile, loading, authReady } = useAuthStore();

// Mientras carga, puedes mostrar un spinner de MUI para que el usuario sepa que algo pasa
  if (!authReady || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Si el perfil no cargÃ³ aÃºn, mantenemos loader (no redirigimos)
  if (!profile) return <Navigate to="/perfil" replace />;

  switch (profile?.app_role) {
    case "OWNER":
      return <Navigate to="/dashboard" replace />;
    case "DEVELOPER":
      return <Navigate to="/dashboard" replace />;
    case "AUDITOR":
      return <Navigate to="/reportes" replace />;
    case "EMPLOYEE":
      return <Navigate to="/ventas" replace />;
    case "ADMIN":
      return <Navigate to="/ventas" replace />;
    default:
      return <Navigate to="/perfil" replace />;
  }
};

function App() {
  const { user, profile } = useAuthStore();

  React.useEffect(() => {
    // Inicializar el servicio de sincronizaciÃ³n offline
    syncService.init();

    // Inicializar OneSignal solo si la red no estÃ¡ degradada
    if (!syncService.isNetworkDegraded() && navigator.onLine) {
      notificationService.init();
    }
  }, []);

  // Efecto para vincular el player_id de OneSignal con el usuario logueado
  React.useEffect(() => {
    if (user?.id && !syncService.isNetworkDegraded() && navigator.onLine) {
      notificationService.linkUser(user.id);
    }
  }, [user?.id]);

  React.useEffect(() => {
    if (profile?.account_id && navigator.onLine && !syncService.isNetworkDegraded()) {
      syncService.pullData(profile.account_id);
    }
  }, [profile?.account_id]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            {/* Rutas de AutenticaciÃ³n */}
            <Route path="/login" element={<SignIn />} />
            <Route path="/register" element={<SignUp />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />

            {/* Ruta RaÃ­z con RedirecciÃ³n por Rol */}
            <Route path="/" element={<RoleRedirect />} />

            {/* Rutas Protegidas bajo el MainLayout */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "DEVELOPER"]}>
                  <MainLayout>
                    <Dashboard />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/rolerequest"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN"]}>
                  <MainLayout>
                    <RoleRequest />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/ventas"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN", "EMPLOYEE"]}>
                  <MainLayout>
                    <POS />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/ecommerce"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN"]}>
                  <MainLayout>
                    <TiendanubeDashboard />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/caja"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN", "EMPLOYEE"]}>
                  <MainLayout>
                    <CashRegister />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/inventario"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN", "EMPLOYEE"]}>
                  <MainLayout>
                    <Inventory />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/stock"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN", "EMPLOYEE"]}>
                  <MainLayout>
                    <StockManagement />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/facturacion"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN", "EMPLOYEE"]}>
                  <MainLayout>
                    <Invoices />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/turnos"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN", "EMPLOYEE"]}>
                  <MainLayout>
                    <Appointments />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/clientes"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN", "EMPLOYEE"]}>
                  <MainLayout>
                    <Customers />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/perfil"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Perfil />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/reportes"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN", "AUDITOR"]}>
                  <MainLayout>
                    <Reports />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* --- Configuration Routes --- */}
            <Route
              path="/configuracion"
              element={
                <ProtectedRoute allowedRoles={["OWNER", "ADMIN"]}>
                  <MainLayout>
                    <ConfigurationLayout />
                  </MainLayout>
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="ventas" replace />} />
              <Route path="ventas" element={<VentasConfig />} />
              <Route path="sucursales" element={<SucursalesConfig />} />
              <Route path="credenciales" element={<CredentialsConfig />} />
              <Route path="stock" element={<StockConfig />} />
              <Route path="facturacion" element={<FacturacionConfig />} />
              <Route path="turnos" element={<TurnosConfig />} />
              <Route path="reportes" element={<ReportesConfig />} />
              <Route path="ecommerce" element={<ECommerceConfig />} />
            </Route>

            {/* RedirecciÃ³n por defecto para rutas inexistentes */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;


