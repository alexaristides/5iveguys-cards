import { describe, it, expect } from "vitest";
import {
  createTournament, advance, nextUserFixture, USER_ID,
} from "@/lib/worldcup/tournament";
import type { TournamentState } from "@/lib/worldcup/types";
import type { Formation } from "@/lib/football";

function make(seed: string, userOverall = 80): TournamentState {
  const args: Parameters<typeof createTournament>[0] = {
    seed,
    difficulty: "even",
    userName: "Test FC",
    userOverall,
    userFlag: null,
    userLineup: Array.from({ length: 7 }, (_, i) => ({
      position: (i === 0 ? "GK" : "MID") as "GK" | "MID",
      posIndex: i,
      cardId: `c${i}`,
    })),
    userFormation: "2-2-2" as Formation,
  };
  return createTournament(args);
}

// Drive the whole tournament from the user's side, always reporting the same
// result, so a run is fully determined by the seed.
function playThrough(seed: string, userWins: boolean): TournamentState {
  let state = make(seed);
  let guard = 0;
  while (state.stage !== "done" && guard++ < 50) {
    const fx = nextUserFixture(state);
    if (!fx) break;
    const result = userWins
      ? { userScore: 2, cpuScore: 1, userWon: true }
      : { userScore: 0, cpuScore: 2, userWon: false };
    state = advance(state, fx.id, result);
  }
  return state;
}

describe("World Cup tournament", () => {
  it("draws 12 groups of 4 with 48 entrants including the user", () => {
    const s = make("seed-a");
    expect(s.entrants).toHaveLength(48);
    expect(s.groups).toHaveLength(12);
    for (const g of s.groups) expect(g.entrantIds).toHaveLength(4);
    expect(s.entrants.filter((e) => e.isUser)).toHaveLength(1);
    expect(s.groups.some((g) => g.entrantIds.includes(USER_ID))).toBe(true);
    // user has exactly 3 group fixtures
    expect(s.fixtures.filter((f) => f.isUser && f.stage === "group")).toHaveLength(3);
    // 12 groups * 6 matches
    expect(s.fixtures.filter((f) => f.stage === "group")).toHaveLength(72);
  });

  it("is deterministic — same seed yields identical draw", () => {
    expect(JSON.stringify(make("xyz"))).toEqual(JSON.stringify(make("xyz")));
    expect(JSON.stringify(make("xyz"))).not.toEqual(JSON.stringify(make("abc")));
  });

  it("plays through to a champion when the user wins everything", () => {
    const s = playThrough("champ-run", true);
    expect(s.stage).toBe("done");
    expect(s.champion).toBe(USER_ID);
    expect(s.userPlacement).toBe("Champions");
    // bracket sizes
    expect(s.fixtures.filter((f) => f.stage === "R32")).toHaveLength(16);
    expect(s.fixtures.filter((f) => f.stage === "R16")).toHaveLength(8);
    expect(s.fixtures.filter((f) => f.stage === "QF")).toHaveLength(4);
    expect(s.fixtures.filter((f) => f.stage === "SF")).toHaveLength(2);
    expect(s.fixtures.filter((f) => f.stage === "final")).toHaveLength(1);
    expect(s.fixtures.every((f) => f.played)).toBe(true);
  });

  it("crowns a (non-user) champion and records placement when the user loses out", () => {
    const s = playThrough("lose-run", false);
    expect(s.stage).toBe("done");
    expect(s.champion).not.toBeNull();
    expect(s.champion).not.toBe(USER_ID);
    expect(s.userPlacement).toBeTruthy();
    expect(s.fixtures.every((f) => f.played)).toBe(true);
  });

  it("full run is reproducible for a fixed seed + fixed user results", () => {
    expect(JSON.stringify(playThrough("repro", true))).toEqual(JSON.stringify(playThrough("repro", true)));
  });
});
