import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Box, Typography, CircularProgress, Paper, Alert, Button } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { supabase } from '../../services/supabaseClient';

// VARIABLE GLOBAL: Sobrevive a montajes/desmontajes de React en la misma sesión
let isProcessingGlobally = false;

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    // 1. Validar parámetros
    if (!code || !state) {
      setStatus('error');
      setErrorMsg('Faltan parámetros críticos de autorización.');
      return;
    }

    // 2. Control de doble ejecución (Strict Mode / Re-renders)
    if (isProcessingGlobally) {
        console.log("Ya hay un proceso de vinculación en curso o terminado. Ignorando...");
        return;
    }

    const processCallback = async () => {
      isProcessingGlobally = true;
      console.log("Iniciando vinculación atómica para:", state);

      try {
        const { data, error } = await supabase.functions.invoke('oauth-handler', {
          body: { code, credentialId: state }
        });

        if (error) throw error;

        if (data?.success) {
          setStatus('success');
          // Redirigir y limpiar flag después de un tiempo
          setTimeout(() => {
            isProcessingGlobally = false;
            navigate('/configuracion/credenciales');
          }, 3000);
        } else {
          throw new Error(data?.message || 'Error en el procesamiento.');
        }

      } catch (err) {
        console.error('OAuth Callback Error:', err);
        setStatus('error');
        setErrorMsg(err.message);
        isProcessingGlobally = false; // Permitir reintento manual si falló
      }
    };

    processCallback();

    // Limpieza al desmontar (opcional, dependiendo de si queremos permitir re-entrada)
    return () => {
        // No reseteamos isProcessingGlobally aquí para evitar el doble disparo de React 18
    };
  }, [searchParams, navigate]);

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', bgcolor: '#f8fafc' }}>
      <Paper elevation={3} sx={{ p: 5, textAlign: 'center', maxWidth: 500, borderRadius: 4 }}>
        {status === 'processing' && (
          <Box sx={{ py: 2 }}>
            <CircularProgress size={60} thickness={4} sx={{ mb: 3 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Vinculando cuenta...</Typography>
            <Typography variant="body1" color="textSecondary">Por seguridad, solo procesamos una solicitud a la vez.</Typography>
          </Box>
        )}

        {status === 'success' && (
          <Box sx={{ py: 2 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 80, mb: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>¡Éxito!</Typography>
            <Typography variant="body1" color="textSecondary">La cuenta se ha vinculado correctamente.</Typography>
          </Box>
        )}

        {status === 'error' && (
          <Box sx={{ py: 2 }}>
            <ErrorIcon color="error" sx={{ fontSize: 80, mb: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Error</Typography>
            <Alert severity="error" sx={{ mb: 3 }}>{errorMsg}</Alert>
            <Button variant="contained" fullWidth onClick={() => navigate('/configuracion/credenciales')}>Volver</Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
