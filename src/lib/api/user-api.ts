import { userApi } from './client';

// --- Auth ---

export async function sendOTP(email: string): Promise<void> {
  await userApi.post('v1/auth/sign-in', { json: { email } });
}

export async function verifyOTP(
  email: string,
  code: string
): Promise<{ access_token: string; is_first_login: boolean }> {
  return userApi
    .post('v1/auth/verify-code', { json: { email, code } })
    .json();
}

export async function getGoogleSignInUrl(): Promise<{ redirect_url: string }> {
  return userApi.get('v1/auth/google/sign-in').json();
}

export async function verifyGoogleCode(
  code: string
): Promise<{ access_token: string; is_first_login: boolean }> {
  return userApi
    .post('v1/auth/google/verify-code', { json: { code } })
    .json();
}

// --- User ---

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  status: 'active' | 'suspended' | 'deleted';
  invite_code: string;
  created_at: string;
  updated_at: string;
  daily_credit: boolean;
}

export async function getMe(): Promise<User> {
  return userApi.get('v1/users/me').json();
}
