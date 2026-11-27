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

- **Fantasy only (user, 2026-11-27):** "strip down the 5G app… just make it a fantasy app… the less features, the easier it is to get approved." The app is now Fantasy Div 1 plus Man of the Match voting and player ratings: tabs **My Team · Players · MOTM · Leagues · How to play** (five is the most iOS shows before a "More" tab) (`src/app/(tabs)/`), plus the team picker, points, league, history and player screens under `src/app/fantasy/`. The YouTube, Players (ratings/MOTM), Cards/packs/shop, Game/5IVE STREET, worlds and in-app Fantasy admin screens were **deleted from `mobile/`, not flagged off** (as were `FEATURES` and `CHANNELS`). To bring one back, restore its files from `main` before PR "fantasy-only app" (commit `de34d18`, e.g. `git checkout de34d18 -- mobile/src/app/play`) and re-add its tab/stack entries. The website and every API are unchanged and still serve all of it; the fantasy admin is the web page `/admin/fantasy`. `mobile/street/` stays (the website serves the game at `/street`), but the app no longer bundles it.
  - Look: **light and bright** (user: "brighter colours as the site's a bit dark"): tokens in `src/lib/theme.ts` (lilac background, white cards, 5iveG purple, purple→pink `HERO_GRADIENT` headline cards, a striped green pitch); `userInterfaceStyle: "light"` in `app.json`. Use the tokens, not hard-coded colours; action sheets use `userInterfaceStyle: "light"`.
  - "SUPER easy to understand" is the brief: My Team always leads with one card saying what's happening and the one thing to do (pick your team / your team is in, deadline countdown). The picker (`fantasy/edit.tsx`) is numbered steps (① pick 7 ② captain ③ name) and its big footer button always does the next step. Formations are back (user, 2026-11-27: "when changing and choosing team, make sure choosing formation is there"): a row of the 6 shapes (4-1-1 … 2-1-3) sits above the pitch in step ①, and tapping a player offers "Move to another spot". Until the fan picks a formation or moves someone, `arrangeLineup` (`lib/fantasy-lineup.ts`) lines a new team up by their own positions; after that, and for a saved team, the formation stays put and new signings take a free spot (`addPlayer`, `changeFormation`, `swapSlots`). Slots are still only for show (everyone scores as their own position). My Team has an "Edit team" link above the pitch. Same on the website (`app/fantasy/team/page.tsx`). Chips are folded away as optional.
  - **MOTM** (user, 2026-11-27: "a place for players to choose MOTM… lists the videos… search for players and pick one"): `(tabs)/motm.tsx` lists the 5ive Guys' videos (`MOTM_CHANNEL`, newest first, latest one big) and `motm/[videoId].tsx` shows the leader, your vote and a player search; tap a player to vote or change your vote (`/api/channels/[slug]/videos/[videoId]/motm`, no points involved). Since nobody syncs YouTube from the app any more, the videos route tops up `VideoMeta` itself from the channel's public RSS feed (`youtube.com/feeds/videos.xml`, latest 15, no API key: the local `YOUTUBE_API_KEY` had expired in Nov 2026) in `lib/youtube-uploads.ts`, at most every 15 min per server.
  - **Players** (user, 2026-11-27: a tab to rate the players, added back after the fantasy-only cut): `(tabs)/players.tsx` is the squad grid (`GET /api/channels/[slug]/players` → `squadRatings` in `lib/player-ratings.ts`: one entry per player on their squad card via `buildSquad`, the fans' position-weighted overall, whether you've rated them, their fantasy player id matched by name) with Top rated / A–Z / To rate. `player/[cardId].tsx` shows the 11 stat averages with your rating marked, their fantasy numbers (→ the fantasy player sheet), and sliders to rate (`POST /api/cards/[cardId]/votes`, the same votes the website and 5IVE STREET use). The votes route still credits 10 points on a first rating; the app doesn't mention points.
  - The app is called **5iveG** (`name` in `mobile/app.json`, the home-screen name; the App Store listing is also "5iveG"). "5G" in the user's voice notes means 5iveG.
  - First launch shows a welcome tour (`src/components/Tour.tsx`, 4 pages about the game) before sign-in; `src/lib/tour.ts` remembers it per device (`tour_seen_v2`; bump the key to show everyone a new tour). Settings → Show the intro again replays it (`/tour`).
  - Signing the Simulator in for testing: Google sign-in can't be automated there, so dev builds take `xcrun simctl openurl booted "fiveguys://dev-sign-in?token=<64-hex Session token>"` (`lib/auth.tsx`, `__DEV__` only). Make a temp `User` + `Session` for it.
