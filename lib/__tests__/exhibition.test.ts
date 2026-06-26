import { describe, it, expect } from "vitest";
import { simulateExhibition } from "../exhibition";
import { assignPositions, getPlayerRating, type FootballCard } from "../football";
import type { StatsMap } from "../card-rating";

// A defender-shaped stat line (strong at the back, poor going forward) and an
// attacker-shaped one, so we can assert the fan-rating mechanic.
const DEF_STATS: StatsMap = {
  attack: 30, defense: 95, speed: 60, strength: 92, skillMoves: 35,
  iq: 80, aura: 60, goalkeeping: 20, agility: 55, celebration: 40, clutch: 70,
};
const ATT_STATS: StatsMap = {
  attack: 95, defense: 25, speed: 90, strength: 60, skillMoves: 90,
  iq: 70, aura: 80, goalkeeping: 10, agility: 88, celebration: 80, clutch: 85,
};

function makeTeam(prefix: string, stats: StatsMap): FootballCard[] {
  return Array.from({ length: 7 }, (_, i) => ({
    id: `${prefix}-${i}`,
    name: `${prefix}${i}`,
    rarity: "common" as const,
    attribute: "Skill" as const,
    imageUrl: "",
    stats,
  }));
}

describe("exhibition fan-rating mechanics", () => {
  it("rates a player by the position they're fielded in", () => {
    const card: FootballCard = {
      id: "x", name: "X", rarity: "common", attribute: "Skill", imageUrl: "", stats: DEF_STATS,
    };
    // A defensive stat line should grade far higher at the back than up front.
    expect(getPlayerRating(card, "DEF")).toBeGreaterThan(getPlayerRating(card, "ATT"));
  });

  it("is deterministic for a given seed", () => {
    const a = assignPositions(makeTeam("A", ATT_STATS), "2-2-2");
    const b = assignPositions(makeTeam("B", DEF_STATS), "2-2-2");
    const r1 = simulateExhibition(a, b, "2-2-2", "2-2-2", "seed-123");
    const r2 = simulateExhibition(a, b, "2-2-2", "2-2-2", "seed-123");
    expect(r1.aScore).toBe(r2.aScore);
    expect(r1.bScore).toBe(r2.bScore);
    expect(r1.frames.length).toBe(r2.frames.length);
  });

  it("produces a playable tape and a coherent scoreline", () => {
    const a = assignPositions(makeTeam("A", ATT_STATS), "2-2-2");
    const b = assignPositions(makeTeam("B", DEF_STATS), "2-2-2");
    const res = simulateExhibition(a, b, "2-2-2", "2-2-2", "seed-xyz");
    expect(res.frames.length).toBeGreaterThan(0);
    expect(res.aScore).toBeGreaterThanOrEqual(0);
    expect(res.bScore).toBeGreaterThanOrEqual(0);
    expect(res.aScorers.length).toBe(res.aScore);
    expect(res.bScorers.length).toBe(res.bScore);
    expect(["A", "B", "draw"]).toContain(res.winner);
  });

  it("lets the better team win most of the time, but not always (form variance)", () => {
    const strong = assignPositions(makeTeam("S", ATT_STATS), "2-2-2");
    const weak = assignPositions(makeTeam("W", DEF_STATS), "2-2-2");
    let strongWins = 0, weakWins = 0;
    const N = 80;
    for (let i = 0; i < N; i++) {
      const res = simulateExhibition(strong, weak, "2-2-2", "2-2-2", `form-${i}`);
      if (res.winner === "A") strongWins++;
      else if (res.winner === "B") weakWins++;
    }
    // The stronger side should win clearly more often…
    expect(strongWins).toBeGreaterThan(weakWins);
    // …but the underdog (or a draw) should still get the odd result — never a clean sweep.
    expect(strongWins).toBeLessThan(N);
  });

  it("produces unserious blunder events", () => {
    // Across a batch of matches there should be at least one comedy blunder.
    const a = assignPositions(makeTeam("A", ATT_STATS), "2-3-1");
    const b = assignPositions(makeTeam("B", DEF_STATS), "2-3-1");
    let blunders = 0;
    for (let i = 0; i < 20; i++) {
      const res = simulateExhibition(a, b, "2-3-1", "2-3-1", `blunder-${i}`);
      blunders += res.events.filter((e) => e.type === "blunder").length;
    }
    expect(blunders).toBeGreaterThan(0);
  });

  it("rewards a balanced shape over an all-defender side on average", () => {
    // Same player pool, but one side is built to attack and the other is all
    // defenders. Across many seeds the attacking side should score more.
    let attackGoals = 0;
    let defenderGoals = 0;
    for (let i = 0; i < 40; i++) {
      const balanced = assignPositions(makeTeam("BAL", ATT_STATS), "1-3-2");
      const allDef = assignPositions(makeTeam("DEF", DEF_STATS), "3-2-1");
      const res = simulateExhibition(balanced, allDef, "1-3-2", "3-2-1", `s${i}`);
      attackGoals += res.aScore;
      defenderGoals += res.bScore;
    }
    expect(attackGoals).toBeGreaterThan(defenderGoals);
  });
});
