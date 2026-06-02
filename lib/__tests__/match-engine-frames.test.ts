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
