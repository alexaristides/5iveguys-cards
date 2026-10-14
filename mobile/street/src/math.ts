export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Frame-rate independent exponential approach: move `a` toward `b` at `rate` per second. */
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function dampAngle(a: number, b: number, rate: number, dt: number) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-rate * dt));
}

/** Turn `a` toward `b` by at most `maxStep` radians. */
export function turnToward(a: number, b: number, maxStep: number) {
  const d = wrapAngle(b - a);
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
}

/** Ground-plane vector (x, z). */
export interface V2 { x: number; z: number }

export const v2 = (x = 0, z = 0): V2 => ({ x, z });
export const len = (x: number, z: number) => Math.hypot(x, z);
export const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
export const angleOf = (x: number, z: number) => Math.atan2(x, z);
export const dirX = (a: number) => Math.sin(a);
export const dirZ = (a: number) => Math.cos(a);

/** Distance from point p to segment ab, and how far along (0..1) the closest point is. */
export function segDist(p: V2, a: V2, b: V2) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const l2 = abx * abx + abz * abz || 1e-6;
  const t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1);
  return { d: Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t)), t };
}

/** Small seeded PRNG (mulberry32) so a player's hair looks the same every time. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Gaussian-ish random in roughly [-1, 1] (sum of uniforms). */
export const gauss = (r: () => number = Math.random) => (r() + r() + r() - 1.5) / 1.5;

/** Standard normal sample (Box–Muller). */
export function normal(r: () => number = Math.random) {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
