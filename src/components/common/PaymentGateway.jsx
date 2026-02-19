import React, { useEffect, useState } from 'react';
import { initMercadoPago, Wallet } from '@mercadopago/sdk-react';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import { supabase } from '../../services/supabaseClient';

// Note: In production, the public key should come from environment variables
const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY;

export default function PaymentGateway({ orderId, onPaymentSuccess }) {
  const [preferenceId, setPreferenceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (MP_PUBLIC_KEY) {
      initMercadoPago(MP_PUBLIC_KEY, { locale: 'es-AR' });
    }

    const createPreference = async () => {
      setLoading(true);
      setError(null);

      try {
        // According to ERS, we invoke a Supabase Edge Function to get the preference_id
        // This ensures the secret token is never exposed to the client.
        const { data, error: functionError } = await supabase.functions.invoke('create-mp-preference', {
          body: { orderId },
        });

        if (functionError) throw functionError;
        if (!data?.preferenceId) throw new Error('No se recibió un preferenceId válido.');

        setPreferenceId(data.preferenceId);
      } catch (err) {
        console.error('Error creating MP preference:', err.message);
        setError('No se pudo iniciar el pago con MercadoPago. Por favor reintenta.');
      } finally {
        setLoading(false);
      }
    };

    if (orderId) createPreference();
  }, [orderId]);

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
