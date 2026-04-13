# PRD: TK Dance Video H5 — "Dance Like Me"

## Self-Clarification

1. **Problem/Goal:** TikTok dance videos are getting high engagement. We want to monetize this traffic by directing users to an H5 page where they can pay $2.99 to create their own version of a viral dance video using AI. Leverages existing elser-user-api (auth + credits) and elser-tool-api (upload + generation).
2. **Core Functionality:** (1) Browse and select a dance template, (2) Upload a photo and pay $2.99, (3) Receive an AI-generated dance video featuring the user's face.
3. **Scope/Boundaries:** No subscription model, no video editing tools, no social features. Auth, credits, upload, and video generation APIs already exist — we only build the H5 frontend + orchestration layer.
4. **Success Criteria:** A user arriving from TikTok can complete the full flow (sign up → pick template → upload photo → pay → receive video) in under 3 minutes (excluding generation time).
5. **Constraints:** Mobile-first (nearly 100% TikTok traffic is mobile). Overseas market, English UI. Generation cost is ~$0.80/use, priced at $2.99 for ~60% gross margin after Stripe fees.

---

## Introduction

"Dance Like Me" is a mobile-first H5 web app that lets users create AI-generated dance videos featuring their own face. Users discover the product through TikTok ads or bio links, choose from pre-set dance templates, upload a selfie, pay $2.99 via Stripe, and receive a generated video in approximately 1 minute.

The product leverages existing backend services:
- **elser-user-api**: Authentication (Google OAuth + Email OTP), credits system, Stripe checkout
- **elser-tool-api**: S3 photo upload, video generation, task status polling, task history

This PRD covers the H5 frontend application and the orchestration of existing APIs.

---

## Business Model

```
Pricing: $2.99 per video generation
Credits: $2.99 = 450 credits (H5-specific Stripe Price)
Cost per generation: 450 credits = ~$0.80 actual cost

Revenue per transaction:
  $2.99 - $0.80 (generation) - $0.39 (Stripe: $0.30 + 2.9%) = $1.80 gross profit (60%)
```

**Payment Flow (leveraging existing credits system):**
```
User clicks "Pay $2.99"
  → POST /v1/stripe/checkout (priceLookupKey: "h5_dance_single")
  → Stripe Checkout ($2.99)
  → Webhook: checkout.session.completed
  → 450 credits granted (source: H5_RECHARGE)
  → Frontend calls POST /v2/video/generate (mode: "credits")
  → 450 credits consumed automatically
  → Video generation starts
```

---

## Goals

- Convert TikTok traffic into paying users with a frictionless mobile-first flow
- Achieve end-to-end flow completion (landing → download) in under 3 minutes + generation time
- Support 13 initial dance templates with an easily extensible template system
- Maintain per-transaction gross margin ~60% at $2.99 price point

---

## Pages & User Flow

```
Landing Page (/):
  Hero video + CTA → Sign Up / Log In
       ↓
Template Gallery (/templates):
  Browse 13+ dance templates (video previews)
  Select one → Continue
       ↓
Upload & Pay (/create):
  Upload selfie photo → S3
  Preview photo + selected template
  "Pay $2.99 & Create" button → Stripe Checkout
       ↓
Generating (/create/[taskId]):
  Progress animation (~1 min)
  User can leave — video saved to "My Videos"
       ↓
My Videos (/my-videos):
  List of all generated videos (from /v2/video/history)
  Download each video
```

---

## API Integration Map

| Feature | API | Endpoint | Notes |
|---------|-----|----------|-------|
| Email login (OTP) | user-api | POST /v1/auth/sign-in → POST /v1/auth/verify-code | Sends 6-digit code to email |
| Google OAuth | user-api | GET /v1/auth/google/sign-in → POST /v1/auth/google/verify-code | Returns JWT |
| Get user info | user-api | GET /v1/users/me | Returns user + dailyCredit status |
| Get credits balance | user-api | GET /v1/credits | Active credits list |
| Stripe checkout | user-api | POST /v1/stripe/checkout | priceLookupKey: "h5_dance_single" |
| Stripe success | user-api | POST /v1/stripe/success/{session_id} | Confirms credit grant |
| Stripe webhook | user-api | POST /v1/stripe/webhook | Handles checkout.session.completed |
| Upload photo | tool-api | POST /v1/s3/upload/single | Returns cdn_url |
| Generate video | tool-api | POST /v2/video/generate | multipart/form-data, returns task_id |
| Poll status | tool-api | POST /v2/video/status/batch | Batch query by task_ids |
| Video history | tool-api | GET /v2/video/history | Paginated, newest first |

