'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEYS } from '@/lib/config';
import { getProfile, loginUser, logoutUser, signupUser, updateProfile, verifySession } from '@/lib/api';
import { UserProfile } from '@/lib/types';

interface AuthContextValue {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  signup: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  updateMyProfile: (payload: Partial<UserProfile> & { password?: string; current_password?: string }) => Promise<boolean>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.token) : null;
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.user) : null;

    if (storedToken) {
      setToken(storedToken);
    }
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (err) {
        console.warn('Failed to parse stored user', err);
      }
    }
  }, []);

  useEffect(() => {
    async function validateSession() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await verifySession(token);
        if (response.success && response.authenticated) {
          if (response.user) {
            setUser(response.user);
            localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(response.user));
          }
        } else {
          await handleLogout();
        }
      } catch (err) {
        console.error('Session validation failed', err);
        await handleLogout();
      } finally {
        setLoading(false);
      }
    }
    validateSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const persistAuth = useCallback((authToken: string, profile: UserProfile) => {
    setToken(authToken);
    setUser(profile);
    localStorage.setItem(STORAGE_KEYS.token, authToken);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(profile));
  }, []);

  const fetchProfileForToken = useCallback(async (authToken: string, fallback?: UserProfile | null) => {
    if (fallback) return fallback;
    try {
      const result = await getProfile(authToken);
      if (result.success) {
        return result.user;
      }
    } catch (err) {
      console.warn('Unable to load profile after auth', err);
    }
    return null;
  }, []);

  const handleLogin = useCallback(async (username: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await loginUser(username, password);
      if (response.success && response.token) {
        const profile = await fetchProfileForToken(response.token, response.user);
        if (!profile) {
          setError('Unable to load profile details');
          return false;
        }
        persistAuth(response.token, profile);
        return true;
      }
      setError(response.error || 'Unable to login');
      return false;
    } catch (err: any) {
      setError(err.message || 'Unable to login');
      return false;
    } finally {
      setLoading(false);
    }
  }, [persistAuth, fetchProfileForToken]);

  const handleSignup = useCallback(async (username: string, email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await signupUser(username, email, password);
      if (response.success && response.token) {
        const profile = await fetchProfileForToken(response.token, response.user);
        if (!profile) {
          setError('Unable to load profile details');
          return false;
        }
        persistAuth(response.token, profile);
        return true;
      }
      setError(response.error || 'Unable to sign up');
      return false;
    } catch (err: any) {
      setError(err.message || 'Unable to sign up');
      return false;
    } finally {
      setLoading(false);
    }
  }, [persistAuth, fetchProfileForToken]);

  const handleLogout = useCallback(async () => {
    try {
      if (token) {
        await logoutUser(token);
      }
    } catch (err) {
      console.warn('Logout warning:', err);
    } finally {
      setToken(null);
      setUser(null);
      localStorage.removeItem(STORAGE_KEYS.token);
      localStorage.removeItem(STORAGE_KEYS.user);
    }
  }, [token]);

  const refreshProfile = useCallback(async () => {
    if (!token) return null;
    try {
      const response = await getProfile(token);
      if (response.success) {
        setUser(response.user);
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(response.user));
        return response.user;
      }
    } catch (err) {
      console.error('Failed to refresh profile', err);
    }
    return null;
  }, [token]);

  const updateMyProfile = useCallback(
    async (payload: Partial<UserProfile> & { password?: string; current_password?: string }) => {
      if (!token) return false;
      try {
        const response = await updateProfile(payload, token);
        if (response.success) {
          await refreshProfile();
          return true;
        }
        setError(response.error || 'Unable to update profile');
        return false;
      } catch (err: any) {
        setError(err.message || 'Unable to update profile');
        return false;
      }
    },
    [token, refreshProfile]
  );

  const value = useMemo<AuthContextValue>(() => ({
    user,
    token,
    loading,
    error,
    login: handleLogin,
    signup: handleSignup,
    logout: handleLogout,
    refreshProfile,
    updateMyProfile,
    clearError: () => setError(null),
  }), [user, token, loading, error, handleLogin, handleSignup, handleLogout, refreshProfile, updateMyProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
