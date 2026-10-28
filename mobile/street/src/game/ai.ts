/**
 * Team AI. Drives every player the user isn't controlling: the CPU side and
 * the user's two teammates. Each step it hands out roles (press, mark, last
 * man, support, chase) and steers players to their spots, sprinting when it's
 * worth the stamina; the CPU ball carrier also decides when to dribble, pass,
 * shoot or try a skill.
 */
import { angleOf, clamp, dist, len, normal, segDist, wrapAngle, type V2 } from "../math";
import { attackDir, attackX, GOAL_HALF, HALF_L, HALF_W } from "./field";
import type { Match } from "./match";
import { rate, type Player } from "./player";

export class TeamAI {
  private nextThink = new Map<Player, number>();
  /** How long each carrier has been hemmed in (s). */
  private stuck = new Map<Player, number>();
  private presser: Player | null = null;

  constructor(private m: Match, readonly team: 0 | 1) {}

  /** A sub came on: drop anything held about who's who. */
  forget() {
    this.presser = null;
    this.nextThink.clear();
    this.stuck.clear();
  }

  private get cpu() { return this.m.isCpu(this.team) || this.m.autopilot; }
  /** The player a person is controlling on this side (the AI leaves them be), if any. */
  private get human() { return this.m.autopilot ? null : this.m.humans[this.team]?.user ?? null; }
  private get dir() { return attackDir(this.team); }
  private get ownGoal(): V2 { return { x: -attackX(this.team), z: 0 }; }
  private get oppGoal(): V2 { return { x: attackX(this.team), z: 0 }; }

  update(dt: number) {
    const m = this.m;
    const b = m.ball;
    const mine = m.teams[this.team];
    // Anyone knocked flat sits this out until they're up.
    const human = this.human;
    const ai = mine.filter((p) => p !== human && p.action?.kind !== "floored");
    if (!ai.length) return;
    const owner = b.owner;

    // Everyone watches the ball (the carrier looks where they're going).
    for (const p of ai) { p.jockeying = false; p.sprint = false; p.look = p === owner ? null : angleOf(b.pos.x - p.pos.x, b.pos.z - p.pos.z); }

    if (owner && owner.team === this.team) this.attack(ai, owner, dt);
    else if (owner) this.defend(ai, owner);
    else this.looseBall(ai);
  }

  // ── Steering ──────────────────────────────────────────────────────────────

  /** Head for `t`, sprinting if it's more than `sprintBeyond` metres away and easing off inside `arrive` metres. */
  private goTo(p: Player, t: V2, urgency = 1, sprintBeyond = Infinity, arrive = 2.2) {
    const tx = clamp(t.x, -HALF_L + 0.5, HALF_L - 0.5), tz = clamp(t.z, -HALF_W + 0.5, HALF_W - 0.5);
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const d = len(dx, dz);
    p.sprint = d > sprintBeyond;
    if (d < 0.35) { p.want = { x: 0, z: 0 }; return; }
    const speed = p.topSpeed * urgency * clamp(d / arrive, 0.25, 1);
    p.want = { x: (dx / d) * speed, z: (dz / d) * speed };
  }

  /**
   * Where `p` can first reach the moving ball: its predicted flight (spin,
   * bounces and all) against how long they take to get there. Low enough to
   * control, that is: a ball over their head doesn't count until it comes down.
   */
  intercept(p: Player): V2 {
    const path = this.m.ballPath();
    const top = p.topSpeed * 0.95;
    for (const q of path) {
      if (q.y < 1.5 && Math.max(0, dist(p.pos, q) - 0.5) / top + 0.1 <= q.t) return { x: q.x, z: q.z };
    }
    const last = path[path.length - 1];
    return { x: last.x, z: last.z };
  }

  // ── Phases ────────────────────────────────────────────────────────────────