---

## Tasks

### T-001: Project Setup & Scaffolding
**Description:** Initialize Next.js project with TypeScript, Tailwind CSS, mobile-first layout, and deployment config for Vercel.

**Acceptance Criteria:**
- [ ] Next.js 14+ app router project with TypeScript
- [ ] Tailwind CSS configured with mobile-first breakpoints
- [ ] Base layout component with mobile viewport meta tags
- [ ] Vercel deployment config (vercel.json if needed)
- [ ] Environment variable structure (.env.example) for: USER_API_BASE_URL, TOOL_API_BASE_URL, STRIPE_PUBLISHABLE_KEY, GOOGLE_ANALYTICS_ID, TIKTOK_PIXEL_ID
- [ ] API client utility with JWT auth header injection
- [ ] Project runs locally with `npm run dev`

---

### T-002: Auth Integration (Google + Email OTP)
**Description:** Integrate with elser-user-api for authentication. Support Google OAuth and email OTP login. Store JWT for subsequent API calls.

**Acceptance Criteria:**
- [ ] Login page with Google sign-in button and email input form
- [ ] Email OTP flow: enter email → receive 6-digit code → verify code → get JWT
- [ ] Google OAuth flow: redirect to Google → callback with code → verify with API → get JWT
- [ ] JWT stored in httpOnly cookie or localStorage
- [ ] Auth context/provider wraps the app, exposes user state (from GET /v1/users/me)
- [ ] Protected routes redirect to login if unauthenticated
- [ ] Logout functionality clears token and redirects to landing
- [ ] Verify in browser: full login/logout cycle works on mobile viewport

**API Calls:**
- POST /v1/auth/sign-in {email}
- POST /v1/auth/verify-code {email, code}
- GET /v1/auth/google/sign-in → redirect
- POST /v1/auth/google/verify-code {code}
- GET /v1/users/me

---

### T-003: Landing Page
**Description:** Mobile-first landing page that converts TikTok traffic. Show hero dance video, value proposition, and CTA.

**Acceptance Criteria:**
- [ ] Auto-playing muted hero video (loop, inline playback on iOS via playsinline attribute)
- [ ] Clear headline: e.g. "Create Your Own Dance Video in 1 Minute"
- [ ] Subheadline with price: "Only $2.99"
- [ ] "Get Started" CTA button → redirects to /templates (or /login if not authenticated)
- [ ] Sample result videos as social proof
- [ ] Fast loading: hero video lazy-loaded or poster image first
- [ ] Fully responsive, optimized for mobile (375px–428px width)
- [ ] Verify in browser on mobile viewport

---

### T-004: Template Gallery Page
**Description:** Display all available dance templates as a scrollable grid from local JSON config.

**Acceptance Criteria:**
- [ ] Grid layout (2 columns on mobile) showing all templates
- [ ] Each card: thumbnail/short video preview + template name + duration
- [ ] Tapping a card selects it and navigates to /create?templateId=xxx
- [ ] Templates loaded from local JSON config file (src/data/templates.json)
- [ ] Template config structure: { id, name, thumbnailUrl, previewVideoUrl, duration, modelId, groupId, aspectRatio, quality }
- [ ] Loading skeleton while media loads
- [ ] Verify in browser: smooth scrolling, video previews play on tap

---

### T-005: Photo Upload & Preview
**Description:** Upload page where user uploads a selfie photo to S3, previews it alongside the selected template, and proceeds to payment.

