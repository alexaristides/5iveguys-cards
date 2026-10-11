import { describe, expect, it } from "vitest";
import {
  EMPTY_STATS, entryError, freeTransfersFor, gameweekStatus, playerPoints, priceSquad, scoreEntry,
  suggestPrices, toFantasyPosition, transferCostFor, transfersBetween,
  type FantasyPosition, type PlayerStats, type SquadPlayer,
} from "../fantasy";

// A 9-player squad: GK, 3 DEF, 2 MID, 1 FWD starting; a DEF and a FWD on the bench.
const SQUAD: [string, FantasyPosition, number][] = [
  ["gk", "GK", 50], ["d1", "DEF", 50], ["d2", "DEF", 50], ["d3", "DEF", 50],
  ["m1", "MID", 60], ["m2", "MID", 60], ["f1", "FWD", 80],
  ["d4", "DEF", 45], ["f2", "FWD", 45],
];
const EXTRA: [string, FantasyPosition, number][] = [["f3", "FWD", 100], ["gk2", "GK", 40], ["m3", "MID", 55]];
const players = new Map<string, SquadPlayer>(
  [...SQUAD, ...EXTRA].map(([id, position, price]) => [id, { id, position, price, isActive: true }]),
);
const positions = new Map([...players.values()].map((p) => [p.id, p.position]));
const ids = SQUAD.map(([id]) => id);
const played = (extra: Partial<PlayerStats> = {}): PlayerStats => ({ ...EMPTY_STATS, played: true, ...extra });

describe("playerPoints", () => {
  it("scores nothing for a player who didn't play", () => {
    expect(playerPoints({ ...EMPTY_STATS, goals: 2 }, "FWD")).toBe(0);
  });
  it("adds up goals, hat-trick, assists, MOTM and cards", () => {
    // 1 appearance + 15 goals + 3 hat-trick + 3 assist + 3 MOTM - 1 yellow
    expect(playerPoints(played({ goals: 3, assists: 1, motm: true, yellowCards: 1 }), "FWD")).toBe(24);
  });
  it("only gives clean sheets to keepers and defenders", () => {
    expect(playerPoints(played({ cleanSheet: true }), "DEF")).toBe(11);
    expect(playerPoints(played({ cleanSheet: true }), "MID")).toBe(1);
  });
});

describe("entryError", () => {
  const ok = { playerIds: ids, captainId: "f1", viceCaptainId: "m1", chip: null };
  const opts = { budget: 500, baseline: null, usedChips: [] };

  it("accepts a legal squad within budget", () => {
    expect(entryError(ok, players, opts)).toBeNull();
  });
  it("rejects squads over budget", () => {
    expect(entryError(ok, players, { ...opts, budget: 400 })).toMatch(/budget/);
  });
  it("needs exactly one keeper and the minimum outfield roles in the starting 7", () => {
    const noKeeper = ["d4", ...ids.slice(1, 7), "gk", "f2"];
    expect(entryError({ ...ok, playerIds: noKeeper }, players, opts)).toMatch(/starting 7/);
    const oneDefender = ["gk", "d1", "m1", "m2", "f1", "f2", "m3", "d2", "d3"];
    expect(entryError({ ...ok, playerIds: oneDefender }, players, opts)).toMatch(/starting 7/);
  });
  it("needs the captain and vice in the starting 7", () => {
    expect(entryError({ ...ok, captainId: "d4" }, players, opts)).toMatch(/captain/);
    expect(entryError({ ...ok, viceCaptainId: "f1" }, players, opts)).toMatch(/different/);
  });
  it("blocks chips already used and a wildcard on the first squad", () => {
    expect(entryError({ ...ok, chip: "bench_boost" }, players, { ...opts, usedChips: ["bench_boost"] })).toMatch(/already used/);
    expect(entryError({ ...ok, chip: "wildcard" }, players, opts)).toMatch(/Wildcard/);
  });
  it("lets owners keep a player who left, but nobody can buy them", () => {
    const left = new Map(players);
    left.set("f1", { ...players.get("f1")!, isActive: false });
    expect(entryError(ok, left, opts)).toMatch(/left the squad/);
    const baseline = priceSquad(ids, players, null);
    expect(entryError(ok, left, { ...opts, baseline })).toBeNull();
  });
  it("values kept players at the price paid, not today's price", () => {
    const baseline = priceSquad(ids, players, null); // f1 bought at 80
    const risen = new Map(players);
    risen.set("f1", { ...players.get("f1")!, price: 120 });
    expect(entryError(ok, risen, { ...opts, budget: 490, baseline })).toBeNull();
    expect(entryError(ok, risen, { ...opts, budget: 490, baseline: null })).toMatch(/budget/);
  });
});

