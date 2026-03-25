import { useState, useEffect } from 'react';
import { getDatabase } from '../services/db';
import { syncService } from '../services/syncService';

export const useOffline = () => {
  const [db, setDb] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const initDb = async () => {
      const database = await getDatabase();
      setDb(database);
    };

    initDb();

    let timeoutId;
    const checkConnection = async () => {
      if (!navigator.onLine) {
        // Si el navegador dice offline, esperamos un poco antes de confirmarlo (evitar flickering en foco/reload)
        timeoutId = setTimeout(() => setIsOnline(false), 3000);
        return;
      }

      // Si dice online, intentamos un ping rápido a un recurso confiable (favicon o similar)
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 3000);
        await fetch('/favicon.ico', { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
        clearTimeout(id);
        clearTimeout(timeoutId);
        setIsOnline(true);
      } catch {
        // Si el fetch falla pero navigator dice online, podríamos estar en un captive portal o DNS caído
        // No cambiamos a offline inmediatamente a menos que navigator.onLine sea false
      }
    };

    const handleOnlineStatus = () => {
      clearTimeout(timeoutId);
      if (navigator.onLine) {
        setIsOnline(true);
      } else {
        // Debounce para evitar el banner en transiciones rápidas
        timeoutId = setTimeout(() => setIsOnline(false), 2000);
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    // Check inicial y periódico cada 1 min
    checkConnection();
    const interval = setInterval(checkConnection, 60000);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      clearInterval(interval);
      clearTimeout(timeoutId);
    };
  }, []);

  return { db, isOnline, syncService };
};
