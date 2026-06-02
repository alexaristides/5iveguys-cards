import { describe, it, expect } from "vitest";
import { sampleTimeline, mirrorTape } from "@/lib/match-playback";
import type { MatchFrame } from "@/lib/match-engine";

const frames: MatchFrame[] = [
  { minute: 0, ball: { x: 0, y: 0 }, possessorId: "a", players: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 10 }], scoreUser: 0, scoreCpu: 0 },
  { minute: 45, ball: { x: 100, y: 100 }, possessorId: "b", players: [{ id: "a", x: 20, y: 20 }, { id: "b", x: 30, y: 30 }], scoreUser: 0, scoreCpu: 0 },
];

describe("sampleTimeline", () => {
  it("returns the first frame at t=0", () => {
    const s = sampleTimeline(frames, 0, 10);
    expect(s.ball).toEqual({ x: 0, y: 0 });
    expect(s.frameIndex).toBe(0);
    expect(s.progress).toBe(0);
  });

  it("returns the last frame at t=duration", () => {
    const s = sampleTimeline(frames, 10, 10);
    expect(s.ball).toEqual({ x: 100, y: 100 });
    expect(s.progress).toBe(1);
  });

  it("interpolates the midpoint", () => {
    const s = sampleTimeline(frames, 5, 10);
    expect(s.ball.x).toBeCloseTo(50, 5);
    const a = s.players.find((p) => p.id === "a")!;
    expect(a.x).toBeCloseTo(10, 5);
  });

  it("preserves all players", () => {
    const s = sampleTimeline(frames, 3, 10);
    expect(s.players.length).toBe(2);
  });

  it("clamps out-of-range time", () => {
    expect(sampleTimeline(frames, -5, 10).progress).toBe(0);
    expect(sampleTimeline(frames, 999, 10).progress).toBe(1);
  });

  it("handles an empty tape", () => {
    const s = sampleTimeline([], 1, 10);
    expect(s.players).toEqual([]);
  });
});

describe("mirrorTape", () => {
  const mFrames: MatchFrame[] = [{
    minute: 10, ball: { x: 30, y: 20 }, possessorId: "a",
    players: [{ id: "a", x: 30, y: 20 }, { id: "b", x: 70, y: 80 }],
    event: { minute: 10, type: "goal", team: "user", description: "g", scoreUser: 1, scoreCpu: 0, phase: "user-attack" },
    scoreUser: 1, scoreCpu: 0,
  }];

  it("rotates coordinates 180 degrees", () => {
    const m = mirrorTape(mFrames)[0];
    expect(m.ball).toEqual({ x: 70, y: 80 });
    expect(m.players.find((p) => p.id === "a")).toEqual({ id: "a", x: 70, y: 80 });
  });

  it("swaps team and score so the opponent reads as 'you'", () => {
    const m = mirrorTape(mFrames)[0];
    expect(m.event!.team).toBe("cpu");
    expect(m.event!.scoreUser).toBe(0);
    expect(m.event!.scoreCpu).toBe(1);
    expect(m.scoreUser).toBe(0);
    expect(m.scoreCpu).toBe(1);
  });

  it("keeps possessor id unchanged", () => {
    expect(mirrorTape(mFrames)[0].possessorId).toBe("a");
  });
});
