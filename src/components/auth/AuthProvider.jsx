import React, { createContext, useContext, useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { supabase } from "../../services/supabaseClient";
import { syncService } from "../../services/syncService";

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
          const cachedProfile = useAuthStore.getState().profile;
          const hasCachedProfile = cachedProfile?.id === session.user.id;
          if (hasCachedProfile) {
            setProfile(cachedProfile);
          }
          // Evitar refetch pesado si el evento es solo refresh de token
          let loadedProfile = cachedProfile;
          if (event !== 'TOKEN_REFRESHED') {
            if (!hasCachedProfile || (navigator.onLine && !syncService.isNetworkDegraded())) {
              loadedProfile = await withTimeout(
                fetchProfile(session.user.id),
                1500,
                "Profile fetch timeout",
              );
            }
          }

          if (navigator.onLine && !syncService.isNetworkDegraded() && loadedProfile?.account_id) {
            syncService.pullData(loadedProfile.account_id);
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
        if (/Failed to fetch|ERR_NAME_NOT_RESOLVED|NetworkError|timeout/i.test(error.message || '')) {
          syncService.markNetworkDegraded();
        }
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
