import React, { useEffect, useState, useRef } from 'react';
import { initMercadoPago, Wallet } from '@mercadopago/sdk-react';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { supabase } from '../../services/supabaseClient';

// Note: In production, the public key should come from environment variables
const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY;

export default function PaymentGateway({ items, orderId, payerEmail, accountId, onPaymentSuccess }) {
  const [preferenceId, setPreferenceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const lastOrderIdRef = useRef(null);

useEffect(() => {
  // 1. Inicializar MP solo una vez
  if (MP_PUBLIC_KEY) {
    initMercadoPago(MP_PUBLIC_KEY, { locale: 'es-AR' });
  }

  const createPreference = async () => {
    // 2. GUARDAS DE SEGURIDAD: No dispares la función si no hay datos
    if (!items || items.length === 0 || !orderId) {
      console.log("Esperando datos válidos...", { items, orderId });
      return; 
    }
    // Evitar duplicar preferencia en StrictMode o re-renders
    if (lastOrderIdRef.current === orderId) return;
    lastOrderIdRef.current = orderId;

    setLoading(true);
    setError(null);
    
    try {
      console.log("Enviando a Edge Function:", { items, orderId });

      const { data, error: functionError } = await supabase.functions.invoke('create_mp_preference', {
        body: { items, orderId, payerEmail, accountId },
      });

      if (functionError) throw functionError;
      if (data?.preferenceId) setPreferenceId(data.preferenceId);

    } catch (err) {
      console.error("Error creating MP preference:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  createPreference();
}, [items, orderId]); // <--- IMPORTANTE: Dependencias para re-ejecutar si cambian

  if (!MP_PUBLIC_KEY) {
    return <Alert severity="warning">VITE_MP_PUBLIC_KEY no configurado en .env</Alert>;
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ mt: 2 }}>Preparando MercadoPago...</Typography>
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ textAlign: 'center', mt: 2 }}>
      {preferenceId && (
        <Wallet 
          initialization={{ preferenceId }} 
          customization={{ texts: { valueProp: 'smart_option' } }}
        />
      )}
    </Box>
  );
}
