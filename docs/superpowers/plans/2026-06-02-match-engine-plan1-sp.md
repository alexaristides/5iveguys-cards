# Match Engine — Plan 1: Engine + Renderer + Single-Player

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cosmetic match movement with a deterministic, tick-based possession engine whose frame "tape" drives a new renderer, delivering fully working single-player matches with real player/ball movement and a halftime formation adjustment.

**Architecture:** A pure, isomorphic engine (`lib/match-engine.ts`) simulates each half from `(lineups, formations, seed)` and emits `MatchFrame[]` (player positions, ball position, possessor, events). A new renderer (`components/football/MatchPitch.tsx`) plays the tape back over ~15s/half, interpolating between frames. The old `FootballPitch.tsx` is left untouched for the PvP lobby (migrated in Plan 2).

**Tech Stack:** TypeScript, Next.js 15, React 18, `seedrandom` (already a dep), Vitest (added in Task 1).

**Spec:** `docs/superpowers/specs/2026-06-02-football-match-engine-design.md`

---

## File structure

**New files:**
- `vitest.config.ts` — test runner config.
- `lib/formation-positions.ts` — per-formation home-position maps + `getHomeCoord`; moved out of `FootballPitch.tsx`.
- `lib/commentary.ts` — commentary template pools + `createCommentary()` no-repeat picker, extracted from `football.ts`.
- `lib/match-engine.ts` — the deterministic possession engine: types, logical simulation (`simulateHalfLogic`), frame sampler (`momentsToFrames`), public API (`simulateFirstHalf` / `simulateSecondHalf`).
- `lib/match-playback.ts` — pure `sampleTimeline()` helper used by the renderer to interpolate the current ball/player positions at a playback time.
- `components/football/MatchPitch.tsx` — timeline-playing renderer (single-player path).
- Test files colocated under `lib/__tests__/`.

**Modified files:**
- `lib/football.ts` — extract commentary pools to `lib/commentary.ts`; keep `simulateMatch` (still used by PvP until Plan 2) but have it consume the extracted commentary.
- `components/football/FootballGame.tsx` — new flow: seed → first half → halftime formation picker → second half → result; uses `MatchPitch`.

**Untouched in Plan 1 (migrated in Plan 2):**
- `components/football/FootballPitch.tsx`, `hooks/useMatchSync.ts`, `app/lobby/[id]/page.tsx`, `app/api/lobbies/**`.

---

## Task 1: Add Vitest test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + devDependencies)
- Test: `lib/__tests__/smoke.test.ts`

- [ ] **Step 1: Install Vitest**

Run:
```bash
npm install -D vitest@^2.1.0
```
Expected: adds `vitest` to devDependencies, exit 0.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test script to `package.json`**

In the `"scripts"` block add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test**

Create `lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json lib/__tests__/smoke.test.ts
git commit -m "test: add Vitest test runner"
```

---

## Task 2: Extract formation home-position maps

**Files:**
- Create: `lib/formation-positions.ts`
- Test: `lib/__tests__/formation-positions.test.ts`

Background: `FootballPitch.tsx` currently holds `USER_POSITIONS`, `CPU_POSITIONS`, `mirrorY`, and `getCoord`. We copy them into a shared module so the engine and renderer agree on geometry. (We copy, not move, in Plan 1 — `FootballPitch.tsx` stays untouched for PvP. Plan 2 deletes the duplicates.)

Coordinate convention: `x` 0–100 (width), `y` 0–100 (length). `y=90` ≈ user GK (bottom), `y=10` ≈ CPU GK (top). User attacks toward `y=0`.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/formation-positions.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getHomeCoord, USER_POSITIONS, CPU_POSITIONS } from "@/lib/formation-positions";
import type { AssignedPlayer } from "@/lib/football";

const mk = (position: AssignedPlayer["position"], posIndex: number): AssignedPlayer => ({
  card: { id: "c", name: "n", rarity: "common", attribute: "Skill", imageUrl: "" },
  position, posIndex,
});

