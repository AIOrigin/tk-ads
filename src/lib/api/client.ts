import ky from 'ky';
import { buildLoginRedirect, getCurrentPathWithSearch } from '@/lib/funnel';

const TOKEN_KEY = 'dance_auth_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function createApiClient(baseUrl: string) {
  return ky.create({
    prefix: baseUrl,
    hooks: {
      beforeRequest: [
        ({ request }) => {
          const token = getToken();
          if (token) {
            request.headers.set('Authorization', `Bearer ${token}`);
          }
        },
      ],
      afterResponse: [
        async ({ response }) => {
          if (response.status === 401 && typeof window !== 'undefined') {
            clearToken();
            window.location.href = buildLoginRedirect(getCurrentPathWithSearch());
          }
        },
      ],
    },
  });
}

export const userApi = createApiClient(
  process.env.NEXT_PUBLIC_USER_API_BASE_URL || 'http://localhost:8000'
);

export const toolApi = createApiClient(
  process.env.NEXT_PUBLIC_TOOL_API_BASE_URL || 'http://localhost:8001'
);
