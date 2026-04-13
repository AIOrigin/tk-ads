# Technical Specifications: Dance Like Me H5

> Based on [PRD: prd-tk-dance-h5.md](./prd-tk-dance-h5.md)

---

## 1. Project Architecture

### 1.1 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| State | Zustand | 5.x |
| HTTP Client | ky (lightweight fetch wrapper) | 1.x |
| Payment | Stripe.js (@stripe/stripe-js) | latest |
| Analytics | @vercel/analytics + custom events | latest |
| Deployment | Vercel | - |

### 1.2 Directory Structure

```
tk-ads/
├── public/
│   ├── videos/                    # Hero/preview videos (or CDN URLs)
│   ├── favicon.ico
│   └── og-image.png
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout: viewport meta, fonts, analytics
│   │   ├── page.tsx               # Landing page (/)
│   │   ├── login/
│   │   │   └── page.tsx           # Login page (/login)
│   │   ├── login/verify/
│   │   │   └── page.tsx           # OTP verification (/login/verify)
│   │   ├── auth/
│   │   │   └── google/
│   │   │       └── callback/
│   │   │           └── page.tsx   # Google OAuth callback (/auth/google/callback)
│   │   ├── templates/
│   │   │   └── page.tsx           # Template gallery (/templates)
│   │   ├── create/
│   │   │   ├── page.tsx           # Upload & pay (/create?templateId=xxx)
│   │   │   └── [taskId]/
│   │   │       └── page.tsx       # Generation progress (/create/[taskId])
│   │   ├── my-videos/
│   │   │   └── page.tsx           # Video history (/my-videos)
│   │   └── profile/
│   │       └── page.tsx           # Profile page (/profile)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── BottomNav.tsx      # Bottom tab navigation
│   │   │   └── AuthGuard.tsx      # Protected route wrapper
│   │   ├── auth/
│   │   │   ├── EmailLoginForm.tsx
│   │   │   ├── OTPInput.tsx
│   │   │   └── GoogleSignInButton.tsx
│   │   ├── templates/
│   │   │   ├── TemplateCard.tsx
│   │   │   └── TemplateGrid.tsx
│   │   ├── create/
│   │   │   ├── PhotoUploader.tsx
│   │   │   ├── TemplatePreview.tsx
│   │   │   ├── PayButton.tsx
│   │   │   └── GenerationProgress.tsx
│   │   ├── videos/
│   │   │   ├── VideoCard.tsx
│   │   │   ├── VideoList.tsx
│   │   │   └── VideoPlayer.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Toast.tsx
│   │       ├── Skeleton.tsx
│   │       ├── StatusBadge.tsx
│   │       └── ErrorBoundary.tsx
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts          # Base API client with auth header injection
│   │   │   ├── user-api.ts        # elser-user-api endpoints
│   │   │   └── tool-api.ts        # elser-tool-api endpoints
│   │   ├── store/
│   │   │   ├── auth-store.ts      # Auth state (user, token)
│   │   │   └── create-store.ts    # Creation flow state (template, photo, taskId)
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── usePolling.ts
│   │   │   └── useVideoHistory.ts
│   │   ├── analytics.ts           # GA + TikTok Pixel event tracking
│   │   └── constants.ts           # Config constants
│   ├── data/
│   │   └── templates.json         # Dance template definitions
│   └── types/
│       ├── api.ts                 # API request/response types
│       ├── template.ts            # Template type
│       └── video.ts               # Video/generation types
├── .env.example
├── .env.local
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vercel.json
└── package.json
```

### 1.3 Environment Variables

```bash
# .env.example

# API Endpoints
NEXT_PUBLIC_USER_API_BASE_URL=https://api.elser.ai
NEXT_PUBLIC_TOOL_API_BASE_URL=https://tool-api.elser.ai

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
NEXT_PUBLIC_STRIPE_PRICE_LOOKUP_KEY=h5_dance_single

# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com

# Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_TIKTOK_PIXEL_ID=XXXXXXXXX

# App
NEXT_PUBLIC_APP_URL=https://dance.elser.ai
```

---

## 2. API Client Layer

### 2.1 Base Client (`src/lib/api/client.ts`)