describe("transfers", () => {
  it("counts new players against the locked squad", () => {
    const baseline = priceSquad(ids, players, null);
    expect(transfersBetween(ids, baseline)).toBe(0);
    expect(transfersBetween([...ids.slice(0, 6), "f3", ...ids.slice(7)], baseline)).toBe(1);
    expect(transfersBetween(ids, null)).toBe(0);
  });

  it("gives unlimited changes before the first lock, then 1 a week banking up to 2", () => {
    expect(freeTransfersFor([], new Map())).toBeNull();
    const entries = new Map([[1, { transfersMade: 0, chip: null }]]);
    expect(freeTransfersFor([1], entries)).toBe(1);
    expect(freeTransfersFor([1, 2], entries)).toBe(2); // GW2 carried over unused
    expect(freeTransfersFor([1, 2, 3], entries)).toBe(2); // capped
    entries.set(3, { transfersMade: 2, chip: null });
    expect(freeTransfersFor([1, 2, 3], entries)).toBe(1);
  });

  it("ignores gameweeks before the team existed and keeps free transfers through a wildcard", () => {
    const entries = new Map<number, { transfersMade: number; chip: null | "wildcard" }>([
      [3, { transfersMade: 0, chip: null }],
      [4, { transfersMade: 6, chip: "wildcard" }],
    ]);
    expect(freeTransfersFor([1, 2, 3], entries)).toBe(1);
    expect(freeTransfersFor([1, 2, 3, 4], entries)).toBe(2);
  });

  it("charges 4 points per transfer beyond the free ones", () => {
    expect(transferCostFor(3, 1, null)).toBe(8);
    expect(transferCostFor(1, 2, null)).toBe(0);
    expect(transferCostFor(5, 1, "wildcard")).toBe(0);
    expect(transferCostFor(5, null, null)).toBe(0);
  });
});

describe("scoreEntry", () => {
  const base = { playerIds: ids, captainId: "f1", viceCaptainId: "m1", chip: null, transferCost: 0 };
  const everyone = (overrides: Record<string, PlayerStats> = {}) =>
    new Map(ids.map((id) => [id, overrides[id] ?? played()]));

  it("doubles the captain and ignores the bench", () => {
    const s = scoreEntry(base, positions, everyone({ f1: played({ goals: 1 }) }));
    // 6 starters × 1 + captain (1 + 5) × 2
    expect(s.total).toBe(18);
    expect(s.captainId).toBe("f1");
    expect(s.players.find((p) => p.playerId === "d4")!.multiplier).toBe(0);
  });

  it("gives the armband to the vice when the captain doesn't play", () => {
    const s = scoreEntry(base, positions, everyone({ f1: EMPTY_STATS, f2: EMPTY_STATS }));
    expect(s.captainId).toBe("m1");
  });

  it("auto-subs bench players in order, only when the line-up stays legal", () => {
    // f1 (FWD) misses: d4 (first sub) would leave no forward, so f2 comes on.
    const s = scoreEntry(base, positions, everyone({ f1: EMPTY_STATS }));
    expect(s.autoSubs).toEqual([{ out: "f1", in: "f2" }]);
    expect(s.total).toBe(6 + 2); // 6 starters + m1 as captain
  });

  it("never subs an outfield player for the keeper", () => {
    const s = scoreEntry(base, positions, everyone({ gk: EMPTY_STATS }));
    expect(s.autoSubs).toEqual([]);
  });

  it("applies chips and the transfer cost", () => {
    const stats = everyone();
    expect(scoreEntry({ ...base, chip: "bench_boost" }, positions, stats).total).toBe(10);
    expect(scoreEntry({ ...base, chip: "triple_captain" }, positions, stats).total).toBe(9);
    expect(scoreEntry({ ...base, chip: "double_points" }, positions, stats).total).toBe(16);
    expect(scoreEntry({ ...base, transferCost: 4 }, positions, stats).total).toBe(4);
  });
});

describe("helpers", () => {
  it("works out gameweek status", () => {
    const now = Date.parse("2026-11-01T12:00:00Z");
    expect(gameweekStatus({ deadline: "2026-11-01T14:00:00Z", finalizedAt: null }, now)).toBe("upcoming");
    expect(gameweekStatus({ deadline: "2026-11-01T10:00:00Z", finalizedAt: null }, now)).toBe("live");
    expect(gameweekStatus({ deadline: "2026-11-01T10:00:00Z", finalizedAt: "2026-11-02" }, now)).toBe("finished");
  });
  it("maps card positions and suggests prices from ratings", () => {
    expect(["GK", "DEF", "CAM", "LW", "ST"].map(toFantasyPosition)).toEqual(["GK", "DEF", "MID", "FWD", "FWD"]);
    const prices = suggestPrices([
      { id: "a", overall: 100 }, { id: "b", overall: 60 }, { id: "c", overall: 80 }, { id: "d", overall: null },
    ]);
    expect(Object.fromEntries(prices)).toEqual({ a: 100, c: 75, b: 45, d: 50 });
  });
});
