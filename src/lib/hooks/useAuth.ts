'use client';

import { useEffect, useRef, useState } from 'react';
import { getToken } from '@/lib/api/client';
import { getMe, type User } from '@/lib/api/user-api';
import { useAuthStore } from '@/lib/store/auth-store';
import { identifyUser } from '@/lib/analytics';

export function useAuth() {
  const store = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    let isActive = true;

    const finishLoading = () => {
      queueMicrotask(() => {
        if (isActive) setIsLoading(false);
      });
    };

    const token = getToken();
    if (!token) {
      finishLoading();
      return () => {
        isActive = false;
      };
    }

    // We have a token, if user already in store (from login flow), we're done
    if (store.user) {
      finishLoading();
      return () => {
        isActive = false;
      };
    }

    // Token exists but no user in store (page refresh) — fetch user
    getMe()
      .then((user: User) => {
        if (!isActive) return;
        store.setAuth(token, user);
        identifyUser(user.email, user.id);
        setIsLoading(false);
      })
      .catch(() => {
        if (!isActive) return;
        store.logout();
        setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    user: store.user,
    isLoading,
    isAuthenticated: store.isAuthenticated,
  };
}