- **Auth:** the app holds the token of a real NextAuth database `Session` row and sends `Authorization: Bearer <token>`. `middleware.ts` rewrites that into the NextAuth session cookie, so every route's `getServerSession()` works unchanged.
  - Google: the app opens `/api/mobile/auth/web-start?basic=1` in the iOS auth sheet → `/mobile-auth?basic=1` runs the normal NextAuth Google flow → `/api/mobile/auth/web-finish` redirects to `fiveguys://auth?token=…`. `basic=1` (build 10 on) asks Google for name and email only, with `include_granted_scopes` so a website fan's existing YouTube access isn't dropped; older builds leave it out and still ask for YouTube. A `link-ticket` let older builds' Apple users link Google (Connect YouTube); the fantasy-only app doesn't use it.
  - Apple: `/api/mobile/auth/apple` verifies the identity token (needs `APPLE_*` env vars).
  - `DELETE /api/account` deletes the user (App Store requirement).
- Game logic is shared, not copied: the app imports `lib/match-engine.ts`, `lib/football.ts`, `lib/exhibition.ts` etc. via the `@shared/*` alias (see `mobile/metro.config.js`). Keep those files free of Next/Prisma imports.

### Player packs (paid, In-App Purchase)

- A fan buys a named player's pack ("Ryan pack") for **£7.99** in the iPhone app: 5 cards, the last one guaranteed to be that player's (kit cards and specials named after them, `cardPlayer` in `lib/player-packs.ts`), the other four from the team's pack cards by `PLAYER_PACK.odds` (60/25/12/3%; a rarity the team lacks becomes a common). **£1 of every pack goes to the player** (`playerSharePence`). Duplicates are kept (they stack). The odds are shown before buying (App Store rule 3.1.1 for random items).
- One App Store product for every player: consumable `com.fiveguysfc.cards.playerpack` (create it in App Store Connect at £7.99; the in-app price comes from StoreKit). The app (`mobile/src/lib/shop.tsx`, expo-iap / StoreKit 2) first creates an order (`POST /api/shop/orders` → a `PlayerPack` row, status `pending`), then buys with the order id as the `appAccountToken`. expo-iap's purchase flow sends the signed transaction to `POST /api/shop/apple`, which verifies it with Apple's library against Apple's root certificates (`lib/apple-iap.ts`, `lib/apple-root-certs.ts`), marks the order `paid` and only then lets the app finish the transaction. Unfinished transactions are retried when the store reconnects or the app returns to the foreground. Verification errors answer `verification_delayed` (never finish a real purchase we couldn't verify); only another app's purchase is `invalid`.
- Paid packs wait unopened in Cards → Your packs; `POST /api/shop/packs/[id]/open` draws the cards (`drawPlayerPack`), adds them as `UserCard`s and logs a `PackOpen` (`packType: "player:<name>"`). Opening again returns the same cards. A paid transaction with no matching order becomes a pack without a player; the buyer picks one when opening.
- Refunds: App Store Server Notifications V2 → `POST /api/shop/apple/notifications` (set `https://www.5iveg.com/api/shop/apple/notifications` in App Store Connect). REFUND/REVOKE mark the pack `refunded` (can't be opened; the player's share is taken back), REFUND_REVERSED restores it. Opened cards stay.
- Player earnings: `/admin/packs` (admin secret) shows each player's packs, earned, paid and owed (Production purchases only unless "Include test purchases"; TestFlight/sandbox ones are free tests). Record money handed to a player with "I've paid …" (`PlayerPayout`). Buyers who delete their account keep their sales on the books (`PlayerPack.userId` → null).
- Local testing: `next dev` with `SHOP_DEV_PURCHASES=1` lets a `__DEV__` app build without the App Store product buy through `POST /api/shop/dev`. Xcode-environment (unsigned, StoreKit configuration file) transactions are accepted only under `next dev`.
- Code: rules/odds/earnings `lib/player-packs.ts` (pure, shared with the app, tests `lib/__tests__/player-packs.test.ts`), DB `lib/player-packs-db.ts`, API `app/api/shop/**` + `app/api/admin/packs`, app screens `mobile/src/app/(tabs)/cards.tsx`, `mobile/src/app/shop/[name].tsx` (buy sheet), `mobile/src/app/shop/open/[id].tsx` (rip and reveal), and "Back <player>" on the card sheet.

