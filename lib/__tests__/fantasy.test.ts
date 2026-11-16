import { describe, expect, it } from "vitest";
import {
  availableChips, awardBonus, buySquad, EMPTY_STATS, entryError, freeTransfersFor, isValidTeam, playerPoints,
  priceChanges, scoreEntry, sellingPrice, teamValue, transferCostFor,
  type FantasyPosition, type PlayerStats, type SquadPlayer,
} from "../fantasy";
import { autoComplete, changeFormation, EMPTY_LINEUP, FORMATIONS, lineupFromIds, lineupIds } from "../fantasy-lineup";

const stats = (s: Partial<PlayerStats>): PlayerStats => ({ ...EMPTY_STATS, played: true, playedMost: true, ...s });

describe("playerPoints (FPL 2025/26 scoring)", () => {
  it("scores nothing for a player who didn't play", () => {
    expect(playerPoints({ ...EMPTY_STATS, goals: 2 }, "FWD")).toBe(0);
  });

  it("gives 1 for a short appearance and 2 for most of the match", () => {
    expect(playerPoints(stats({ playedMost: false, goalsConceded: 3 }), "MID")).toBe(1);
    expect(playerPoints(stats({ goalsConceded: 3 }), "MID")).toBe(2);
  });

  it("values goals by position", () => {
    const goal = (p: FantasyPosition) => playerPoints(stats({ goals: 1, goalsConceded: 1 }), p) - playerPoints(stats({ goalsConceded: 1 }), p);
    expect([goal("GK"), goal("DEF"), goal("MID"), goal("FWD")]).toEqual([10, 6, 5, 4]);
  });

  it("gives clean sheets to keepers and defenders (4), midfielders (1), not forwards", () => {
    expect(playerPoints(stats({}), "GK")).toBe(6);
    expect(playerPoints(stats({}), "DEF")).toBe(6);
    expect(playerPoints(stats({}), "MID")).toBe(3);
    expect(playerPoints(stats({}), "FWD")).toBe(2);
    // No clean sheet without playing most of the match.
    expect(playerPoints(stats({ playedMost: false }), "DEF")).toBe(1);
  });

  it("takes 1 off keepers and defenders for every 2 goals conceded", () => {
    expect(playerPoints(stats({ goalsConceded: 5 }), "DEF")).toBe(2 - 2);
    expect(playerPoints(stats({ goalsConceded: 5 }), "FWD")).toBe(2);
  });

  it("adds saves, penalty saves, defensive contributions and deductions", () => {
    expect(playerPoints(stats({ goalsConceded: 1, saves: 7, penaltySaves: 1 }), "GK")).toBe(2 + 2 + 5);
    expect(playerPoints(stats({ goalsConceded: 1, defensiveContributions: 10 }), "DEF")).toBe(4);
    expect(playerPoints(stats({ goalsConceded: 1, defensiveContributions: 11 }), "MID")).toBe(2);
    expect(playerPoints(stats({ goalsConceded: 1, defensiveContributions: 12 }), "MID")).toBe(4);
    expect(playerPoints(stats({ goalsConceded: 1, yellowCards: 1, ownGoals: 1, penaltyMisses: 1 }), "MID")).toBe(2 - 1 - 2 - 2);
    expect(playerPoints(stats({ goalsConceded: 1, redCard: true }), "FWD")).toBe(-1);
    expect(playerPoints(stats({ goalsConceded: 1, bonus: 3 }), "FWD")).toBe(5);
  });
});

describe("awardBonus", () => {
  const p = (id: string, s: Partial<PlayerStats>, position: FantasyPosition = "FWD") => ({ id, position, stats: stats({ goalsConceded: 1, ...s }) });

  it("gives 3, 2, 1 to the top three", () => {
    const bonus = awardBonus([p("a", { goals: 2 }), p("b", { goals: 1 }), p("c", { assists: 1 }), p("d", { assists: 0, defensiveContributions: 2 })]);
    expect(Object.fromEntries(bonus)).toEqual({ a: 3, b: 2, c: 1 });
  });

  it("follows FPL's ties", () => {
    expect(Object.fromEntries(awardBonus([p("a", { goals: 1 }), p("b", { goals: 1 }), p("c", { assists: 1 }), p("d", { saves: 1 })])))
      .toEqual({ a: 3, b: 3, c: 1 });
    expect(Object.fromEntries(awardBonus([p("a", { goals: 2 }), p("b", { goals: 1 }), p("c", { goals: 1 }), p("d", { assists: 1 })])))
      .toEqual({ a: 3, b: 2, c: 2 });
  });

  it("hands out nothing when nobody did more than turn up", () => {
    expect(awardBonus([p("a", {}), p("b", {}), p("c", {})]).size).toBe(0);
  });
});

