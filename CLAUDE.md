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

No test suite exists.

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
