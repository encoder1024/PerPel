import { useState } from 'react';
import { supabase } from '../services/supabaseClient';

export const useMercadoPagoPoint = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createPointPaymentIntent = async (orderId, deviceId) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: functionError } = await supabase.functions.invoke('create-mp-point-intent', {
        body: { orderId, deviceId },
      });

      if (functionError) {
        // The error from a function invoke is an object, we need to find the message
        const errorMessage = functionError.context?.body?.error || functionError.message;
        throw new Error(errorMessage);
      }

      return { success: true, ...data };

    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    createPointPaymentIntent,
  };
};