describe("team shape", () => {
  it("needs 1 keeper, 2-4 defenders, 1-3 midfielders, 1-3 forwards", () => {
    expect(isValidTeam(["GK", "DEF", "DEF", "DEF", "MID", "MID", "FWD"])).toBe(true);
    expect(isValidTeam(["GK", "DEF", "DEF", "MID", "FWD", "FWD", "FWD"])).toBe(true);
    expect(isValidTeam(["GK", "GK", "DEF", "DEF", "MID", "MID", "FWD"])).toBe(false);
    expect(isValidTeam(["GK", "DEF", "MID", "MID", "MID", "FWD", "FWD"])).toBe(false);
    expect(isValidTeam(["GK", "DEF", "DEF", "FWD", "FWD", "FWD", "FWD"])).toBe(false);
    expect(isValidTeam(["GK", "DEF", "DEF", "MID", "FWD", "FWD"])).toBe(false);
  });

  it("has exactly the six formations the editor offers", () => {
    const shapes = [];
    for (let d = 0; d <= 6; d++) for (let m = 0; m <= 6 - d; m++) {
      const f = 6 - d - m;
      const positions: FantasyPosition[] = ["GK", ...Array(d).fill("DEF"), ...Array(m).fill("MID"), ...Array(f).fill("FWD")];
      if (isValidTeam(positions)) shapes.push(`${d}-${m}-${f}`);
    }
    expect(shapes.sort()).toEqual(FORMATIONS.map((f) => `${f.DEF}-${f.MID}-${f.FWD}`).sort());
  });
});

describe("prices and the bank", () => {
  it("keeps half of a rise when selling, and all of a fall", () => {
    expect(sellingPrice(70, 73)).toBe(71);
    expect(sellingPrice(70, 71)).toBe(70);
    expect(sellingPrice(70, 68)).toBe(68);
  });

  const prices = new Map(Object.entries({ a: 60, b: 70, c: 80, d: 50 }).map(([id, price]) => [id, { price }]));

  it("buys a first team out of the budget", () => {
    expect(buySquad(["a", "b"], prices, { budget: 200, from: null })).toEqual({
      picks: [{ playerId: "a", price: 60 }, { playerId: "b", price: 70 }], bank: 70,
    });
  });

  it("sells at the selling price and buys at today's price", () => {
    const from = { picks: [{ playerId: "a", price: 56 }, { playerId: "b", price: 70 }], bank: 10 };
    // a bought at 5.6, now 6.0: sells for 5.8. c costs 8.0.
    const next = buySquad(["c", "b"], prices, { budget: 200, from });
    expect(next).toEqual({ picks: [{ playerId: "c", price: 80 }, { playerId: "b", price: 70 }], bank: 10 + 58 - 80 });
    expect(teamValue(from, prices)).toBe(10 + 58 + 70);
  });

  it("keeps what this gameweek's draft already paid for a signing", () => {
    const from = { picks: [{ playerId: "a", price: 60 }], bank: 30 };
    expect(buySquad(["c"], prices, { budget: 0, from, draft: [{ playerId: "c", price: 78 }] }).bank).toBe(30 + 60 - 78);
  });

  it("moves prices with net transfers, capped at £0.3m and floored", () => {
    const now = new Map([["a", 60], ["b", 60], ["c", 36], ["d", 60]]);
    const changes = priceChanges(new Map([["a", 9], ["b", -3], ["c", -6], ["d", 1]]), 20, now);
    expect(Object.fromEntries(changes)).toEqual({ a: 3, b: -1, c: -1 });
  });
});