  private looseBall(ai: Player[]) {
    const m = this.m;
    const b = m.ball;
    // The intended receiver goes for it; otherwise whoever gets there first.
    let chaser = ai.find((p) => b.kick?.target === p) ?? null;
    let best = Infinity;
    if (!chaser) {
      for (const p of ai) {
        const i = this.intercept(p);
        const t = dist(p.pos, i) / p.topSpeed;
        if (t < best) { best = t; chaser = p; }
      }
      // If the person playing this side is closer, let them go and hold shape.
      const u = this.human;
      if (u && chaser && dist(u.pos, b.pos) < dist(chaser.pos, b.pos) - 1) chaser = null;
    }
    // Who's winning the race decides attack or defence shape.
    let theirs = Infinity;
    for (const o of m.opponents(this.team)) theirs = Math.min(theirs, dist(o.pos, b.pos) / o.topSpeed);
    const ours = chaser ? dist(chaser.pos, b.pos) / chaser.topSpeed : Infinity;
    const others = ai.filter((p) => p !== chaser);
    if (chaser) this.goTo(chaser, this.intercept(chaser), 1, 1.2);
    if (ours < theirs) this.supportShape(others, { x: b.pos.x, z: b.pos.z });
    else this.defenceShape(others, null);
  }

  private attack(ai: Player[], owner: Player, dt: number) {
    const supporters = ai.filter((p) => p !== owner);
    this.supportShape(supporters, owner.pos);
    if (ai.includes(owner)) this.carry(owner, dt);
  }

  private defend(ai: Player[], carrier: Player) {
    const m = this.m;
    // Presser: nearest to the carrier (sticky so roles don't flicker). With the
    // user on this team, they press unless they're well out of it.
    let presser: Player | null = null;
    let pd = Infinity;
    for (const p of ai) {
      const d = dist(p.pos, carrier.pos) - (p === this.presser ? 1 : 0);
      if (d < pd) { pd = d; presser = p; }
    }
    const u = this.human;
    if (u && presser && dist(u.pos, carrier.pos) < pd + 4) presser = null;
    this.presser = presser;

    if (presser) this.press(presser, carrier);
    this.defenceShape(ai.filter((p) => p !== presser), carrier);
  }

  /** Close down the carrier from the goal side and nick the ball. */
  private press(p: Player, carrier: Player) {
    const m = this.m;
    const g = this.ownGoal;
    const d = dist(p.pos, carrier.pos);
    // Goal side of the carrier, a step off them (close enough to poke at the ball), backing
    // off as they come, and a little to the middle so they're shown down the outside: not
    // stood on the ball, which just makes them run into you.
    const cd = Math.max(0.01, dist(carrier.pos, g));
    const ux = (g.x - carrier.pos.x) / cd, uz = (g.z - carrier.pos.z) / cd;
    const off = d < 2 ? 1.05 : 1.4;
    // Sideways (of their line to goal) toward the middle of the pitch.
    const inside = -Math.sign(carrier.pos.z || 1) * Math.sign(ux || 1);
    const spot = { x: carrier.pos.x + ux * off - uz * inside * 0.55, z: carrier.pos.z + uz * off + ux * inside * 0.55 };
    this.goTo(p, spot, d > 3 ? 1 : 0.85, 2.5, 1);
    p.jockeying = d < 3;
    // Go in: barge when tight, fly in with a slide or a kick from further out.
    if (d < 2.4 && this.think(p, this.cpu ? 0.5 : 0.7)) {
      const rate = (this.cpu ? 0.22 * this.m.difficulty.steal : 0.15) * (d < 1.5 ? 1 : 0.4);
      if (Math.random() < rate) m.tackle(p);
    }
  }

