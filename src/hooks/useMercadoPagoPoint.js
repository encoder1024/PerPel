import { useState } from 'react';
import { supabase } from '../services/supabaseClient';

export const useMercadoPagoPoint = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createPointPaymentIntent = async (orderId, deviceId) => {
    setLoading(true);
    setError(null);
    console.log(`Intentando crear Orden Point para ERP Order: ${orderId}, Device: ${deviceId}`);
    
    try {
      const { data, error: functionError } = await supabase.functions.invoke('create-mp-point-order', {
        body: { orderId, deviceId },
      });

      if (functionError) {
        console.error("Error de Supabase Function:", functionError);
        // Intentar extraer el mensaje del cuerpo si es un error HTTP
        let errorMessage = functionError.message;
        try {
          // Si el error viene de la función como un JSON con {error: "..."}, intentamos leerlo
          if (functionError.context?.body?.error) {
            errorMessage = functionError.context.body.error;
          }
        } catch (e) {}
        throw new Error(errorMessage || "Error desconocido al invocar la función.");
      }

      console.log("Respuesta exitosa de la función:", data);
      return { success: true, ...data };

    } catch (err) {
      console.error("Excepción capturada en useMercadoPagoPoint:", err);
      const msg = err.message === 'Failed to fetch' ? 'No se pudo conectar con la Edge Function (Posible error de red o CORS)' : err.message;
      setError(msg);
      return { success: false, error: msg };
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
