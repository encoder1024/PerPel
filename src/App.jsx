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
import POS from "./pages/pos/POS";
import Appointments from "./pages/appointments/Appointments";
import Dashboard from "./pages/dashboard/Dashboard";
import AuditLogs from "./pages/audit/AuditLogs";
import RoleRequest  from "./pages/auth/RoleRequest";

import { syncService } from "./services/syncService";
import { notificationService } from "./services/notificationService";

import { useAuthStore } from "./stores/authStore";

// Páginas temporales para la Fase 2
import { Perfil } from "./components/auth/Perfil";

// Componente para redirección dinámica basada en el ROL (Fase 7 - Final)
const RoleRedirect = () => {
  const { user, profile, loading } = useAuthStore();

// Mientras carga, puedes mostrar un spinner de MUI para que el usuario sepa que algo pasa
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Si el perfil no cargó pero el usuario sí existe, mándalo a perfil por defecto
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
    // Inicializar el servicio de sincronización offline
    syncService.init();

    // Inicializar OneSignal
    notificationService.init();
  }, []);

  // Efecto para vincular el player_id de OneSignal con el usuario logueado
  React.useEffect(() => {
    if (user?.id) {
      notificationService.linkUser(user.id);
    }
  }, [user?.id]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            {/* Rutas de Autenticación */}
            <Route path="/login" element={<SignIn />} />
            <Route path="/register" element={<SignUp />} />

            {/* Ruta Raíz con Redirección por Rol */}
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
                    <AuditLogs />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Redirección por defecto para rutas inexistentes */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