  /** Marker on the most dangerous attacker, last man in front of goal. */
  private defenceShape(players: Player[], carrier: Player | null) {
    if (!players.length) return;
    const m = this.m;
    const b = m.ball;
    const g = this.ownGoal;
    const threats = m.opponents(this.team).filter((o) => o !== carrier)
      .sort((a, c) => dist(a.pos, g) - dist(c.pos, g));
    // Last man: on the line from the ball to the middle of the goal, like a keeper
    // without hands — further out to narrow the angle when the ball is close.
    const bd = Math.max(0.01, dist(b.pos, g));
    const out = clamp(bd * 0.32, 1.4, 3.2);
    const lastSpot: V2 = { x: g.x + ((b.pos.x - g.x) / bd) * out, z: g.z + ((b.pos.z - g.z) / bd) * out };
    const spots: V2[] = [];
    const threat = threats[0];
    if (threat) {
      const td = Math.max(0.01, dist(threat.pos, g));
      spots.push({
        x: threat.pos.x + ((g.x - threat.pos.x) / td) * 1.5 + (b.pos.x - threat.pos.x) * 0.12,
        z: threat.pos.z + ((g.z - threat.pos.z) / td) * 1.5 + (b.pos.z - threat.pos.z) * 0.12,
      });
    }
    spots.push(lastSpot);
    if (players.length === 1) {
      // One spare man: if the ball's near our goal, guard it; else mark.
      const near = dist(b.pos, g) < 11;
      this.goTo(players[0], near || !spots[1] ? lastSpot : spots[0], 1, 3.5);
      return;
    }
    this.assign(players, spots.length >= 2 ? spots : [lastSpot, lastSpot], 1, 3.5);
  }

  /** Spread out to give the carrier options: one wide and ahead, one trailing. */
  private supportShape(players: Player[], ball: V2) {
    if (!players.length) return;
    const dir = this.dir;
    const t = this.m.t;
    const flank = ball.z > 0 ? -1 : 1;
    const nearGoal = (attackX(this.team) - ball.x) * dir < 10;
    const wobble = Math.sin(t * 0.7 + this.team) * 1.3;
    const ahead: V2 = nearGoal
      ? { x: attackX(this.team) - dir * 3.4, z: flank * (2 + wobble * 0.4) }
      : { x: clamp(ball.x + dir * 6.8, -HALF_L + 2, HALF_L - 2.5), z: flank * (5 + wobble) };
    const trail: V2 = { x: ball.x - dir * 4.6, z: clamp(ball.z * 0.2 - flank * 2.2 + wobble * 0.5, -HALF_W + 1.5, HALF_W - 1.5) };
    this.assign(players, [ahead, trail], 0.85, 5, 0.45);
  }

  /** Give each player the closest spot (2 players, 2 spots). Sprint if far off it and the tank is above `reserve`. */
  private assign(players: Player[], spots: V2[], urgency: number, sprintBeyond = Infinity, reserve = 0) {
    const go = (p: Player, t: V2) => this.goTo(p, t, urgency, p.stamina > reserve ? sprintBeyond : Infinity);
    if (players.length === 1) { go(players[0], spots[0]); return; }
    const [a, c] = players;
    const straight = dist(a.pos, spots[0]) + dist(c.pos, spots[1]);
    const swapped = dist(a.pos, spots[1]) + dist(c.pos, spots[0]);
    if (straight <= swapped) { go(a, spots[0]); go(c, spots[1]); }
    else { go(a, spots[1]); go(c, spots[0]); }
  }

  /** Rate-limit decisions (reaction time). */
  private think(p: Player, every: number) {
    const now = this.m.t;
    if (now < (this.nextThink.get(p) ?? 0)) return false;
    this.nextThink.set(p, now + every * (0.7 + Math.random() * 0.6));
    return true;
  }

  // ── On the ball ───────────────────────────────────────────────────────────

