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
  // The role picked on the login screen (if any) and whether it matches the
  // account's ACTUAL role. Access is USER-BASED: a doctor account can only enter
  // the doctor panel — picking any other role is denied.
  selectedRole: string | null;
  accessDenied: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(!!token);
  // The role the user PICKED on the login screen. USER-BASED access: it does NOT
  // grant anything — the account's real role (from /me) governs the panel. It's
  // only used to DENY entry when a user picks a role that isn't theirs.
  const [selectedRole] = useState<string | null>(() => localStorage.getItem(SELECTED_ROLE_KEY));
  const accessDenied = !!(user && selectedRole && selectedRole !== user.role);

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
    <AuthContext.Provider value={{ user, token, loading, login, logout, hasPermission, selectedRole, accessDenied }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
