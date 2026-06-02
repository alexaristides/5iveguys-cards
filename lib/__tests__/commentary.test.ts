import { describe, it, expect } from "vitest";
import seedrandom from "seedrandom";
import { createCommentary, GOAL_GENERIC, GOAL_PACE } from "@/lib/commentary";

describe("createCommentary", () => {
  it("fills both template slots", () => {
    const c = createCommentary(seedrandom("x"));
    const line = c.pick(GOAL_GENERIC, "Scorer", "Assister");
    expect(line).toContain("Scorer");
    expect(line).toContain("Assister");
  });

  it("avoids immediate repeats within a pool", () => {
    const c = createCommentary(seedrandom("y"));
    const seen = new Set<string>();
    for (let i = 0; i < GOAL_GENERIC.length; i++) {
      seen.add(c.pick(GOAL_GENERIC, "A", "B"));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is deterministic for a given seed", () => {
    const a = createCommentary(seedrandom("same"));
    const b = createCommentary(seedrandom("same"));
    expect(a.pick(GOAL_PACE, "X", "Y")).toBe(b.pick(GOAL_PACE, "X", "Y"));
  });
});