describe("transfers", () => {
  const week = (transfersMade = 0, chip: null | "wildcard" | "free_hit" = null, hasEntry = true) => ({ hasEntry, transfersMade, chip });

  it("is unlimited until the first team locks, then one a week", () => {
    expect(freeTransfersFor([])).toBeNull();
    expect(freeTransfersFor([week(0, null, false)])).toBeNull();
    expect(freeTransfersFor([week(0, null, false), week()])).toBe(1);
  });

  it("saves unused transfers up to 5", () => {
    expect(freeTransfersFor([week(), week(), week()])).toBe(3);
    expect(freeTransfersFor(Array.from({ length: 9 }, () => week()))).toBe(5);
    expect(freeTransfersFor([week(), week(), week(2)])).toBe(1);
    expect(freeTransfersFor([week(), week(), week(4)])).toBe(1);
  });

  it("keeps saved transfers through a Wildcard or Free Hit", () => {
    expect(freeTransfersFor([week(), week(), week(6, "wildcard")])).toBe(3);
    expect(freeTransfersFor([week(), week(5, "free_hit")])).toBe(2);
  });

  it("charges 4 points per extra transfer, nothing on a Wildcard or Free Hit", () => {
    expect(transferCostFor(3, 1, null)).toBe(8);
    expect(transferCostFor(2, 2, null)).toBe(0);
    expect(transferCostFor(5, 1, "wildcard")).toBe(0);
    expect(transferCostFor(5, 1, "free_hit")).toBe(0);
    expect(transferCostFor(5, null, null)).toBe(0);
  });
});

describe("chips", () => {
  it("can be played once a season without a second half", () => {
    expect(availableChips(5, [{ chip: "wildcard", gameweek: 3 }], null)).not.toContain("wildcard");
  });

  it("come back for the second half", () => {
    const played = [{ chip: "wildcard" as const, gameweek: 3 }, { chip: "triple_captain" as const, gameweek: 9 }];
    expect(availableChips(8, played, 9)).toEqual(["free_hit", "triple_captain", "double_points"]);
    expect(availableChips(10, played, 9)).toEqual(["wildcard", "free_hit", "double_points"]);
  });

  it("lets you keep the chip you've put on this gameweek", () => {
    expect(availableChips(4, [{ chip: "free_hit", gameweek: 4 }], null)).toContain("free_hit");
  });
});

describe("scoreEntry", () => {
  const positions = new Map<string, FantasyPosition>([["gk", "GK"], ["d1", "DEF"], ["d2", "DEF"], ["m1", "MID"], ["m2", "MID"], ["f1", "FWD"], ["f2", "FWD"]]);
  const ids = [...positions.keys()];
  const s = new Map<string, PlayerStats>(ids.map((id) => [id, stats({ goalsConceded: 1 })]));
  s.set("f1", stats({ goalsConceded: 1, goals: 1 })); // 6 points
  const entry = { playerIds: ids, captainId: "f1", viceCaptainId: "m1", chip: null, transferCost: 0 };

  it("doubles the captain", () => {
    expect(scoreEntry(entry, positions, s).total).toBe(6 * 2 + 6 * 2);
  });

  it("gives the armband to the vice when the captain doesn't play", () => {
    const missing = new Map(s);
    missing.set("f1", { ...EMPTY_STATS });
    const score = scoreEntry(entry, positions, missing);
    expect(score.captainId).toBe("m1");
    expect(score.total).toBe(2 * 2 + 5 * 2);
    expect(score.players.find((p) => p.playerId === "f1")!.multiplier).toBe(0);
  });

  it("applies Triple Captain, Double Points and the transfer cost", () => {
    expect(scoreEntry({ ...entry, chip: "triple_captain" }, positions, s).total).toBe(6 * 3 + 12);
    expect(scoreEntry({ ...entry, chip: "double_points", transferCost: 4 }, positions, s).total).toBe(24 * 2 - 4);
  });

  it("counts the first 7 of a team saved with subs", () => {
    expect(scoreEntry({ ...entry, playerIds: [...ids, "x", "y"] }, positions, s).players).toHaveLength(7);
  });
});

