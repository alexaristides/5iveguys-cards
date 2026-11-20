import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  availableChips, awardBonus, buySquad, EMPTY_STATS, entryError, FANTASY_RULES, freeTransfersFor, isValidTeam, playerPoints,
  priceChanges, scoreEntry, sellingPrice, teamValue, transferCostFor,
  type FantasyPosition, type PlayerStats, type SquadPlayer,
} from "../fantasy";
import { autoComplete, changeFormation, EMPTY_LINEUP, FORMATIONS, lineupFromIds, lineupFromPicks, lineupIds, lineupPositions } from "../fantasy-lineup";

const stats = (s: Partial<PlayerStats>): PlayerStats => ({ ...EMPTY_STATS, played: true, playedMost: true, ...s });

describe("playerPoints (7-a-side scoring)", () => {
  it("scores nothing for a player who didn't play", () => {
    expect(playerPoints({ ...EMPTY_STATS, goals: 2 }, "FWD")).toBe(0);
  });

  it("gives 1 for under half the game and 2 for over half", () => {
    expect(playerPoints(stats({ playedMost: false, goalsConceded: 3 }), "MID")).toBe(1);
    expect(playerPoints(stats({ goalsConceded: 3 }), "MID")).toBe(2);
  });

  it("values goals by position", () => {
    const goal = (p: FantasyPosition) => playerPoints(stats({ goals: 1, goalsConceded: 1 }), p) - playerPoints(stats({ goalsConceded: 1 }), p);
    expect([goal("GK"), goal("DEF"), goal("MID"), goal("FWD")]).toEqual([6, 6, 4, 4]);
  });

  it("gives keepers and defenders a clean sheet less 1 per goal conceded, never below -2", () => {
    const defence = (position: FantasyPosition, conceded: number) => playerPoints(stats({ goalsConceded: conceded }), position) - 2;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 12].map((n) => defence("DEF", n))).toEqual([5, 4, 3, 2, 1, 0, -1, -2, -2, -2]);
    expect([0, 1, 4, 5, 6, 9].map((n) => defence("GK", n))).toEqual([4, 3, 0, -1, -2, -2]);
  });

  it("gives midfielders and forwards nothing for clean sheets or goals conceded", () => {
    expect(playerPoints(stats({}), "MID")).toBe(2);
    expect(playerPoints(stats({}), "FWD")).toBe(2);
    expect(playerPoints(stats({ goalsConceded: 9 }), "MID")).toBe(2);
  });

  it("gives a sub (under half the game) no defence points either way", () => {
    expect(playerPoints(stats({ playedMost: false, goalsConceded: 0 }), "GK")).toBe(1);
    expect(playerPoints(stats({ playedMost: false, goalsConceded: 9 }), "DEF")).toBe(1);
  });

  it("adds saves, penalty saves, defensive contributions and deductions", () => {
    expect(playerPoints(stats({ goalsConceded: 1, saves: 9, penaltySaves: 1 }), "GK")).toBe(2 + 3 + 2 + 5);
    expect(playerPoints(stats({ goalsConceded: 1, defensiveContributions: 5 }), "DEF")).toBe(2 + 4);
    expect(playerPoints(stats({ goalsConceded: 1, defensiveContributions: 6 }), "DEF")).toBe(2 + 4 + 2);
    expect(playerPoints(stats({ goalsConceded: 1, defensiveContributions: 7 }), "MID")).toBe(2);
    expect(playerPoints(stats({ goalsConceded: 1, defensiveContributions: 8 }), "MID")).toBe(4);
    expect(playerPoints(stats({ goalsConceded: 1, defensiveContributions: 20 }), "GK")).toBe(2 + 3);
    expect(playerPoints(stats({ goalsConceded: 1, yellowCards: 1, ownGoals: 1, penaltyMisses: 1 }), "MID")).toBe(2 - 1 - 2 - 2);
    expect(playerPoints(stats({ goalsConceded: 1, redCard: true }), "FWD")).toBe(-1);
    expect(playerPoints(stats({ goalsConceded: 1, bonus: 3 }), "FWD")).toBe(5);
  });

  it("counts saves for whoever made them (an outfielder who went in goal)", () => {
    expect(playerPoints(stats({ goalsConceded: 1, saves: 8, penaltySaves: 1 }), "DEF")).toBe(2 + 4 + 2 + 5);
    expect(playerPoints(stats({ goalsConceded: 1, saves: 4 }), "MID")).toBe(2 + 1);
  });

  it("adds up a busy defender's afternoon (the admin page example)", () => {
    // Over half the game 2, two goals 12, assist 3, 3 conceded (5 - 3 =) 2, yellow -1 = 18; one save isn't a point.
    expect(playerPoints(stats({ goals: 2, assists: 1, goalsConceded: 3, yellowCards: 1, saves: 1 }), "DEF")).toBe(18);
    expect(playerPoints(stats({ goals: 2, assists: 1, goalsConceded: 3, yellowCards: 1, saves: 1, bonus: 3 }), "DEF")).toBe(21);
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

  it("gives a clean-sheet game's bonus to the defence, like FPL", () => {
    const cleanSheet = (id: string, position: FantasyPosition) => ({ id, position, stats: stats({}) });
    const bonus = awardBonus([cleanSheet("gk", "GK"), cleanSheet("d", "DEF"), cleanSheet("m", "MID"), cleanSheet("f", "FWD")]);
    expect(Object.fromEntries(bonus)).toEqual({ gk: 3, d: 3 });
  });

  it("makes a goal worth the same bonus to everyone", () => {
    expect(Object.fromEntries(awardBonus([p("m", { goals: 1 }, "MID"), p("f", { goals: 1 }), p("x", { assists: 1 })])))
      .toEqual({ m: 3, f: 3, x: 1 });
  });

  it("doesn't count an outfield player's saves towards bonus", () => {
    expect(awardBonus([p("d", { saves: 3 }, "DEF"), p("k", { saves: 3 }, "GK")]).get("d")).toBeUndefined();
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

/** The price rules are switched off for now (FANTASY_RULES.prices); these tests run them switched on. */
function withPrices() {
  beforeEach(() => { FANTASY_RULES.prices = true; });
  afterEach(() => { FANTASY_RULES.prices = false; });
}

describe("prices and the bank", () => {
  withPrices();
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

  // Each concedes 1: keeper 2 + 3, defenders 2 + 4, midfielders 2, forwards 2, and f1 scores (+4).
  const base = 5 + 6 + 6 + 2 + 2 + 6 + 2;

  it("doubles the captain", () => {
    expect(scoreEntry(entry, positions, s).total).toBe(base + 6);
  });

  it("gives the armband to the vice when the captain doesn't play", () => {
    const missing = new Map(s);
    missing.set("f1", { ...EMPTY_STATS });
    const score = scoreEntry(entry, positions, missing);
    expect(score.captainId).toBe("m1");
    expect(score.total).toBe(base - 6 + 2);
    expect(score.players.find((p) => p.playerId === "f1")!.multiplier).toBe(0);
  });

  it("applies Triple Captain, Double Points and the transfer cost", () => {
    expect(scoreEntry({ ...entry, chip: "triple_captain" }, positions, s).total).toBe(base + 6 * 2);
    expect(scoreEntry({ ...entry, chip: "double_points", transferCost: 4 }, positions, s).total).toBe((base + 6) * 2 - 4);
  });

  it("counts the first 7 of a team saved with subs", () => {
    expect(scoreEntry({ ...entry, playerIds: [...ids, "x", "y"] }, positions, s).players).toHaveLength(7);
  });

  it("scores players as their own position, whatever slot they're in", () => {
    // f1 is a forward: 4 for his goal, even if the fan stood him in defence.
    expect(scoreEntry(entry, positions, s).players.find((p) => p.playerId === "f1")!.points).toBe(2 + 4);
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
    FANTASY_RULES.prices = true;
    expect(entryError(ok, players, { ...o, budget: 400 })).toMatch(/over budget/);
    FANTASY_RULES.prices = false;
    expect(entryError({ ...ok, chip: "wildcard" }, players, o)).toMatch(/first team/);
    expect(entryError({ ...ok, chip: "triple_captain" }, players, { ...o, availableChips: [] })).toMatch(/already played/);
  });

  it("has no budget while prices are off", () => {
    const o = { ...opts, availableChips: [...opts.availableChips] };
    expect(entryError(ok, players, { ...o, budget: 0 })).toBeNull();
    expect(priceChanges(new Map([["f1", 50]]), 10, new Map([["f1", 0]])).size).toBe(0);
  });

  it("lets anyone play anywhere, checking the shape by where they're put", () => {
    const o = { ...opts, availableChips: [...opts.availableChips] };
    const noKeeper = ["d1", "d2", "d3", "m1", "m2", "f1", "f2"];
    const team7 = { ...ok, playerIds: noKeeper };
    expect(entryError(team7, players, o)).toMatch(/1 in goal/);
    expect(entryError({ ...team7, positions: ["DEF", "DEF", "DEF", "MID", "MID", "FWD", "GK"] }, players, o)).toBeNull();
    expect(entryError({ ...team7, positions: ["DEF", "DEF", "DEF", "MID", "MID", "FWD", "FWD"] }, players, o)).toMatch(/1 in goal/);
    expect(entryError({ ...team7, positions: ["DEF", "DEF"] as FantasyPosition[] }, players, o)).toMatch(/position/);
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

  it("keeps all 7 when the formation changes, moving the extras into the new slots", () => {
    const l = lineupFromIds(["gk", "d1", "d2", "d3", "m1", "m2", "f1"], players);
    const next = changeFormation(l, { DEF: 2, MID: 1, FWD: 3 }, players);
    // 3-2-1 → 2-1-3: a defender and a midfielder now play up front.
    expect(next.slots).toEqual(["gk", "d1", "d2", "m1", "f1", "d3", "m2"]);
    expect(lineupPositions(next)).toEqual(["GK", "DEF", "DEF", "MID", "FWD", "FWD", "FWD"]);
  });

  it("lays a saved team out where the fan put each player", () => {
    const l = lineupFromPicks([
      { playerId: "f1", position: "GK" }, { playerId: "gk", position: "FWD" }, { playerId: "d1", position: "DEF" },
      { playerId: "d2", position: "DEF" }, { playerId: "m1", position: "MID" }, { playerId: "m2", position: "MID" }, { playerId: "f2" },
    ], players);
    expect(l.slots[0]).toBe("f1");
    expect(l.formation).toEqual({ DEF: 2, MID: 2, FWD: 2 });
    expect(l.slots.slice(5)).toEqual(["gk", "f2"]);
  });

  it("auto-fills within the money left", () => {
    const filled = autoComplete(EMPTY_LINEUP, [...players.values()], 450);
    const ids = lineupIds(filled)!;
    expect(ids).toHaveLength(7);
    expect(ids.reduce((sum, id) => sum + players.get(id)!.price, 0)).toBeLessThanOrEqual(450);
  });
});
