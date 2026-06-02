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
    expect(summary.userScore).toBeGreaterThanOrEqual(h1.endScore.user);
    expect(summary.cpuScore).toBeGreaterThanOrEqual(h1.endScore.cpu);
  });

  it("lets a changed second-half formation alter the outcome stream", () => {
    const base = input("form");
    const h1 = simulateFirstHalf(base);
    const keep = simulateSecondHalf({ ...base, halftimeScore: h1.endScore, involvements: new Map(h1.involvements), firstHalfEvents: h1.events });
    const changed = simulateSecondHalf({ ...base, userFormation: "1-3-2", halftimeScore: h1.endScore, involvements: new Map(h1.involvements), firstHalfEvents: h1.events });
    expect(JSON.stringify(keep.frames)).not.toBe(JSON.stringify(changed.frames));
  });
});
