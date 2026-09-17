import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Feature } from '@hospitalityos/shared';
import { apiGet, apiWrite, setAccessToken, getAccessToken } from './api';

export interface AuthUser {
  id: string;
  hotelId: string;
  name: string;
  role: string;
  phone: string;
  extraPermissions: string[];
}

/** Tenant subscription context returned by /auth/me, used to gate the UI. */
export interface HotelContext {
  name: string;
  slug: string | null;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  approved: boolean;
  approvalRequested: boolean;
  trialEndsAt: string | null;
  plan: { code: string; name: string; features: string[] } | null;
  features: Feature[];
}

interface AuthState {
  user: AuthUser | null;
  hotel: HotelContext | null;
  loading: boolean;
  login: (phone: string, password: string, hotelSlug?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

interface MeResponse {
  user: AuthUser;
  hotel: HotelContext | null;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hotel, setHotel] = useState<HotelContext | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadMe = async () => {
    const me = await apiGet<MeResponse>('/auth/me');
    setUser(me.user);
    setHotel(me.hotel);
  };

  useEffect(() => {
    (async () => {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      try {
        await loadMe();
      } catch {
        setAccessToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (phone: string, password: string, hotelSlug?: string) => {
    const res = await apiWrite<{
      accessToken: string;
      refreshToken: string;
      user: AuthUser;
    }>('POST', '/auth/login', { phone, password, ...(hotelSlug ? { hotelSlug } : {}) });
    if (res.queued) throw new Error('Cannot log in while offline');
    setAccessToken(res.data.accessToken);
    localStorage.setItem('refreshToken', res.data.refreshToken);
    await loadMe();
  };

  const logout = async () => {
    try {
      await apiWrite('POST', '/auth/logout');
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    localStorage.removeItem('refreshToken');
    setUser(null);
    setHotel(null);
  };

  return (
    <AuthContext.Provider value={{ user, hotel, loading, login, logout, refresh: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
