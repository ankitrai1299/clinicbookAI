import React, { createContext, useContext, useEffect, useState } from 'react';
import { initNativePush, unregisterNativePush } from '../utils/nativePush';

import { AuthUser, getMe } from '../api/auth';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  setAuth: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('auth_token');
    if (!stored) {
      setLoading(false);
      return;
    }
    getMe()
      .then((u) => {
        setUser(u);
        setToken(stored);
        // Returning to the app with a session already stored — the sign-in path
        // never runs, so this is the only place the device gets registered.
        // Idempotent: it re-posts nothing if this token is already registered.
        initNativePush();
      })
      .catch(() => {
        localStorage.removeItem('auth_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const setAuth = (t: string, u: AuthUser) => {
    localStorage.setItem('auth_token', t);
    setToken(t);
    setUser(u);
    // Now that there IS a session, the phone's push token can be bound to it.
    // The token usually arrives before anyone signs in, so this is the moment
    // registration becomes possible rather than the moment it is offered.
    initNativePush();
  };

  const logout = () => {
    // Before the token goes: a shared clinic phone must stop buzzing for
    // whoever signed in previously.
    unregisterNativePush();
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
