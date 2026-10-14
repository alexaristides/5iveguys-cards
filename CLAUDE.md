# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # prisma generate + next build
npm run lint         # ESLint
npm run db:push      # Push schema changes to DB (no migration file)
npm run db:studio    # Open Prisma Studio
```

Unit tests: `npm test` (vitest, `lib/**/*.test.ts`).

### iOS app (`mobile/`, Expo SDK 57)

```bash
cd mobile
npx expo run:ios          # build + run the dev build in the Simulator (needs LANG=en_US.UTF-8 for CocoaPods)
npx expo start --dev-client   # Metro only, once the dev build is installed (don't pass --localhost: it binds IPv6 only)
npx tsc --noEmit && npx expo lint
```

`mobile/.env.local` sets `EXPO_PUBLIC_API_URL` (the Next site; `http://localhost:3000` for the Simulator) and the public Pusher key/cluster.

## Architecture

**5iveguysfc Trading Cards** — a fan loyalty app where users earn points by engaging with a YouTube channel, then spend points to open randomised card packs.

### Points → Cards loop

1. User signs in with Google (OAuth, YouTube scope required)
2. User hits **Sync YouTube** → `POST /api/youtube/sync`
   - Checks subscription status (`subscriptions.list`)
   - Fetches all channel videos from uploads playlist
   - Calls `videos.getRating` to find which videos the user has liked
   - Awards points: subscribe = 500 (one-time), early like (within 24h of upload) = 50, regular like = 10
   - Publish timestamps are stored in `VideoMeta` to avoid re-fetching for early-like calculation
3. User spends points on packs → `POST /api/packs/open`
   - Atomic `$transaction`: deduct points, record `PackOpen`, create `UserCard` rows
   - Legend pack guarantees ≥1 epic+ card

### Auth

NextAuth v4 + PrismaAdapter + Google OAuth. The `youtube.force-ssl` scope is mandatory — without it `videos.getRating` is unavailable and sync fails with `reauth_required`. Token refresh is handled automatically in the sync route when `expires_at` is within 60 seconds.

New users receive 100 free starting points (via the `createUser` NextAuth event in `lib/auth.ts`).

### iOS app architecture

- Tabs over the **same API and database** as the website. Channels covered: `CHANNELS` in `mobile/src/lib/config.ts`.
  - Tabs shown: **YouTube · Players · Game** (Game re-added 2026-10-14 with 5IVE STREET). Cards (packs/collection) and Fantasy are held back by `FEATURES` in `mobile/src/lib/config.ts`: each flag hides its tab and guards its stack screens in `src/app/_layout.tsx`, so flipping it to `true` brings the feature back.
  - Players lists one tile per player (`buildSquad` from `lib/motm.ts`, Home Kit card preferred) and opens the card sheet to rate them.
- **Auth:** the app holds the token of a real NextAuth database `Session` row and sends `Authorization: Bearer <token>`. `middleware.ts` rewrites that into the NextAuth session cookie, so every route's `getServerSession()` works unchanged.
  - Google: the app opens `/api/mobile/auth/web-start` in the iOS auth sheet → `/mobile-auth` runs the normal NextAuth Google flow → `/api/mobile/auth/web-finish` redirects to `fiveguys://auth?token=…`. A `link-ticket` lets an Apple user link Google (Connect YouTube).
  - Apple: `/api/mobile/auth/apple` verifies the identity token (needs `APPLE_*` env vars).
  - `DELETE /api/account` deletes the user (App Store requirement).
- Game logic is shared, not copied: the app imports `lib/match-engine.ts`, `lib/football.ts`, `lib/exhibition.ts` etc. via the `@shared/*` alias (see `mobile/metro.config.js`). Keep those files free of Next/Prisma imports.

### 5IVE STREET (3D 3v3 game, `mobile/street/`)

- A three.js game bundled into one HTML page and run in a WebView by `mobile/src/app/play/street.tsx` (landscape via `expo-screen-orientation`; portrait everywhere else through the plugin's `initialOrientation`). Entry: banner on the Game and Players tabs, behind `FEATURES.street`.
- Edit `mobile/street/src/**`, then `npm run build:street` (in `mobile/`) to regenerate `mobile/src/street/html.generated.ts` — the app imports that file, so commit it with the source. `npm run dev:street` (or the `street` entry in `.claude/launch.json`) serves the game at http://localhost:5180 with live rebuilds; card art comes from `public/cards` via a symlink.
- Players are procedural models (`street/src/rig/model.ts`) with the real face cut from each Home Kit card (`look.face` in `street/src/roster.ts` = eye midpoint and chin as fractions of the card image). Add a player there: look, stats, face crop, celebration.
- Stats in `roster.ts` are blended with the fans' votes on each player's Home Kit card (`useStreetRatings` → `window.__STREET__`).
- Balance: in the browser console `__sim(20)` plays 20 headless CPU-vs-CPU matches and reports goals, shots, tackles…; `?autopilot` lets the CPU play both sides on screen. Aim for ~5–7 goals per 3-minute match.

### Key files

| File | Purpose |
|------|---------|
| `lib/auth.ts` | NextAuth config, Google OAuth scopes, new-user points grant |
| `lib/cards.ts` | Card definitions, pack configs, `POINTS_CONFIG`, draw logic |
| `lib/db.ts` | Prisma client singleton |
| `app/api/youtube/sync/route.ts` | Core points engine |
| `app/api/packs/open/route.ts` | Pack opening + card draw |
| `components/PointsActivity.tsx` | Earn Points UI with YouTube channel links |

### Database (PostgreSQL via Prisma)

Key models:
- **User** — `points` (spendable) + `totalEarned` (leaderboard ranking, never decrements)
- **YoutubeSync** — per-user: `isSubscribed`, `likedVideoIds` (JSON array), `earlyLikedVideoIds` (JSON array), `lastSynced`
- **VideoMeta** — channel video publish timestamps, used for early-like window calculation
- **UserCard** — collected cards with `isFavourite`
- **PackOpen** — history of pack opens with card IDs drawn

Schema changes: use `npm run db:push` (no migration files; direct push to DB).

### Pack rarities

| Pack | Cost | Cards | Rarity weights |
|------|------|-------|----------------|
| Starter | 50 pts | 3 | 100% common |
| Team | 150 pts | 3 | 75% common / 20% rare / 5% epic |
| Legend | 400 pts | 5 | 50/25/20/5% + guaranteed epic+ |

### Admin

`GET /api/admin/stats` requires `x-admin-secret` header matching `ADMIN_SECRET` env var.

### Environment variables

```
NEXTAUTH_URL
NEXTAUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
YOUTUBE_CHANNEL_ID          # Channel to track engagement on
DATABASE_URL                # PostgreSQL
GOOGLE_SITE_VERIFICATION    # Hardcoded in layout.tsx — update there, not env
ADMIN_SECRET                # Optional, gates /api/admin/stats
```