  private carry(p: Player, dt: number) {
    const m = this.m;
    const b = m.ball;
    const goal = this.oppGoal;
    const opp = m.opponents(this.team);

    // Dribble: head for goal, steer round defenders and away from walls. Down by
    // the byline and wide of the posts there's no angle, so cut back inside.
    const dir = this.dir;
    const toLine = (goal.x - p.pos.x) * dir;
    const wide = Math.abs(p.pos.z) > GOAL_HALF + 0.4;
    const aim = toLine < 5.5 && wide ? { x: goal.x - dir * 6, z: p.pos.z * 0.25 } : goal;
    let gx = aim.x - p.pos.x, gz = aim.z - p.pos.z;
    const gl = Math.max(0.01, len(gx, gz));
    gx /= gl; gz /= gl;
    let pressure = Infinity;
    for (const o of opp) {
      const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z;
      const d = Math.max(0.3, len(dx, dz));
      if (d < 4) { gx += (dx / (d * d)) * 1.3; gz += (dz / (d * d)) * 1.3; }
      const ahead = Math.abs(wrapAngle(angleOf(-dx, -dz) - p.facing)) < 1.0;
      if (ahead) pressure = Math.min(pressure, d);
    }
    // Keep off the walls: sides, and the end wall either side of the goal.
    if (Math.abs(p.pos.z) > HALF_W - 2.5) gz -= Math.sign(p.pos.z) * (1.6 - (HALF_W - Math.abs(p.pos.z)) * 0.4);
    if (toLine < 2 && wide) gx -= dir * 1.5;
    const l = Math.max(0.01, len(gx, gz));
    const sp = p.topSpeed;
    p.want = { x: (gx / l) * sp, z: (gz / l) * sp };
    // Open grass ahead: knock it on and go (a bigger touch, so not with a man close).
    p.sprint = pressure > 3.2 && p.stamina > 0.3 && dist(p.pos, goal) > 4;

    // Hemmed in (slow, or pinned near the byline/wall): get rid of it sooner.
    const pinned = p.speed < 1.5 || (toLine < 2.5 && wide) || Math.abs(p.pos.z) > HALF_W - 1;
    const stuck = pinned ? (this.stuck.get(p) ?? 0) + dt : 0;
    this.stuck.set(p, stuck);

    // Strike it only when it's at their feet (not mid-knock).
    if (p.busy || p.action?.kind === "kick" || dist(b.pos, p.pos) > m.touchReach(p)) return;
    const react = this.cpu ? m.difficulty.react : 0.3;
    if (!this.think(p, react)) return;

    // Shoot?
    const toGoal = dist(p.pos, goal);
    const facingGoal = Math.abs(wrapAngle(angleOf(goal.x - p.pos.x, goal.z - p.pos.z) - p.facing)) < 1.3;
    if (toGoal < 12 + p.stats.shooting / 25 && facingGoal) {
      const blockers = opp.filter((o) => {
        const s = segDist(o.pos, b.pos, goal);
        return s.d < 0.75 && s.t > 0.08;
      }).length;
      let chance = toGoal < 6.5 ? 0.9 : toGoal < 10 ? 0.55 : 0.22;
      if (blockers) chance *= 0.2;
      if (Math.random() < chance) {
        m.shoot(p, clamp(0.4 + toGoal / 22 + Math.random() * 0.15, 0.3, 0.95), null);
        return;
      }
    }

    // Pass? Poor passers misjudge who's free.
    const vision = 1 - rate(p.stats.passing);
    let best: Player | null = null, bestV = -Infinity;
    for (const mate of m.teams[this.team]) {
      if (mate === p) continue;
      const progress = ((mate.pos.x - p.pos.x) * this.dir) / 6;
      let open = 4;
      for (const o of opp) open = Math.min(open, dist(o.pos, mate.pos));
      const lane = opp.some((o) => { const s = segDist(o.pos, p.pos, mate.pos); return s.d < 0.8 && s.t > 0.1 && s.t < 0.9; });
      const v = progress + open / 4 - (lane ? 0.5 : 0) - dist(p.pos, mate.pos) / 30 + normal() * vision * 0.5;
      if (v > bestV) { bestV = v; best = mate; }
    }
    const squeezed = pressure < 1.6;
    const trapped = (this.stuck.get(p) ?? 0) > 0.7;
    if (best && (bestV > 0.85 || (squeezed && bestV > 0.25 && Math.random() < 0.6) || (trapped && bestV > -1))) {
      m.pass(p, best, null);
      return;
    }

    // Skill?
    const flair = this.cpu ? m.difficulty.flair : 0.6;
    if (pressure < 3.2 && Math.random() < flair * (p.stats.dribbling / 100) * 0.4) {
      m.trick(p);
      return;
    }
    // Under real pressure with nothing on: shoot from distance or knock it into space.
    if (squeezed && toGoal < 14 && facingGoal && Math.random() < 0.18) {
      m.shoot(p, 0.8, null);
    }
  }
}
