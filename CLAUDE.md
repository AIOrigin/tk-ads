# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

**tk-ads** ("Dance Like Me") is a mobile-first H5 web app for AI-powered dance video generation. Users upload a selfie, choose a dance template, pay $2.99 via Stripe, and receive a generated video of their face performing the dance. Traffic comes from TikTok ads.

## Commands

```bash
npm run dev        # Next.js dev server on :3000
npm run build      # Production build
npm run start      # Production server
npm run lint       # ESLint (flat config, Next.js core-web-vitals + TypeScript)
```

No test runner is configured.

## Tech Stack

- **Next.js 16.2.2** (App Router) / React 19 / TypeScript 5
- **Tailwind CSS 4** via `@tailwindcss/postcss`
- **Zustand** for client state (`src/lib/store/`)
- **Ky** as HTTP client (`src/lib/api/client.ts`)
- **Stripe** (server-side SDK) for payments

## Architecture

### Page Flow

```
Landing (/)  →  Login (/login → /login/verify)  →  Landing (select dance + upload photo)
     ↓                                                        ↓
  My Videos gallery                                   Pay $2.99 (Stripe Checkout)
                                                               ↓
                                                      Redirect back with session_id
                                                               ↓
                                                      POST /api/generate (validates payment, calls tool-api)
                                                               ↓
                                                      /create/[taskId] (polls until video ready)
```

### Server-Side API Routes (`src/app/api/`)

| Route | Purpose |
|-------|---------|
| `POST /api/checkout` | Creates Stripe checkout session with user/template metadata |
| `GET /api/checkout-session` | Retrieves Stripe session status (used after redirect) |
| `POST /api/generate` | **Paid path**: validates Stripe payment, grants credits to user-api, forwards photo + template to tool-api, stores taskId in Stripe metadata |
| `POST /api/generate-free` | **Credits path**: skips Stripe, calls tool-api directly (tool-api deducts user's existing credits) |
| `POST /api/tt-event` | Forwards client-side analytics events to TikTok Events API server-side (ViewContent, CompleteRegistration, Download) |

**Two generation paths**: Paid (`/api/generate`) requires a Stripe checkout session and grants just-in-time credits before calling tool-api. Free (`/api/generate-free`) relies on user's existing credit balance — tool-api returns 402 if insufficient.

**Generation idempotency** (paid path): an in-memory `Set<string>` tracks used session IDs. Stripe metadata (`taskId`, `generationStatus`, `creditsGranted`) guards against duplicate generation and double credit grants across restarts.

### Client API Layer (`src/lib/api/`)

- `client.ts` — Creates Ky instances for `userApi` and `toolApi` with auto bearer-token injection and 401→login redirect
- `user-api.ts` — Auth endpoints (OTP sign-in, verify, Google OAuth, `/users/me`)
- `tool-api.ts` — Video generation (`/v2/motion-control/generate`) and batch status polling (`/v2/video/status/batch`)

### State Management

| Store | Location | Purpose |
|-------|----------|---------|
| `useAuthStore` | `src/lib/store/auth-store.ts` | User/token/isAuthenticated; hydrates from localStorage |
| `useCreateStore` | `src/lib/store/create-store.ts` | Selected dance template for creation flow |

### Persistence

- **localStorage**: Auth token (`dance_auth_token`), pending template/session/task IDs, "My Videos" list (max 20)
- **IndexedDB** (`dance_photo_db`): Stores uploaded photo file so it survives Stripe redirect

Key prefixes are in `src/lib/funnel.ts`.

### External Services

| Service | Used For | Env Var |
|---------|----------|---------|
| user-api (Elser) | Auth (OTP, Google OAuth), user info | `NEXT_PUBLIC_USER_API_BASE_URL` |
| tool-api (Elser) | Video generation, task status polling | `NEXT_PUBLIC_TOOL_API_BASE_URL`, `TOOL_API_INTERNAL_URL` (server-side) |
| Stripe | $2.99 per-video payment | `STRIPE_SECRET_KEY` |

### Analytics (`src/lib/analytics.ts`)

Triple-fires events to Google Analytics (gtag), TikTok Pixel, and Meta Pixel (client-side). For attribution-critical events, TikTok also gets server-side Events API calls (deduped via shared `event_id`):

- **Client-only**: GA fires for all events. TikTok Pixel and Meta Pixel fire client-side.
- **Client + Server**: `view_content`, `sign_up`, `video_download` also fire via `POST /api/tt-event`. `payment_complete` fires server-side inline from `/api/generate`. `payment_start` fires server-side inline from `/api/checkout`.
- Event name mapping: internal names (e.g. `payment_complete`) → TikTok standard events (`Purchase`) → Meta standard events (`Purchase`). See `TT_EVENT_MAP` and `META_EVENT_MAP` in analytics.ts.

## Key Patterns

- **Mobile-first**: All UI is vertical/touch-optimized. Landing page uses a custom bottom-sheet with touch-drag dismiss.
- **Funnel recovery**: State is persisted before Stripe redirect and restored on return. Photo goes to IndexedDB, template/session IDs to localStorage.
- **Task polling**: `usePolling` hook polls tool-api at 5s intervals, max 150 attempts (~12.5 min). Constants in `src/lib/constants.ts`.
- **Dance templates**: Static data in `src/data/templates.json` with video preview URLs, mode, orientation, and duration metadata.
- **Path alias**: `@/*` maps to `./src/*`.

### Server-Side Helpers (`src/lib/server/`)

- `current-user.ts` — Validates JWT against user-api's `/v1/users/me`; used by all API routes for auth.
- `tiktok-events.ts` — Non-blocking fire-and-forget to TikTok Events API v1.3. Hashes PII (email, external_id) with SHA-256 before sending.

## Environment Variables

```bash
# Frontend (NEXT_PUBLIC_*)
NEXT_PUBLIC_USER_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_TOOL_API_BASE_URL=http://localhost:8001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXX     # Google Analytics

# Server-side
STRIPE_SECRET_KEY=sk_test_...
TOOL_API_INTERNAL_URL=    # Optional; falls back to NEXT_PUBLIC_TOOL_API_BASE_URL
USER_API_INTERNAL_URL=    # Optional; falls back to NEXT_PUBLIC_USER_API_BASE_URL
USER_API_INTERNAL_KEY=    # X-API-Key for user-api internal endpoints (credit grants)
TIKTOK_ACCESS_TOKEN=      # TikTok Events API access token (server-side tracking)
```
