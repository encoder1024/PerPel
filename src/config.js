/**
 * Configuración Global de la Aplicación (PerPel)
 * Centraliza el comportamiento según el entorno (Desarrollo o Producción).
 */

// Si Vite está corriendo en modo 'production', esto será true automáticamente.
// Pero permitimos un override manual con la constante.
const MANUAL_PRODUCTION_OVERRIDE = false; 
const IS_PROD = import.meta.env.PROD || MANUAL_PRODUCTION_OVERRIDE;

const config = {
  isProduction: IS_PROD,
  
  // 1. URLs de Navegación
  // Se usan para los Redirect URI de Mercado Pago, Cal.com, etc.
  appUrl: IS_PROD 
    ? 'https://perpel.vercel.com'  // Dominio final
    : 'http://localhost:5173',

  // 2. Configuración Global de Supabase
  // (Aunque los valores están en .env, aquí podemos definir comportamientos extra)
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  },

  // 3. Mercado Pago (Global App Settings)
  // IMPORTANTE: Este es el Client ID de TU aplicación "PerPel" en el panel de MP Developers.
  // Es el que se usa para pedirle permiso a los dueños de las perfumerías.
  mercadopago: {
    appClientId: IS_PROD 
      ? 'ID_PROD_APP_PERPEL' //TODO PRODUCTION
      : '3202479358', // ID de prueba
    
    get redirectUri() {
      return `${config.appUrl}/oauth/callback`;
    }
  },

  // 4. Flags de Debug
  // Permite activar/desactivar logs pesados en consola
  debug: !IS_PROD,
};

export default config;
