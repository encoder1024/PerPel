import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../services/supabaseClient';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      profile: null,
      loading: true,
      error: null,

      setUser: (user) => set({ user }),
      setProfile: (profile) => set({ profile }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      login: async (email, password) => {
        set({ loading: true, error: null });
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          
          // El perfil se recuperará en un listener de sesión en App.jsx o mediante un hook
          return data;
        } catch (error) {
          set({ error: error.message });
          throw error;
        } finally {
          set({ loading: false });
        }
      },

      logout: async () => {
        set({ loading: true });
        try {
          await supabase.auth.signOut();
          set({ user: null, profile: null });
        } catch (error) {
          set({ error: error.message });
        } finally {
          set({ loading: false });
        }
      },

      fetchProfile: async (userId) => {
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('*', { schema: 'core' }) // Specific schema for core.user_profiles
            .eq('id', userId)
            .single();
          
          if (error) {
            // If the query above fails due to schema configuration, we try standard naming
            const { data: dataAlt, error: errorAlt } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', userId)
              .single();
            if (errorAlt) throw errorAlt;
            set({ profile: dataAlt });
            return dataAlt;
          }
          set({ profile: data });
          return data;
        } catch (error) {
          console.error('Error fetching profile:', error.message);
          return null;
        }
      }
    }),
    {
      name: 'auth-storage', // Nombre para localStorage
    }
  )
);
