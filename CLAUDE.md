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
- Edit `mobile/street/src/**`, then `npm run build:street` (in `mobile/`) to regenerate `mobile/src/street/html.generated.ts` (the app imports it) and `public/street/index.html` (the website serves it at `/street` via a rewrite in `next.config.ts`; link to it with a plain `<a>`, not `<Link>`). Commit both with the source. On the website the game fetches fan ratings from the site's own API. `npm run dev:street` (or the `street` entry in `.claude/launch.json`) serves the game at http://localhost:5180 with live rebuilds; card art comes from `public/cards` via a symlink.
- Players are procedural models (`street/src/rig/model.ts`) with the real face cut from each Home Kit card (`look.face` in `street/src/roster.ts` = eye midpoint and chin as fractions of the card image; `tilt` levels a tilted head, `w` < 1 narrows the mask for a face turned aside). All 16 Home Kit players are in `ROSTER`; add a player there: look, stats (seeded from the card's attribute and position), face crop, celebration. Check crops with `?faces` (e.g. `?faces&p=milo,theo`), which draws each head close up instead of the game.
- Team select is a scrollable line-up of the whole squad: you pick 3 for your side and 3 for the CPU (the rest sit out and are hidden during the match).
- Stats in `roster.ts` are blended with the fans' votes on each player's Home Kit card (`useStreetRatings` → `window.__STREET__`). Every stat drives play (through `rate()` in `game/player.ts`): pace = sprint speed, burst and braking; dribbling = cornering grip, speed on the ball, how far away they can take the ball (`controlReach`) and play it (`touchReach`), first touch, tight touches and keeping it under a sprint, beating tackles/pokes, tricks; shooting = corner placement, accuracy, power, curl; passing = accuracy, pace, leading the runner, how much a pass bends onto its man, the CPU's choice of pass; defending = tackles, pokes, reading passes, reacting to shots; physical = stamina, shielding, strength in challenges and bumps.
- The cage is 34 × 20 m with 3.9 m goals (`game/field.ts`). Physics (`game/ball.ts`, `game/match.ts`, `game/player.ts`):
  - The ball has spin: sidespin curls it, topspin dips it, backspin floats it (Magnus), with air drag, and bounces and rolls with friction that trades spin for speed (`contact`, `flight`). Kicks go through `aimKick`, which finds the strike that lands the ball on a spot at a given moment with that spin: placed shots start outside the post and curl in, hard ones dip, chips go over the man (2.6 m peak) with backspin. Ground passes are rolled to arrive at an easy pace (`rollSpeedFor`/`rollTime` use the same rolling model) and `passAssist` bends a pass gently onto its receiver. The ball hits bodies it can't be controlled by (the knocked down, the beaten, heads), and a sprinting carrier's big knock-on can hit a defender's legs.
  - Dribbling is touch by touch (`dribble`/`touch`): each touch knocks the ball to where `Player.predict` says they'll be a little later, so it rolls ahead and they run onto it — little and often when running, bigger knocks flat out; turning or reversing takes it with them at once (drag-back); stood still, mid-trick or striking it, it's glued to the boot (`glueBall`). If it gets ~2 m away it's loose (`heavyTouches`).
  - Running isn't skating: `Player.locomote` turns the run's heading only as fast as grip allows at that speed, eases off into tight turns, plants and brakes for anything sharper than ~110°; bodies lean into turns. Players who run into each other bump (momentum shared by physical).
  - Receiving: a pass's receiver goes to meet it (a stick pointing roughly that way counts as "meet it"); balls in the air come off the chest/thigh into their stride.
- Controls (`ui/input.ts`): the stick is analogue: a half push walks, further runs (up to `JOG`, 80% of sprint speed), and pushed out to the rim sprints (Shift on a keyboard). Sprinting drains stamina (ring round the stick, bar under the name tag) and pushes the ball further ahead; empty = winded until it's back to a third. The CPU sprints to chase, close down, recover and run into space. Pass and Shoot both charge while held (rings round the buttons) and go on release: a tapped pass is a normal pass, a held one is driven harder and further into the runner's path. Pressed to switch or tackle, the release does nothing.
- Tackles, Red Card style, and there are no fouls (`TACKLES` and `tackles()` in `game/match.ts`): Tackle picks a shoulder barge up close, a flying kung-fu kick or a slide from a couple of metres, and a long slide from further. Anyone in its path is sent flying (`floored`: spin, land, stars, get up), ball or no ball; a carrier can ride it (defending vs dribbling, physical vs physical), and physical decides how far people fly. Slides and kicks leave the tackler on the floor for a moment. Hits freeze the frame briefly, shake the camera and throw up dust.
- Auto switch (`autoSwitchUser` in `game/match.ts`, on/off in the pause menu, saved as `street.autoSwitch`): when defending, the user gets the teammate nearest the ball only if theirs is out of the play (2.5 m and a third further, held for 0.4 s), never while their stick points at the ball within 8 m, with 1.5 s between auto switches, 3 s after a manual Switch, and a bigger gap to switch straight back. `__switching(10, "wander" | "chase" | "idle")` measures it.
- Balance and glitches (`street/src/dev.ts`, browser console only): `__sim(20)` plays 20 headless CPU-vs-CPU matches between random 3v3s from the squad (`__sim(20, 1, ["neymar", …])` narrows the pool) and reports goals, shots, tackles, goals per player… (about 7–9 goals per 3-minute match on Pro on the bigger pitch, ~75% of passes completed: `passPct`); `__glitch(10)` checks every frame for NaNs, teleports, overlaps, spins, ping-pong possession and the camera losing the ball — it should come back empty; `__duel(200, { pace: 95 }, { pace: 55 })` plays identical teams except for the stats you pass, so the win rate shows what a stat is worth (each stat at 95 vs 55 should win clearly more than half; about 50% means it does nothing). `?autopilot` lets the CPU play both sides on screen. `__newSim()` gives a headless match to poke at (`m.step(1 / 60, __PAD)`), and `__gfx` the renderer, scene and camera for grabbing frames (`renderer.render(scene, cam)` then `toDataURL` in the same call) — the in-app browser shows WebGL as black when its pane is hidden, but an `<img>` of the frame screenshots fine.
- Celebrations (`celebrate` in `rig/pose.ts`): 16 of them (`CELEBRATIONS` in `roster.ts`), from the knee slide and siuu to a backflip (the `flip` pose channel turns the body about the hips, uneased), a belly dive, shush, can't-hear-you, robot, dance, salute, rock-the-baby, calm-down and the archer. A player's own one (`celebration` in their roster entry) comes first, then `pickCelebration` picks a different one each goal (the situation can choose: a worldie → backflip, an equaliser → cup the ears, a rout → calm down). Teammates join in the group ones (`GROUP_CELEBRATIONS`).
- Online 1v1 (`online.ts`, `net/`, **Online** button on team select): both phones must be on the same `GAME_VERSION` (`net/protocol.ts`, sent in `hello`; a clash shows "update" and leaves the room) — bump it whenever the match changes in a way the other side would see (pitch size, physics, snapshot layout). a room is a Pusher presence channel `presence-street-<CODE>` (5 chars, no 0/O/1/I/L) and nothing is stored: open rooms are listed from Pusher's channel list (`/api/street/rooms`), `/api/pusher/auth` turns a third person away, and invites are `/street?room=CODE` (the app takes `fiveguys://play/street?room=CODE`). The host (who made the room) runs the match as the home side; the guest plays away, sends its buttons (`PadSender`) and plays back the host's snapshots ~50 ms behind (`Replica`). Both sides pick from one squad and the host settles clashes. `Match` takes `{ humans: [true, true], userTeam }`: each side has a `Controller` (the player it controls, charging, auto switch), and `step(dt, pad, awayPad)`.
  - The guest watches from the other touchline (`Match.camSide`), so both people attack left to right: `setView` in `main.ts` flips the camera (`rig.flipped`), turns the cage round with it (so it looks the same) and mirrors the stick (`input.mirrored`); `#hud.away` puts their side of the scoreboard on the left. A scorer celebrates towards their own player's camera, and the goal close-up cuts to that side on both screens. `__glitch` films every other match flipped.
  - Transport: Pusher client events are **off** on the app, so room messages go through `/api/street/relay` (signed with a relay token from `/api/street/me`, no DB hit). The match itself runs over a direct WebRTC data channel (STUN only, set up through the relay) at 30 snapshots/s, falling back to the relay at 8/s ("ONLINE · RELAY" badge, ~0.3 s behind) when phones can't connect directly. Snapshots and inputs carry everything unacknowledged, so loss and reordering are fine.
  - Testing needs two signed-in users: temp `User` + `Session` rows (see the iOS notes), each game in a same-origin iframe of one visible tab with `__STREET__ = { token }` set before `document.write`ing `/street` (a background tab's rAF is throttled to ~2 fps, which stalls a host). `__online` and `__match` in each frame's console.
- The match camera must keep the ball inside `SAFE` (`world/camera.ts`), clear of the scoreboard and touch controls.
- iOS ignores `user-scalable=no`/`touch-action` for double-tap zoom and pinch, which cancel held touches; `ui/input.ts` cancels the touch events on the stick and buttons to stop that (the game reads pointer events). Keep new controls inside those elements.
- Full screen on the website (`ui/fullscreen.ts`, phones/tablets only, never in the app): where the Fullscreen API exists (Android, iPad) a tap goes full screen and locks landscape. iPhone Safari has no Fullscreen API for pages (checked on iOS 26.5), so the page is made scrollable behind a "Swipe up for full screen" card shown in landscape; the swipe tucks Safari's bars away, the page then locks, and the card returns if the bars do. Added to the Home Screen it opens full screen (`public/street/manifest.webmanifest` + apple meta tags in `street/index.html`).
- 5IVE MODE (style meter → team power-up and glow) is switched off by `FIVE_MODE` in `game/match.ts` (the glow made both teams look the same colour and it was confusing); its meters are hidden.

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
