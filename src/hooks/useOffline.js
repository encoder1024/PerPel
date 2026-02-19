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

    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  return { db, isOnline, syncService };
};
