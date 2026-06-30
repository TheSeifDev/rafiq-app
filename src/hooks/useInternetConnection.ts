import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

type ConnectionStatus = {
  isConnected: boolean | null;
  type: 'wifi' | 'cellular' | 'unknown' | 'none';
  isInternetReachable: boolean | null;
};

const DEFAULT_STATUS: ConnectionStatus = {
  isConnected: null,
  type: 'unknown',
  isInternetReachable: null,
};

export function useInternetConnection(pingIntervalMs: number = 30_000): ConnectionStatus & {
  checkNow: () => Promise<void>;
  isOffline: boolean;
} {
  const [status, setStatus] = useState<ConnectionStatus>(DEFAULT_STATUS);

  const checkConnection = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://httpbin.org/get', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
      });

      clearTimeout(timeout);

      const connected = response.ok;
      setStatus({
        isConnected: connected,
        type: connected ? 'unknown' : 'none',
        isInternetReachable: connected,
      });
    } catch {
      setStatus({
        isConnected: false,
        type: 'none',
        isInternetReachable: false,
      });
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  useEffect(() => {
    const interval = setInterval(checkConnection, pingIntervalMs);
    return () => clearInterval(interval);
  }, [checkConnection, pingIntervalMs]);

  return {
    ...status,
    checkNow: checkConnection,
    isOffline: status.isConnected === false,
  };
}

export default useInternetConnection;