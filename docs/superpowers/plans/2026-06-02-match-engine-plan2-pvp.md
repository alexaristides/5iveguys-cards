# Match Engine — Plan 2: PvP on the new engine (full parity + halftime)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring online head-to-head matches onto the new possession engine + `MatchPitch` renderer, with full single-player parity including the halftime formation change (a mid-match sync point between the two players).

**Architecture:** Keep the existing PvP model — **both clients re-simulate locally** for display (seeded by `lobbyId`), while the **server's stored `MatchResult` is authoritative** for the recorded outcome. Swap `simulateMatch` → the new engine (`simulateFirstHalf`/`simulateSecondHalf`). Render `MatchPitch` instead of `FootballPitch`; the opponent mirrors the tape 180° so their team sits at the bottom. The halftime change adds a sync point: each player POSTs their 2nd-half formation, the server stores both, computes the authoritative final result, and broadcasts both formations so each client computes the same second half locally.

**Tech Stack:** TypeScript, Next.js 15, Prisma/Postgres, Pusher Channels, `seedrandom`, Vitest. Reuses everything from Plan 1 (`lib/match-engine.ts`, `MatchPitch.tsx`, `lib/match-playback.ts`).

**Spec:** `docs/superpowers/specs/2026-06-02-football-match-engine-design.md` (this plan adapts the PvP section to the codebase's existing "client re-sim + server-authoritative" pattern rather than transferring tapes).

**Prerequisite:** Plan 1 is implemented and merged/branched in (engine, `MatchPitch`, `sampleTimeline` all exist).

---

## Key design decisions

- **No tape transfer.** Both clients compute frames locally with the new engine (deterministic, `seed = lobbyId`), exactly as the current code computes `simulateMatch` locally. This matches the existing architecture and avoids large Pusher/DB payloads.
- **Engine perspective is fixed:** every caller (both clients + server) runs `simulate*Half` with `userLineup = creatorLineup`, `cpuLineup = opponentLineup`, `seed = lobbyId` → identical results. The **opponent mirrors** the resulting frames for display.
- **Server authoritative result:** the final winner/scoreline + a full `summary` (with events, for the result screen) are computed and stored in `MatchResult` once **both** halftime formations are in.
- **Halftime sync:** `POST /api/lobbies/[id]/halftime { formation }`. Server records `creatorFormation2`/`opponentFormation2`. When both present → compute + store result, broadcast `match:half2-ready { creatorFormation2, opponentFormation2 }`. A client whose user hasn't picked auto-submits their current formation after 30s, so the sync never stalls.
- **No wager** (the app doesn't have one); keep W/L/D (`pvpWins/Losses/Draws`).

## File structure

**New:**
- `app/api/lobbies/[id]/halftime/route.ts` — halftime formation exchange + authoritative result.

**Modified:**
- `prisma/schema.prisma` — add `creatorFormation2`, `opponentFormation2` to `Lobby`.
- `lib/match-playback.ts` — add `mirrorTape()`.
- `app/api/lobbies/[id]/squad/route.ts` — store lineups+formations (no full sim at lock); create a placeholder `MatchResult`.
- `app/api/lobbies/[id]/result/route.ts` — minor: tolerate a result computed at halftime; unchanged winner logic.
- `hooks/useLobby.ts` — new `StoredSimulation` shape; handle `match:half2-ready`; expose `halftimeData`.
- `app/lobby/[id]/page.tsx` — render `MatchPitch`, compute tapes locally, halftime picker + sync, mirror for opponent, result from stored `summary`.

**Deleted:**
- `app/api/lobbies/[id]/tick/route.ts`
- `hooks/useMatchSync.ts`

---

## Task 1: Add halftime-formation columns to Lobby

**Files:** Modify `prisma/schema.prisma`; run `npm run db:push`.

- [ ] **Step 1: Add the columns**

In `model Lobby`, after `opponentSquad Json?`, add:
```prisma
  creatorFormation2  String?
  opponentFormation2 String?
```

- [ ] **Step 2: Push the schema**

Run: `npm run db:push`
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(pvp): add halftime formation columns to Lobby"
```

---

## Task 2: `mirrorTape` helper (opponent perspective)

**Files:**
- Modify: `lib/match-playback.ts`
- Test: `lib/__tests__/match-playback.test.ts`

Flips frames 180° (so the opponent's team is at the bottom) and swaps the `team`/score fields so the opponent reads as "you".

- [ ] **Step 1: Add the failing test** (append to `lib/__tests__/match-playback.test.ts`)

```ts
import { mirrorTape } from "@/lib/match-playback";
import type { MatchFrame } from "@/lib/match-engine";

describe("mirrorTape", () => {
  const frames: MatchFrame[] = [{
    minute: 10, ball: { x: 30, y: 20 }, possessorId: "a",
    players: [{ id: "a", x: 30, y: 20 }, { id: "b", x: 70, y: 80 }],
    event: { minute: 10, type: "goal", team: "user", description: "g", scoreUser: 1, scoreCpu: 0, phase: "user-attack" },
    scoreUser: 1, scoreCpu: 0,
  }];

  it("rotates coordinates 180 degrees", () => {
    const m = mirrorTape(frames)[0];
    expect(m.ball).toEqual({ x: 70, y: 80 });
    expect(m.players.find((p) => p.id === "a")).toEqual({ id: "a", x: 70, y: 80 });
  });

  it("swaps team and score so the opponent reads as 'you'", () => {
    const m = mirrorTape(frames)[0];
    expect(m.event!.team).toBe("cpu");
    expect(m.event!.scoreUser).toBe(0);
    expect(m.event!.scoreCpu).toBe(1);
    expect(m.scoreUser).toBe(0);
    expect(m.scoreCpu).toBe(1);
  });

  it("keeps possessor id unchanged", () => {
    expect(mirrorTape(frames)[0].possessorId).toBe("a");
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm test -- match-playback`
Expected: FAIL — `mirrorTape` not exported.

- [ ] **Step 3: Implement** (append to `lib/match-playback.ts`)

```ts
import type { MatchFrame } from "./match-engine";

/** Rotate a tape 180° and swap team/score fields, for the opponent's perspective. */
export function mirrorTape(frames: MatchFrame[]): MatchFrame[] {
  const flip = (t: "user" | "cpu"): "user" | "cpu" => (t === "user" ? "cpu" : "user");
  return frames.map((f) => ({
    minute: f.minute,
    ball: { x: 100 - f.ball.x, y: 100 - f.ball.y },
    possessorId: f.possessorId,
    players: f.players.map((p) => ({ id: p.id, x: 100 - p.x, y: 100 - p.y })),
    scoreUser: f.scoreCpu,
    scoreCpu: f.scoreUser,
    event: f.event ? { ...f.event, team: flip(f.event.team), scoreUser: f.event.scoreCpu, scoreCpu: f.event.scoreUser } : undefined,
  }));
}
```
(If `lib/match-playback.ts` already imports `MatchFrame`, reuse the existing import instead of adding a duplicate.)

- [ ] **Step 4: Run it (passes)**

Run: `npm test -- match-playback`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/match-playback.ts lib/__tests__/match-playback.test.ts
git commit -m "feat(pvp): mirrorTape helper for opponent perspective"
```

---

## Task 3: Squad route — store lineups, defer the result

**Files:** Modify `app/api/lobbies/[id]/squad/route.ts`.

At squad-lock we no longer compute the full match (the halftime change happens later). We just store both lineups+formations and signal `matchReady`.

- [ ] **Step 1: Update the imports**

Replace line 6–7:
```ts
import seedrandom from "seedrandom";
import { simulateMatch, type Formation, type Position, type AssignedPlayer } from "@/lib/football";
```
with:
```ts
import { type Formation, type Position, type AssignedPlayer } from "@/lib/football";
```

- [ ] **Step 2: Replace the "both ready" block**

Replace everything from `// Both ready — compute deterministic simulation and store it` (line 91) through the end of the function (the closing `}` of `POST`) with:
```ts
  // Both ready — store lineups + formations. The authoritative result is
  // computed at halftime (once both 2nd-half formations are known).
  await prisma.matchResult.create({
    data: {
      lobbyId: id,
      player1Id: lobby.creatorId,
      player2Id: lobby.opponentId!,
      winnerId: null,
      scoreline: "–",
      simulation: {
        creatorFormation: creatorSquad.formation,
        opponentFormation: opponentSquad.formation,
        creatorLineup: creatorSquad.players,
        opponentLineup: opponentSquad.players,
      } as object,
    },
  });

  await pusher.trigger(`presence-lobby-${id}`, "lobby:squad_locked", {
    player: "both",
    matchReady: true,
  });

  return NextResponse.json({ status: "match-ready" });
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors (note `seedrandom`/`simulateMatch` are no longer referenced here).

- [ ] **Step 4: Commit**

```bash
git add app/api/lobbies/[id]/squad/route.ts
git commit -m "feat(pvp): squad-lock stores lineups; result deferred to halftime"
```

---

## Task 4: Halftime route — exchange formations + authoritative result

**Files:** Create `app/api/lobbies/[id]/halftime/route.ts`.

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pusher } from "@/lib/pusher";
import { assignPositions, type Formation, type AssignedPlayer } from "@/lib/football";
import { simulateFirstHalf, simulateSecondHalf } from "@/lib/match-engine";

interface StoredAtLock {
  creatorFormation: Formation;
  opponentFormation: Formation;
  creatorLineup: AssignedPlayer[];
  opponentLineup: AssignedPlayer[];
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { formation } = (await req.json()) as { formation: Formation };

  const lobby = await prisma.lobby.findUnique({ where: { id }, include: { matchResult: true } });
  if (!lobby) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userId = session.user.id;
  const isCreator = lobby.creatorId === userId;
  const isOpponent = lobby.opponentId === userId;
  if (!isCreator && !isOpponent) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

  // Record this player's 2nd-half formation.
  const field = isCreator ? "creatorFormation2" : "opponentFormation2";
  const updated = await prisma.lobby.update({ where: { id }, data: { [field]: formation } });
  const cF2 = updated.creatorFormation2 as Formation | null;
  const oF2 = updated.opponentFormation2 as Formation | null;

  if (!cF2 || !oF2) {
    await pusher.trigger(`presence-lobby-${id}`, "lobby:halftime-waiting", { who: isCreator ? "creator" : "opponent" });
    return NextResponse.json({ status: "waiting" });
  }

  // Both in → compute the authoritative full result and store it.
  const stored = lobby.matchResult?.simulation as unknown as StoredAtLock | null;
  if (!stored) return NextResponse.json({ error: "Squads not locked" }, { status: 409 });

  const h1 = simulateFirstHalf({
    userLineup: stored.creatorLineup,
    cpuLineup: stored.opponentLineup,
    userFormation: stored.creatorFormation,
    cpuFormation: stored.opponentFormation,
    seed: id,
  });
  const { summary } = simulateSecondHalf({
    userLineup: assignPositions(stored.creatorLineup.map((p) => p.card), cF2),
    cpuLineup: assignPositions(stored.opponentLineup.map((p) => p.card), oF2),
    userFormation: cF2,
    cpuFormation: oF2,
    seed: id,
    halftimeScore: h1.endScore,
    involvements: new Map(h1.involvements),
    firstHalfEvents: h1.events,
  });

  const scoreline = `${summary.userScore}–${summary.cpuScore}`;
  const winnerId = summary.result === "win" ? lobby.creatorId : summary.result === "loss" ? lobby.opponentId : null;

  await prisma.matchResult.update({
    where: { lobbyId: id },
    data: {
      winnerId,
      scoreline,
      simulation: { ...stored, creatorFormation2: cF2, opponentFormation2: oF2, summary } as object,
    },
  });

  await pusher.trigger(`presence-lobby-${id}`, "match:half2-ready", { creatorFormation2: cF2, opponentFormation2: oF2 });
  return NextResponse.json({ status: "ready" });
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/lobbies/[id]/halftime/route.ts
git commit -m "feat(pvp): halftime route exchanges formations + computes authoritative result"
```

---

## Task 5: `useLobby` — new stored shape + half2-ready signal

**Files:** Modify `hooks/useLobby.ts`.

- [ ] **Step 1: Replace the `StoredSimulation` interface** (lines 14–20)

```ts
export interface StoredSimulation {
  creatorFormation: Formation;
  opponentFormation: Formation;
  creatorLineup: AssignedPlayer[];
  opponentLineup: AssignedPlayer[];
  creatorFormation2?: Formation;
  opponentFormation2?: Formation;
  summary?: import("@/lib/football").MatchSimulation;
}
```

- [ ] **Step 2: Add `halftimeData` to state**

In the `State` interface add:
```ts
  halftimeData: { creatorFormation2: Formation; opponentFormation2: Formation } | null;
```
In the initial `useState<State>({ ... })` add `halftimeData: null,`.

- [ ] **Step 3: Handle `match:half2-ready`** in `handleRef.current`

After the `match:fulltime` branch (before `void lobby;`), add:
```ts
    else if (event === "match:half2-ready") {
      setState((s) => ({
        ...s,
        halftimeData: {
          creatorFormation2: d.creatorFormation2 as Formation,
          opponentFormation2: d.opponentFormation2 as Formation,
        },
      }));
    }
```

- [ ] **Step 4: Bind/unbind the new event** in the subscription effect

Alongside the existing binds:
```ts
    const half2Cb = cb("match:half2-ready");
    channel.bind("match:half2-ready", half2Cb);
```
and in the cleanup:
```ts
    channel.unbind("match:half2-ready", half2Cb);
```

- [ ] **Step 5: Return `halftimeData`**

The hook already returns `{ ...state, ... }`, so `halftimeData` is included automatically. Confirm `...state` is spread in the return.

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit` (expect no errors), then:
```bash
git add hooks/useLobby.ts
git commit -m "feat(pvp): useLobby handles half2-ready and new stored shape"
```

---

## Task 6: Lobby page — render `MatchPitch`, local tapes, halftime sync

**Files:** Modify `app/lobby/[id]/page.tsx`. A sequence of scoped edits.

- [ ] **Step 1: Imports** — replace lines 8–18 with:
```ts
import { QRCodeSVG } from "qrcode.react";
import {
  type Formation, type FootballCard, type LineupSlot, type AssignedPlayer,
  type MatchSimulation,
  buildSlots, slotsToLineup, assignPositions, FORMATIONS,
} from "@/lib/football";
import { simulateFirstHalf, simulateSecondHalf, type HalfResult, type MatchFrame } from "@/lib/match-engine";
import { mirrorTape } from "@/lib/match-playback";
import { useLobby, type StoredSimulation } from "@/hooks/useLobby";
import FormationPitchSelector from "@/components/football/FormationPitchSelector";
import MatchPitch from "@/components/football/MatchPitch";
```

- [ ] **Step 2: Pull `halftimeData` from the hook** — change the `useLobby(...)` destructure (line ~61):
```ts
  const { lobby, phase, role, opponentSquadLocked, halftimeData, joinLobby, setPhase } = useLobby(
    lobbyId,
    sessionStatus === "loading" ? undefined : userId,
  );
```

- [ ] **Step 3: Replace the match-state block** (lines ~78–86) with:
```ts
  // Match state
  const [firstHalf, setFirstHalf] = useState<HalfResult | null>(null);
  const [secondHalfFrames, setSecondHalfFrames] = useState<MatchFrame[] | null>(null);
  const [summary, setSummary] = useState<MatchSimulation | null>(null);
  const [creatorLineup, setCreatorLineup] = useState<AssignedPlayer[]>([]);
  const [opponentLineup, setOpponentLineup] = useState<AssignedPlayer[]>([]);
  const [creatorFormation, setCreatorFormation] = useState<Formation>("2-2-2");
  const [opponentFormation, setOpponentFormation] = useState<Formation>("2-2-2");
  const [showHalftime, setShowHalftime] = useState(false);
  const [secondHalfFormation, setSecondHalfFormation] = useState<Formation>("2-2-2");
  const [halftimeSubmitted, setHalftimeSubmitted] = useState(false);
  const halftimeSubmittedRef = useRef(false);
  const secondHalfFormationRef = useRef<Formation>("2-2-2");
```
Add `useRef` to the React import at the top of the file (`import { use, useCallback, useEffect, useRef, useState } from "react";`).

- [ ] **Step 4: Delete the `useMatchSync` block** (lines ~88–93). Remove it entirely.

- [ ] **Step 5: Replace `buildSimulation` with `buildFirstHalf`** (lines ~125–136):
```ts
  const buildFirstHalf = useCallback((stored: StoredSimulation) => {
    setCreatorLineup(stored.creatorLineup);
    setOpponentLineup(stored.opponentLineup);
    setCreatorFormation(stored.creatorFormation);
    setOpponentFormation(stored.opponentFormation);
    const mine = role === "creator" ? stored.creatorFormation : stored.opponentFormation;
    setSecondHalfFormation(mine);
    secondHalfFormationRef.current = mine;
    setFirstHalf(simulateFirstHalf({
      userLineup: stored.creatorLineup,
      cpuLineup: stored.opponentLineup,
      userFormation: stored.creatorFormation,
      cpuFormation: stored.opponentFormation,
      seed: lobbyId,
    }));
  }, [lobbyId, role]);
```

- [ ] **Step 6: Countdown effect** (lines ~138–149) — change `buildSimulation(lobby.matchResult.simulation)` to `buildFirstHalf(lobby.matchResult.simulation as StoredSimulation)`; the guard becomes `if (phase !== "countdown" || !lobby?.matchResult?.simulation) return;` (unchanged). The 3-2-1 countdown stays.

- [ ] **Step 7: Replace the "finished on load" effect** (lines ~152–156):
```ts
  useEffect(() => {
    if (phase === "result" && lobby?.matchResult?.simulation && !summary) {
      const st = lobby.matchResult.simulation as StoredSimulation;
      setCreatorLineup(st.creatorLineup);
      setOpponentLineup(st.opponentLineup);
      if (st.summary) setSummary(st.summary);
    }
  }, [phase, lobby?.matchResult, summary]);
```

- [ ] **Step 8: Add the halftime effect + handlers** (place near the other handlers, e.g. after `handleMatchComplete`):
```ts
  // When both 2nd-half formations arrive, compute the second half locally.
  useEffect(() => {
    if (!halftimeData || !firstHalf || secondHalfFrames) return;
    const { creatorFormation2, opponentFormation2 } = halftimeData;
    const { frames, summary: s } = simulateSecondHalf({
      userLineup: assignPositions(creatorLineup.map((p) => p.card), creatorFormation2),
      cpuLineup: assignPositions(opponentLineup.map((p) => p.card), opponentFormation2),
      userFormation: creatorFormation2,
      cpuFormation: opponentFormation2,
      seed: lobbyId,
      halftimeScore: firstHalf.endScore,
      involvements: new Map(firstHalf.involvements),
      firstHalfEvents: firstHalf.events,
    });
    setSummary(s);
    setSecondHalfFrames(frames);
    setShowHalftime(false);
  }, [halftimeData, firstHalf, secondHalfFrames, creatorLineup, opponentLineup, lobbyId]);

  const submitHalftime = useCallback(async (f: Formation) => {
    if (halftimeSubmittedRef.current) return;
    halftimeSubmittedRef.current = true;
    setHalftimeSubmitted(true);
    try {
      await fetch(`/api/lobbies/${lobbyId}/halftime`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formation: f }),
      });
    } catch { /* the 30s auto-submit on the other side keeps things moving */ }
  }, [lobbyId]);

  function handleHalftimeReached() {
    setShowHalftime(true);
    // Auto-submit current pick after 30s so a slow/AFK player can't stall the sync.
    setTimeout(() => submitHalftime(secondHalfFormationRef.current), 30000);
  }
```

- [ ] **Step 9: Replace the match render block** (`if (phase === "match" && simulation) { ... }`, lines ~455–493) with:
```tsx
  if (phase === "match" && firstHalf) {
    const userIsCreator = role === "creator";
    const uLabel = myName ?? "You";
    const cLabel = opponentName ?? "Opponent";
    const userLineupPv = userIsCreator ? creatorLineup : opponentLineup;
    const cpuLineupPv  = userIsCreator ? opponentLineup : creatorLineup;
    const firstFrames  = userIsCreator ? firstHalf.frames : mirrorTape(firstHalf.frames);
    const secondFrames = secondHalfFrames ? (userIsCreator ? secondHalfFrames : mirrorTape(secondHalfFrames)) : null;
    const htMy  = userIsCreator ? firstHalf.endScore.user : firstHalf.endScore.cpu;
    const htOpp = userIsCreator ? firstHalf.endScore.cpu : firstHalf.endScore.user;

    return pageWrapper(
      <div className="w-full">
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-2">
            <Avatar src={session?.user?.image} name={myName} size={8} />
            <span className="text-white font-bold text-sm">{myName ?? "You"}</span>
          </div>
          <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">PvP Match</span>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">{opponentName ?? "Opponent"}</span>
            <Avatar src={opponentAvatar} name={opponentName} size={8} />
          </div>
        </div>

        <MatchPitch
          userLineup={userLineupPv}
          cpuLineup={cpuLineupPv}
          firstHalfFrames={firstFrames}
          secondHalfFrames={secondFrames}
          userLabel={uLabel}
          cpuLabel={cLabel}
          onHalftime={handleHalftimeReached}
          onComplete={handleMatchComplete}
        />

        {showHalftime && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl p-6 text-center">
              <div className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-2">Half Time</div>
              <div className="text-white text-4xl font-black mb-4">{htMy}–{htOpp}</div>
              {!halftimeSubmitted ? (
                <>
                  <div className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Second-half formation</div>
                  <div className="grid grid-cols-2 gap-2 mb-5">
                    {(["2-2-2", "3-2-1", "1-3-2", "2-3-1"] as Formation[]).map((f) => (
                      <button key={f}
                        onClick={() => { setSecondHalfFormation(f); secondHalfFormationRef.current = f; }}
                        className={`py-2 rounded-lg text-sm font-bold border transition-all ${secondHalfFormation === f ? "bg-green-700 border-green-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
                        {FORMATIONS[f].label}
                        <span className="block text-[9px] font-normal text-zinc-400">{FORMATIONS[f].desc}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => submitHalftime(secondHalfFormation)}
                    className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-all active:scale-95">
                    Confirm
                  </button>
                </>
              ) : (
                <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm py-4">
                  <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                  Waiting for opponent…
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
```

- [ ] **Step 10: Result block** — in the `if (phase === "result")` block (lines ~496–610), replace every `simulation` reference with `summary`:
  - `const myScore = simulation ? ... ` → `const myScore = summary ? (userIsCreator ? summary.userScore : summary.cpuScore) : 0;`
  - `const oppScore = simulation ? ...` → `... summary ? (userIsCreator ? summary.cpuScore : summary.userScore) : 0;`
  - The goals section guard `{simulation && (myScore > 0 ...)` → `{summary && (myScore > 0 ...)` and both `simulation.events` → `summary.events`.

- [ ] **Step 11: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. (`simulation`, `useMatchSync`, `simulateMatch`, `seedrandom`, `FootballPitch` should all be gone from this file.)

- [ ] **Step 12: Commit**

```bash
git add app/lobby/[id]/page.tsx
git commit -m "feat(pvp): play PvP matches on the new engine via MatchPitch with halftime sync"
```

---

## Task 7: Remove the dead tick path

**Files:** Delete `app/api/lobbies/[id]/tick/route.ts` and `hooks/useMatchSync.ts`.

- [ ] **Step 1: Confirm nothing imports them**

Run: `grep -rn "useMatchSync\|/tick" app hooks components lib --include=*.ts --include=*.tsx`
Expected: no matches (the page no longer imports `useMatchSync`; nothing calls the tick route).

- [ ] **Step 2: Delete**

```bash
git rm app/api/lobbies/[id]/tick/route.ts hooks/useMatchSync.ts
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: clean build, all tests pass.
```bash
git commit -m "chore(pvp): remove per-event tick streaming (replaced by local tapes)"
```

---

## Task 8: Build + manual verification (two players)

**Files:** none.

PvP needs two sessions. Use two browser profiles (or one normal + one incognito) signed into **different Google accounts**, both pointed at the same lobby URL.

- [ ] **Step 1:** `npm run build` succeeds; `npm run dev` running.
- [ ] **Step 2:** Player A: Game → PvP → create lobby. Player B: open the invite URL → Join.
- [ ] **Step 3:** Both pick a squad + formation → Lock In. Both transition through countdown into the match.
- [ ] **Step 4:** Confirm **each player sees their own team at the bottom in blue**, opponent red at top (mirroring), names/possession banner/pop-ups all correct from each perspective, and the scoreboard shows each player's own score first.
- [ ] **Step 5:** At halftime both get the formation picker. Have each pick a different formation and Confirm → both resume the second half together; a player who doesn't pick is auto-submitted after 30s.
- [ ] **Step 6:** At full time both see the result screen with the **same** scoreline and the correct winner/loser, and the goals breakdown populates. Confirm `pvpWins/Losses/Draws` updated (check Player A wins vs B loss).
- [ ] **Step 7:** Reload a FINISHED lobby URL → result screen still renders from the stored `summary`.
- [ ] **Step 8:** (Edge) During the match, close Player B's tab → after ~30s Player A should win by forfeit (existing behaviour, unchanged).

---

## Definition of done (Plan 2)

- Online PvP matches play on the new engine via `MatchPitch`, mirrored per perspective.
- Halftime formation change works for both players with a server-coordinated sync point (+30s auto-submit fallback).
- The recorded result (winner/scoreline + W/L/D) is server-authoritative and matches what both players watched.
- `tick` route and `useMatchSync` are gone; `FootballPitch` is now unused (see note) — `npm test`, `npm run build` pass.

## Cleanup note

After this plan, `components/football/FootballPitch.tsx` has no remaining importers. Delete it in a final commit once Step 1 of Task 7's grep confirms it's unreferenced:
```bash
grep -rn "FootballPitch" app components hooks lib --include=*.ts --include=*.tsx
git rm components/football/FootballPitch.tsx
```
(Keep `lib/formation-positions.ts` — it now backs the engine. The duplicate position maps inside the old `FootballPitch` go away with the file.)

## Determinism note

Both clients compute display frames locally with `seed = lobbyId`; the server computes the authoritative result the same way. This is the same cross-device-determinism assumption the app already shipped with (the old `simulateMatch` was also re-run client-side). Outcome math (`Math.exp` sigmoid) is unchanged in risk; the new `Math.hypot` in pressing only affects *positions*, never scores, so it can't desync results.
