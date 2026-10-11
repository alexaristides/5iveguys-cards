import { describe, expect, it } from "vitest";
import { entryError, priceSquad, squadCost, type FantasyPosition } from "../fantasy";
import {
  autoComplete, changeFormation, EMPTY_LINEUP, formationLabel, lineupFromIds, lineupIds, swapWithBench, type LineupPlayer,
} from "../fantasy-lineup";

const POOL: [string, FantasyPosition, number][] = [
  ["gk", "GK", 60], ["d1", "DEF", 90], ["d2", "DEF", 80], ["d3", "DEF", 50], ["d4", "DEF", 50],
  ["m1", "MID", 70], ["m2", "MID", 65], ["m3", "MID", 60],
  ["f1", "FWD", 100], ["f2", "FWD", 95], ["f3", "FWD", 75], ["f4", "FWD", 45],
];
const list: LineupPlayer[] = POOL.map(([id, position, price]) => ({ id, position, price, isActive: true }));
const players = new Map(list.map((p) => [p.id, p]));

describe("lineupFromIds", () => {
  it("orders starters keeper-first and reads the formation", () => {
    const l = lineupFromIds(["f1", "m1", "d1", "gk", "d2", "d3", "m2", "f2", "d4"], players);
    expect(formationLabel(l.formation)).toBe("3-2-1");
    expect(l.starters[0]).toBe("gk");
    expect(l.bench).toEqual(["f2", "d4"]);
  });
});

describe("changeFormation", () => {
  it("drops starters who no longer fit to the bench, then out", () => {
    const l = lineupFromIds(["gk", "d1", "d2", "d3", "m1", "m2", "f1", "f2", "d4"], players);
    const next = changeFormation({ ...l, bench: ["f2", null] }, { DEF: 2, MID: 2, FWD: 2 }, players);
    expect(next.starters.filter(Boolean)).toHaveLength(6); // one forward slot now empty
    expect(next.bench).toEqual(["f2", "d3"]);
  });
});

describe("swapWithBench", () => {
  const l = lineupFromIds(["gk", "d1", "d2", "d3", "m1", "m2", "f1", "f2", "d4"], players);
  it("swaps when the new 7 is legal and follows the new formation", () => {
    const next = swapWithBench(l, 1, 0, players)!; // d1 off, f2 on → 2-2-2
    expect(formationLabel(next.formation)).toBe("2-2-2");
    expect(next.bench).toContain("d1");
  });
  it("refuses swaps that break the line-up", () => {
    const twoDef = lineupFromIds(["gk", "d1", "d2", "m1", "m2", "f1", "f3", "f2", "d4"], players);
    expect(swapWithBench(twoDef, 1, 0, players)).toBeNull(); // would leave one defender
  });
});

describe("autoComplete", () => {
  it("fills every slot with a legal team inside the budget", () => {
    const filled = autoComplete(EMPTY_LINEUP, list, 600, (id) => players.get(id)!.price);
    const ids = lineupIds(filled)!;
    expect(ids).toHaveLength(9);
    const squad = new Map(list.map((p) => [p.id, p]));
    expect(squadCost(priceSquad(ids, squad, null))).toBeLessThanOrEqual(600);
    expect(entryError({ playerIds: ids, captainId: ids[1], viceCaptainId: ids[2], chip: null }, squad, { budget: 600, baseline: null, usedChips: [] })).toBeNull();
  });
});