describe("getHomeCoord", () => {
  it("returns the user GK near the bottom", () => {
    const [x, y] = getHomeCoord(mk("GK", 0), "2-2-2", "user");
    expect(x).toBe(50);
    expect(y).toBe(90);
  });

  it("mirrors the CPU GK to the top", () => {
    const [, y] = getHomeCoord(mk("GK", 0), "2-2-2", "cpu");
    expect(y).toBe(10);
  });

  it("keeps every coordinate within the pitch", () => {
    for (const f of ["2-2-2", "3-2-1", "1-3-2", "2-3-1"] as const) {
      for (const map of [USER_POSITIONS[f], CPU_POSITIONS[f]]) {
        for (const arr of Object.values(map)) {
          for (const [x, y] of arr) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(100);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- formation-positions`
Expected: FAIL — cannot find module `@/lib/formation-positions`.

- [ ] **Step 3: Create `lib/formation-positions.ts`**

```ts
import type { AssignedPlayer, Formation } from "./football";

export type PosMap = { GK: number[][]; DEF: number[][]; MID: number[][]; ATT: number[][] };

export const USER_POSITIONS: Record<Formation, PosMap> = {
  "2-2-2": { GK: [[50,90]], DEF: [[28,76],[72,76]], MID: [[28,62],[72,62]], ATT: [[35,47],[65,47]] },
  "3-2-1": { GK: [[50,90]], DEF: [[18,76],[50,76],[82,76]], MID: [[32,62],[68,62]], ATT: [[50,47]] },
  "1-3-2": { GK: [[50,90]], DEF: [[50,76]], MID: [[18,62],[50,62],[82,62]], ATT: [[33,47],[67,47]] },
  "2-3-1": { GK: [[50,90]], DEF: [[30,76],[70,76]], MID: [[18,62],[50,62],[82,62]], ATT: [[50,47]] },
};

function mirrorY(map: PosMap): PosMap {
  const m = (y: number) => 100 - y;
  return {
    GK:  map.GK.map(([x, y])  => [x, m(y)]),
    DEF: map.DEF.map(([x, y]) => [x, m(y)]),
    MID: map.MID.map(([x, y]) => [x, m(y)]),
    ATT: map.ATT.map(([x, y]) => [x, m(y)]),
  };
}

export const CPU_POSITIONS: Record<Formation, PosMap> = Object.fromEntries(
  (Object.entries(USER_POSITIONS) as [Formation, PosMap][]).map(([f, p]) => [f, mirrorY(p)])
) as Record<Formation, PosMap>;

export function getHomeCoord(
  player: AssignedPlayer,
  formation: Formation,
  team: "user" | "cpu",
): [number, number] {
  const map = team === "user" ? USER_POSITIONS[formation] : CPU_POSITIONS[formation];
  const coords = map[player.position];
  return (coords[player.posIndex] ?? coords[0]) as [number, number];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- formation-positions`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/formation-positions.ts lib/__tests__/formation-positions.test.ts
git commit -m "feat: extract shared formation home-position maps"
```

---

## Task 3: Extract commentary pools into a shared module

**Files:**
- Create: `lib/commentary.ts`
- Modify: `lib/football.ts` (remove the inline pools + `pick`; import from `lib/commentary.ts`)
- Test: `lib/__tests__/commentary.test.ts`

Background: `lib/football.ts` defines `type Tpl`, the pools (`GOAL_GENERIC`, `GOAL_PACE`, `GOAL_SKILL`, `GOAL_POWER`, `SAVE_TEMPLATES`, `MISS_TEMPLATES`, `NEARPOST_TEMPLATES`, `TACKLE_TEMPLATES`, `CLEARANCE_TEMPLATES`, `FREEKICK_TEMPLATES`, `YELLOW_TEMPLATES`, `COUNTER_TEMPLATES`, `POSSESSION_TEMPLATES`), and a no-repeat `pick()` closure inside `simulateMatch`. We move all of that to `lib/commentary.ts` as a `createCommentary(rng)` factory so both `simulateMatch` and the new engine can use it.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/commentary.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import seedrandom from "seedrandom";
import { createCommentary, GOAL_GENERIC } from "@/lib/commentary";

describe("createCommentary", () => {
  it("fills both template slots", () => {
    const c = createCommentary(seedrandom("x"));
    const line = c.pick(GOAL_GENERIC, "Scorer", "Assister");
    expect(line).toContain("Scorer");
    expect(line).toContain("Assister");
  });

  it("avoids immediate repeats within a pool", () => {
    const c = createCommentary(seedrandom("y"));
    const seen = new Set<string>();
    for (let i = 0; i < GOAL_GENERIC.length; i++) {
      seen.add(c.pick(GOAL_GENERIC, "A", "B"));
    }
    // With no-repeat tracking, a full pass should produce more than one distinct line.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is deterministic for a given seed", () => {
    const a = createCommentary(seedrandom("same"));
    const b = createCommentary(seedrandom("same"));
    expect(a.pick(GOAL_PACE, "X", "Y")).toBe(b.pick(GOAL_PACE, "X", "Y"));
  });
});

import { GOAL_PACE } from "@/lib/commentary";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- commentary`
Expected: FAIL — cannot find module `@/lib/commentary`.

- [ ] **Step 3: Create `lib/commentary.ts`**

Move the `Tpl` type and every template pool verbatim from `lib/football.ts` (lines ~172–260), then add the factory. Full file:
```ts
export type Tpl = (a: string, b: string) => string;

export const GOAL_GENERIC: Tpl[] = [
  (sc, as) => `${as} plays it through to ${sc}, who slots it home!`,
  (sc, as) => `${sc} latches onto a clever ball from ${as} and fires in!`,
  (sc, as) => `Brilliant finish! ${as}'s pass was perfectly weighted for ${sc}!`,
  (sc, as) => `${sc} receives from ${as} and buries it in the bottom corner!`,
  (sc, as) => `GOAL! ${sc} doesn't miss from there! ${as} gets the assist!`,
  (sc, as) => `${sc} tucks it away beautifully after a lay-off by ${as}!`,
  (sc, as) => `${as} finds ${sc} in the box and he finishes it off!`,
];

export const GOAL_PACE: Tpl[] = [
  (sc, as) => `COUNTER! ${sc} bursts through with electric pace and slots it past the keeper — ${as} started the move!`,
  (sc, as) => `${sc} leaves the defence for dead on the break! ${as} released him and he finishes clinically!`,
  (sc, as) => `Blistering pace from ${sc}! ${as} picks him out in behind and it's a goal!`,
];

export const GOAL_SKILL: Tpl[] = [
  (sc, as) => `Silky skill from ${sc} — beats his man and curls it into the corner! ${as} linked it up beautifully!`,
  (sc, as) => `Incredible dribble from ${sc}! Past one, past two, into the net! ${as} started the move!`,
  (sc, as) => `${sc} does the stepovers, creates the space, and finds the net! Great work from ${as}!`,
  (sc, as) => `${as} plays a clever through ball, ${sc} takes one touch and arrows it in!`,
];

export const GOAL_POWER: Tpl[] = [
  (sc, as) => `${sc} rises highest from ${as}'s cross and powers the header into the net!`,
  (sc, as) => `THUNDERBOLT! ${sc} hits it with sheer power from distance — ${as} can't believe it went in!`,
  (sc, as) => `${sc} muscles past the defender and smashes it home! ${as} gets the assist!`,
  (sc, as) => `${as} floats it in, ${sc} attacks the ball and buries the header!`,
];

export const SAVE_TEMPLATES: Tpl[] = [
  (gk, sh) => `Brilliant save by ${gk}! ${sh}'s shot was heading for the top corner!`,
  (gk, sh) => `${gk} dives to his right and pushes away ${sh}'s powerful effort!`,
  (gk, sh) => `What a stop from ${gk}! He denies ${sh} with an outstretched hand!`,
  (gk, sh) => `${sh} thought he'd scored but ${gk} pulls off a world-class save!`,
  (gk, sh) => `Point-blank chance for ${sh} but ${gk} stands tall — remarkable reaction!`,
];

export const MISS_TEMPLATES: Tpl[] = [
  (sh, cr) => `${sh} blazes it over the bar! ${cr} put him clean through — chance wasted!`,
  (sh, cr) => `${sh} pulls it just wide of the far post — agonising! ${cr} made the chance!`,
  (sh, cr) => `One on one after ${cr}'s pass but ${sh} can't convert!`,
  (sh, cr) => `${sh} sidefoots it the wrong side of the post. ${cr} won't be happy either!`,
];

export const NEARPOST_TEMPLATES: Tpl[] = [
  (sh, as) => `OFF THE POST! ${sh} was so close! ${as}'s cross was perfect but the woodwork intervenes!`,
  (sh, as) => `Off the bar from ${sh}! ${as} set it up beautifully — no goal!`,
];

export const TACKLE_TEMPLATES: Tpl[] = [
  (def, att) => `${def} times the tackle perfectly and wins it cleanly from ${att}!`,
  (def, att) => `Crunching challenge from ${def} on ${att} — referee waves play on!`,
  (def, att) => `${def} reads ${att}'s run and cuts it out before it's dangerous!`,
  (def, att) => `${def} and ${att} go shoulder to shoulder — ${def} comes out on top!`,
];

export const CLEARANCE_TEMPLATES: Tpl[] = [
  (def, att) => `${def} gets there just in time to head it clear as ${att} closes in!`,
  (def, att) => `Last-ditch clearance from ${def}! ${att} was clean through!`,
  (def, att) => `${def} blocks ${att}'s effort on the line! Vital interception!`,
];

export const FREEKICK_TEMPLATES: Tpl[] = [
  (def, att) => `Free kick awarded! ${def} hauled back ${att} just outside the box — cynical foul!`,
  (def, att) => `Referee stops play! ${att} goes down under a heavy challenge from ${def}!`,
];

export const YELLOW_TEMPLATES: Tpl[] = [
  (def, att) => `Yellow card for ${def}! He pulled back ${att} — no choice for the referee!`,
  (def, att) => `${def} is booked! Reckless challenge on ${att} — lucky it wasn't red!`,
];

export const COUNTER_TEMPLATES: Tpl[] = [
  (pac, mid) => `COUNTER-ATTACK! ${pac} picks up the ball from ${mid} and flies forward at pace!`,
  (pac, mid) => `${mid} wins it back and immediately feeds ${pac} — lightning fast break!`,
  (pac, mid) => `Quick transition! ${mid} to ${pac} who's now racing towards goal with space!`,
];

export const POSSESSION_TEMPLATES: Tpl[] = [
  (m1, m2) => `${m1} plays a neat one-two with ${m2} — slick football in the middle!`,
  (m1, m2) => `${m1} switches it to ${m2} — keeping possession nicely!`,
  (m1, m2) => `Clever interplay between ${m1} and ${m2} in the middle of the park!`,
  (m1, m2) => `${m1} finds ${m2} in space — recycling possession well!`,
];

export interface Commentary {
  pick: (pool: Tpl[], a: string, b: string) => string;
}

/** No-repeat picker bound to a seeded RNG. Mirrors the original closure in simulateMatch. */
export function createCommentary(rng: () => number): Commentary {
  const poolHistory = new Map<Tpl[], number[]>();
  function pick(pool: Tpl[], a: string, b: string): string {
    const used = poolHistory.get(pool) ?? [];
    const candidates = pool.map((_, i) => i).filter((i) => !used.includes(i));
    const from = candidates.length > 0 ? candidates : pool.map((_, i) => i);
    const idx = from[Math.floor(rng() * from.length)];
    const next = [...used, idx].slice(-(Math.max(2, Math.floor(pool.length * 0.6))));
    poolHistory.set(pool, next);
    return pool[idx](a, b);
  }
  return { pick };
}
```

- [ ] **Step 4: Refactor `lib/football.ts` to use the shared module**

In `lib/football.ts`: delete the `type Tpl` declaration and all 13 template pool constants (the block at lines ~174–260) and the inline `pick` closure inside `simulateMatch` (lines ~310–319). At the top of the file add:
```ts
import { createCommentary, GOAL_GENERIC, GOAL_PACE, GOAL_SKILL, GOAL_POWER,
  SAVE_TEMPLATES, MISS_TEMPLATES, NEARPOST_TEMPLATES, TACKLE_TEMPLATES,
  CLEARANCE_TEMPLATES, FREEKICK_TEMPLATES, YELLOW_TEMPLATES, COUNTER_TEMPLATES,
  POSSESSION_TEMPLATES } from "./commentary";
```
Then inside `simulateMatch`, replace the deleted `pick` closure with:
```ts
const { pick } = createCommentary(rng);
```
Leave the rest of `simulateMatch` unchanged — it already calls `pick(POOL, a, b)`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- commentary && npx tsc --noEmit`
Expected: commentary tests PASS; `tsc` reports no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/commentary.ts lib/football.ts lib/__tests__/commentary.test.ts
git commit -m "refactor: extract commentary pools into lib/commentary.ts"
```

---

## Task 4: Engine — logical possession simulation (`simulateHalfLogic`)

**Files:**
- Create: `lib/match-engine.ts` (logical layer; the sampler and public API are appended in Tasks 5–6)
- Test: `lib/__tests__/match-engine-logic.test.ts`

This produces the "moments" of a half: each is one touch/event with a ball location, all-14 target positions, possessor, and running score. Ball waypoints are real player home coordinates, so the ball progresses up the pitch through real players. Shots resolve from card ratings (reusing `calcTeamStats`/`FORMATION_MODS`). `TUNING` constants are grouped so scorelines can be balanced during execution.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/match-engine-logic.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { simulateHalfLogic, type HalfInput } from "@/lib/match-engine";
import { assignPositions, type FootballCard, type Formation } from "@/lib/football";

function squad(prefix: string, rarity: FootballCard["rarity"]): FootballCard[] {
  const attrs = ["Pace", "Power", "Skill"] as const;
  return Array.from({ length: 7 }, (_, i) => ({
    id: `${prefix}-${i}`, name: `${prefix}${i}`, rarity,
    attribute: attrs[i % 3], imageUrl: "", kit: null,
  }));
}

function input(seed: string, uR: FootballCard["rarity"] = "rare", cR: FootballCard["rarity"] = "rare"): HalfInput {
  const f: Formation = "2-2-2";
  return {
    userLineup: assignPositions(squad("u", uR), f),
    cpuLineup: assignPositions(squad("c", cR), f),
    userFormation: f, cpuFormation: f, seed,
  };
}

describe("simulateHalfLogic", () => {
  it("is deterministic for the same seed", () => {
    const a = simulateHalfLogic(input("abc"), 1, { user: 0, cpu: 0 });
    const b = simulateHalfLogic(input("abc"), 1, { user: 0, cpu: 0 });
    expect(JSON.stringify(a.moments)).toBe(JSON.stringify(b.moments));
  });

  it("keeps all ball coordinates inside the pitch", () => {
    const { moments } = simulateHalfLogic(input("xyz"), 1, { user: 0, cpu: 0 });
    for (const m of moments) {
      expect(m.ball.x).toBeGreaterThanOrEqual(0);
      expect(m.ball.x).toBeLessThanOrEqual(100);
      expect(m.ball.y).toBeGreaterThanOrEqual(0);
      expect(m.ball.y).toBeLessThanOrEqual(100);
    }
  });

  it("produces non-decreasing minutes within the half's range", () => {
    const { moments } = simulateHalfLogic(input("min"), 1, { user: 0, cpu: 0 });
    let prev = -1;
    for (const m of moments) {
      expect(m.minute).toBeGreaterThanOrEqual(0);
      expect(m.minute).toBeLessThanOrEqual(45);
      expect(m.minute).toBeGreaterThanOrEqual(prev);
      prev = m.minute;
    }
  });

  it("starts the second half in the 45–90 window", () => {
    const { moments } = simulateHalfLogic(input("h2"), 2, { user: 1, cpu: 1 });
    for (const m of moments) {
      expect(m.minute).toBeGreaterThanOrEqual(45);
      expect(m.minute).toBeLessThanOrEqual(90);
    }
    expect(moments[0].scoreUser).toBe(1);
    expect(moments[0].scoreCpu).toBe(1);
  });

  it("gives the much stronger squad more goals on average", () => {
    let strong = 0, weak = 0;
    for (let s = 0; s < 40; s++) {
      const r = simulateHalfLogic(input(`bal-${s}`, "legendary", "common"), 1, { user: 0, cpu: 0 });
      strong += r.endScore.user;
      weak += r.endScore.cpu;
    }
    expect(strong).toBeGreaterThan(weak);
  });

  it("never produces a frame target outside the pitch", () => {
    const { moments } = simulateHalfLogic(input("tgt"), 1, { user: 0, cpu: 0 });
    for (const m of moments) {
      for (const t of Object.values(m.targets)) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThanOrEqual(100);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeLessThanOrEqual(100);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- match-engine-logic`
Expected: FAIL — cannot find module `@/lib/match-engine`.

- [ ] **Step 3: Create `lib/match-engine.ts` (logical layer)**

```ts
import seedrandom from "seedrandom";
import {
  type AssignedPlayer, type Formation, type Position,
  type MatchEvent, type MatchEventType, type MatchPhase,
  type PlayerInvolvement, type FootballCard,
  calcTeamStats, FORMATION_MODS,
} from "./football";
import { getHomeCoord } from "./formation-positions";
import {
  createCommentary, GOAL_GENERIC, GOAL_PACE, GOAL_SKILL, GOAL_POWER,
  SAVE_TEMPLATES, MISS_TEMPLATES, NEARPOST_TEMPLATES, TACKLE_TEMPLATES,
  CLEARANCE_TEMPLATES, FREEKICK_TEMPLATES, YELLOW_TEMPLATES, POSSESSION_TEMPLATES,
} from "./commentary";

// ── Public types ────────────────────────────────────────────────────────────

export interface HalfInput {
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  userFormation: Formation;
  cpuFormation: Formation;
  seed: string;
}

export interface Moment {
  minute: number;
  type: MatchEventType;
  team: "user" | "cpu";
  phase: MatchPhase;
  description: string;
  ball: { x: number; y: number };
  targets: Record<string, { x: number; y: number }>; // all 14 players' target spots
  possessorId: string | null;
  scorerCardId?: string;
  assisterCardId?: string;
  scoreUser: number;
  scoreCpu: number;
}

export interface HalfLogicResult {
  moments: Moment[];
  endScore: { user: number; cpu: number };
  involvements: Map<string, PlayerInvolvement>;
  events: MatchEvent[];
}

// ── Tuning ──────────────────────────────────────────────────────────────────

const TUNING = {
  seqPerHalf: 12,        // base ball-winning sequences per half
  seqJitter: 5,          // + up to this many
  chainMin: 2,           // passes per attack
  chainExtra: 3,         // + up to this many
  shotChanceInBox: 0.6,  // chance the holder shoots when in the final third
  goalScale: 0.6,        // sigmoid → goal-probability scaler
  goalNoise: 0.12,
  goalFloor: 0.08,
  goalCap: 0.62,
};

// ── Geometry helpers ──────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function goalYFor(team: "user" | "cpu") { return team === "user" ? 4 : 96; }
function isFinalThird(team: "user" | "cpu", y: number) { return team === "user" ? y < 33 : y > 67; }

// Returns [dx, dy] tactical offset for a player given who is attacking.
function phaseShift(team: "user" | "cpu", atk: "user" | "cpu", position: Position, baseX: number): [number, number] {
  const dirUp = team === "user" ? -1 : 1; // toward opponent goal
  if (team === atk) {
    const push = position === "ATT" ? 11 : position === "MID" ? 5 : position === "DEF" ? 1 : 0;
    return [0, dirUp * push];
  }
  const drop = position === "ATT" ? 5 : position === "MID" ? 5 : position === "DEF" ? 6 : 0;
  const cmp = position === "DEF" ? (50 - baseX) * 0.18 : position === "GK" ? (50 - baseX) * 0.12 : 0;
  return [cmp, -dirUp * drop];
}

// ── Logical simulation ─────────────────────────────────────────────────────────

export function simulateHalfLogic(
  input: HalfInput,
  half: 1 | 2,
  startScore: { user: number; cpu: number },
  involvementsIn?: Map<string, PlayerInvolvement>,
): HalfLogicResult {
  const { userLineup, cpuLineup, userFormation, cpuFormation, seed } = input;
  const rng = seedrandom(`${seed}:h${half}`);
  const { pick } = createCommentary(rng);
  const involvements = involvementsIn ?? new Map<string, PlayerInvolvement>();
  const events: MatchEvent[] = [];
  const moments: Moment[] = [];

  const us = calcTeamStats(userLineup), cs = calcTeamStats(cpuLineup);
  const uMod = FORMATION_MODS[userFormation], cMod = FORMATION_MODS[cpuFormation];
  const uEff = { attack: us.attack * uMod.atkMult, defense: us.defense * uMod.defMult, midfield: us.midfield * uMod.midMult, goalkeeping: us.goalkeeping };
  const cEff = { attack: cs.attack * cMod.atkMult, defense: cs.defense * cMod.defMult, midfield: cs.midfield * cMod.midMult, goalkeeping: cs.goalkeeping };

  let userScore = startScore.user, cpuScore = startScore.cpu;
  const startMin = half === 1 ? 0 : 45, endMin = half === 1 ? 45 : 90;

  const lineupOf = (t: "user" | "cpu") => (t === "user" ? userLineup : cpuLineup);
  const formationOf = (t: "user" | "cpu") => (t === "user" ? userFormation : cpuFormation);
  const effOf = (t: "user" | "cpu") => (t === "user" ? uEff : cEff);

  function rpick<T>(arr: T[]): T | null { return arr.length ? arr[Math.floor(rng() * arr.length)] : null; }
  function byPos(t: "user" | "cpu", ...ps: Position[]) { return rpick(lineupOf(t).filter((p) => ps.includes(p.position))); }
  function diff(t: "user" | "cpu", exclude: string | null, ...ps: Position[]) {
    return rpick(lineupOf(t).filter((p) => ps.includes(p.position) && p.card.id !== exclude));
  }
  const nameOf = (p: AssignedPlayer | null, fb = "A player") => p?.card.name ?? fb;
  const homeCoordOf = (p: AssignedPlayer, t: "user" | "cpu") => getHomeCoord(p, formationOf(t), t);

  function trackInv(card: FootballCard, type: "goal" | "assist") {
    const e = involvements.get(card.id) ?? { cardId: card.id, name: card.name, goals: 0, assists: 0, imageUrl: card.imageUrl };
    if (type === "goal") e.goals++; else e.assists++;
    involvements.set(card.id, e);
  }

  function computeTargets(atk: "user" | "cpu", ball: { x: number; y: number }, possessorId: string | null): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    for (const t of ["user", "cpu"] as const) {
      for (const p of lineupOf(t)) {
        const [bx, by] = homeCoordOf(p, t);
        const [dx, dy] = phaseShift(t, atk, p.position, bx);
        let x = clamp(bx + dx, 4, 96), y = clamp(by + dy, 4, 96);
        if (p.card.id === possessorId) { x += (ball.x - x) * 0.6; y += (ball.y - y) * 0.6; }
        out[p.card.id] = { x: Math.round(x), y: Math.round(y) };
      }
    }
    return out;
  }

  function emit(
    minute: number, type: MatchEventType, team: "user" | "cpu", description: string,
    phase: MatchPhase, ball: { x: number; y: number }, possessorId: string | null,
    scorerCardId?: string, assisterCardId?: string,
  ) {
    const b = { x: clamp(Math.round(ball.x), 0, 100), y: clamp(Math.round(ball.y), 0, 100) };
    moments.push({ minute, type, team, phase, description, ball: b, targets: computeTargets(team, b, possessorId), possessorId, scorerCardId, assisterCardId, scoreUser: userScore, scoreCpu: cpuScore });
    events.push({ minute, type, team, description, scoreUser: userScore, scoreCpu: cpuScore, phase, scorerCardId, assisterCardId });
  }

  // Kickoff
  let atk: "user" | "cpu" = rng() < 0.5 ? "user" : "cpu";
  const koHolder = byPos(atk, "MID") ?? lineupOf(atk)[0];
  emit(startMin, "kickoff", atk, "⚡ Kick off! The match is underway!", atk === "user" ? "user-attack" : "cpu-attack", { x: 50, y: 50 }, koHolder?.card.id ?? null);

  const totalMinutes = endMin - startMin;
  const sequences = TUNING.seqPerHalf + Math.floor(rng() * TUNING.seqJitter);
  const minutesPerSeq = totalMinutes / sequences;

  for (let seq = 0; seq < sequences; seq++) {
    const minute = clamp(
      Math.round(startMin + (seq + 1) * minutesPerSeq - minutesPerSeq * 0.5 + (rng() - 0.5) * minutesPerSeq * 0.6),
      startMin, endMin - 1,
    );

    // Midfield contest decides who attacks
    const uRoll = uEff.midfield + rng() * 22, cRoll = cEff.midfield + rng() * 22;
    atk = uRoll > cRoll ? "user" : "cpu";
    const def: "user" | "cpu" = atk === "user" ? "cpu" : "user";
    const phase: MatchPhase = atk === "user" ? "user-attack" : "cpu-attack";
    const aEff = effOf(atk), dEff = effOf(def);

    // Build-up starts deep
    let holder = byPos(atk, "DEF", "MID") ?? lineupOf(atk)[0];
    if (!holder) continue;
    let [, hy] = homeCoordOf(holder, atk);
    {
      const [hx] = homeCoordOf(holder, atk);
      emit(minute, "possession", atk, pick(POSSESSION_TEMPLATES, nameOf(holder), nameOf(byPos(atk, "MID"))), phase, { x: hx, y: hy }, holder.card.id);
    }

    const chain = TUNING.chainMin + Math.floor(rng() * TUNING.chainExtra);
    let done = false;
    for (let step = 0; step < chain && !done; step++) {
      // Shot opportunity?
      if (isFinalThird(atk, hy) && rng() < TUNING.shotChanceInBox) {
        const scorer = (holder.position === "ATT" || holder.position === "MID") ? holder : (byPos(atk, "ATT", "MID") ?? holder);
        const assister = diff(atk, scorer.card.id, "MID", "ATT", "DEF");
        const gk = byPos(def, "GK");
        const dval = dEff.defense * 0.42 + dEff.goalkeeping * 0.58;
        const advantage = (aEff.attack - dval) / 14;
        const sigmoid = 1 / (1 + Math.exp(-advantage));
        const goalProb = clamp(sigmoid * TUNING.goalScale + (rng() - 0.5) * TUNING.goalNoise, TUNING.goalFloor, TUNING.goalCap);
        const gx = clamp(50 + (rng() - 0.5) * 20, 30, 70), gy = goalYFor(atk);
        if (rng() < goalProb) {
          if (atk === "user") userScore++; else cpuScore++;
          if (atk === "user") { trackInv(scorer.card, "goal"); if (assister) trackInv(assister.card, "assist"); }
          const fam = scorer.card.attribute === "Pace" ? GOAL_PACE : scorer.card.attribute === "Power" ? GOAL_POWER : scorer.card.attribute === "Skill" ? GOAL_SKILL : GOAL_GENERIC;
          emit(minute, "goal", atk, `⚽ GOAL! ${pick(fam, nameOf(scorer), nameOf(assister))}`, phase, { x: gx, y: gy }, scorer.card.id, scorer.card.id, assister?.card.id);
        } else {
          const r = rng();
          if (r < 0.45) emit(minute, "save", atk, `🧤 ${pick(SAVE_TEMPLATES, nameOf(gk), nameOf(scorer))}`, phase, { x: gx, y: gy }, gk?.card.id ?? null);
          else if (r < 0.70) emit(minute, "nearpost", atk, pick(NEARPOST_TEMPLATES, nameOf(scorer), nameOf(assister)), phase, { x: gx, y: gy }, scorer.card.id);
          else emit(minute, "miss", atk, pick(MISS_TEMPLATES, nameOf(scorer), nameOf(assister)), phase, { x: gx, y: gy }, scorer.card.id);
        }
        done = true;
        break;
      }

      // Interception / turnover?
      const interceptor = byPos(def, "DEF", "MID");
      const intercepted = (dEff.defense + rng() * 18) > (aEff.midfield + 8 + rng() * 18) && rng() < 0.5;
      if (intercepted && interceptor) {
        const [dx, dy] = homeCoordOf(interceptor, def);
        const isTackle = rng() > 0.45;
        emit(minute, isTackle ? "tackle" : "clearance", def, pick(isTackle ? TACKLE_TEMPLATES : CLEARANCE_TEMPLATES, nameOf(interceptor), nameOf(holder)), phase, { x: dx, y: dy }, interceptor.card.id);
        done = true;
        break;
      }

      // Occasional foul
      if (rng() < 0.06) {
        const fouler = byPos(def, "DEF", "MID");
        const isYellow = rng() < 0.4;
        emit(minute, isYellow ? "yellowcard" : "freekick", def, pick(isYellow ? YELLOW_TEMPLATES : FREEKICK_TEMPLATES, nameOf(fouler), nameOf(holder)), phase, homeXY(holder, atk, homeCoordOf), holder.card.id);
        done = true;
        break;
      }

      // Pass forward
      const want: Position[] = step < chain - 1 ? ["MID", "ATT"] : ["ATT", "MID"];
      const receiver = diff(atk, holder.card.id, ...want) ?? diff(atk, holder.card.id, "MID", "ATT", "DEF");
      if (!receiver) { done = true; break; }
      holder = receiver;
      const [rx, ry] = homeCoordOf(holder, atk);
      hy = ry;
      emit(minute, "possession", atk, pick(POSSESSION_TEMPLATES, nameOf(holder), nameOf(byPos(atk, "MID"))), phase, { x: rx, y: ry }, holder.card.id);
    }
  }

  return { moments, endScore: { user: userScore, cpu: cpuScore }, involvements, events };
}

// Small helper used above to read a player's home (x,y) as a ball point.
function homeXY(p: AssignedPlayer, team: "user" | "cpu", get: (p: AssignedPlayer, t: "user" | "cpu") => [number, number]): { x: number; y: number } {
  const [x, y] = get(p, team);
  return { x, y };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- match-engine-logic`
Expected: PASS, 6 tests. If the "stronger squad scores more" test is flaky, raise the loop count or nudge `TUNING.goalScale` — but it should hold comfortably for legendary vs common.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/match-engine.ts lib/__tests__/match-engine-logic.test.ts
git commit -m "feat: possession-based logical match simulation"
```

---

## Task 5: Engine — frame sampler (`momentsToFrames`)

**Files:**
- Modify: `lib/match-engine.ts` (append the `MatchFrame`/`PlayerFrame` types + `momentsToFrames`)
- Test: `lib/__tests__/match-engine-frames.test.ts`

Turns moments into a dense, interpolatable tape. Players ease from their position at the end of the previous moment toward this moment's targets; the ball lerps between moment ball-points. Each moment's `event` is attached to its final subframe (when the ball arrives).

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/match-engine-frames.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { simulateHalfLogic, momentsToFrames, type HalfInput } from "@/lib/match-engine";
import { assignPositions, type FootballCard, type Formation } from "@/lib/football";

function squad(p: string): FootballCard[] {
  const attrs = ["Pace", "Power", "Skill"] as const;
  return Array.from({ length: 7 }, (_, i) => ({
    id: `${p}-${i}`, name: `${p}${i}`, rarity: "rare", attribute: attrs[i % 3], imageUrl: "", kit: null,
  }));
}
function input(seed: string): HalfInput {
  const f: Formation = "2-2-2";
  return { userLineup: assignPositions(squad("u"), f), cpuLineup: assignPositions(squad("c"), f), userFormation: f, cpuFormation: f, seed };
}

describe("momentsToFrames", () => {
  const { moments } = simulateHalfLogic(input("frames"), 1, { user: 0, cpu: 0 });
  const frames = momentsToFrames(moments, 6);

  it("emits 6 frames per moment", () => {
    expect(frames.length).toBe(moments.length * 6);
  });

  it("includes all 14 players in every frame", () => {
    for (const f of frames) expect(f.players.length).toBe(14);
  });

  it("keeps every coordinate inside the pitch", () => {
    for (const f of frames) {
      expect(f.ball.x).toBeGreaterThanOrEqual(0);
      expect(f.ball.x).toBeLessThanOrEqual(100);
      for (const p of f.players) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(100);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(100);
      }
    }
  });

  it("attaches exactly one event per moment", () => {
    const withEvent = frames.filter((f) => f.event);
    expect(withEvent.length).toBe(moments.length);
  });

  it("produces non-decreasing minutes", () => {
    let prev = -1;
    for (const f of frames) { expect(f.minute).toBeGreaterThanOrEqual(prev); prev = f.minute; }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- match-engine-frames`
Expected: FAIL — `momentsToFrames` is not exported.

- [ ] **Step 3: Append to `lib/match-engine.ts`**

Add at the end of the file:
```ts
// ── Frame sampler ──────────────────────────────────────────────────────────

export interface PlayerFrame { id: string; x: number; y: number }

export interface MatchFrame {
  minute: number;
  ball: { x: number; y: number };
  possessorId: string | null;
  players: PlayerFrame[];
  event?: MatchEvent;
  scoreUser: number;
  scoreCpu: number;
}

const SUBFRAMES_PER_MOMENT = 6;

export function momentsToFrames(moments: Moment[], subframes = SUBFRAMES_PER_MOMENT): MatchFrame[] {
  if (moments.length === 0) return [];
  const ids = Object.keys(moments[0].targets);
  const cur: Record<string, { x: number; y: number }> = {};
  for (const id of ids) cur[id] = { ...moments[0].targets[id] };
  let prevBall = { ...moments[0].ball };
  let prevMinute = moments[0].minute;
  const frames: MatchFrame[] = [];

  for (let i = 0; i < moments.length; i++) {
    const m = moments[i];
    const startPos: Record<string, { x: number; y: number }> = {};
    for (const id of ids) startPos[id] = { ...(cur[id] ?? m.targets[id] ?? { x: 50, y: 50 }) };
    const startBall = { ...prevBall };
    const startMinute = prevMinute;

    for (let s = 1; s <= subframes; s++) {
      const t = s / subframes;
      const players: PlayerFrame[] = ids.map((id) => {
        const a = startPos[id] ?? { x: 50, y: 50 };
        const b = m.targets[id] ?? a;
        return { id, x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) };
      });
      const ball = {
        x: Math.round(startBall.x + (m.ball.x - startBall.x) * t),
        y: Math.round(startBall.y + (m.ball.y - startBall.y) * t),
      };
      const minute = Math.round(startMinute + (m.minute - startMinute) * t);
      const frame: MatchFrame = { minute, ball, possessorId: m.possessorId, players, scoreUser: m.scoreUser, scoreCpu: m.scoreCpu };
      if (s === subframes) {
        frame.event = {
          minute: m.minute, type: m.type, team: m.team, description: m.description,
          scoreUser: m.scoreUser, scoreCpu: m.scoreCpu, phase: m.phase,
          scorerCardId: m.scorerCardId, assisterCardId: m.assisterCardId,
        };
      }
      frames.push(frame);
    }
    for (const id of ids) cur[id] = { ...m.targets[id] };
    prevBall = { ...m.ball };
    prevMinute = m.minute;
  }
  return frames;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- match-engine-frames`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/match-engine.ts lib/__tests__/match-engine-frames.test.ts
git commit -m "feat: frame sampler turning moments into an interpolatable tape"
```

---

## Task 6: Engine — public API (`simulateFirstHalf` / `simulateSecondHalf`)

**Files:**
- Modify: `lib/match-engine.ts` (add `MatchSimulation` to the football import; append the public functions)
- Test: `lib/__tests__/match-engine-api.test.ts`

This is the surface the UI calls. The first half appends a `halftime` marker frame (so the renderer knows to pause); the second half appends a `fulltime` event and returns the existing `MatchSimulation` summary shape for the result screen.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/match-engine-api.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { simulateFirstHalf, simulateSecondHalf, type HalfInput } from "@/lib/match-engine";
import { assignPositions, type FootballCard, type Formation } from "@/lib/football";

function squad(p: string): FootballCard[] {
  const attrs = ["Pace", "Power", "Skill"] as const;
  return Array.from({ length: 7 }, (_, i) => ({
    id: `${p}-${i}`, name: `${p}${i}`, rarity: "epic", attribute: attrs[i % 3], imageUrl: "", kit: null,
  }));
}
function input(seed: string): HalfInput {
  const f: Formation = "2-2-2";
  return { userLineup: assignPositions(squad("u"), f), cpuLineup: assignPositions(squad("c"), f), userFormation: f, cpuFormation: f, seed };
}

describe("public engine API", () => {
  it("ends the first half with a halftime event frame", () => {
    const h1 = simulateFirstHalf(input("api"));
    const last = h1.frames[h1.frames.length - 1];
    expect(last.event?.type).toBe("halftime");
  });

  it("is deterministic across runs", () => {
    const a = simulateFirstHalf(input("det"));
    const b = simulateFirstHalf(input("det"));
    expect(JSON.stringify(a.frames)).toBe(JSON.stringify(b.frames));
  });

  it("produces a fulltime summary with a coherent result", () => {
    const h1 = simulateFirstHalf(input("full"));
    const h2 = simulateSecondHalf({
      ...input("full"),
      halftimeScore: h1.endScore,
      involvements: h1.involvements,
      firstHalfEvents: h1.events,
    });
    const { summary, frames } = h2;
    expect(frames.length).toBeGreaterThan(0);
    expect(summary.events.some((e) => e.type === "fulltime")).toBe(true);
    expect(summary.halftimeScore).toEqual(h1.endScore);
    const expected = summary.userScore > summary.cpuScore ? "win" : summary.cpuScore > summary.userScore ? "loss" : "draw";
    expect(summary.result).toBe(expected);
    // final score is at least the halftime score (second half only adds goals)
    expect(summary.userScore).toBeGreaterThanOrEqual(h1.endScore.user);
    expect(summary.cpuScore).toBeGreaterThanOrEqual(h1.endScore.cpu);
  });

  it("lets a changed second-half formation alter the outcome stream", () => {
    const base = input("form");
    const h1 = simulateFirstHalf(base);
    const keep = simulateSecondHalf({ ...base, halftimeScore: h1.endScore, involvements: new Map(h1.involvements), firstHalfEvents: h1.events });
    const changed = simulateSecondHalf({ ...base, userFormation: "1-3-2", halftimeScore: h1.endScore, involvements: new Map(h1.involvements), firstHalfEvents: h1.events });
    // Different formation → different second-half frames.
    expect(JSON.stringify(keep.frames)).not.toBe(JSON.stringify(changed.frames));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- match-engine-api`
Expected: FAIL — `simulateFirstHalf` not exported.

- [ ] **Step 3: Update the football import in `lib/match-engine.ts`**

Change the existing import from `./football` to also include `MatchSimulation`:
```ts
import {
  type AssignedPlayer, type Formation, type Position,
  type MatchEvent, type MatchEventType, type MatchPhase,
  type PlayerInvolvement, type FootballCard, type MatchSimulation,
  calcTeamStats, FORMATION_MODS,
} from "./football";
```

- [ ] **Step 4: Append the public API to `lib/match-engine.ts`**

```ts
// ── Public API ───────────────────────────────────────────────────────────────

export interface HalfResult {
  frames: MatchFrame[];
  endScore: { user: number; cpu: number };
  involvements: Map<string, PlayerInvolvement>;
  events: MatchEvent[];
}

export function simulateFirstHalf(input: HalfInput): HalfResult {
  const r = simulateHalfLogic(input, 1, { user: 0, cpu: 0 });
  const frames = momentsToFrames(r.moments);
  const last = frames[frames.length - 1];
  const htEvent: MatchEvent = {
    minute: 45, type: "halftime", team: "user",
    description: `⏸ Half time! ${r.endScore.user}–${r.endScore.cpu}`,
    scoreUser: r.endScore.user, scoreCpu: r.endScore.cpu, phase: "halftime",
  };
  frames.push({
    minute: 45, ball: { x: 50, y: 50 }, possessorId: null,
    players: last ? last.players : [], event: htEvent,
    scoreUser: r.endScore.user, scoreCpu: r.endScore.cpu,
  });
  return { frames, endScore: r.endScore, involvements: r.involvements, events: [...r.events, htEvent] };
}

export interface SecondHalfInput extends HalfInput {
  halftimeScore: { user: number; cpu: number };
  involvements: Map<string, PlayerInvolvement>;
  firstHalfEvents: MatchEvent[];
}

export function simulateSecondHalf(input: SecondHalfInput): { frames: MatchFrame[]; summary: MatchSimulation } {
  const r = simulateHalfLogic(input, 2, input.halftimeScore, input.involvements);
  const frames = momentsToFrames(r.moments);
  const userScore = r.endScore.user, cpuScore = r.endScore.cpu;
  const events: MatchEvent[] = [...input.firstHalfEvents, ...r.events, {
    minute: 90, type: "fulltime", team: "user",
    description: `🔔 Full time! Final score: ${userScore}–${cpuScore}`,
    scoreUser: userScore, scoreCpu: cpuScore, phase: "midfield",
  }];
  const us = calcTeamStats(input.userLineup), cs = calcTeamStats(input.cpuLineup);
  let mvp: PlayerInvolvement | null = null, best = 0;
  for (const inv of input.involvements.values()) {
    const s = inv.goals * 3 + inv.assists;
    if (s > best) { best = s; mvp = inv; }
  }
  const result: "win" | "loss" | "draw" = userScore > cpuScore ? "win" : cpuScore > userScore ? "loss" : "draw";
  const summary: MatchSimulation = {
    events, userScore, cpuScore, result,
    userOverall: us.overall, cpuOverall: cs.overall,
    halftimeScore: input.halftimeScore, mvp,
  };
  return { frames, summary };
}

/** CPU picks a second-half formation: chase the game when behind, protect a lead. */
export function pickCpuSecondHalfFormation(current: Formation, cpuScore: number, userScore: number, seed: string): Formation {
  const rng = seedrandom(`${seed}:cpu-ht`);
  if (cpuScore < userScore) return rng() < 0.7 ? "1-3-2" : "2-3-1"; // attacking
  if (cpuScore > userScore) return rng() < 0.7 ? "3-2-1" : "2-3-1"; // defensive
  return current;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- match-engine-api && npx tsc --noEmit`
Expected: PASS, 4 tests; no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/match-engine.ts lib/__tests__/match-engine-api.test.ts
git commit -m "feat: public match engine API (first/second half + summary)"
```

---

## Task 7: Playback interpolation helper (`sampleTimeline`)

**Files:**
- Create: `lib/match-playback.ts`
- Test: `lib/__tests__/match-playback.test.ts`

A pure function the renderer calls every animation frame to get the interpolated ball + player positions at a given playback time. Keeping this pure makes the renderer's only untested part the DOM wiring.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/match-playback.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sampleTimeline } from "@/lib/match-playback";
import type { MatchFrame } from "@/lib/match-engine";

const frames: MatchFrame[] = [
  { minute: 0, ball: { x: 0, y: 0 }, possessorId: "a", players: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 10 }], scoreUser: 0, scoreCpu: 0 },
  { minute: 45, ball: { x: 100, y: 100 }, possessorId: "b", players: [{ id: "a", x: 20, y: 20 }, { id: "b", x: 30, y: 30 }], scoreUser: 0, scoreCpu: 0 },
];

describe("sampleTimeline", () => {
  it("returns the first frame at t=0", () => {
    const s = sampleTimeline(frames, 0, 10);
    expect(s.ball).toEqual({ x: 0, y: 0 });
    expect(s.frameIndex).toBe(0);
    expect(s.progress).toBe(0);
  });

  it("returns the last frame at t=duration", () => {
    const s = sampleTimeline(frames, 10, 10);
    expect(s.ball).toEqual({ x: 100, y: 100 });
    expect(s.progress).toBe(1);
  });

  it("interpolates the midpoint", () => {
    const s = sampleTimeline(frames, 5, 10);
    expect(s.ball.x).toBeCloseTo(50, 5);
    const a = s.players.find((p) => p.id === "a")!;
    expect(a.x).toBeCloseTo(10, 5);
  });

  it("preserves all players", () => {
    const s = sampleTimeline(frames, 3, 10);
    expect(s.players.length).toBe(2);
  });

  it("clamps out-of-range time", () => {
    expect(sampleTimeline(frames, -5, 10).progress).toBe(0);
    expect(sampleTimeline(frames, 999, 10).progress).toBe(1);
  });

  it("handles an empty tape", () => {
    const s = sampleTimeline([], 1, 10);
    expect(s.players).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- match-playback`
Expected: FAIL — cannot find module `@/lib/match-playback`.

- [ ] **Step 3: Create `lib/match-playback.ts`**

```ts
import type { MatchFrame, PlayerFrame } from "./match-engine";

export interface PlaybackSample {
  ball: { x: number; y: number };
  players: PlayerFrame[];
  frameIndex: number; // floored index of the lower bounding frame
  progress: number;   // 0..1 over the whole tape
}

export function sampleTimeline(frames: MatchFrame[], elapsedSec: number, durationSec: number): PlaybackSample {
  if (frames.length === 0) return { ball: { x: 50, y: 50 }, players: [], frameIndex: 0, progress: 0 };
  const tNorm = durationSec <= 0 ? 1 : Math.max(0, Math.min(1, elapsedSec / durationSec));
  const pos = tNorm * (frames.length - 1);
  const i = Math.floor(pos);
  const frac = pos - i;
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const ball = {
    x: a.ball.x + (b.ball.x - a.ball.x) * frac,
    y: a.ball.y + (b.ball.y - a.ball.y) * frac,
  };
  const bMap = new Map(b.players.map((p) => [p.id, p]));
  const players: PlayerFrame[] = a.players.map((pa) => {
    const pb = bMap.get(pa.id) ?? pa;
    return { id: pa.id, x: pa.x + (pb.x - pa.x) * frac, y: pa.y + (pb.y - pa.y) * frac };
  });
  return { ball, players, frameIndex: i, progress: tNorm };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- match-playback`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/match-playback.ts lib/__tests__/match-playback.test.ts
git commit -m "feat: pure timeline interpolation helper for playback"
```

---

## Task 8: New renderer `MatchPitch.tsx` (plays the tape)

**Files:**
- Create: `components/football/MatchPitch.tsx`

Plays the first half, freezes and calls `onHalftime` when it ends, then plays the second half (provided by the parent after the halftime choice) and calls `onComplete`. Positions and ball come from `sampleTimeline`; events fire as playback crosses event-bearing frames. The interpolation math is already unit-tested (Task 7); this component is the DOM wiring, verified manually in Task 11.

This component does NOT touch `FootballPitch.tsx` (still used by PvP). The momentum bar from the old pitch is intentionally dropped (it was decorative); commentary, scoreboard, goal flash, shots/possession stats, and the progress bar are kept.

- [ ] **Step 1: Create `components/football/MatchPitch.tsx`**

```tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AssignedPlayer, MatchEvent, Rarity } from "@/lib/football";
import type { MatchFrame } from "@/lib/match-engine";
import { sampleTimeline } from "@/lib/match-playback";

const DEFAULT_HALF_SEC = 15;

const RARITY_RING: Record<Rarity, string> = {
  common: "ring-zinc-400", rare: "ring-blue-400", epic: "ring-purple-400", legendary: "ring-amber-400",
};
const EVENT_ICON: Record<string, string> = {
  goal: "⚽", save: "🧤", miss: "💨", tackle: "💪", clearance: "↗", kickoff: "🏁",
  halftime: "⏸", fulltime: "🔔", possession: "●", freekick: "🎯", yellowcard: "🟨", nearpost: "🔔", counter: "⚡",
};

type Phase = "playing1" | "halftime-wait" | "playing2" | "done";

interface Props {
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  firstHalfFrames: MatchFrame[];
  secondHalfFrames: MatchFrame[] | null;
  halfDurationSec?: number;
  userLabel?: string;
  cpuLabel?: string;
  /** Called when the first half finishes playing. Parent shows the halftime UI + computes the 2nd half. */
  onHalftime: () => void;
  /** Called when the second half finishes playing. */
  onComplete: () => void;
}

interface CardInfo { id: string; name: string; imageUrl: string; rarity: Rarity; team: "user" | "cpu"; position: string; }

export default function MatchPitch({
  userLineup, cpuLineup, firstHalfFrames, secondHalfFrames,
  halfDurationSec = DEFAULT_HALF_SEC, userLabel = "YOU", cpuLabel = "CPU",
  onHalftime, onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>("playing1");
  const [ball, setBall] = useState({ x: 50, y: 50 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [possessorId, setPossessorId] = useState<string | null>(null);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [score, setScore] = useState({ user: 0, cpu: 0 });
  const [minute, setMinute] = useState(0);
  const [progress, setProgress] = useState(0);
  const [goalFlash, setGoalFlash] = useState<"user" | "cpu" | null>(null);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [stats, setStats] = useState({ userShots: 0, cpuShots: 0, userPoss: 0, cpuPoss: 0 });

  const cardById = useMemo(() => {
    const m = new Map<string, CardInfo>();
    for (const p of userLineup) m.set(p.card.id, { id: p.card.id, name: p.card.name, imageUrl: p.card.imageUrl, rarity: p.card.rarity, team: "user", position: p.position });
    for (const p of cpuLineup) m.set(p.card.id, { id: p.card.id, name: p.card.name, imageUrl: p.card.imageUrl, rarity: p.card.rarity, team: "cpu", position: p.position });
    return m;
  }, [userLineup, cpuLineup]);

  const startRef = useRef<number | null>(null);
  const firedRef = useRef(-1);

  function applyEvent(ev: MatchEvent) {
    setFeed((prev) => [ev, ...prev].slice(0, 12));
    setScore({ user: ev.scoreUser, cpu: ev.scoreCpu });
    setStats((s) => {
      const next = { ...s };
      if (["goal", "save", "miss", "nearpost"].includes(ev.type)) { if (ev.team === "user") next.userShots++; else next.cpuShots++; }
      if (ev.type === "possession" || ev.type === "counter") { if (ev.team === "user") next.userPoss++; else next.cpuPoss++; }
      return next;
    });
    if (ev.type === "goal") {
      setGoalFlash(ev.team);
      setSpotlightId(ev.scorerCardId ?? null);
      setTimeout(() => { setGoalFlash(null); setSpotlightId(null); }, 1600);
    }
  }

  // Drive playback for the active half.
  useEffect(() => {
    if (phase !== "playing1" && phase !== "playing2") return;
    const frames = phase === "playing1" ? firstHalfFrames : (secondHalfFrames ?? []);
    if (frames.length === 0) return;
    startRef.current = null;
    firedRef.current = -1;
    const raf = { id: 0 };

    function frame(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = (ts - startRef.current) / 1000;
      const s = sampleTimeline(frames, elapsed, halfDurationSec);
      setBall(s.ball);
      setPositions(Object.fromEntries(s.players.map((p) => [p.id, { x: p.x, y: p.y }])));
      setProgress(phase === "playing1" ? s.progress * 0.5 : 0.5 + s.progress * 0.5);

      // fire events up to current frame index
      for (let i = firedRef.current + 1; i <= s.frameIndex && i < frames.length; i++) {
        const ev = frames[i].event;
        if (ev) { applyEvent(ev); setMinute(ev.minute); setPossessorId(frames[i].possessorId); }
      }
      firedRef.current = Math.max(firedRef.current, s.frameIndex);

      if (elapsed < halfDurationSec) {
        raf.id = requestAnimationFrame(frame);
      } else {
        if (phase === "playing1") { setPhase("halftime-wait"); onHalftime(); }
        else { setPhase("done"); onComplete(); }
      }
    }
    raf.id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, firstHalfFrames, secondHalfFrames, halfDurationSec]);

  // Resume into the second half once the parent supplies its frames.
  useEffect(() => {
    if (phase === "halftime-wait" && secondHalfFrames && secondHalfFrames.length > 0) {
      setPhase("playing2");
    }
  }, [phase, secondHalfFrames]);

  const totalPoss = stats.userPoss + stats.cpuPoss;
  const userPossPct = totalPoss > 0 ? Math.round((stats.userPoss / totalPoss) * 100) : 50;

  function renderToken(id: string, pos: { x: number; y: number }) {
    const info = cardById.get(id);
    if (!info) return null;
    const isPossessor = possessorId === id;
    const isSpotlight = spotlightId === id;
    return (
      <div key={id} className={`absolute ${isSpotlight ? "z-30" : "z-10"}`}
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)", transition: "top 0.12s linear, left 0.12s linear" }}>
        {isPossessor && <div className="absolute inset-0 rounded-full ring-2 ring-white/60 animate-pulse scale-125 z-10" />}
        {isSpotlight && <div className="absolute inset-0 rounded-full ring-4 ring-yellow-400 animate-pulse scale-150 z-10" />}
        <div className={`relative rounded-full ring-2 overflow-hidden shadow-lg ${RARITY_RING[info.rarity]} ${isSpotlight ? "w-12 h-12" : "w-10 h-10 sm:w-8 sm:h-8"}`}
          title={`${info.name} (${info.position})`}>
          <Image src={info.imageUrl} alt={info.name} fill className="object-cover object-center" sizes="40px" />
          <div className={`absolute inset-0 pointer-events-none ${info.team === "user" ? "bg-blue-500/20" : "bg-red-500/25"}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-3xl mx-auto">
      <div className="relative w-full sm:w-52 lg:w-64 xl:w-72 shrink-0">
        <div className="relative w-full overflow-hidden rounded-xl pt-[120%] sm:pt-[150%]"
          style={{ background: "linear-gradient(180deg, #1a5c28 0%, #206b30 30%, #1e6b2e 50%, #206b30 70%, #1a5c28 100%)" }}>
          <div className="absolute inset-0">
            {/* markings */}
            <div className="absolute inset-[4%] border border-white/25 rounded-sm" />
            <div className="absolute left-[4%] right-[4%] border-t border-white/25" style={{ top: "50%" }} />
            <div className="absolute rounded-full border border-white/25" style={{ width: "22%", aspectRatio: "1", left: "39%", top: "calc(50% - 11%)" }} />
            <div className="absolute border border-white/20 border-t-0" style={{ width: "46%", left: "27%", top: "4%", height: "15%" }} />
            <div className="absolute border border-white/20 border-b-0" style={{ width: "46%", left: "27%", bottom: "4%", height: "15%" }} />
            <div className="absolute top-[4.5%] left-1/2 -translate-x-1/2 text-red-300/70 text-[8px] font-bold uppercase tracking-widest">{cpuLabel}</div>
            <div className="absolute bottom-[4.5%] left-1/2 -translate-x-1/2 text-blue-300/70 text-[8px] font-bold uppercase tracking-widest">{userLabel}</div>

            {Object.entries(positions).map(([id, pos]) => renderToken(id, pos))}

            <div className="absolute rounded-full bg-white shadow-lg shadow-white/60 z-20"
              style={{ width: "4%", aspectRatio: "1", left: `${ball.x}%`, top: `${ball.y}%`, transform: "translate(-50%, -50%)", transition: "top 0.12s linear, left 0.12s linear" }} />

            {goalFlash && (
              <div className={`absolute inset-0 z-30 flex items-center justify-center pointer-events-none ${goalFlash === "user" ? "bg-green-500/30" : "bg-red-500/25"}`}>
                <div className="bg-black/60 rounded-2xl px-4 py-2 text-center">
                  <span className="text-3xl font-black text-white drop-shadow-lg animate-bounce block">{goalFlash === "user" ? "⚽ GOAL!" : `${cpuLabel} GOAL`}</span>
                  <div className="text-white/60 text-xs mt-1 font-bold">{score.user} – {score.cpu}</div>
                </div>
              </div>
            )}

            <div className="absolute top-0 left-0 right-0 z-20 bg-black/55 backdrop-blur-sm">
              <div className="flex items-center justify-between px-3 py-1.5">
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[7px] font-bold">{userLabel[0]}</div>
                  <span className="text-white text-xs font-bold">{score.user}</span>
                </div>
                <div className="text-white/60 text-[9px] font-mono">{minute}&apos;</div>
                <div className="flex items-center gap-1">
                  <span className="text-white text-xs font-bold">{score.cpu}</span>
                  <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[7px] font-bold">{cpuLabel[0]}</div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-20">
              <div className="h-full bg-white/40 transition-all duration-100" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-zinc-400 text-[10px] sm:text-xs font-medium uppercase tracking-wider">Commentary</span>
          <span className="ml-auto text-zinc-500 text-[10px] sm:text-xs font-mono">{minute}&apos;</span>
        </div>
        <div className="flex flex-col gap-1 sm:gap-1.5 overflow-y-auto max-h-28 sm:max-h-none sm:flex-1 pr-0.5">
          {feed.length === 0 && <div className="text-zinc-600 text-xs italic">Waiting for kick off…</div>}
          {feed.map((ev, i) => (
            <div key={`${ev.minute}-${i}`} className={`flex items-start gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg ${i === 0 ? "bg-zinc-800/80 border border-zinc-700/50" : "bg-zinc-900/50"} ${ev.type === "goal" && ev.team === "user" ? "!border-blue-500/50 !bg-blue-900/20" : ""} ${ev.type === "goal" && ev.team === "cpu" ? "!border-red-500/50 !bg-red-900/20" : ""}`}>
              <span className="shrink-0 text-sm leading-none mt-0.5">{EVENT_ICON[ev.type] ?? "●"}</span>
              <div className="flex-1 min-w-0">
                <span className="text-zinc-500 text-[10px] font-mono mr-1">{ev.minute}&apos;</span>
                <span className={`text-[11px] sm:text-xs leading-snug ${ev.type === "goal" ? "font-semibold text-white" : "text-zinc-300"}`}>{ev.description}</span>
              </div>
              {(ev.type === "goal" || ev.type === "halftime" || ev.type === "fulltime") && (
                <span className="shrink-0 text-[10px] font-bold text-white/70">{ev.scoreUser}–{ev.scoreCpu}</span>
              )}
            </div>
          ))}
        </div>
        <div className="rounded-lg sm:rounded-xl bg-zinc-900/60 border border-zinc-800 px-2 sm:px-3 py-1.5 sm:py-2 shrink-0">
          <div className="grid grid-cols-2 gap-1 text-center">
            <div>
              <div className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Shots</div>
              <div className="text-[10px] sm:text-xs font-bold"><span className="text-blue-400">{stats.userShots}</span><span className="text-zinc-600 mx-0.5">–</span><span className="text-red-400">{stats.cpuShots}</span></div>
            </div>
            <div>
              <div className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Poss</div>
              <div className="text-[10px] sm:text-xs font-bold"><span className="text-blue-400">{userPossPct}%</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No unit test here — the playback math is covered by Task 7; visual behaviour is verified in Task 11.)

- [ ] **Step 3: Commit**

```bash
git add components/football/MatchPitch.tsx
git commit -m "feat: MatchPitch renderer that plays the engine tape"
```

---

## Task 9: Wire engine into `FootballGame` (halftime picker + skip)

**Files:**
- Modify: `components/football/MatchPitch.tsx` (add `skipSignal` fast-forward)
- Modify: `components/football/FootballGame.tsx` (new flow)

- [ ] **Step 1: Add skip support to `MatchPitch.tsx`**

In the `Props` interface, add:
```tsx
  /** Increment to fast-forward the current half to its end (fires remaining events, then ends the half). */
  skipSignal?: number;
```
In the destructured props, add `skipSignal = 0,`.
Just below the `startRef` / `firedRef` declarations, add:
```tsx
  const skipRef = useRef(0);
  const lastSkipRef = useRef(0);
  useEffect(() => { skipRef.current = skipSignal; }, [skipSignal]);
```
Inside `frame(ts)`, as the very first lines after `if (startRef.current === null) startRef.current = ts;`, add:
```tsx
      if (skipRef.current !== lastSkipRef.current) {
        lastSkipRef.current = skipRef.current;
        startRef.current = ts - halfDurationSec * 1000 - 100; // force elapsed >= duration → fast-forward
      }
```
This makes the next computed `elapsed` exceed the duration, so `sampleTimeline` returns `progress = 1` (firing every remaining event via the catch-up loop) and the half's end branch runs.

- [ ] **Step 2: Replace the imports in `FootballGame.tsx`**

Replace the existing import of `@/lib/football` and `./FootballPitch` (lines ~4–17) with:
```tsx
import {
  type Formation,
  type FootballCard,
  type AssignedPlayer,
  type LineupSlot,
  type MatchSimulation,
  type PlayerInvolvement,
  type MatchEvent,
  buildSlots,
  slotsToLineup,
  pickCpuLineup,
  FORMATIONS,
} from "@/lib/football";
import {
  simulateFirstHalf,
  simulateSecondHalf,
  pickCpuSecondHalfFormation,
  type HalfResult,
  type MatchFrame,
} from "@/lib/match-engine";
import { nanoid } from "nanoid";
import FormationPitchSelector from "./FormationPitchSelector";
import MatchPitch from "./MatchPitch";
```

- [ ] **Step 3: Replace the match-related state + add refs**

Replace the simulation state declarations (the `const [simulation, setSimulation] = …` line and surrounding match state, lines ~86–97) so the block reads:
```tsx
  const [userLineup, setUserLineup] = useState<AssignedPlayer[]>([]);
  const [cpuLineup, setCpuLineup]   = useState<AssignedPlayer[]>([]);
  const [cpuFormation, setCpuFormation] = useState<Formation>("2-2-2");
  const [firstHalf, setFirstHalf]   = useState<HalfResult | null>(null);
  const [secondHalfFrames, setSecondHalfFrames] = useState<MatchFrame[] | null>(null);
  const [summary, setSummary]       = useState<MatchSimulation | null>(null);
  const [showHalftime, setShowHalftime] = useState(false);
  const [secondHalfFormation, setSecondHalfFormation] = useState<Formation>("2-2-2");
  const [skipSignal, setSkipSignal] = useState(0);
  const [stats, setStats]           = useState<MatchStats>({ wins: 0, losses: 0, draws: 0 });
  const [loadingCards, setLoadingCards] = useState(true);
  const [saving, setSaving]         = useState(false);
  const [savedMsg, setSavedMsg]     = useState(false);

  // Refs so playback callbacks always read current values.
  const seedRef = useRef("");
  const firstHalfRef = useRef<HalfResult | null>(null);
  const summaryRef = useRef<MatchSimulation | null>(null);
  const userLineupRef = useRef<AssignedPlayer[]>([]);
  const cpuLineupRef = useRef<AssignedPlayer[]>([]);
  const cpuFormationRef = useRef<Formation>("2-2-2");
  const secondHalfFormationRef = useRef<Formation>("2-2-2");
```
(Keep the existing `useState<Phase>("setup")`, `shareCopied`, `ownedCards`, `formation`, `lineup` declarations above this as-is.)

- [ ] **Step 4: Replace `handleKickOff` and `handleMatchComplete`; add halftime/skip handlers**

Replace `handleKickOff` (lines ~176–188) and `handleMatchComplete` (lines ~190–208) with:
```tsx
  function handleKickOff() {
    const assigned = slotsToLineup(lineup);
    if (assigned.length < 7) return;

    const { formation: cpuFm, lineup: cpuAssigned } = pickCpuLineup();
    const seed = nanoid();
    const h1 = simulateFirstHalf({
      userLineup: assigned, cpuLineup: cpuAssigned,
      userFormation: formation, cpuFormation: cpuFm, seed,
    });

    setUserLineup(assigned); userLineupRef.current = assigned;
    setCpuLineup(cpuAssigned); cpuLineupRef.current = cpuAssigned;
    setCpuFormation(cpuFm); cpuFormationRef.current = cpuFm;
    seedRef.current = seed;
    setFirstHalf(h1); firstHalfRef.current = h1;
    setSecondHalfFrames(null);
    setSummary(null); summaryRef.current = null;
    setSecondHalfFormation(formation); secondHalfFormationRef.current = formation;
    setSkipSignal(0);
    setShowHalftime(false);
    setPhase("playing");

    saveTeamToDb(formation, lineup);
  }

  function computeSecondHalf(userFm: Formation): MatchSimulation {
    const h1 = firstHalfRef.current!;
    const cpuFm2 = pickCpuSecondHalfFormation(cpuFormationRef.current, h1.endScore.cpu, h1.endScore.user, seedRef.current);
    const { frames, summary } = simulateSecondHalf({
      userLineup: userLineupRef.current,
      cpuLineup: cpuLineupRef.current,
      userFormation: userFm,
      cpuFormation: cpuFm2,
      seed: seedRef.current,
      halftimeScore: h1.endScore,
      involvements: new Map(h1.involvements),
      firstHalfEvents: h1.events,
    });
    summaryRef.current = summary;
    setSummary(summary);
    setSecondHalfFrames(frames);
    return summary;
  }

  async function finishMatch(s: MatchSimulation) {
    setPhase("result");
    try {
      await fetch("/api/football", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userCardIds: userLineupRef.current.map((p) => p.card.id),
          cpuCardIds: cpuLineupRef.current.map((p) => p.card.id),
          formation,
          userScore: s.userScore,
          cpuScore: s.cpuScore,
          result: s.result,
        }),
      });
      await fetchStats();
    } catch {}
  }

  function handleHalftimeReached() { setShowHalftime(true); }

  function handleStartSecondHalf() {
    secondHalfFormationRef.current = secondHalfFormation;
    setShowHalftime(false);
    computeSecondHalf(secondHalfFormation); // sets secondHalfFrames → MatchPitch resumes
  }

  function handleSkipToResult() {
    const s = summaryRef.current ?? computeSecondHalf(secondHalfFormationRef.current);
    setShowHalftime(false);
    finishMatch(s);
  }

  function handleSkipPlayback() { setSkipSignal((n) => n + 1); }

  function handleMatchComplete() {
    const s = summaryRef.current;
    if (s) finishMatch(s);
  }
```

- [ ] **Step 5: Replace the "playing" render block**

Replace the `if (phase === "playing" && simulation) { … }` block (lines ~294–312) with:
```tsx
  // ── Playing ────────────────────────────────────────────────────────────────
  if (phase === "playing" && firstHalf) {
    return (
      <div className="w-full">
        <div className="text-center mb-4 flex items-center justify-center gap-3">
          <div>
            <h2 className="text-zinc-300 text-sm font-semibold uppercase tracking-wider">Match in Progress</h2>
            <p className="text-zinc-600 text-xs mt-0.5">{secondHalfFormation} vs {cpuFormation}</p>
          </div>
          <button
            onClick={handleSkipPlayback}
            className="ml-2 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300"
          >
            Skip ⏭
          </button>
        </div>

        <MatchPitch
          userLineup={userLineup}
          cpuLineup={cpuLineup}
          firstHalfFrames={firstHalf.frames}
          secondHalfFrames={secondHalfFrames}
          skipSignal={skipSignal}
          onHalftime={handleHalftimeReached}
          onComplete={handleMatchComplete}
        />

        {showHalftime && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl p-6 text-center">
              <div className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-2">Half Time</div>
              <div className="text-white text-4xl font-black mb-4">{firstHalf.endScore.user}–{firstHalf.endScore.cpu}</div>
              <div className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Second-half formation</div>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {(["2-2-2", "3-2-1", "1-3-2", "2-3-1"] as Formation[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setSecondHalfFormation(f)}
                    className={`py-2 rounded-lg text-sm font-bold border transition-all ${
                      secondHalfFormation === f
                        ? "bg-green-700 border-green-500 text-white"
                        : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    {FORMATIONS[f].label}
                    <span className="block text-[9px] font-normal text-zinc-400">{FORMATIONS[f].desc}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleStartSecondHalf}
                className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-all active:scale-95 mb-2"
              >
                ⚽ Second Half
              </button>
              <button
                onClick={handleSkipToResult}
                className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-bold"
              >
                Skip to result
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
```

- [ ] **Step 6: Replace `simulation` references in the result block**

In the `if (phase === "result" …)` block, change the guard and the destructure source from `simulation` to `summary`:
- Change `if (phase === "result" && simulation) {` → `if (phase === "result" && summary) {`
- Change `const { userScore, cpuScore, result, userOverall, cpuOverall, mvp } = simulation;` → `const { userScore, cpuScore, result, userOverall, cpuOverall, mvp } = summary;`
- In the goalscorers section, change both `simulation.events` references to `summary.events`.
- In `handleShare`, change `if (!simulation) return;` → `if (!summary) return;` and `const { result, userScore, cpuScore, userOverall } = simulation;` → `… = summary;`
- In `handlePlayAgain`, change `setSimulation(null);` → `setSummary(null); setFirstHalf(null); setSecondHalfFrames(null); summaryRef.current = null; firstHalfRef.current = null;`

- [ ] **Step 7: Typecheck + tests + lint**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: no type errors; all tests pass; lint clean (fix any unused-import warnings, e.g. remove `PlayerInvolvement`/`MatchEvent` from the import in Step 2 if the editor flags them as unused — they are listed for convenience; drop whichever are unused).

- [ ] **Step 8: Commit**

```bash
git add components/football/FootballGame.tsx components/football/MatchPitch.tsx
git commit -m "feat: single-player matches play the engine tape with halftime adjustment + skip"
```

---

## Task 10: Full build + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: build succeeds with no type errors. (Reminder: `npm run build` runs `prisma generate` first — that's fine.)

- [ ] **Step 2: Run the app**

Run: `npm run dev` and open http://localhost:3000. Sign in, go to **Play → Football**, fill a 7-card squad, **Kick Off**.

- [ ] **Step 3: Verify the match visuals**

Confirm by watching one match:
- Players slide toward role positions — attackers push up when their team attacks, defenders drop when defending (no more wobble-in-place).
- The ball visibly travels between the **named** players in the commentary (build-up through defenders/midfielders, shots from the final third).
- The white "possessor" ring is on the player who actually has the ball.
- A goal triggers the flash + scorer spotlight, and the scoreboard updates.

- [ ] **Step 4: Verify halftime + skip**

- At ~half-duration the **Half Time** modal appears with the score and a **formation picker**. Choose a different formation → **Second Half** → play resumes and the second half reflects the new shape.
- Replay; press **Skip ⏭** during the first half → it jumps to the Half Time modal (you can still adjust).
- Press **Skip ⏭** during the second half → it jumps to the result.
- Replay; on the Half Time modal press **Skip to result** → goes straight to the result keeping the current formation.

- [ ] **Step 5: Verify the result screen**

- Final score, Your/CPU OVR, goalscorers list, and Man of the Match all populate correctly.
- The season **W / L / D** counters increment (confirms the `POST /api/football` write).
- **Play Again** returns to setup cleanly.

- [ ] **Step 6: Final full test run**

Run: `npm test`
Expected: all suites pass.

---

## Definition of done (Plan 1)

- Single-player matches are driven by `lib/match-engine.ts`; players and ball move according to real simulation state.
- Halftime formation adjustment works and influences the second half; the CPU also re-picks.
- Skip behaves as specified (1st half → halftime; 2nd half → result; halftime modal → result).
- Engine determinism, balance, and invariants are covered by Vitest; `npm test`, `npm run build`, and `npm run lint` all pass.
- PvP is untouched and still functions on the old `FootballPitch.tsx` (migrated in Plan 2).

## Hand-off to Plan 2 (PvP)

Plan 2 will: run the engine server-side in `app/api/lobbies/[id]/`, store the seed + formations + tapes on the `Lobby` model, broadcast `half-ready` signals over Pusher, add the `halftime` sync route, switch the lobby page to fetch tapes and render via `MatchPitch` (mirrored), and delete `FootballPitch.tsx` + `hooks/useMatchSync.ts` + the `tick` route. The engine, `MatchPitch`, `simulateFirstHalf`/`simulateSecondHalf`, and `sampleTimeline` from this plan are reused unchanged.