### Fantasy Div 1 (FPL rules for 7-a-side)

- Fans pick **any 7 players** from the 5ive Guys squad and put them in **any position** (user, 2026-11-20): the 7 slots still make a shape of 1 GK, 2-4 DEF, 1-3 MID, 1-3 FWD (no bench), but anyone can fill any slot and **always scores as their own position** (user, 2026-11-20, after the balance sim showed slot scoring was worth +27%: a forward in defence still scores as a forward; the slot only shapes the team). Each saved pick stores its `position`; picks without one (teams from before, or older app builds that don't send `positions`) play their own position (`pickPositions`, `entryPositions`, `lineupFromPicks`, `lineupPositions`). **No prices** (user, 2026-11-18): `FANTASY_RULES.prices = false` turns off the budget check, price changes and every price/bank/team-value display (imported players cost 0); the FPL price code is kept behind that flag and its tests switch it on. Everything else follows Fantasy Premier League 2025/26 (captain ×2 / vice if the captain doesn't play, **2 free transfers a gameweek** (user, 2026-11-27; FPL gives 1) saved up to 5 and −4 per extra; changing formation, captain or who plays where is always free, 3-2-1 bonus from BPS: only players who did more than turn up qualify, and in a clean-sheet game it goes to the defence) with **points reworked for 7-a-side** (user, 2026-11-20; `FANTASY_POINTS`): 1/2 for under/over half the game (FPL's 60 minutes; games are 40-50 min), goals GK/DEF 6 · MID/FWD 4, assist 3, and for GK/DEF who played over half the game a **defence ladder** instead of FPL's clean sheet + conceded: DEF 5 / GK 4, −1 per goal conceded, never below −2 (`defencePoints`; MID gets no clean sheet). Saves (+1 per 4) and penalty saves (+5) count for whoever made them. Defensive contributions +2 at DEF 6 / MID-FWD 8. BPS gives every goal 20 and docks GK/DEF 2 per goal conceded. A simulation (Poisson 7-a-side matches, run against the real functions) put every position at ~5 points a game and out-of-position play at +1%; if the real average goals conceded drifts far from ~3.5, set DEF's ladder top to about that average + 1.5 and GK's one less. Chips: Wildcard, Free Hit (team reverts next week), Triple Captain, and Double Points in Bench Boost's slot; once per half if the season's `secondHalfFrom` is set, otherwise once a season. Private classic leagues join by 6-character code (`/fantasy/join/CODE` on the web).
- Code: rules and scoring `lib/fantasy.ts` (pure, shared with the app via `@shared/fantasy`, tests in `lib/__tests__/fantasy.test.ts`), editing helpers `lib/fantasy-lineup.ts`, "How it works" copy `lib/fantasy-guide.ts`, DB side `lib/fantasy-db.ts` (team state, bank, Free Hit revert, finalize = bonus + prices + ranks, leagues, history). API under `app/api/fantasy/**`; app screens `mobile/src/app/(tabs)/` + `mobile/src/app/fantasy/**`; website `app/fantasy/**`.
- Running a season: `/admin/fantasy` is built for the user's phone (bottom tabs Gameweeks · Players · Season, bottom sheets, big +/− steppers, 16px inputs; components in `components/fantasy-admin/`). Unlocked once per device with `ADMIN_SECRET` (kept in localStorage; "Lock admin on this phone" forgets it). Gameweeks are entered by **kick-off**; the deadline is kick-off − 90 min (`LOCK_MINUTES`). Upcoming gameweek card → edit sheet; live/scored card → the match screen: **the score comes first** (Step 1, with an "It finished 0–0" button; until it's set nobody can be picked, so an unentered 0–0 never hands out clean sheets), then a "Who played?" grid (playing assumes over half the game and fills conceded from the score; conceded is capped at the opponent's goals), then a card per player with one **Over half / Under half** control (FPL's 60-minute line; their 7-a-side games are 40-50 minutes), steppers, and a **line-by-line points breakdown** (`pointsBreakdown`, own position, live bonus), then **Save & score GW** (finalise: scores every team, carries over untouched teams, bonus, prices if on, ranks). Saving a scored gameweek re-scores it. Players: add/edit name, position, fitness flag + news, in-squad switch, "Add from cards". The API is `app/api/admin/fantasy/route.ts` (`x-admin-secret`). Test against a local Postgres (e.g. `DATABASE_URL=… ADMIN_SECRET=… next dev`), never prod.
- **Scale (checked with 20,000 fans, 2026-11-20, local Postgres):** scoring a gameweek reads only this gameweek's entries and each team's kept team from the last couple of scored weeks (every team has an entry in each scored week because scoring carries teams over), writes scores with a few `UPDATE … FROM unnest(...)` statements, and updates standings from the previous scored week's running totals (`updateStandings(seasonId, fromNumber)`): ~5-11 s per gameweek vs 35-66 s before, identical results. The season player list (stats, form, "picked by" counted in SQL) is cached per server for 30 s (`cachedPlayerList`, cleared by admin actions): GET /api/fantasy ~60 ms per fan, 50 at once ~0.2 s. League tables rank in one sort and send the top 100 plus your row (`teamCount` is the real size). Saves were already fine (100 at once ~0.3 s).
- `FantasyEntry.picks` are `{ playerId, price paid }`; `bank` is the money left after that entry. Teams saved before the 7-player rules had 2 subs after the 7: everything reads the first 7.
- Test against a local Postgres (`createdb …; DATABASE_URL=… npx prisma db push`, then `.env.development.local` with that `DATABASE_URL` so `next dev` uses it) rather than prod — the API serves whichever season is active.

