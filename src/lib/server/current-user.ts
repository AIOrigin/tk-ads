import { User } from '@/lib/api/user-api';

const USER_API_BASE = process.env.NEXT_PUBLIC_USER_API_BASE_URL || 'http://localhost:8000';

export async function getCurrentUserFromAuthHeader(authHeader: string | null): Promise<User | null> {
  if (!authHeader) return null;

  const response = await fetch(`${USER_API_BASE}/v1/users/me`, {
    headers: {
      Authorization: authHeader,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}