describe("entryError", () => {
  const roster: [string, FantasyPosition, number][] = [
    ["gk", "GK", 50], ["d1", "DEF", 60], ["d2", "DEF", 60], ["d3", "DEF", 90], ["m1", "MID", 70], ["m2", "MID", 70],
    ["f1", "FWD", 100], ["f2", "FWD", 45], ["old", "FWD", 50],
  ];
  const players = new Map<string, SquadPlayer>(roster.map(([id, position, price]) => [id, { id, position, price, isActive: id !== "old" }]));
  const team = ["gk", "d1", "d2", "m1", "m2", "f1", "f2"];
  const ok = { playerIds: team, captainId: "f1", viceCaptainId: "m1", chip: null };
  const opts = { budget: 500, from: null, availableChips: ["wildcard", "free_hit", "triple_captain", "double_points"] as const };

  it("accepts a legal team within budget", () => {
    expect(entryError(ok, players, { ...opts, availableChips: [...opts.availableChips] })).toBeNull();
  });

  it("rejects bad teams", () => {
    const o = { ...opts, availableChips: [...opts.availableChips] };
    expect(entryError({ ...ok, playerIds: team.slice(1) }, players, o)).toMatch(/Pick 7/);
    expect(entryError({ ...ok, playerIds: [...team.slice(0, 6), "d3"] }, players, o)).toBeNull();
    expect(entryError({ ...ok, captainId: "d3" }, players, o)).toMatch(/captain/);
    expect(entryError({ ...ok, viceCaptainId: "f1" }, players, o)).toMatch(/different/);
    expect(entryError({ ...ok, playerIds: [...team.slice(0, 6), "old"] }, players, o)).toMatch(/left the squad/);
    expect(entryError(ok, players, { ...o, budget: 400 })).toMatch(/over budget/);
    expect(entryError({ ...ok, chip: "wildcard" }, players, o)).toMatch(/first team/);
    expect(entryError({ ...ok, chip: "triple_captain" }, players, { ...o, availableChips: [] })).toMatch(/already played/);
  });

  it("lets owners keep a player who has left the squad", () => {
    const from = { picks: [...team.slice(0, 6), "old"].map((id) => ({ playerId: id, price: players.get(id)!.price })), bank: 0 };
    expect(entryError({ ...ok, playerIds: from.picks.map((p) => p.playerId) }, players, { ...opts, availableChips: [], from })).toBeNull();
  });
});

describe("lineup editing", () => {
  const players = new Map<string, { id: string; position: FantasyPosition; price: number; isActive: boolean }>(([
    ["gk", "GK", 50], ["d1", "DEF", 60], ["d2", "DEF", 55], ["d3", "DEF", 50], ["m1", "MID", 70], ["m2", "MID", 65], ["m3", "MID", 45],
    ["f1", "FWD", 100], ["f2", "FWD", 95], ["f3", "FWD", 45],
  ] as const).map(([id, position, price]) => [id, { id, position, price, isActive: true }]));

  it("lays a saved team out by position", () => {
    const l = lineupFromIds(["f1", "gk", "m1", "d1", "d2", "d3", "m2"], players);
    expect(l.formation).toEqual({ DEF: 3, MID: 2, FWD: 1 });
    expect(l.slots[0]).toBe("gk");
  });

  it("drops players who don't fit a new formation", () => {
    const l = lineupFromIds(["gk", "d1", "d2", "d3", "m1", "m2", "f1"], players);
    const next = changeFormation(l, { DEF: 2, MID: 1, FWD: 3 }, players);
    // 3-2-1 → 2-1-3: a defender and a midfielder leave; the two new forward slots are empty.
    expect(next.slots.filter(Boolean)).toEqual(["gk", "d1", "d2", "m1", "f1"]);
  });

  it("auto-fills within the money left", () => {
    const filled = autoComplete(EMPTY_LINEUP, [...players.values()], 450);
    const ids = lineupIds(filled)!;
    expect(ids).toHaveLength(7);
    expect(ids.reduce((sum, id) => sum + players.get(id)!.price, 0)).toBeLessThanOrEqual(450);
  });
});
