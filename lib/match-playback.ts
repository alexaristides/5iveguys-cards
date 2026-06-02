import type { MatchFrame, PlayerFrame } from "./match-engine";

export interface PlaybackSample {
  ball: { x: number; y: number };
  players: PlayerFrame[];
  frameIndex: number; // floored index of the lower bounding frame
  progress: number;   // 0..1 over the whole tape
}

export function sampleTimeline(frames: MatchFrame[], elapsedSec: number, durationSec: number): PlaybackSample {
  if (frames.length === 0) return { ball: { x: 50, y: 50 }, players: [], frameIndex: 0, progress: 0 };
  const tNorm = durationSec <= 0 ? 1 : Math.max(0, Math.min(1, elapsedSec / durationSec));
  const pos = tNorm * (frames.length - 1);
  const i = Math.floor(pos);
  const frac = pos - i;
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const ball = {
    x: a.ball.x + (b.ball.x - a.ball.x) * frac,
    y: a.ball.y + (b.ball.y - a.ball.y) * frac,
  };
  const bMap = new Map(b.players.map((p) => [p.id, p]));
  const players: PlayerFrame[] = a.players.map((pa) => {
    const pb = bMap.get(pa.id) ?? pa;
    return { id: pa.id, x: pa.x + (pb.x - pa.x) * frac, y: pa.y + (pb.y - pa.y) * frac };
  });
  return { ball, players, frameIndex: i, progress: tNorm };
}
