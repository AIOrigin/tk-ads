type EventProperties = Record<string, string | number | boolean>;

export function trackEvent(eventName: string, properties?: EventProperties) {
  // Google Analytics
  if (typeof window !== 'undefined' && 'gtag' in window) {
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
      'event',
      eventName,
      properties
    );
  }

  // TikTok Pixel
  if (typeof window !== 'undefined' && 'ttq' in window) {
    const ttq = (window as unknown as { ttq: { track: (name: string, params?: EventProperties) => void } }).ttq;
    const ttEventMap: Record<string, string> = {
      sign_up: 'CompleteRegistration',
      payment_start: 'InitiateCheckout',
      payment_complete: 'CompletePayment',
      video_download: 'Download',
    };
    const ttEvent = ttEventMap[eventName];
    if (ttEvent) {
      ttq.track(ttEvent, properties);
    }
  }
}

export function trackPageView(page: string) {
  trackEvent('page_view', { page });
}
