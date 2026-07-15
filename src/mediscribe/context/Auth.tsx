import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { AuthUser, Permission, can } from '../contracts';
import { login as apiLogin, getMe } from '../services/api';

// SSO: share ClinicBook's session token. Logging into ClinicBook (or the scribe)
// writes this one key, so being signed into either signs you into both.
const TOKEN_KEY = 'auth_token';

// The role the user picked on the MediScribe login screen. It DRIVES which panel
// opens (Doctor / Staff / Clinic Admin / Super Admin) — the whole app gates on it.
const SELECTED_ROLE_KEY = 'mediscribe_role';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [rawUser, setRawUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(!!token);
  // The role picked at login overrides the account's default → that role's panel opens.
  const [selectedRole] = useState<string | null>(() => localStorage.getItem(SELECTED_ROLE_KEY));

  // Effective user: the picked role wins for what the UI shows/gates on.
  const user: AuthUser | null = rawUser
    ? { ...rawUser, role: (selectedRole as AuthUser['role']) || rawUser.role }
    : null;
  const setUser = setRawUser;

  // On mount (or whenever a persisted token exists) hydrate the current user.
  // A rejected token (expired / revoked) clears the session cleanly.
  useEffect(() => {
    let cancelled = false;
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getMe(stored)
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setToken(stored);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token: newToken, user: newUser } = await apiLogin(email, password);
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SELECTED_ROLE_KEY);
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
