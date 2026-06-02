import { describe, it, expect } from "vitest";
import { getHomeCoord, USER_POSITIONS, CPU_POSITIONS } from "@/lib/formation-positions";
import type { AssignedPlayer } from "@/lib/football";

const mk = (position: AssignedPlayer["position"], posIndex: number): AssignedPlayer => ({
  card: { id: "c", name: "n", rarity: "common", attribute: "Skill", imageUrl: "" },
  position, posIndex,
});

describe("getHomeCoord", () => {
  it("returns the user GK near the bottom", () => {
    const [x, y] = getHomeCoord(mk("GK", 0), "2-2-2", "user");
    expect(x).toBe(50);
    expect(y).toBe(90);
  });

  it("mirrors the CPU GK to the top", () => {
    const [, y] = getHomeCoord(mk("GK", 0), "2-2-2", "cpu");
    expect(y).toBe(10);
  });

  it("keeps every coordinate within the pitch", () => {
    for (const f of ["2-2-2", "3-2-1", "1-3-2", "2-3-1"] as const) {
      for (const map of [USER_POSITIONS[f], CPU_POSITIONS[f]]) {
        for (const arr of Object.values(map)) {
          for (const [x, y] of arr) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(100);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });
});
