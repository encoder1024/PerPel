import React, { createContext, useContext, useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { supabase } from "../../services/supabaseClient";

export const AuthProvider = ({ children }) => {
  const { setUser, setProfile, setLoading, fetchProfile, loading } = useAuthStore(); // Added 'loading' to destructure for clarity

  useEffect(() => {
    // This initial call is good for first load or refresh to get current session
    const initAuth = async () => {
      setLoading(true); // Start loading state
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else {
          // No active session found
          setUser(null);
          setProfile(null);
        }
      } catch (error) {
        console.error("Error during initial auth check:", error);
        // Optionally set error state in store
      } finally {
        setLoading(false); // Ensure loading is turned off after initial check
      }
    };

    initAuth();

    // Set up the listener for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Log event and session for debugging
      console.log('onAuthStateChange event:', event);
      console.log('onAuthStateChange session:', session);

      // Always show loading state while processing auth changes
      // This is crucial as session processing (e.g., fetchProfile) can take time
      setLoading(true); 

      try {
        if (session) {
          setUser(session.user);
          // If profile is already being fetched or is available, avoid refetching immediately
          // This check prevents redundant calls if fetchProfile is called elsewhere (e.g., in login)
          if (!loading || !session.user || !useAuthStore.getState().profile) { // Check if profile is not already loading or set
              await fetchProfile(session.user.id);
          }
        } else {
          // User logged out or session expired
          setUser(null);
          setProfile(null);
        }
      } catch (error) {
        console.error("Error during onAuthStateChange processing:", error);
        // Optionally set error state in store
      } finally {
        setLoading(false); // Ensure loading is turned off after processing the auth change
      }
    });

    // Clean up the subscription on component unmount
    return () => subscription.unsubscribe();
  }, []); // Empty dependency array means this runs once on mount

  return <>{children}</>;
};

// Removed useAuthContext as it's not being used and the store is accessed directly
// export const useAuthContext = () => useContext(AuthContext);
