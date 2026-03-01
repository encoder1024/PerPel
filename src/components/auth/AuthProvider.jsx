import React, { createContext, useContext, useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { supabase } from "../../services/supabaseClient";

export const AuthProvider = ({ children }) => {
  const { setUser, setProfile, setLoading, setAuthReady, fetchProfile } = useAuthStore();

  const withTimeout = (promise, ms, message) =>
    new Promise((resolve, reject) => {
      const id = setTimeout(() => reject(new Error(message)), ms);
      promise
        .then((value) => {
          clearTimeout(id);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(id);
          reject(error);
        });
    });

  const recheckSession = async () => {
    const {
      data: { session },
    } = await withTimeout(
      supabase.auth.getSession(),
      8000,
      "Auth session timeout",
    );
    return session;
  };

  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
      setAuthReady(true);
    }, 3000);

    // Set up the listener for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        setLoading(true);
        setAuthReady(false);
      }
      const shouldBlock =
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT';
      if (shouldBlock) setLoading(true);

      try {
        if (session) {
          setUser(session.user);
          // Evitar refetch pesado si el evento es solo refresh de token
          if (event !== 'TOKEN_REFRESHED') {
            await withTimeout(
              fetchProfile(session.user.id),
              8000,
              "Profile fetch timeout",
            );
          }
        } else {
          // Recheck once before clearing (avoid transient null session)
          const confirmedSession = await recheckSession();
          if (!confirmedSession) {
            setUser(null);
            setProfile(null);
          }
        }
      } catch (error) {
        console.error("Error during onAuthStateChange processing:", error);
        // Optionally set error state in store
      } finally {
        if (shouldBlock) setLoading(false);
        if (event === 'INITIAL_SESSION') setAuthReady(true);
      }
    });

    // Clean up the subscription on component unmount
    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array means this runs once on mount

  return <>{children}</>;
};

// Removed useAuthContext as it's not being used and the store is accessed directly
// export const useAuthContext = () => useContext(AuthContext);
