import React, { createContext, useContext, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../services/supabaseClient';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const { setUser, setProfile, setLoading, fetchProfile } = useAuthStore();

  useEffect(() => {
    // 1. Initial session check
    const initAuth = async () => {
      setLoading(true);
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (session) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      }
      setLoading(false);
    };

    initAuth();

    // 2. Auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setProfile, setLoading, fetchProfile]);

  return (
    <AuthContext.Provider value={{}}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => useContext(AuthContext);
