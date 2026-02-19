import OneSignal from 'react-onesignal';
import { supabase } from './supabaseClient';

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

export const notificationService = {
  // Initialize OneSignal
  init: async () => {
    if (!ONESIGNAL_APP_ID) {
      console.warn('VITE_ONESIGNAL_APP_ID not found in environment variables.');
      return;
    }

    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true, // For development
        notifyButton: {
          enable: true, // Floating button to request permissions
        },
      });
    } catch (error) {
      console.error('Error initializing OneSignal:', error.message);
    }
  },

  // Link OneSignal subscription with Supabase User
  linkUser: async (supabaseUserId) => {
    try {
      // Get the OneSignal ID (subscriptionId)
      const externalId = await OneSignal.getUserId();
      
      if (externalId && supabaseUserId) {
        console.log('Linking User:', supabaseUserId, 'with PlayerID:', externalId);
        
        // 1. Intentamos vía RPC (Preferido por seguridad definer)
        const { error: rpcError } = await supabase.rpc('register_onesignal_player', {
          user_id: supabaseUserId,
          player_id: externalId,
        });

        if (rpcError) {
          console.warn('RPC register_onesignal_player failed, trying direct update:', rpcError.message);
          
          // 2. Fallback: Actualización directa si el RLS lo permite (Punto 2)
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ onesignal_id: externalId })
            .eq('id', supabaseUserId);

          if (updateError) throw updateError;
        }
        
        console.log('User linked with OneSignal successfully.');
      }
    } catch (error) {
      console.error('Error linking user with OneSignal:', error.message);
    }
  },

  // Manual request for permissions (can be used in a button)
  requestPermissions: async () => {
    try {
      await OneSignal.showNativePrompt();
    } catch (error) {
      console.error('Error requesting push permissions:', error.message);
    }
  }
};