**Acceptance Criteria:**
- [ ] Show selected template preview (thumbnail + name) at top
- [ ] Photo upload: tap to open camera/gallery (accept image/*)
- [ ] Client-side validation: file type (jpg/png/webp), max size (10MB)
- [ ] Upload photo to S3 via POST /v1/s3/upload/single, get cdn_url
- [ ] Photo preview after upload with option to re-upload
- [ ] "Pay $2.99 & Create" button (disabled until photo uploaded to S3)
- [ ] Show upload progress indicator
- [ ] Verify in browser: upload works on iOS Safari and Android Chrome

**API Calls:**
- POST /v1/s3/upload/single (multipart: file, user_id, category: "images", track_id)

---

### T-006: Stripe Payment & Video Generation Trigger
**Description:** Integrate with existing Stripe checkout via user-api. After payment success, credits are auto-granted, then trigger video generation.

**Acceptance Criteria:**
- [ ] "Pay $2.99 & Create" calls POST /v1/stripe/checkout with priceLookupKey for H5 dance
- [ ] User redirected to Stripe Checkout page
- [ ] On success redirect: call POST /v1/stripe/success/{session_id} to confirm credits
- [ ] After credits confirmed, call POST /v2/video/generate with:
  - image_urls: [S3 cdn_url from upload]
  - template_id or (model_id + prompt + duration + aspect_ratio + quality from template config)
  - mode: "credits"
- [ ] Store returned task_id, redirect to /create/[taskId]
- [ ] On cancel: return to upload page with message
- [ ] Verify in browser: full payment flow with Stripe test mode

**API Calls:**
- POST /v1/stripe/checkout {priceLookupKey, locale: "en"}
- POST /v1/stripe/success/{checkout_session_id}
- POST /v2/video/generate (multipart)

---

### T-007: Async Video Generation & Progress Page
**Description:** Show progress page while video generates. Poll for completion. Allow user to leave and check back later.

**Acceptance Criteria:**
- [ ] Progress page at /create/[taskId] with animated indicator
- [ ] Poll POST /v2/video/status/batch {task_ids: [taskId]} every 5 seconds
- [ ] Show progress percentage from API response
- [ ] On status "completed": show video preview with download button (video_url from response)
- [ ] On status "failed": show error message + "Credits have been refunded" notice
- [ ] "Go to My Videos" link so user can leave and check later
- [ ] Verify in browser: progress animation smooth on mobile

**API Calls:**
- POST /v2/video/status/batch {task_ids: [taskId]}

---

### T-008: My Videos Page
**Description:** Authenticated page showing all user's generated videos from API history.

**Acceptance Criteria:**
- [ ] Fetch videos from GET /v2/video/history?page=1&size=20
- [ ] List of all user's videos (newest first)
- [ ] Each item: video thumbnail, template name, creation date, status
- [ ] Status badges: "Generating" (animated) / "Ready" / "Failed"
- [ ] Tap "Ready" video → opens video player with download button
- [ ] Download button triggers native file download (video_url from API)
- [ ] Empty state for new users: "No videos yet — create your first one!" with CTA
- [ ] Pagination: load more on scroll
- [ ] Verify in browser on mobile viewport

**API Calls:**
- GET /v2/video/history?page={n}&size=20

---

### T-009: Navigation & Global Layout
**Description:** Bottom tab navigation bar and global layout for authenticated pages.

**Acceptance Criteria:**
- [ ] Bottom navigation bar with 3 tabs: Home (templates) / My Videos / Profile
- [ ] Active tab highlighted
- [ ] Profile tab: shows user email/name (from /v1/users/me), credits balance (from /v1/credits), logout button
- [ ] Navigation bar hidden on landing page and auth pages
- [ ] Smooth page transitions
- [ ] Verify in browser: tabs work correctly, no layout shift

---

### T-010: Error Handling & Edge Cases
**Description:** Handle error states, network failures, and edge cases across the app.

**Acceptance Criteria:**
- [ ] Global error boundary with user-friendly error page
- [ ] API call failures show toast notifications (not crashes)
- [ ] Handle specific error codes: CREDIT_INSUFFICIENT, TOKEN_INVALID, TOKEN_MISSING
- [ ] Payment failure/cancel: user returned to upload page with error message
- [ ] Photo upload failure: clear error message with retry option
- [ ] Generation timeout (>5 min): show "Taking longer than expected" with support contact
- [ ] Generation failed: show "Credits have been refunded" message
- [ ] Verify: test each error state in browser

---

### T-011: SEO, Analytics & Meta Tags
**Description:** Add meta tags for social sharing (OG tags), basic SEO, and analytics tracking.

**Acceptance Criteria:**
- [ ] OG meta tags (title, description, image) for social sharing
- [ ] Favicon and app icons
- [ ] Google Analytics integration via environment variable
- [ ] Track key events: page_view, sign_up, template_select, upload_photo, payment_start, payment_complete, video_ready, video_download
- [ ] TikTok Pixel integration for ad conversion tracking (crucial for measuring TK ad ROI)
- [ ] Verify: OG tags render correctly when sharing URL

---

## Functional Requirements

- FR-1: Users must sign up / log in via Google OAuth or email OTP (6-digit code) before accessing templates
- FR-2: The template gallery must display all available dance templates with video previews, loaded from local JSON config
- FR-3: Users must upload exactly one photo (jpg/png/webp, max 10MB) to S3 per generation
- FR-4: The system must initiate Stripe Checkout for $2.99 USD via existing user-api (POST /v1/stripe/checkout)
- FR-5: After successful payment, 450 credits are granted via existing webhook flow, then video generation is triggered
- FR-6: The system must poll POST /v2/video/status/batch for task status and update the UI accordingly
- FR-7: Users must be able to view all their generated videos via GET /v2/video/history
- FR-8: Users must be able to download completed videos to their device
- FR-9: If video generation fails, credits are automatically refunded by the tool-api (credit transaction revert)
- FR-10: All pages must be fully functional on mobile browsers (iOS Safari, Android Chrome)
- FR-11: Templates are maintained as a local JSON config file, new templates added by updating the JSON

---

## Non-Goals (Out of Scope)

- No subscription or credit-pack billing model (single $2.99 purchase only)
- No video editing or customization tools
- No social features (sharing within the app, comments, likes)
- No in-app video recording
- No admin panel for template management (local JSON config for now)
- No multi-language support (English only for MVP)
- No referral or affiliate program
- No iOS/Android native app
- No custom database — rely entirely on existing API's storage

---

## Technical Considerations

- **Tech Stack:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Vercel
- **Auth:** Integrate with elser-user-api (Google OAuth + Email OTP), JWT token management
- **Credits:** Use existing credits system. Create H5-specific Stripe Price ($2.99 = 450 credits, source: H5_RECHARGE). Credits isolated — only usable for dance video generation
- **Video Generation:** POST /v2/video/generate with template config, async with task_id polling via POST /v2/video/status/batch
- **Photo Upload:** POST /v1/s3/upload/single → get cdn_url → pass as image_urls to generation API
- **Payment:** Existing Stripe integration via POST /v1/stripe/checkout. Need to create a new Stripe Price with lookup key (e.g., "h5_dance_single") for $2.99 one-time payment that grants 450 credits
- **Storage:** All data stored in existing APIs' databases. No new DB needed for H5 frontend.
- **CDN:** Generated videos served from tool-api's CDN URLs
- **Performance:** Target Lighthouse mobile score > 80. Minimize JS bundle. Use next/image for optimized images.
- **CORS:** H5 domain needs to be added to elser-user-api's allowed frontend origins list

---

## Backend Setup Required (Before Frontend Dev)

These items must be configured in existing backend services before the H5 frontend can work:

1. **Create Stripe Price:** New price with lookup_key "h5_dance_single", $2.99 USD, one-time payment, grants 450 credits
2. **Add H5 domain to CORS:** Add H5 production domain to elser-user-api's FRONTEND_ORIGINS whitelist
3. **Credit source type:** Add "H5_RECHARGE" as a valid credit source (if not already supported by existing enum)
4. **Google OAuth redirect:** Register H5 domain as authorized redirect URI in Google Cloud Console

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Landing → Sign Up conversion | > 20% |
| Sign Up → Payment conversion | > 10% |
| Payment → Successful generation | > 95% |
| Page load time (mobile 4G) | < 3 seconds |
| Full flow time (excl. generation) | < 3 minutes |
| Generation success rate | > 95% |
| Gross margin per transaction | > 55% |

---

## Open Questions (Resolved)

1. ~~Photo upload destination~~ → **Upload to S3 via tool-api, pass cdn_url to generation API**
2. ~~Task history API~~ → **Existing tool-api has DB, GET /v2/video/history**
3. ~~Template data source~~ → **Local JSON config in codebase**
4. ~~Stripe account~~ → **Already set up**
5. ~~Generation failure policy~~ → **Auto credit refund via tool-api transaction revert**
6. ~~Pricing~~ → **$2.99/use, ~60% gross margin after costs and Stripe fees**
7. **Photo requirements:** Does the generation API have specific photo requirements (face detection, minimum resolution, orientation)? — *To confirm when testing*