### 5IVE STREET (3D 3v3 game, `mobile/street/`)

- A three.js game bundled into one HTML page and run in a WebView by `mobile/src/app/play/street.tsx` (landscape via `expo-screen-orientation`; portrait everywhere else through the plugin's `initialOrientation`). The app's Game tab and its WebView screen were removed for the fantasy-only app (2026-11-27); restore `mobile/src/app/play/street.tsx` from `de34d18` to bring it back.
- Edit `mobile/street/src/**`, then `npm run build:street` (in `mobile/`) to regenerate `mobile/src/street/html.generated.ts` (the app imports it) and `public/street/index.html` (the website serves it at `/street` via a rewrite in `next.config.ts`; link to it with a plain `<a>`, not `<Link>`). Commit both with the source. On the website the game fetches fan ratings from the site's own API. `npm run dev:street` (or the `street` entry in `.claude/launch.json`) serves the game at http://localhost:5180 with live rebuilds; card art comes from `public/cards` via a symlink.
- Players are procedural models (`street/src/rig/model.ts`) with the real face cut from each Home Kit card (`look.face` in `street/src/roster.ts` = eye midpoint and chin as fractions of the card image; `tilt` levels a tilted head, `w` < 1 narrows the mask for a face turned aside). All 16 Home Kit players are in `ROSTER`; add a player there: look, stats (seeded from the card's attribute and position), face crop, celebration. Check crops with `?faces` (e.g. `?faces&p=milo,theo`), which draws each head close up instead of the game.
- Team select is a scrollable line-up of the whole squad: you pick 3 for your side and 3 for the CPU (the rest sit out and are hidden during the match).
- Stats in `roster.ts` are blended with the fans' votes on each player's Home Kit card (`useStreetRatings` → `window.__STREET__`). Every stat drives play (through `rate()` in `game/player.ts`): pace = sprint speed, burst and braking; dribbling = cornering grip, speed on the ball, how far away they can take the ball (`controlReach`) and play it (`touchReach`), first touch, tight touches and keeping it under a sprint, beating tackles/pokes, tricks; shooting = corner placement, accuracy, power, curl; passing = accuracy, pace, leading the runner, how much a pass bends onto its man, the CPU's choice of pass; defending = tackles, pokes, reading passes, reacting to shots; physical = stamina, shielding, strength in challenges and bumps.
- The cage is 34 × 20 m with 3.9 m goals (`game/field.ts`). Physics (`game/ball.ts`, `game/match.ts`, `game/player.ts`):
  - The ball has spin: sidespin curls it, topspin dips it, backspin floats it (Magnus), with air drag, and bounces and rolls with friction that trades spin for speed (`contact`, `flight`). Kicks go through `aimKick`, which finds the strike that lands the ball on a spot at a given moment with that spin: placed shots start outside the post and curl in, hard ones dip, chips go over the man (2.6 m peak) with backspin. Ground passes are rolled to arrive at an easy pace (`rollSpeedFor`/`rollTime` use the same rolling model) and `passAssist` bends a pass gently onto its receiver. A free ball hits bodies it can't be controlled by (the knocked down, the beaten, heads).
  - Dribbling is a magnet (`dribble`): the ball sits just in front of the carrier's feet the way they face and follows on a quick spring (tighter for good dribblers), so it swings round with them on turns and never runs away from them; it goes out and back with their stride (a bigger knock flat out). A ball just taken is drawn in over ~0.3 s. Carriers lose it only to tackles and pokes. (A touch-by-touch dribble where the ball rolled free between touches was tried in #26 and felt loose and unpolished — the user wants the ball to stick to players.)
  - Running isn't skating: `Player.locomote` turns the run's heading only as fast as grip allows at that speed, eases off into tight turns, plants and brakes for anything sharper than ~110°; bodies lean into turns. Running into someone hard (closing at over 2 m/s) is a bump (the speed over that is lost, shared by physical); leaning on someone only keeps them apart, and a carrier running into a man rolls round him (`rollRound`: more for good dribblers, less against good defenders). Don't make plain contact cost speed: a defender stood in the way then becomes a wall, which is what made story mode (everyone at ~55, nobody strong enough to shove through) feel stuck running at goal. For the same reason the CPU presser (`press` in `game/ai.ts`) jockeys a step goal-side of the carrier and a little toward the middle (showing them down the outside), not on the ball.
  - Receiving: a pass's receiver goes to meet it (a stick pointing roughly that way counts as "meet it"), takes it from up to `controlReach` (0.6–1.0 m by dribbling, +0.35 m for the intended receiver), and the pass bends onto them (`PASS_ASSIST`); balls in the air come off the chest/thigh into their stride.
- Controls (`ui/input.ts`): the stick is analogue: a half push walks, further runs (up to `JOG`, 80% of sprint speed), and pushed out to the rim sprints (Shift on a keyboard). Sprinting drains stamina (ring round the stick, bar under the name tag) and pushes the ball further ahead; empty = winded until it's back to a third. The CPU sprints to chase, close down, recover and run into space. Pass and Shoot both charge while held (rings round the buttons) and go on release: a tapped pass is a normal pass, a held one is driven harder and further into the runner's path. Pressed to switch or tackle, the release does nothing.
- Tackles, Red Card style, and there are no fouls (`TACKLES` and `tackles()` in `game/match.ts`): Tackle picks a shoulder barge up close, a flying kung-fu kick or a slide from a couple of metres, and a long slide from further. Anyone in its path is sent flying (`floored`: spin, land, stars, get up), ball or no ball; a carrier can ride it (defending vs dribbling, physical vs physical), and physical decides how far people fly. Slides and kicks leave the tackler on the floor for a moment. Hits freeze the frame briefly, shake the camera and throw up dust.
- Auto switch (`autoSwitchUser` in `game/match.ts`, on/off in the pause menu, saved as `street.autoSwitch`): when defending, the user gets the teammate nearest the ball only if theirs is out of the play (2.5 m and a third further, held for 0.4 s), never while their stick points at the ball within 8 m, with 1.5 s between auto switches, 3 s after a manual Switch, and a bigger gap to switch straight back. `__switching(10, "wander" | "chase" | "idle")` measures it.
- Balance and glitches (`street/src/dev.ts`, browser console only): `__sim(20)` plays 20 headless CPU-vs-CPU matches between random 3v3s from the squad (`__sim(20, 1, ["neymar", …])` narrows the pool) and reports goals, shots, tackles, goals per player… (about 7–9 goals per 3-minute match on Pro on the bigger pitch, ~75% of passes completed: `passPct`); `__glitch(10)` checks every frame for NaNs, teleports, overlaps, spins, ping-pong possession and the camera losing the ball — it should come back empty; `__duel(200, { pace: 95 }, { pace: 55 })` plays identical teams except for the stats you pass, so the win rate shows what a stat is worth (each stat at 95 vs 55 should win clearly more than half; about 50% means it does nothing). `?autopilot` lets the CPU play both sides on screen. `__newSim()` gives a headless match to poke at (`m.step(1 / 60, __PAD)`), and `__gfx` the renderer, scene and camera for grabbing frames (`renderer.render(scene, cam)` then `toDataURL` in the same call) — the in-app browser shows WebGL as black when its pane is hidden, but an `<img>` of the frame screenshots fine.
- Celebrations (`celebrate` in `rig/pose.ts`): 16 of them (`CELEBRATIONS` in `roster.ts`), from the knee slide and siuu to a backflip (the `flip` pose channel turns the body about the hips, uneased), a belly dive, shush, can't-hear-you, robot, dance, salute, rock-the-baby, calm-down and the archer. A player's own one (`celebration` in their roster entry) comes first, then `pickCelebration` picks a different one each goal (the situation can choose: a worldie → backflip, an equaliser → cup the ears, a rout → calm down). Teammates join in the group ones (`GROUP_CELEBRATIONS`).
- Online 1v1 (`online.ts`, `net/`, **Online** button on team select): both phones must be on the same `GAME_VERSION` (`net/protocol.ts`, sent in `hello`; a clash shows "update" and leaves the room) — bump it whenever the match changes in a way the other side would see (pitch size, physics, snapshot layout). a room is a Pusher presence channel `presence-street-<CODE>` (5 chars, no 0/O/1/I/L) and nothing is stored: open rooms are listed from Pusher's channel list (`/api/street/rooms`), `/api/pusher/auth` turns a third person away, and invites are `/street?room=CODE` (the app takes `fiveguys://play/street?room=CODE`). The host (who made the room) runs the match as the home side; the guest plays away, sends its buttons (`PadSender`) and plays back the host's snapshots ~50 ms behind (`Replica`). Both sides pick from one squad and the host settles clashes. `Match` takes `{ humans: [true, true], userTeam }`: each side has a `Controller` (the player it controls, charging, auto switch), and `step(dt, pad, awayPad)`.
  - The guest watches from the other touchline (`Match.camSide`), so both people attack left to right: `setView` in `main.ts` flips the camera (`rig.flipped`), turns the cage round with it (so it looks the same) and mirrors the stick (`input.mirrored`); `#hud.away` puts their side of the scoreboard on the left. A scorer celebrates towards their own player's camera, and the goal close-up cuts to that side on both screens. `__glitch` films every other match flipped.
  - Transport: Pusher client events are **off** on the app, so room messages go through `/api/street/relay` (signed with a relay token from `/api/street/me`, no DB hit). The match itself runs over a direct WebRTC data channel (STUN only, set up through the relay) at 30 snapshots/s, falling back to the relay at 8/s ("ONLINE · RELAY" badge, ~0.3 s behind) when phones can't connect directly. Snapshots and inputs carry everything unacknowledged, so loss and reordering are fine.
  - Testing needs two signed-in users: temp `User` + `Session` rows (see the iOS notes), each game in a same-origin iframe of one visible tab with `__STREET__ = { token }` set before `document.write`ing `/street` (a background tab's rAF is throttled to ~2 fps, which stalls a host). `__online` and `__match` in each frame's console.
- Story mode (`story/`, **Story** button on team select; `/street?story` opens straight into it, linked from the home page hero, `/game` and the channel games page): Oscar, player-manager of Five Guys FC, takes them from Division 4 to the Golden Cage (Division 1). Rules and clubs in `story/career.ts` (no DOM/three.js), the words in `story/script.ts`, screens in `story/ui.ts`; the career is saved in localStorage (`street.story.v1`), so the app and the website each keep their own.
  - Story matches are 2 minutes (`STORY_SECONDS`; golden goal is a third of the match, so 40 s), normal and online ones 3. Six clubs a division, five games a season against the other five, easiest first (`otherFixtures` is the round-robin for the rest of the table, simulated from club strength). Top two go up (you must win Division 1), bottom goes down. CPU difficulty ramps from about Amateur (first Div 4 game) to Legend (last Div 1 game): `fixtureDifficulty`. Each division's last game is its rival (Wolves, Kings, Vipers, Hollins Royals); a club that beats you becomes a nemesis (☠) until you beat them (REVENGE XP).
  - You draft four players to start with Oscar, all at the same overall (55, with a hint of their card's shape: `freshStats`); two of three offered players sign after each season. At the end of season 2 the Royals take one of your best three (`stolen`); he plays for them in Division 1 until you beat them, then comes home.
  - XP (`XP`): playing, goals, assists, tackles, wins, clean sheets, man of the match, revenge; unused subs get a little for training. Each level (`levelXp`, a bit more each time) is +1 to every stat and +2 to the two best on their card. Opponents are made up from the club's id (`clubSquad`, drawn faces, club kit via `defineKit`).
  - Fatigue and subs (`Match` with `{ bench, fatigue }`): `Player.energy` drains on the pitch (faster sprinting, slower with physical, which story mode labels STA) and comes back on the bench; under 60% it wears stats down (`Player.tire`). Rolling subs from the SUBS button or the pause menu (`subsSheet` → `Match.substitute`, which hands over the ball, controller and AI roles); the CPU subs at kick-offs and for tired players away from the ball. Quitting a story match doesn't count: it's played again.
  - Testing: when the browser pane is hidden it stops animating, so `__frames(n)` runs the game loop by hand; the career rules can be run headlessly by bundling `story/career.ts` with esbuild for node.
- The match camera must keep the ball inside `SAFE` (`world/camera.ts`), clear of the scoreboard and touch controls.
- iOS ignores `user-scalable=no`/`touch-action` for double-tap zoom and pinch, which cancel held touches; `ui/input.ts` cancels the touch events on the stick and buttons to stop that (the game reads pointer events). Keep new controls inside those elements.
- Full screen on the website (`ui/fullscreen.ts`, phones/tablets only, never in the app): where the Fullscreen API exists (Android, iPad) a tap goes full screen and locks landscape. iPhone Safari has no Fullscreen API for pages (checked on iOS 26.5), so the page is made scrollable behind a "Swipe up for full screen" card shown in landscape; the swipe tucks Safari's bars away, the page then locks, and the card returns if the bars do. The card also says how to Add to Home Screen, the only way to get rid of Safari's bars completely. Added to the Home Screen it opens full screen (`public/street/manifest.webmanifest` + apple meta tags in `street/index.html`).
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
| `lib/player-packs.ts` / `lib/player-packs-db.ts` | Paid player packs: odds, draw, earnings / orders, Apple purchases, opening, refunds |
| `lib/apple-iap.ts` | Verifies App Store signed transactions and server notifications |

### Database (PostgreSQL via Prisma)

Key models:
- **User** — `points` (spendable) + `totalEarned` (leaderboard ranking, never decrements)
- **YoutubeSync** — per-user: `isSubscribed`, `likedVideoIds` (JSON array), `earlyLikedVideoIds` (JSON array), `lastSynced`
- **VideoMeta** — channel video publish timestamps, used for early-like window calculation
- **UserCard** — collected cards with `isFavourite`
- **PackOpen** — history of pack opens with card IDs drawn
- **PlayerPack** — a paid player pack (order → paid → opened, or refunded) with its App Store transaction and the player's share
- **PlayerPayout** — money handed to a player from their pack earnings

Schema changes: use `npm run db:push` (no migration files; direct push to DB).

### Pack rarities

| Pack | Cost | Cards | Rarity weights |
|------|------|-------|----------------|
| Starter | 50 pts | 3 | 100% common |
| Team | 150 pts | 3 | 75% common / 20% rare / 5% epic |
| Legend | 400 pts | 5 | 50/25/20/5% + guaranteed epic+ |

### Website look

The 5iveG brand lives in `public/brand` (badge + wordmark, made by `scripts/brand-logo.mjs`): `components/Logo.tsx` (`Logo` white, `ThemedLogo` for the light/dark Navbar). Public pages and the signed-in home use `components/SiteHeader.tsx` (logo, Shop · Play · Fantasy · Help, sign-in or account menu) and `components/SiteFooter.tsx` (sections, help, legal, seller); the team pages keep `Navbar`. `components/ShopBanner.tsx` promotes the printed packs on both home pages. Favicons are file conventions in `app/` (`icon.svg`, `favicon.ico`, `apple-icon.png`), plus `app/manifest.ts` and link previews `app/opengraph-image.jpg` and `app/shop/opengraph-image.jpg` (rendered from HTML with headless Chrome). Page titles use the root template "%s · 5iveG", so set plain titles. `public/brand/street-squad.jpg` is a 5IVE STREET screenshot (team select, headless Chrome with SwiftShader).

### Printed card shop (`/shop`)

Physical 1st Edition packs sold on the website through Stripe Checkout (the app doesn't sell them yet). Rules in `lib/print-shop.ts` (pure): the squad pack plus 16 player packs (pictures in `public/shop/packs`, cut from the print files), £9.99 a pack and any 3 for £25 (a Stripe coupon per number of bundles, made on first use), delivery £2.99 UK / £7.99 worldwide (the buyer picks the zone in the basket; Checkout only accepts addresses in it), orders paid before `firstEditionCutoff` (14 Dec) are 1st Edition and posted by 20 Dec, no refunds (with the statutory-rights line). Stripe and DB side in `lib/print-shop-db.ts`: `createCheckout`, and `recordCheckout` (idempotent, by session id) called from the thanks page (`/shop/thanks`), the webhook (`/api/store/webhook`, only with `STRIPE_WEBHOOK_SECRET`) and a 10-minute cron (`/api/cron/shop-sync`, needs `CRON_SECRET`). Each new order is a `PrintOrder` row and an email to `SHOP_EMAIL_TO` (or `CONSENT_EMAIL_TO`). `/admin/orders` (ADMIN_SECRET) lists orders, the packs to make and addresses to post, and marks orders posted; player packs add `playerSharePence` to that player's earnings in `/admin/packs`. Seller: Genius Technologies Ltd, trading as 5iveG; help at support@5iveg.com (Cloudflare Email Routing → the boutmeapp Gmail, label "5iveG"). Test locally against a scratch Postgres, never the prod DB that `.env` points at.

### Player consent (`/consent`)

The link sent to squad players to get their permission to sell cards and packs with their face, and their bank details for their share (`/consent?team=OGFC&player=Ramin` opens on one player). Each signed form is emailed in full to `CONSENT_EMAIL_TO` via Resend (`app/api/consent/route.ts`), replying to the player; the player gets nothing. To show it's really them, a selfie is required: taken with the front camera, shrunk to a ≤1024 px JPEG on the phone, and attached inline beside their card in the email (never stored). Players in both teams tick "I play for … too" once. Resend is a free account (the Vercel Marketplace's free plan is disabled): without a verified domain it sends from `onboarding@resend.dev`, which only reaches the Resend account's own email, so `CONSENT_EMAIL_TO` must be that address. Nothing is stored in the database, and the form never logs what was sent. The wording and checks are in `lib/player-consent.ts`: the agreement is with the company (`COMPANY`, Genius Technologies Ltd, trading as 5iveG; a brand can't hold the rights), and `CONSENT_VERSION` is bumped whenever the wording changes. The form deliberately doesn't say how much the share is. Payouts are made by hand.

### Admin

`GET /api/admin/stats` requires `x-admin-secret` header matching `ADMIN_SECRET` env var.

Support: `/support` (FAQ + contact form → `SupportMessage` rows; it's the App Store Support URL and the app's Settings → Help & Support). Messages are read at `/admin/support` (same admin secret). 5iveg.com's DNS is on Cloudflare (moved from GoDaddy 2026-11-20; the site's A/CNAME are DNS-only to Vercel) and support@5iveg.com forwards to the boutmeapp Gmail.

### Points wording (YouTube policy)

The site and app only say "you get points for being a fan". Don't show what earns points (no per-like, per-subscribe or per-minute amounts, no 👍/⚡ like counts on leaderboards, no "+N pts" while watching): YouTube's API policies forbid rewarding likes, subscribes or views. The points engine itself is unchanged. The privacy policy still discloses which YouTube data is read, as Google requires.

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
STRIPE_SECRET_KEY           # Stripe (Genius Technologies' account): live key in Production, test key in Preview/Development
STRIPE_WEBHOOK_SECRET       # Optional: signs /api/store/webhook (the cron sync covers it without)
CRON_SECRET                 # Vercel cron auth (shop order sync)
SHOP_EMAIL_TO               # Optional: new-order emails (default CONSENT_EMAIL_TO)
RESEND_API_KEY              # Resend (free account at resend.com), sends the /consent and new-order emails
CONSENT_EMAIL_TO            # Where signed player consents are emailed
CONSENT_EMAIL_FROM          # Optional sender on a domain verified in Resend (default onboarding@resend.dev)
APPLE_BUNDLE_ID             # com.fiveguysfc.cards (Sign in with Apple audience; also the IAP bundle check)
APPLE_APP_APPLE_ID          # Optional, defaults to 6821596728 (App Store Connect app id, for Production purchase checks)
SHOP_DEV_PURCHASES          # Local next dev only: "1" allows /api/shop/dev test purchases
```
