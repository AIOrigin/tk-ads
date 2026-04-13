import { userApi } from './client';

// --- Auth ---

export async function sendOTP(email: string): Promise<void> {
  await userApi.post('v1/auth/sign-in', { json: { email } });
}

export async function verifyOTP(
  email: string,
  code: string
): Promise<{ accessToken: string; isFirstLogin: boolean }> {
  return userApi
    .post('v1/auth/verify-code', { json: { email, code } })
    .json();
}

export async function getGoogleSignInUrl(): Promise<{ redirectUrl: string }> {
  return userApi.get('v1/auth/google/sign-in').json();
}

export async function verifyGoogleCode(
  code: string
): Promise<{ accessToken: string; isFirstLogin: boolean }> {
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
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
  dailyCredit: boolean;
}

export async function getMe(): Promise<User> {
  return userApi.get('v1/users/me').json();
}