```typescript
import ky from 'ky';

const TOKEN_KEY = 'auth_token';

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

export const userApi = ky.create({
  prefixUrl: process.env.NEXT_PUBLIC_USER_API_BASE_URL,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = getToken();
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        if (response.status === 401) {
          clearToken();
          window.location.href = '/login';
        }
      },
    ],
  },
});

export const toolApi = ky.create({
  prefixUrl: process.env.NEXT_PUBLIC_TOOL_API_BASE_URL,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = getToken();
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        if (response.status === 401) {
          clearToken();
          window.location.href = '/login';
        }
      },
    ],
  },
});
```

### 2.2 User API (`src/lib/api/user-api.ts`)

```typescript
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

// --- Credits ---

export interface Credit {
  id: string;
  userId: string;
  initialBalance: number;
  currentBalance: number;
  source: string;
  type: string;
  validFrom: string;
  expiredAt: string | null;
}

export async function getCredits(): Promise<Credit[]> {
  return userApi.get('v1/credits').json();
}

// --- Stripe ---

export async function createCheckout(
  priceLookupKey: string,
  locale: string = 'en'
): Promise<{ redirectUrl: string }> {
  return userApi
    .post('v1/stripe/checkout', { json: { priceLookupKey, locale } })
    .json();
}

export async function confirmCheckoutSuccess(
  checkoutSessionId: string
): Promise<unknown> {
  return userApi.post(`v1/stripe/success/${checkoutSessionId}`).json();
}
```

### 2.3 Tool API (`src/lib/api/tool-api.ts`)

```typescript
import { toolApi } from './client';

// --- S3 Upload ---

export interface UploadResult {
  success: boolean;
  taskId: string;
  fileId: string;
  cdnUrl: string;
}

export async function uploadPhoto(
  file: File,
  userId: string,
  trackId: string
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('user_id', userId);
  formData.append('category', 'images');
  formData.append('track_id', trackId);

  return toolApi.post('v1/s3/upload/single', { body: formData }).json();
}

// --- Video Generation ---

export interface GenerateResult {
  success: boolean;
  taskId: string;
  status: string;
  generationMode: string;
  message: string;
}

export interface GenerateParams {
  imageUrls: string[];
  templateId?: string;
  modelId?: string;
  groupId?: string;
  prompt?: string;
  duration?: number;
  aspectRatio?: string;
  quality?: string;
  imageUploadMode?: string;
}

export async function generateVideo(
  params: GenerateParams
): Promise<GenerateResult> {
  const formData = new FormData();

  if (params.templateId) {
    formData.append('template_id', params.templateId);
  }
  if (params.modelId) {
    formData.append('model_id', params.modelId);
  }
  if (params.groupId) {
    formData.append('group_id', params.groupId);
  }
  if (params.prompt) {
    formData.append('prompt', params.prompt);
  }
  if (params.duration) {
    formData.append('duration', String(params.duration));
  }
  if (params.aspectRatio) {
    formData.append('aspect_ratio', params.aspectRatio);
  }
  if (params.quality) {
    formData.append('quality', params.quality);
  }
  if (params.imageUploadMode) {
    formData.append('image_upload_mode', params.imageUploadMode);
  }

  params.imageUrls.forEach((url) => {
    formData.append('image_urls', url);
  });

  formData.append('mode', 'credits');

  return toolApi.post('v2/video/generate', { body: formData }).json();
}

// --- Status Polling ---

export interface VideoOutput {
  id: string;
  status: string;
  progress: number;
  videoUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  format: string | null;
}

export interface TaskStatus {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'deleted';
  progress: number;
  generationMode: string;
  templateId: string | null;
  modelId: string;
  provider: string;
  prompt: string;
  videos: VideoOutput[];
  createdAt: string;
  completedAt: string | null;
}

export interface BatchStatusResponse {
  total: number;
  found: number;
  results: TaskStatus[];
  notFound: string[];
}

export async function getTaskStatus(
  taskIds: string[]
): Promise<BatchStatusResponse> {
  return toolApi
    .post('v2/video/status/batch', { json: { task_ids: taskIds } })
    .json();
}

// --- Video History ---

export interface VideoHistoryResponse {
  total: number;
  page: number;
  size: number;
  results: TaskStatus[];
}

export async function getVideoHistory(
  page: number = 1,
  size: number = 20
): Promise<VideoHistoryResponse> {
  return toolApi
    .get('v2/video/history', { searchParams: { page, size } })
    .json();
}
```

