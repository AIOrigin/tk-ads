export function getBaseUrl(request: Request): string {
  const origin = request.headers.get('origin');
  if (origin) return origin;

  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host) return `${proto}://${host}`;

  return process.env.NEXT_PUBLIC_APP_URL ?? '';
}
