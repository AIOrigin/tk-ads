import { create } from 'zustand';
import type { User } from '@/lib/api/user-api';
import { getToken, setToken, clearToken } from '@/lib/api/client';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  setAuth: (token, user) => {
    setToken(token);
    set({ token, user, isAuthenticated: true, isLoading: false });
  },

  setUser: (user) => {
    set({ user });
  },

  logout: () => {
    clearToken();
    // Reset PostHog so the next session gets a fresh anonymous distinct_id.
    // Dynamic import keeps analytics out of the initial SSR bundle path.
    import('@/lib/analytics').then(({ resetUser }) => resetUser()).catch(() => {});
    set({ token: null, user: null, isAuthenticated: false, isLoading: false });
  },

  hydrate: () => {
    const token = getToken();
    set({ token, isAuthenticated: !!token, isLoading: !token ? false : true });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },
}));