---

## 3. State Management

### 3.1 Auth Store (`src/lib/store/auth-store.ts`)

```typescript
import { create } from 'zustand';
import { User } from '@/lib/api/user-api';
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
    set({ token: null, user: null, isAuthenticated: false });
  },

  hydrate: () => {
    const token = getToken();
    set({ token, isAuthenticated: !!token, isLoading: !token ? false : true });
    // If token exists, caller should fetch /v1/users/me to populate user
  },
}));
```

### 3.2 Create Flow Store (`src/lib/store/create-store.ts`)

```typescript
import { create } from 'zustand';
import { Template } from '@/types/template';

interface CreateState {
  // Step 1: Template selection
  selectedTemplate: Template | null;

  // Step 2: Photo upload
  photoFile: File | null;
  photoCdnUrl: string | null;
  isUploading: boolean;

  // Step 3: Payment + generation
  checkoutSessionId: string | null;
  taskId: string | null;

  // Actions
  selectTemplate: (template: Template) => void;
  setPhoto: (file: File, cdnUrl: string) => void;
  setUploading: (uploading: boolean) => void;
  setCheckoutSession: (sessionId: string) => void;
  setTaskId: (taskId: string) => void;
  reset: () => void;
}

export const useCreateStore = create<CreateState>((set) => ({
  selectedTemplate: null,
  photoFile: null,
  photoCdnUrl: null,
  isUploading: false,
  checkoutSessionId: null,
  taskId: null,

  selectTemplate: (template) => set({ selectedTemplate: template }),
  setPhoto: (file, cdnUrl) => set({ photoFile: file, photoCdnUrl: cdnUrl, isUploading: false }),
  setUploading: (uploading) => set({ isUploading: uploading }),
  setCheckoutSession: (sessionId) => set({ checkoutSessionId: sessionId }),
  setTaskId: (taskId) => set({ taskId }),
  reset: () =>
    set({
      selectedTemplate: null,
      photoFile: null,
      photoCdnUrl: null,
      isUploading: false,
      checkoutSessionId: null,
      taskId: null,
    }),
}));
```

---

## 4. Types

### 4.1 Template Type (`src/types/template.ts`)

```typescript
export interface Template {
  id: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  previewVideoUrl: string;
  duration: number;            // seconds
  aspectRatio: string;         // "9:16" for vertical dance videos
  quality: string;             // "1080p"
  modelId: string;             // e.g. "seedance-1-5-pro-251215"
  groupId: string;             // e.g. "byte-seedance"
  imageUploadMode: string;     // "single"
  prompt: string;              // Generation prompt
  creditCost: number;          // 450
  tags: string[];              // ["hip-hop", "trending"]
}
```

### 4.2 Template Data (`src/data/templates.json`)

```json
[
  {
    "id": "dance-001",
    "name": "Hip Hop Groove",
    "description": "Trending hip hop dance moves",
    "thumbnailUrl": "https://cdn.elser.ai/templates/dance-001/thumb.jpg",
    "previewVideoUrl": "https://cdn.elser.ai/templates/dance-001/preview.mp4",
    "duration": 8,
    "aspectRatio": "9:16",
    "quality": "1080p",
    "modelId": "seedance-1-5-pro-251215",
    "groupId": "byte-seedance",
    "imageUploadMode": "single",
    "prompt": "A person performing trending hip hop dance moves, smooth motion, professional lighting",
    "creditCost": 450,
    "tags": ["hip-hop", "trending"]
  }
]
```

---

## 5. Page Specifications

### 5.1 Landing Page (`/`)

**Route:** `src/app/page.tsx`
**Auth Required:** No
**Bottom Nav:** Hidden

**Layout (mobile, 375px):**
```
┌─────────────────────┐
│                     │
│   [Hero Video       │
│    auto-play        │
│    muted, loop]     │
│                     │
├─────────────────────┤
│                     │
│  Create Your Own    │
│  Dance Video        │
│  in 1 Minute        │
│                     │
│  Only $2.99         │
│                     │
│ ┌─────────────────┐ │
│ │  Get Started →   │ │
│ └─────────────────┘ │
│                     │
├─────────────────────┤
│  How It Works       │
│                     │
│  1. Pick a dance    │
│  2. Upload selfie   │
│  3. Get your video  │
│                     │
├─────────────────────┤
│  [Sample Result 1]  │
│  [Sample Result 2]  │
│  [Sample Result 3]  │
│                     │
└─────────────────────┘
```

