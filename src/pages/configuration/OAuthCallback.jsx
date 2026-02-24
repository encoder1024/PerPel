import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Box, Typography, CircularProgress, Paper, Alert, Button } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { supabase } from '../../services/supabaseClient';

/**
 * Componente que recibe el código de autorización de APIs externas (OAuth)
 * y lo envía al backend para finalizar la vinculación.
 */
export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing'); // 'processing', 'success', 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state'); // Aquí vendrá el ID de la credencial en nuestra DB

      if (!code || !state) {
        setStatus('error');
        setErrorMsg('No se recibió el código de autorización o la sesión es inválida.');
        return;
      }

      try {
        // Llamada a la Edge Function de Supabase
        // El body envía el 'code' (de MP) y el 'credentialId' (nuestro ID interno)
        const { data, error } = await supabase.functions.invoke('oauth-handler', {
          body: { code, credentialId: state }
        });

        if (error) throw error;

        if (data?.success) {
          setStatus('success');
          // Redirigir después de unos segundos
          setTimeout(() => navigate('/configuracion/credenciales'), 3000);
        } else {
          throw new Error(data?.message || 'Error desconocido al procesar la vinculación.');
        }

      } catch (err) {
        console.error('OAuth Callback Error:', err);
        setStatus('error');
        setErrorMsg(err.message);
      }
    };

    processCallback();
  }, [searchParams, navigate]);

  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '80vh',
      bgcolor: '#f8fafc' 
    }}>
      <Paper elevation={3} sx={{ p: 5, textAlign: 'center', maxWidth: 500, borderRadius: 4 }}>
        {status === 'processing' && (
          <Box sx={{ py: 2 }}>
            <CircularProgress size={60} thickness={4} sx={{ mb: 3 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Vinculando tu cuenta...</Typography>
            <Typography variant="body1" color="textSecondary">
              Estamos configurando la conexión de forma segura. No cierres ni recargues esta ventana.
            </Typography>
          </Box>
        )}

        {status === 'success' && (
          <Box sx={{ py: 2 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 80, mb: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>¡Vinculación Exitosa!</Typography>
            <Typography variant="body1" color="textSecondary" sx={{ mb: 3 }}>
              Tu cuenta de Mercado Pago ha sido conectada correctamente a tu sucursal.
            </Typography>
            <Typography variant="caption" display="block">
              Redirigiendo automáticamente...
            </Typography>
          </Box>
        )}

        {status === 'error' && (
          <Box sx={{ py: 2 }}>
            <ErrorIcon color="error" sx={{ fontSize: 80, mb: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Error en la vinculación</Typography>
            <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
              {errorMsg}
            </Alert>
            <Button 
              variant="contained" 
              fullWidth 
              size="large"
              onClick={() => navigate('/configuracion/credenciales')}
              sx={{ borderRadius: 2 }}
            >
              Volver a Configuración
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
