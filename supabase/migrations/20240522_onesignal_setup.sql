-- 1. Agregar columna onesignal_id a user_profiles si no existe
ALTER TABLE core.user_profiles ADD COLUMN IF NOT EXISTS onesignal_id TEXT;

-- 2. RPC para Vincular PlayerID (SubscriptionID)
-- Esta función es la que llama el frontend con supabase.rpc('register_onesignal_player', { user_id: '...', player_id: '...' })
CREATE OR REPLACE FUNCTION public.register_onesignal_player(user_id UUID, player_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE core.user_profiles
  SET onesignal_id = player_id,
      updated_at = NOW()
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC para Limpiar IDs Inválidos (Manejo de Errores de Delivery)
CREATE OR REPLACE FUNCTION public.unregister_onesignal_player(player_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE core.user_profiles
  SET onesignal_id = NULL,
      updated_at = NOW()
  WHERE onesignal_id = player_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Tabla de Notificaciones para Triggers (Punto 4 de la estrategia)
CREATE TABLE IF NOT EXISTS core.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES core.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id), -- Destinatario
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB, -- Para Deep Linking o Silent Push
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE core.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios ven sus propias notificaciones" ON core.notifications FOR SELECT USING (user_id = auth.uid());
