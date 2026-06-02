# Football Match Engine — Spatial Possession Simulation

**Date:** 2026-06-02
**Status:** Approved design, ready for implementation planning

## Problem

The football match feature shows players and a ball moving on a pitch, but the
movement is cosmetic and disconnected from what actually happens in the match.

Today's pipeline:

1. `simulateMatch()` (`lib/football.ts`) runs the entire match instantly and
   returns a list of narrative `MatchEvent`s (`goal`, `save`, `tackle`,
   `possession`, …), each with a minute, a team, commentary text, and running
   scores. **It contains no positions or ball coordinates.**
2. `FootballPitch.tsx` replays that event list over ~32 seconds. Because the
   data has no spatial information, it fabricates movement:
   - players sit at fixed formation slots and wobble via a sine wave,
   - the ball teleports to a random zone loosely matching the event type,
   - a "ball carrier" is guessed by position and drifts toward the ball.

Nothing on the pitch reflects the real flow of play. For online PvP, the same
event list is streamed over Pusher (`useMatchSync` → `/api/lobbies/[id]/tick`)
and each client re-fabricates the movement independently.

## Goal

Replace the cosmetic layer with a real, tick-based **possession simulation** that
produces spatial **state over time** (player positions, ball position, possessor,
clock). The renderer simply draws that state. The simulation is the source of
truth for both the visuals and the outcome.

## Decisions (agreed during brainstorming)

| Question | Decision |
|----------|----------|
| Simulation depth | **Minimal possession sim** — real engine tracks ball + holder; players move to role-based targets; passes/shots travel between actual players; goals/saves emerge from positions + card ratings. Not a full tactical AI. |
| Scope | **Both single-player (vs CPU) and online PvP.** They share the renderer and the engine. |
| Pacing | **~30s sped-up playback** (≈15s per half) **with a skip control.** |
| Interactivity | **Watch-only with a halftime formation/tactics adjustment.** No live in-play control. |
| Architecture | **Pre-computed "match tape"** — engine emits a frame timeline; renderer plays it back. (Chosen over a live per-frame engine and over choreographing the existing events.) |

## Architecture overview

```
              ┌─────────────────────────────────────────────┐
              │  lib/match-engine.ts  (pure, isomorphic)      │
              │  simulate(half inputs, seed) → MatchFrame[]   │
              └─────────────────────────────────────────────┘
                     │                                  │
        Single-player (client)                  PvP (server, API route)
        runs engine in-browser                  runs engine in Next API
                     │                                  │
                     ▼                                  ▼
        FootballPitch plays the tape        clients FETCH the tape, play it
                                            Pusher signals "half ready"
```

The engine is a pure function of its inputs, so it runs in the browser (SP) or in
a Next API route (PvP) with identical results. PvP runs it **server-side** so the
server is the single source of truth — this avoids cross-device floating-point
drift and Pusher's payload-size limit (see PvP section).

## The possession engine (`lib/match-engine.ts`, new)

### Pitch model

Normalised coordinates `x: 0–100` (width) and `y: 0–100` (length), keeping the
existing renderer convention: `y = 100` is the user's goal line (bottom of
screen), `y = 0` is the opponent's (top). Attacking "up" means decreasing `y` for
the user. The existing per-formation position maps (currently inside
`FootballPitch.tsx`) become each player's **home position** and move to
`lib/formation-positions.ts`.

### State

- 14 player entities (7 per side), each `{ id, role: GK|DEF|MID|ATT, homePos, pos }`.
- A ball: `{ pos, holderId | "in-flight" | "loose" }`.
- A clock in game-minutes.

### Loop (possession-based, not physics-based)

