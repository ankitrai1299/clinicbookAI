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
import {
  login as apiLogin,
  register as apiRegister,
  resetPassword as apiResetPassword,
  getMe,
  setSessionToken,
  setUnauthorizedHandler,
  type RegisterProfile,
} from '../services/api';
import { setSettingsScope, syncProfileFromUser } from '../services/storage';
import { setChatScope } from '../services/chatHistory';
import { registerForPush, unregisterFromPush } from '../services/push';

// Token persistence key.
//
// Renamed from 'novascribe.admin.token': this session is no longer just the
// admin console's, it now gates the whole app. The old key is deliberately NOT
// migrated — a token minted before the data routes required auth should not
// silently become an app-wide session, and signing in again costs one screen.
const TOKEN_KEY = 'novascribe.session.token';
const LEGACY_TOKEN_KEY = 'novascribe.admin.token';

interface AuthValue {
  user: AuthUser | null;
  token: string | null;
  /** True while the persisted session is being restored on mount. */
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (
    name: string,
    email: string,
    password: string,
    profile?: RegisterProfile,
  ) => Promise<AuthUser>;
  /** Exchange an emailed reset code for a new password; signs in on success. */
  resetPassword: (email: string, code: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** Drop the session everywhere: state, storage and the API module. */
  const clearSession = useCallback(async () => {
    // DIVERGENCE (see services/push.ts): a clinic phone is shared, so this
    // device must stop receiving the signed-out doctor's notifications. Runs
    // FIRST — it needs the session that is about to be cleared.
    await unregisterFromPush();
    await AsyncStorage.multiRemove([TOKEN_KEY, LEGACY_TOKEN_KEY]).catch(() => {});
    setSessionToken(null);
    // Stop reading the signed-out doctor's settings. Their stored copy is left
    // on disk so signing back in restores it, but nothing can reach it until
    // an account is scoped again.
    setSettingsScope(null);
    setChatScope(null);
    setToken(null);
    setUser(null);
  }, []);

  // Let the API layer end the session when the server rejects our token, so an
  // expired JWT returns the doctor to the login screen instead of leaving the
  // app in a signed-in state where every request fails.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // On mount, restore a persisted token and confirm it with the server. The
  // token is published to the API module BEFORE getMe() so that call is itself
  // authenticated; anything invalid clears the session and shows login.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (!stored) {
          setSessionToken(null);
          return;
        }
        setSessionToken(stored);
        const me = await getMe(stored);
        if (active) {
          // Scope settings BEFORE publishing the user, so the first screen to
          // call loadSettings() already reads this account's copy.
          setSettingsScope(me.id);
          setChatScope(me.id);
          await syncProfileFromUser(me);
          setToken(stored);
          setUser(me);
        }
      } catch {
        await clearSession();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clearSession]);

  /** Persist and publish a freshly issued session. */
  const adoptSession = useCallback(async (newToken: string, newUser: AuthUser) => {
    await AsyncStorage.setItem(TOKEN_KEY, newToken);
    // Publish before setState so any request triggered by the re-render (the
    // dashboard loads immediately) already carries the token, and so settings
    // reads land on the right account.
    setSessionToken(newToken);
    setSettingsScope(newUser.id);
    setChatScope(newUser.id);
    // Pull the stored profile into the local cache before any screen renders,
    // so the doctor's name/clinic appear immediately rather than after a first
    // visit to Settings.
    await syncProfileFromUser(newUser);
    setToken(newToken);
    setUser(newUser);
    // DIVERGENCE (see services/push.ts): bind this device to the doctor who has
    // just signed in. Every session — login, register, reset, and the on-mount
    // restore — comes through here, so this is the one place it belongs.
    // Not awaited: a permission prompt must not delay the dashboard.
    void registerForPush();
    return newUser;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin(email, password);
      return adoptSession(res.token, res.user);
    },
    [adoptSession],
  );

  const register = useCallback(
    async (name: string, email: string, password: string, profile?: RegisterProfile) => {
      const res = await apiRegister(name, email, password, profile);
      // The server signs the new doctor straight in, so there's no second
      // round-trip and no bounce back to a login screen.
      return adoptSession(res.token, res.user);
    },
    [adoptSession],
  );

  const resetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      // The server verifies the code, sets the new password and issues a fresh
      // session in one call, so a successful reset lands the doctor straight in.
      const res = await apiResetPassword(email, code, password);
      return adoptSession(res.token, res.user);
    },
    [adoptSession],
  );

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const hasPermission = useCallback(
    (permission: Permission) => can(user?.role, permission),
    [user],
  );

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, resetPassword, logout, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
