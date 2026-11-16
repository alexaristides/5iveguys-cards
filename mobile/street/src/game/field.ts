/** Cage dimensions (metres). The pitch runs along x; the home side attacks +x. */
export const HALF_L = 17;
export const HALF_W = 10;
export const GOAL_HALF = 1.95;
export const GOAL_H = 1.75;
export const GOAL_DEPTH = 1.1;
export const BALL_R = 0.13;
export const POST_R = 0.06;
export const GRAVITY = 11.5;

/** x of the goal line a team attacks (team 0 attacks +x). */
export const attackX = (team: 0 | 1) => (team === 0 ? HALF_L : -HALF_L);
export const attackDir = (team: 0 | 1) => (team === 0 ? 1 : -1);

// ── Ball physics constants (shared by the ball, the kick solvers and the AI) ──

/** Air drag: deceleration = DRAG × speed² (m/s² per (m/s)²). */
export const DRAG = 0.009;
/** Magnus effect: acceleration = MAGNUS × (spin × velocity). Curls, dips and floats. */
export const MAGNUS = 0.0075;
/** Rolling on the turf: constant resistance plus a little that grows with speed. */
const ROLL_C = 1.15;
const ROLL_L = 0.12;

/** How quickly a ball rolling at speed `s` slows down (m/s²): turf resistance and air drag. */
export const rollDecel = (s: number) => ROLL_C + ROLL_L * s + DRAG * s * s;

/** Speed a ball must be rolled at to cover `d` metres and still be doing `arrive` m/s. */
export function rollSpeedFor(d: number, arrive: number) {
  // Integrate backwards from the receiver: ds/dx = decel(s) / s.
  let s = Math.max(0.3, arrive);
  const n = Math.max(4, Math.ceil(d / 0.05));
  const dx = d / n;
  for (let i = 0; i < n; i++) s += (rollDecel(s) / s) * dx;
  return s;
}

/** Time for a ball rolled at `v0` to cover `d` metres (Infinity if it stops short). */
export function rollTime(v0: number, d: number) {
  let s = v0, x = 0, t = 0;
  const h = 1 / 120;
  while (x < d) {
    if (s <= 0.05) return Infinity;
    x += s * h;
    s -= rollDecel(s) * h;
    t += h;
    if (t > 8) return Infinity;
  }
  return t;
}