The match is a sequence of ~26–33 **actions** spread across 90 game-minutes, with
a halftime near minute 45 (same cadence as today's `phaseCount`). Each action:

1. **Players ease toward role targets.** The team in possession pushes up toward
   the ball's third; the defending team drops and compresses toward its own goal
   and the ball's x-column. Positions change gradually, so the renderer shows
   real runs rather than wobble.
2. **The ball-holder picks an action**, weighted by pitch location, card ratings,
   and seeded randomness:
   - **Shoot** (in the final third) → resolved against opponent Defense /
     Goalkeeping → `goal` / `save` / `miss` / `nearpost`. Ball travels holder → goal.
   - **Pass** (default) → choose a teammate (prefer forward / more open);
     resolved as passer **Skill** vs the nearest defender's interception
     (**Pace** + positioning). Success moves the ball to the actual receiver and
     play continues further up; failure flips possession to that defender
     (`tackle` / `clearance`).
   - **Dribble** (occasional) → the holder advances; contested as attacker
     **Pace + Skill** vs defender **Power + Pace** → advance, get tackled, or win
     a `freekick` / `yellowcard`.
3. Each action emits **one `MatchEvent` in the existing shape and types**, so the
   commentary template pools, live stats, MVP, and goalscorer lists keep working —
   now naming the players actually involved, at the location it happened.

Probabilities reuse the already-tuned pieces: `getPlayerRating`, the
`Pace`/`Skill`/`Power` attributes, and `FORMATION_MODS` (attack/defence/midfield
multipliers). The multipliers also scale how aggressively each line pushes up.

### Determinism

The engine is a pure function of
`(userLineup, cpuLineup, userFormation, cpuFormation, seed)`. Randomness comes
from `seedrandom` (already a dependency), never `Math.random`. The second half is
a continuation from the halftime score using the chosen second-half formations
and a continued seed stream. Determinism only needs to hold **within a single
device** (SP client, or PvP server) — see PvP for why.

### Output — the "tape"

Between an action's start and end the engine samples sub-frames at a fixed cadence
so motion interpolates smoothly:

```ts
interface PlayerFrame { id: string; x: number; y: number; } // 0–100, rounded
interface MatchFrame {
  minute: number;
  ball: { x: number; y: number };
  possessorId: string | null;          // null while the ball is in flight/loose
  players: PlayerFrame[];              // all 14
  event?: MatchEvent;                  // existing type; only on action frames
  scoreUser: number;
  scoreCpu: number;
}
type HalfTape = MatchFrame[];
```

The match summary keeps today's `MatchSimulation` shape (`result`, `userScore`,
`cpuScore`, `userOverall`, `cpuOverall`, `halftimeScore`, `mvp`, `events[]`) so
the result screen is essentially unchanged.

Coordinates are rounded to integers to keep tapes small.

## Renderer rework (`components/football/FootballPitch.tsx`)

The component keeps its chrome and loses its fabrication.

**Removed:** `computeEventZone`, the sine-wave wobble, `blendToBall` possessor
drift, `getPositionOffset` phase shifts, the bezier `launchBall`, and the
gentle-drift fallback.

**New core:** map playback time → frame index (~15s per half, ~30s total) and
**interpolate** the ball and all 14 player positions between the two surrounding
frames. `PlayerToken` renders at its interpolated `(x, y)`. Smoothness comes from
dense frames plus a short CSS transition.

**Kept, now accurate:** when playback crosses a frame carrying an `event`, run the
existing handlers — commentary feed, goal flash, spotlight, live stats, momentum
bar, scoreboard. `possessorId` comes straight from the frame (no more guessing),
so the highlight ring is correct. Possession % becomes real (time the ball spends
in each half). `CpuReveal`, the halftime modal, and the progress bar remain.

## Single-player flow (`components/football/FootballGame.tsx`)

```
Kick Off → generate seed → engine simulates FIRST half → play (~15s)
  → HALFTIME: pause; show score + best performer + FORMATION PICKER
       → player keeps or changes formation
  → engine simulates SECOND half (end state + chosen formation + seed cont.)
  → play (~15s) → FULL TIME → result screen (unchanged) → POST result
```

The halftime modal gains a **real formation selector** (the four existing
formations) instead of only a text tip; the choice drives the second half's target
positions and attack/defence multipliers. The **CPU re-picks** at halftime via a
simple seeded heuristic (e.g., chase the game when losing) so the opponent feels
reactive.

### Skip behaviour

- Skip during the **first half** → jump to the halftime screen (the adjustment is
  preserved).
- Skip during the **second half** → jump straight to the result.
- The halftime screen also offers **"Skip to result"**, which keeps the current
  formation and ends the match (fast grinding).

Because each half is already a fully computed tape, "skip" is just *jump to the
last frame and show the result* — no extra simulation pass.

