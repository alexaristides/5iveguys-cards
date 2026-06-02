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