**Behavior:**
- Hero video: `<video autoPlay muted loop playsInline poster="poster.jpg">`
- "Get Started" → check auth → if logged in, go to `/templates`; else go to `/login`
- Sample results: horizontal scroll carousel of 3-4 before/after comparisons

---

### 5.2 Login Page (`/login`)

**Route:** `src/app/login/page.tsx`
**Auth Required:** No (redirect to /templates if already logged in)
**Bottom Nav:** Hidden

**Layout:**
```
┌─────────────────────┐
│       ← Back        │
│                     │
│   [App Logo]        │
│                     │
│  Sign in to         │
│  Dance Like Me      │
│                     │
│ ┌─────────────────┐ │
│ │ G Continue with  │ │
│ │   Google         │ │
│ └─────────────────┘ │
│                     │
│  ──── or ────       │
│                     │
│  Email              │
│ ┌─────────────────┐ │
│ │ you@email.com   │ │
│ └─────────────────┘ │
│                     │
│ ┌─────────────────┐ │
│ │  Send Code       │ │
│ └─────────────────┘ │
│                     │
│  By continuing you  │
│  agree to Terms &   │
│  Privacy Policy     │
│                     │
└─────────────────────┘
```

**Email OTP Flow:**
1. User enters email → tap "Send Code"
2. Call `POST /v1/auth/sign-in { email }`
3. On success (204) → navigate to `/login/verify?email=xxx`
4. On error `SIGNIN_EMAIL_SENT` → show "Code already sent, check your email"

**Google OAuth Flow:**
1. User taps "Continue with Google"
2. Call `GET /v1/auth/google/sign-in` → get `redirectUrl`
3. `window.location.href = redirectUrl`
4. Google redirects back to `/auth/google/callback?code=xxx`
5. Call `POST /v1/auth/google/verify-code { code }`
6. Store JWT → fetch user → redirect to `/templates`

---

### 5.3 OTP Verification Page (`/login/verify`)

**Route:** `src/app/login/verify/page.tsx`
**Query Params:** `?email=user@email.com`

**Layout:**
```
┌─────────────────────┐
│       ← Back        │
│                     │
│  Enter the code     │
│  sent to            │
│  user@email.com     │
│                     │
│  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐
│  │  ││  ││  ││  ││  ││  │
│  └──┘└──┘└──┘└──┘└──┘└──┘
│     6-digit OTP     │
│                     │
│ ┌─────────────────┐ │
│ │     Verify       │ │
│ └─────────────────┘ │
│                     │
│  Didn't get code?   │
│  Resend (30s)       │
│                     │
└─────────────────────┘
```

**Behavior:**
1. Auto-focus first digit input
2. Auto-advance on digit entry, auto-submit when 6 digits entered
3. Call `POST /v1/auth/verify-code { email, code }`
4. On success → store JWT (`accessToken`) → fetch `/v1/users/me` → redirect to `/templates`
5. On error `OTP_CODE_INVALID` → shake animation + "Invalid code"
6. On error `OTP_CODE_EXPIRED` → show "Code expired" + resend button
7. Resend: call `POST /v1/auth/sign-in` again, cooldown timer (30s)

---

### 5.4 Template Gallery (`/templates`)

**Route:** `src/app/templates/page.tsx`
**Auth Required:** Yes
**Bottom Nav:** Visible (Home tab active)

**Layout:**
```
┌─────────────────────┐
│  Choose Your Dance   │
│                     │
│ ┌──────┐ ┌──────┐  │
│ │▶     │ │▶     │  │
│ │      │ │      │  │
│ │      │ │      │  │
│ │ Name │ │ Name │  │
│ │ 8s   │ │ 10s  │  │
│ └──────┘ └──────┘  │
│ ┌──────┐ ┌──────┐  │
│ │▶     │ │▶     │  │
│ │      │ │      │  │
│ │      │ │      │  │
│ │ Name │ │ Name │  │
│ │ 6s   │ │ 12s  │  │
│ └──────┘ └──────┘  │
│         ...         │
│                     │
├─────────────────────┤
│ [Home] [Videos] [Me]│
└─────────────────────┘
```

