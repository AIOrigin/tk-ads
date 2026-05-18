'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type MetaPixelWindow = Window & {
  fbq?: (...args: unknown[]) => void;
};

export function MetaPixelPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    const search = searchParams.toString();
    const url = search ? `${pathname}?${search}` : pathname;

    if (lastUrlRef.current === null) {
      lastUrlRef.current = url;
      return;
    }

    if (lastUrlRef.current === url) return;
    lastUrlRef.current = url;

    const fbq = (window as MetaPixelWindow).fbq;
    if (fbq) fbq('track', 'PageView');
  }, [pathname, searchParams]);

  return null;
}
