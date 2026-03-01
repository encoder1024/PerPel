import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../services/supabaseClient';

export const useAuthStore = create(
  persist(
    (set) => ({ // Removed 'get' as it's no longer needed in login
      user: null,
      profile: null,
      loading: false,
      authReady: false,
      error: null,

      setUser: (user) => set({ user }),
      setProfile: (profile) => set({ profile }),
      setLoading: (loading) => set({ loading }),
      setAuthReady: (authReady) => set({ authReady }),
      setError: (error) => set({ error }),

      login: async (email, password) => {
        // loading lo controla AuthProvider
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          
          // El perfil se recuperará en un listener de sesión en App.jsx o mediante un hook
          // Reverted: Removed direct setting of user and profile here.
          set({ user: data.user });
          return data;
        } catch (error) {
          set({ error: error.message });
          throw error;
        }
      },

      logout: async () => {
        // loading lo controla AuthProvider
        try {
          await supabase.auth.signOut();
          set({ user: null, profile: null });
        } catch (error) {
          set({ error: error.message });
        }
      },

      fetchProfile: async (userId) => {
        // loading lo controla AuthProvider
        try {
          // Intentamos la consulta al esquema core
          const { data, error } = await supabase
            .schema('core')  
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

          // if (error) {
          //   console.warn("Fallo en esquema 'core', intentando 'public'...");
          //   // Intento alternativo en public
          //   const { data: dataAlt, error: errorAlt } = await supabase
          //     .from('user_profiles')
          //     .select('*')
          //     .eq('id', userId)
          //     .single();
            
          //   if (errorAlt) throw errorAlt;
            
          //   set({ profile: dataAlt });
          //   return dataAlt;
          // }

          set({ profile: data });
          return data;
        } catch (error) {
          console.error('Error fetching profile:', error.message);
          set({ error: error.message });
          return null;
        }
      }
    }),
    {
      name: 'auth-storage', 
      // Evitamos persistir estado efímero o sensible del runtime
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(
            ([key]) => !['user', 'profile', 'loading', 'authReady', 'error'].includes(key)
          )
        ),
      // Forzar estado limpio al rehidratar para evitar loading colgado
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.setLoading(false);
        state.setAuthReady(false);
        state.setError(null);
      },
    }
  )
);
