import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, profile, loading, authReady } = useAuthStore();
  const location = useLocation();

  if (!authReady || (loading && !(user && profile))) {

    console.log("En protectedRoute: ", user, profile, loading);

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Cargando permisos de PerPel ERP...
      </div>
    );
  }

  if (!user) {
    // Redirect to login if not authenticated, storing the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If roles are specified and the user does not have one of them
  if (allowedRoles.length > 0 && !allowedRoles.includes(profile?.app_role)) {
    // Redireccionamos a una ruta de no autorizado o al dashboard por defecto
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
