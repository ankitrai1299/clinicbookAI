import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser, Permission, can } from '../contracts';
import { login as apiLogin, getMe, setAuthToken } from '../services/api';

// Token persistence key (namespaced so it can't collide with app settings).
const TOKEN_KEY = 'novascribe.admin.token';

interface AuthValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean; // true while hydrating the persisted session on mount
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, hydrate a stored token → fetch the current user. A stale/invalid
  // token silently clears so the admin tab just shows the login screen.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (stored) {
          setAuthToken(stored); // so every api call carries the token
          const me = await getMe(stored);
          if (active) {
            setToken(stored);
            setUser(me);
          }
        }
      } catch {
        await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
        setAuthToken(null);
        if (active) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await apiLogin(email, password);
    await AsyncStorage.setItem(TOKEN_KEY, res.token);
    setAuthToken(res.token);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (permission: Permission) => can(user?.role, permission),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