**Behavior:**
- Load templates from `src/data/templates.json` (static import)
- 2-column grid, aspect ratio 9:16 thumbnails
- Tap card → video preview plays inline (muted)
- Tap again or tap "Use This" overlay → navigate to `/create?templateId=dance-001`
- Store selected template in `useCreateStore`

**Component: TemplateCard**
```
Props:
  - template: Template
  - onSelect: (template: Template) => void

State:
  - isPlaying: boolean (toggle video preview)

Render:
  - If !isPlaying: show thumbnail image with ▶ overlay
  - If isPlaying: show <video> with "Use This Dance" overlay button
```

---

### 5.5 Create Page — Upload & Pay (`/create`)

**Route:** `src/app/create/page.tsx`
**Query Params:** `?templateId=dance-001`
**Auth Required:** Yes
**Bottom Nav:** Hidden

**Layout:**
```
┌─────────────────────┐
│       ← Back        │
│                     │
│  ┌────────────────┐ │
│  │ Template Preview│ │
│  │ [video thumb]   │ │
│  │ Hip Hop Groove  │ │
│  │ 8s • 1080p      │ │
│  └────────────────┘ │
│                     │
│  Upload Your Photo  │
│                     │
│  ┌────────────────┐ │
│  │                │ │
│  │   📷 Tap to    │ │
│  │   upload photo │ │
│  │                │ │
│  └────────────────┘ │
│                     │  ← Before upload
│  OR                 │
│                     │
│  ┌────────────────┐ │
│  │  [User Photo]  │ │
│  │                │ │
│  │   ↻ Change     │ │
│  └────────────────┘ │
│                     │  ← After upload
│ ┌─────────────────┐ │
│ │ Pay $2.99 &     │ │
│ │ Create Video    │ │
│ └─────────────────┘ │
│                     │
└─────────────────────┘
```

**Upload Flow:**
1. User taps upload area → `<input type="file" accept="image/jpeg,image/png,image/webp" capture="user">`
2. Client-side validation:
   - File type: jpeg, png, webp only
   - File size: max 10MB
   - Show error toast if invalid
3. Show local preview immediately (`URL.createObjectURL`)
4. Upload to S3 in background:
   ```
   POST /v1/s3/upload/single
   FormData: { file, user_id, category: "images", track_id: crypto.randomUUID() }
   ```
5. Store `cdnUrl` in create-store
6. Enable "Pay $2.99" button

**Payment Flow:**
1. User taps "Pay $2.99 & Create Video"
2. Track event: `payment_start`
3. Save `{ templateId, photoCdnUrl }` to localStorage (survive redirect)
4. Call `POST /v1/stripe/checkout { priceLookupKey: "h5_dance_single", locale: "en" }`
5. Redirect to `response.redirectUrl` (Stripe Checkout hosted page)
6. Stripe success redirects to: `/create?session_id={CHECKOUT_SESSION_ID}`
7. On return with `session_id`:
   a. Call `POST /v1/stripe/success/{session_id}` → confirms credits granted
   b. Track event: `payment_complete`
   c. Retrieve `{ templateId, photoCdnUrl }` from localStorage
   d. Call `POST /v2/video/generate` with template params + photo URL
   e. Get `taskId` from response
   f. Navigate to `/create/{taskId}`
   g. Clear localStorage temp data

**Edge Cases:**
- Stripe cancel → redirect to `/create?canceled=true` → show toast "Payment canceled"
- Stripe success but generation fails → show error + "Credits have been refunded"
- Browser closed after payment but before generation → user has credits, can generate manually (or handle via webhook)

---

### 5.6 Generation Progress (`/create/[taskId]`)

**Route:** `src/app/create/[taskId]/page.tsx`
**Auth Required:** Yes
**Bottom Nav:** Hidden

**Layout — Generating:**
```
┌─────────────────────┐
│                     │
│                     │
│     [Dancing        │
│      Animation]     │
│                     │
│  Creating your      │
│  dance video...     │
│                     │
│  ████████░░ 75%     │
│                     │
│  Usually takes      │
│  about 1 minute     │
│                     │
│  You can leave —    │
│  find it in         │
│  My Videos          │
│                     │
│                     │
└─────────────────────┘
```

