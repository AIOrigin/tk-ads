'use client';

import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/api/client';
import { getMe, type User } from '@/lib/api/user-api';
import { useAuthStore } from '@/lib/store/auth-store';

export function useAuth() {
  const store = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    // We have a token, if user already in store (from login flow), we're done
    if (store.user) {
      setIsLoading(false);
      return;
    }

    // Token exists but no user in store (page refresh) — fetch user
    getMe()
      .then((user: User) => {
        store.setAuth(token, user);
        setIsLoading(false);
      })
      .catch(() => {
        store.logout();
        setIsLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    user: store.user,
    isLoading,
    isAuthenticated: store.isAuthenticated,
  };
}