## PvP flow (server-authoritative)

The engine runs **server-side** in the lobby API routes. This makes the server the
single source of truth and avoids two problems:

- **Pusher payload limit (~10 KB):** a full tape is ~30–40 KB, too large to
  broadcast — so it is never broadcast.
- **Cross-device math drift:** if each client simulated locally, small
  floating-point differences could desync the two screens.

```
Both players lock squad + initial formation (existing squad route, + formation)
  → server stores both lineups + a generated seed
HALF 1: server computes the first-half tape
  → Pusher signals "half-1-ready" → both clients FETCH the tape → play it
HALFTIME: each player picks a second-half formation
  → POST /api/lobbies/[id]/halftime  (synchronisation point)
  → when both are in (or ~30s timeout → keep current), server computes half-2 tape
  → Pusher signals "half-2-ready" → both clients fetch → play it
FULL TIME → result saved (existing result route; wager and W/L/D unchanged)
```

Each client renders the **same tape from its own perspective**: `y` is mirrored so
the local player's team is always at the bottom. The renderer already accepts
`userLineup` / `cpuLineup` / labels, so this is mostly wiring.

Pusher's role shrinks from streaming every event to a few **signals**:
`half-ready`, `opponent-choosing`, `opponent-locked`. The halftime screen shows
"waiting for opponent…" when one player is slower.

This replaces the per-event `tick` broadcast (`useMatchSync` +
`/api/lobbies/[id]/tick`) entirely.

## File structure

**New:**

- `lib/match-engine.ts` — deterministic possession engine (pure, isomorphic).
- `lib/formation-positions.ts` — home-position maps, moved out of `FootballPitch`.
- `lib/commentary.ts` — template pools + `pick()` extracted from `football.ts`.

**Modified:**

- `lib/football.ts` — keeps types, ratings, formations, lineup builders; the old
  event-only `simulateMatch` loop is removed.
- `components/football/FootballPitch.tsx` — plays tapes + interpolates; halftime
  formation picker; skip.
- `components/football/FootballGame.tsx` — new SP flow (seed → halves → halftime
  adjust).
- `hooks/useLobby.ts`, `app/lobby/[id]/page.tsx` — tape-fetch + signals instead of
  the event stream.
- `app/api/lobbies/[id]/` — replace `tick/` with a tape compute + serve route; add
  `halftime/`; engine runs here. `squad/`, `join/`, `result/` remain (squad
  extended to carry the chosen formation).
- `hooks/useMatchSync.ts` — retired.

**Prisma `Lobby` model additions** (applied via `npm run db:push`):

- `seed: String`
- `creatorFormation: String?`, `opponentFormation: String?`
- `creatorFormation2: String?`, `opponentFormation2: String?` (halftime choices)
- `firstHalfTape: Json?`, `secondHalfTape: Json?`

## Testing

No test suite exists today. The engine is pure, so it is straightforward to
verify with a small **`tsx` sanity script** (run the same way as
`prisma/seed.ts`), checking:

- **Determinism:** the same seed and inputs produce byte-identical frames.
- **Balance:** a clearly higher-OVR squad wins more often over N seeds.
- **Invariants:** all coordinates within 0–100; scores monotonic; each frame has
  exactly one possessor or the ball is in-flight; the frame timeline is
  continuous in `minute`.

A small `vitest` setup is an optional upgrade if proper tests are preferred. Final
verification is visual: run the app and watch a full match (SP) and a PvP match
end-to-end.

## Out of scope

- Live in-play tactical control (only a halftime adjustment is included).
- Full physics, stamina, pressing intensity, or off-ball-run modelling (these were
  the "light tactical sim" tier, deliberately not chosen).
- Changes to packs, collection, points, or other unrelated systems.

## Reuse summary

Reused as-is or extracted: `getPlayerRating`, `calcTeamStats`, `FORMATIONS`,
`FORMATION_MODS`, `assignPositions`/`buildSlots`/`slotsToLineup`, the commentary
template pools, the `MatchEvent` / `MatchSimulation` types, the result screen, the
CPU reveal, and the halftime modal shell. The genuinely new code is the spatial
engine, the frame interpolation in the renderer, the halftime formation control,
and the server-side PvP tape routes.