**Layout — Completed:**
```
┌─────────────────────┐
│                     │
│  ┌────────────────┐ │
│  │                │ │
│  │  [Generated    │ │
│  │   Video        │ │
│  │   Player]      │ │
│  │                │ │
│  └────────────────┘ │
│                     │
│  Your video is      │
│  ready! 🎉         │
│                     │
│ ┌─────────────────┐ │
│ │  ↓ Download     │ │
│ └─────────────────┘ │
│                     │
│ ┌─────────────────┐ │
│ │  Create Another │ │
│ └─────────────────┘ │
│                     │
└─────────────────────┘
```

**Layout — Failed:**
```
┌─────────────────────┐
│                     │
│      ⚠️             │
│                     │
│  Generation failed  │
│                     │
│  Don't worry —      │
│  your credits have  │
│  been refunded.     │
│                     │
│ ┌─────────────────┐ │
│ │  Try Again      │ │
│ └─────────────────┘ │
│                     │
│  Contact support:   │
│  support@elser.ai   │
│                     │
└─────────────────────┘
```

**Polling Logic (`usePolling` hook):**
```typescript
function usePolling(taskId: string) {
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 5 min at 5s intervals

    async function poll() {
      try {
        const res = await getTaskStatus([taskId]);
        const task = res.results[0];

        if (!task) {
          setError('Task not found');
          return;
        }

        setStatus(task);

        if (task.status === 'completed') {
          trackEvent('video_ready');
          return; // Stop polling
        }

        if (task.status === 'failed') {
          setError('Generation failed');
          return; // Stop polling
        }

        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
          setError('timeout');
          return;
        }

        timeoutId = setTimeout(poll, 5000);
      } catch {
        timeoutId = setTimeout(poll, 10000); // Retry with longer interval
      }
    }

    poll();
    return () => clearTimeout(timeoutId);
  }, [taskId]);

  return { status, error };
}
```

**Download:**
```typescript
function handleDownload(videoUrl: string, templateName: string) {
  const a = document.createElement('a');
  a.href = videoUrl;
  a.download = `dance-like-me-${templateName}.mp4`;
  a.click();
  trackEvent('video_download');
}
```

---

### 5.7 My Videos (`/my-videos`)

**Route:** `src/app/my-videos/page.tsx`
**Auth Required:** Yes
**Bottom Nav:** Visible (Videos tab active)

**Layout:**
```
┌─────────────────────┐
│  My Videos           │
│                     │
│ ┌─────────────────┐ │
│ │ [Thumbnail]     │ │
│ │ Hip Hop Groove  │ │
│ │ Apr 8 • Ready ✓ │ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ [Thumbnail]     │ │
│ │ K-Pop Moves     │ │
│ │ Apr 7 • ◌ Gen...│ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ [Thumbnail]     │ │
│ │ Street Style    │ │
│ │ Apr 6 • ✗ Failed│ │
│ └─────────────────┘ │
│                     │
│    Load more ↓      │
│                     │
├─────────────────────┤
│ [Home] [Videos] [Me]│
└─────────────────────┘
```

**Empty State:**
```
┌─────────────────────┐
│  My Videos           │
│                     │
│                     │
│    🎬               │
│                     │
│  No videos yet      │
│                     │
│  Create your first  │
│  dance video!       │
│                     │
│ ┌─────────────────┐ │
│ │  Browse Dances  │ │
│ └─────────────────┘ │
│                     │
├─────────────────────┤
│ [Home] [Videos] [Me]│
└─────────────────────┘
```

**Behavior:**
- Fetch `GET /v2/video/history?page=1&size=20`
- Infinite scroll: load next page when scrolled to bottom
- Tap a "Ready" video → navigate to `/create/{taskId}` (reuse progress page in completed state)
- Tap a "Generating" video → navigate to `/create/{taskId}` (shows live progress)
- Status badge colors: Generating = blue pulse, Ready = green, Failed = red

---

### 5.8 Profile (`/profile`)

**Route:** `src/app/profile/page.tsx`
**Auth Required:** Yes
**Bottom Nav:** Visible (Me tab active)

