import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { API_ORIGIN } from '../api/api';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, isAuthenticated, refresh } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }
    const s = io(API_ORIGIN, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('permissions:updated', () => refresh());
    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [token, isAuthenticated, refresh]);

  const value = useMemo(() => {
    const on = (event, handler) => {
      socket?.on(event, handler);
      return () => socket?.off(event, handler);
    };
    return { socket, connected, on };
  }, [socket, connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