**Layout:**
```
┌─────────────────────┐
│  Profile             │
│                     │
│  ┌────────────────┐ │
│  │ 👤  user@e.com │ │
│  │                │ │
│  │ Credits: 0     │ │
│  └────────────────┘ │
│                     │
│  ┌────────────────┐ │
│  │ Terms of Use   │ │
│  │ Privacy Policy │ │
│  │ Contact Us     │ │
│  └────────────────┘ │
│                     │
│ ┌─────────────────┐ │
│ │    Log Out      │ │
│ └─────────────────┘ │
│                     │
│  v1.0.0             │
│                     │
├─────────────────────┤
│ [Home] [Videos] [Me]│
└─────────────────────┘
```

**Behavior:**
- User info from auth store (already fetched)
- Credits: sum `currentBalance` from `GET /v1/credits`
- Logout: clear token + store → redirect to `/`

---

## 6. Components Specification

### 6.1 BottomNav

```
Props: none (reads route from usePathname)

Tabs:
  - Home:   icon=Home,   href=/templates,  label="Home"
  - Videos: icon=Video,  href=/my-videos,  label="My Videos"
  - Me:     icon=User,   href=/profile,    label="Me"

Visibility:
  - Show on: /templates, /my-videos, /profile
  - Hide on: /, /login, /login/verify, /auth/*, /create, /create/*

Style:
  - Fixed bottom, h-16, bg-white, border-t
  - Safe area padding (env(safe-area-inset-bottom))
  - Active tab: primary color, inactive: gray-400
```

### 6.2 AuthGuard

```
Props:
  - children: ReactNode

Behavior:
  - On mount: check token exists in auth store
  - If no token: redirect to /login?redirect={currentPath}
  - If token but no user: fetch GET /v1/users/me
    - On success: set user in store, render children
    - On 401: clear token, redirect to /login
  - If token + user: render children
  - While loading: show full-screen spinner

Usage:
  Wrap in layout.tsx for route groups that require auth:
  src/app/(authenticated)/layout.tsx → wraps /templates, /create, /my-videos, /profile
```

### 6.3 PhotoUploader

```
Props:
  - onUploadComplete: (cdnUrl: string) => void
  - onError: (message: string) => void

State:
  - previewUrl: string | null (local blob URL)
  - isUploading: boolean
  - uploadProgress: number (0-100, visual only)

Behavior:
  - Tap → open file picker (accept="image/jpeg,image/png,image/webp")
  - Validate file type + size (max 10MB)
  - Show local preview immediately
  - Upload to S3 in background
  - On S3 success → call onUploadComplete(cdnUrl)
  - On S3 error → call onError, allow retry
  - "Change photo" button visible after upload

Style:
  - Dashed border upload area (h-64, rounded-2xl)
  - Upload state: overlay with spinner + progress %
  - Uploaded state: photo preview fills the area
```

### 6.4 OTPInput

```
Props:
  - length: number (6)
  - onComplete: (code: string) => void

Behavior:
  - 6 individual input boxes
  - Auto-focus first box on mount
  - Auto-advance cursor on digit entry
  - Backspace moves to previous box
  - Paste support: distribute pasted string across boxes
  - Call onComplete when all 6 digits entered
  - Support mobile numeric keyboard (inputMode="numeric")

Style:
  - Each box: w-12 h-14, text-2xl, text-center, border, rounded-lg
  - Focus: border-primary ring-2
  - Error state: border-red-500, shake animation
```

### 6.5 Toast

```
Global toast system using a store or context.

API:
  toast.success(message: string)
  toast.error(message: string)
  toast.info(message: string)

Behavior:
  - Appears at top of screen, below status bar
  - Auto-dismiss after 3 seconds
  - Swipe up to dismiss
  - Stack max 3 toasts

Style:
  - Rounded-full pill shape
  - Success: green bg, Error: red bg, Info: gray bg
  - Text white, text-sm
```

---

## 7. Analytics Events

### 7.1 Event Definitions

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `page_view` | Every page navigation | `{ page, referrer }` |
| `sign_up` | First-time user login completes | `{ method: "google" \| "email" }` |
| `login` | Returning user login completes | `{ method: "google" \| "email" }` |
| `template_select` | User taps a template card | `{ templateId, templateName }` |
| `upload_photo` | Photo uploaded to S3 successfully | `{ templateId }` |
| `payment_start` | User taps "Pay $2.99" button | `{ templateId, amount: 2.99 }` |
| `payment_complete` | Stripe checkout success confirmed | `{ templateId, amount: 2.99, sessionId }` |
| `payment_cancel` | User returns from Stripe without paying | `{ templateId }` |
| `generation_start` | Video generation API called | `{ templateId, taskId }` |
| `video_ready` | Polling detects completed status | `{ templateId, taskId, durationSec }` |
| `video_failed` | Polling detects failed status | `{ templateId, taskId, errorCode }` |
| `video_download` | User taps download button | `{ taskId }` |

### 7.2 TikTok Pixel Events

Map to TikTok standard events for ad optimization:

| Our Event | TikTok Pixel Event |
|-----------|-------------------|
| `page_view` | `PageView` |
| `sign_up` | `CompleteRegistration` |
| `payment_start` | `InitiateCheckout` |
| `payment_complete` | `CompletePayment` (value: 2.99, currency: USD) |
| `video_download` | `Download` |

---

## 8. Performance Requirements

| Metric | Target | Strategy |
|--------|--------|----------|
| LCP (Largest Contentful Paint) | < 2.5s | Poster image for hero video, next/image for thumbnails |
| FID (First Input Delay) | < 100ms | Minimal client-side JS, code splitting |
| CLS (Cumulative Layout Shift) | < 0.1 | Fixed dimensions for video/image containers |
| JS Bundle Size | < 150KB gzipped | Tree-shaking, dynamic imports for Stripe.js |
| Time to Interactive | < 3s on 4G | SSR for landing page, client components where needed |

**Optimization Strategies:**
- Landing page: Server Component (static), hero video loaded lazily
- Template gallery: Static JSON import, images via next/image with CDN
- Stripe.js: Dynamic import only when user reaches payment step
- Video previews: Intersection Observer to load/play only visible videos

---

## 9. Error Handling Matrix

| Scenario | API Error Code | User Message | Action |
|----------|---------------|--------------|--------|
| OTP invalid | `OTP_CODE_INVALID` | "Invalid code, please try again" | Shake OTP input, clear fields |
| OTP expired | `OTP_CODE_EXPIRED` | "Code expired, tap to resend" | Show resend button |
| Google OAuth fail | `GOOGLE_OAUTH_FAILED` | "Google sign-in failed, please try again" | Return to login page |
| Token expired | `TOKEN_INVALID` / `TOKEN_MISSING` | Auto-redirect | Clear token, redirect to /login |
| User suspended | `USER_SUSPENDED` | "Account suspended, contact support" | Logout + show message |
| Photo too large | Client-side | "Photo must be under 10MB" | Toast error |
| S3 upload fail | Network/500 | "Upload failed, please try again" | Show retry button |
| Stripe checkout fail | Stripe redirect | "Payment was not completed" | Return to create page |
| Credits insufficient | `CREDIT_INSUFFICIENT` | "Payment issue, please try again" | Return to create page |
| Generation failed | Status: `failed` | "Generation failed. Credits refunded." | Show retry + support link |
| Generation timeout | 60 polls (5min) | "Taking longer than expected" | Show support link, keep polling |
| Network offline | - | "You're offline. Check your connection." | Top banner, retry on reconnect |

---

## 10. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| JWT storage | localStorage (acceptable for this use case — no sensitive financial data beyond Stripe) |
| API calls | All via HTTPS. JWT in Authorization header, not URL params |
| Photo upload | Client-side type/size validation + server-side validation by tool-api |
| Stripe payment | Use Stripe Checkout (hosted page) — no card data touches our servers |
| CORS | H5 domain added to user-api's whitelist; tool-api similarly configured |
| XSS | Next.js default escaping; no dangerouslySetInnerHTML usage |
| Payment verification | Credits granted via Stripe webhook (server-to-server), not client-side |

---

## 11. Mobile-Specific Considerations

| Issue | Solution |
|-------|----------|
| iOS safe area | `env(safe-area-inset-bottom)` padding on bottom nav |
| iOS video autoplay | `playsinline muted` attributes required |
| iOS bounce scroll | `overscroll-behavior: none` on body |
| Viewport | `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">` |
| Camera access | `<input capture="user">` for selfie camera |
| File download | Use `<a download>` or Blob URL for video download |
| Keyboard push | `visualViewport` API to handle keyboard pushing layout |
| 300ms tap delay | Already handled by modern browsers, no polyfill needed |
