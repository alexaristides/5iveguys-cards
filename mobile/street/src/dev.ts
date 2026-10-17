/**
 * Dev tools for the browser console (not used in the app):
 *   __sim(20)     headless CPU-vs-CPU matches → goals, shots, tackles… (balance)
 *   __glitch(10)  the same, checking every frame for glitches and the camera
 *                 losing the ball (every other match filmed from the other touchline)
 *   __duel(200, { pace: 90 })  what one stat is worth (see below)
 *   __switching(10)  how auto switch behaves for a stand-in user (see below)
 * Each match draws two random teams of three from the squad; pass player keys
 * as the third argument to draw from just those (`__sim(20, 1, ["neymar", …])`).
 *
 * And `?faces` in the URL shows every player's head close up (see `faceSheet`).
 */
import * as THREE from "three";
import { dist, wrapAngle } from "./math";
import { DIFFICULTIES, Match, type Pad } from "./game/match";
import { BALL_R, GOAL_DEPTH, HALF_L, HALF_W } from "./game/field";
import { buildPlayer, type PlayerModel } from "./rig/model";
import type { RosterPlayer, Stats } from "./roster";
import { CameraRig, SAFE } from "./world/camera";

const PAD: Pad = { move: { x: 0, z: 0 }, passDown: false, passHeld: false, passUp: false, shootDown: false, shootHeld: false, shootUp: false, skill: false, sprint: false };

function newSim(roster: RosterPlayer[], d: number, keys?: string[]) {
  const pool = roster.filter((p) => !keys || keys.includes(p.key));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sim = new Match(new THREE.Group(), pool.slice(0, 3), pool.slice(3, 6), DIFFICULTIES[d], (p) => buildPlayer(p.name, p.look, "home"));
  sim.autopilot = true;
  return sim;
}

export function installDevTools(roster: RosterPlayer[]) {
  const w = window as unknown as Record<string, unknown>;

  w.__sim = (n: number, d = 1, keys?: string[]) => {
    const out: string[] = [];
    const goalDist: number[] = [];
    const goalsBy: Record<string, number> = {};
    const total = { goals: [0, 0], shots: [0, 0], blocks: [0, 0], tackles: [0, 0], takedowns: [0, 0], pokes: [0, 0], tricks: [0, 0], passes: [0, 0], possession: [0, 0], sprint: [0, 0] };
    for (let i = 0; i < n; i++) {
      const sim = newSim(roster, d, keys);
      let guard = 0;
      while (sim.state !== "over" && guard++ < 60 * 400) sim.step(1 / 60, PAD);
      out.push(`${sim.score[0]}-${sim.score[1]}`);
      goalDist.push(...sim.log.goalDist);
      for (const g of sim.scorers) if (!g.og) goalsBy[g.name] = (goalsBy[g.name] ?? 0) + 1;
      total.goals[0] += sim.score[0]; total.goals[1] += sim.score[1];
      for (const k of ["shots", "blocks", "tackles", "takedowns", "pokes", "tricks", "passes", "possession", "sprint"] as const) {
        total[k][0] += sim.log[k][0]; total[k][1] += sim.log[k][1];
      }
    }
    const avg = Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v.map((x) => +(x / n).toFixed(1))]));
    const hist: Record<string, number> = {};
    for (const g of goalDist) { const k = `${Math.floor(g / 3) * 3}m`; hist[k] = (hist[k] ?? 0) + 1; }
    return { scores: out.join(" "), avg, goalsFrom: hist, goalsBy };
  };

  // `__duel(200, { pace: 90 })`: identical teams of three (every stat 75), except
  // side A gets the stats you pass. How much more A wins shows what that stat is
  // worth. Sides swap each match so the CPU difficulty tweaks even out.
  w.__duel = (n: number, a: Partial<Stats> = {}, b: Partial<Stats> = {}, d = 1) => {
    const base: Stats = { pace: 75, shooting: 75, passing: 75, dribbling: 75, defending: 75, physical: 75 };
    const team = (s: Partial<Stats>) => roster.slice(0, 3).map((p) => ({ ...p, stats: { ...base, ...s } }));
    const r = { aWins: 0, draws: 0, bWins: 0, aGoals: 0, bGoals: 0 };
    const log = { shots: [0, 0], blocks: [0, 0], tackles: [0, 0], takedowns: [0, 0], pokes: [0, 0], passes: [0, 0], possession: [0, 0], sprint: [0, 0] };
    for (let i = 0; i < n; i++) {
      const swap = i % 2 === 1;
      const sim = new Match(new THREE.Group(), team(swap ? b : a), team(swap ? a : b), DIFFICULTIES[d], (p) => buildPlayer(p.name, p.look, "home"));
      sim.autopilot = true;
      let guard = 0;
      while (sim.state !== "over" && guard++ < 60 * 400) { sim.step(1 / 60, PAD); sim.events.length = 0; }
      const [ga, gb] = swap ? [sim.score[1], sim.score[0]] : sim.score;
      r.aGoals += ga; r.bGoals += gb;
      if (ga > gb) r.aWins++; else if (gb > ga) r.bWins++; else r.draws++;
      for (const k of Object.keys(log) as (keyof typeof log)[]) {
        log[k][0] += sim.log[k][swap ? 1 : 0];
        log[k][1] += sim.log[k][swap ? 0 : 1];
      }
    }
    const per = (x: number) => +(x / n).toFixed(2);
    return {
      aWinPct: Math.round((100 * r.aWins) / n), drawPct: Math.round((100 * r.draws) / n), bWinPct: Math.round((100 * r.bWins) / n),
      goals: [per(r.aGoals), per(r.bGoals)],
      ...Object.fromEntries(Object.entries(log).map(([k, v]) => [k, v.map(per)])),
    };
  };

  // `__switching(10, "wander")`: auto switch with a stand-in for the user: "idle" (no
  // input), "chase" (stick always at the ball) or "wander" (a random direction each
  // second), against the same with it off. Reports switches per minute spent
  // defending, the shortest gap between two, switches straight back to the player
  // just switched from (within 4 s), switches away from a user going for the ball
  // within 8 m (should be 0), and how much of the defending the user had the player
  // nearest the ball.
  w.__switching = (n = 10, mode: "idle" | "chase" | "wander" = "wander", d = 1) => {
    const run = (auto: boolean) => {
      let defT = 0, nearestT = 0, switches = 0, awayFromChase = 0, backs = 0, minGap = Infinity;
      for (let i = 0; i < n; i++) {
        const sim = newSim(roster, d);
        sim.autopilot = false;
        sim.autoSwitch = auto;
        let wander = { x: 0, z: 0 }, nextWander = 0, lastAt = -Infinity, guard = 0;
        let lastFrom: unknown = null;
        while (sim.state !== "over" && guard++ < 60 * 400) {
          const u = sim.user, b = sim.ball;
          let move = { x: 0, z: 0 };
          if (mode === "chase") {
            const l = Math.max(0.01, dist(u.pos, b.pos));
            move = { x: (b.pos.x - u.pos.x) / l, z: (b.pos.z - u.pos.z) / l };
          } else if (mode === "wander") {
            if (sim.t > nextWander) { const a = Math.random() * Math.PI * 2; wander = { x: Math.cos(a), z: Math.sin(a) }; nextWander = sim.t + 1; }
            move = wander;
          }
          const defending = () => sim.state === "play" && !!b.owner && b.owner.team !== sim.userTeam;
          const before = defending();
          sim.step(1 / 60, { ...PAD, move });
          sim.events.length = 0;
          if (!before || !defending()) continue;
          defT += 1 / 60;
          const mates = sim.teams[sim.userTeam];
          if (mates.every((m) => dist(m.pos, b.pos) >= dist(sim.user.pos, b.pos))) nearestT += 1 / 60;
          if (sim.user !== u) {
            switches++;
            if (sim.user === lastFrom && sim.t - lastAt < 4) backs++;
            lastFrom = u;
            minGap = Math.min(minGap, sim.t - lastAt);
            lastAt = sim.t;
            if (mode === "chase" && dist(u.pos, b.pos) < 8) awayFromChase++;
          }
        }
      }
      return {
        perDefendingMinute: +(switches / Math.max(1e-6, defT / 60)).toFixed(1),
        shortestGap: minGap === Infinity ? null : +minGap.toFixed(2),
        switchBacks: backs,
        switches,
        awayFromChase,
        userNearestPct: Math.round((100 * nearestT) / Math.max(1e-6, defT)),
      };
    };
    return { on: run(true), off: run(false) };
  };

  w.__glitch = (n: number, d = 1, aspect = 844 / 390, keys?: string[]) => {
    const count: Record<string, number> = {};
    const examples: string[] = [];
    let frames = 0, playFrames = 0;
    const flag = (kind: string, sim: Match, detail = "") => {
      count[kind] = (count[kind] ?? 0) + 1;
      if (examples.length < 30 && count[kind] <= 8) examples.push(`${kind} @${sim.t.toFixed(1)}s ${sim.state} ${detail}`);
    };
    for (let i = 0; i < n; i++) {
      const sim = newSim(roster, d, keys);
      const rig = new CameraRig();
      rig.resize(aspect * 390, 390);
      rig.flipped = i % 2 === 1; // the online away player's view
      const prevPos = new Map(sim.players.map((p) => [p, { ...p.pos }]));
      const prevFacing = new Map(sim.players.map((p) => [p, p.facing]));
      const prevVel = new Map(sim.players.map((p) => [p, { ...p.vel }]));
      const prevBall = sim.ball.pos.clone();
      let deadFor = 0;
      let stuckFor = 0;
      const possessionChanges: number[] = [];
      let lastTeam: 0 | 1 | null = null;
      let guard = 0;
      while (sim.state !== "over" && guard++ < 60 * 400) {
        const dt = 1 / 60;
        sim.step(dt, PAD);
        sim.events.length = 0;
        rig.update(dt, "match", sim);
        frames++;
        const b = sim.ball;
        const play = sim.state === "play";
        if (play) playFrames++;

        // Numbers.
        const bad = (x: number) => !Number.isFinite(x);
        if ([b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z].some(bad) || sim.players.some((p) => [p.pos.x, p.pos.z, p.vel.x, p.vel.z, p.facing, p.air].some(bad))) flag("NaN", sim);

        // Ball.
        if (Math.abs(b.pos.x) > HALF_L + GOAL_DEPTH + 0.02 || Math.abs(b.pos.z) > HALF_W + 0.02 || b.pos.y < BALL_R - 0.02) flag("ballOutOfCage", sim, `${b.pos.x.toFixed(2)},${b.pos.y.toFixed(2)},${b.pos.z.toFixed(2)}`);
        const jump = b.pos.distanceTo(prevBall);
        if (!b.owner && jump > b.vel.length() * dt + 0.35 && sim.stateT > 0.05) flag("ballTeleport", sim, `${jump.toFixed(2)}m`);
        if (b.owner && dist(b.owner.pos, b.pos) > 1.1) flag("ballFarFromOwner", sim, `${b.owner.name} ${dist(b.owner.pos, b.pos).toFixed(2)}m`);
        prevBall.copy(b.pos);
        if (play && !b.owner && b.speed < 0.3) { deadFor += dt; if (deadFor > 3) { flag("deadBall", sim, `${b.pos.x.toFixed(1)},${b.pos.z.toFixed(1)}`); deadFor = -999; } }
        else if (b.owner || b.speed >= 0.3) deadFor = 0;

        // A carrier pinned in a corner / against a wall, or stood still on the ball.
        const o = b.owner;
        const cornered = o && Math.abs(o.pos.x) > HALF_L - 1.6 && Math.abs(o.pos.z) > 2.2;
        if (play && o && (cornered || o.speed < 0.6)) {
          stuckFor += dt;
          if (stuckFor > 2.5) { flag(cornered ? "carrierCornered" : "carrierStandingStill", sim, `${o.name} ${o.pos.x.toFixed(1)},${o.pos.z.toFixed(1)}`); stuckFor = -999; }
        } else if (!o || !(cornered || o.speed < 0.6)) stuckFor = 0;

        // Possession ping-pong.
        const team = b.owner?.team ?? null;
        if (team !== null && team !== lastTeam) {
          possessionChanges.push(sim.t);
          while (possessionChanges.length && sim.t - possessionChanges[0] > 1) possessionChanges.shift();
          if (possessionChanges.length >= 4) { flag("pingPong", sim); possessionChanges.length = 0; }
          lastTeam = team;
        }

        // Players (skip the frame a kick-off resets everyone's position).
        const reset = sim.state === "kickoff" && sim.stateT <= dt + 1e-6;
        for (const p of sim.players) {
          if (reset) { prevPos.set(p, { ...p.pos }); prevFacing.set(p, p.facing); prevVel.set(p, { ...p.vel }); continue; }
          const pp = prevPos.get(p)!;
          const step = dist(p.pos, pp);
          if (step > 0.5) flag("playerTeleport", sim, `${p.name} ${step.toFixed(2)}m`);
          const turn = Math.abs(wrapAngle(p.facing - prevFacing.get(p)!)) / dt;
          const trick = p.action?.kind === "roulette";
          if (turn > 13 && !trick && p.speed < 1.5 && p.mood === "play") flag("spinOnSpot", sim, `${p.name} ${turn.toFixed(0)}rad/s act=${p.action?.kind ?? "-"} ball=${sim.ball.owner === p ? "own" : sim.ball.owner ? "theirs" : "loose"} user=${p === sim.user}`);
          const pv = prevVel.get(p)!;
          const justHit = p.action?.kind === "floored" && p.action.t < 0.1; // a tackle knocks them back
          if (!justHit && p.speed > 1.2 && Math.hypot(pv.x, pv.z) > 1.2 && p.vel.x * pv.x + p.vel.z * pv.z < 0) flag("velocityFlip", sim, p.name);
          if (Math.abs(p.pos.x) > HALF_L || Math.abs(p.pos.z) > HALF_W) flag("playerOutOfCage", sim, p.name);
          prevPos.set(p, { ...p.pos });
          prevFacing.set(p, p.facing);
          prevVel.set(p, { ...p.vel });
        }
        for (let a = 0; a < sim.players.length; a++) {
          for (let c = a + 1; c < sim.players.length; c++) {
            const pa = sim.players[a], pc = sim.players[c];
            if (dist(pa.pos, pc.pos) < 0.55 && play) flag("playersOverlap", sim, `${pa.name}/${pc.name}`);
          }
        }

        // Camera keeps the ball in view during play.
        if (play && sim.stateT > 0.6) {
          const ndc = rig.ballNdc(b.pos);
          if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z > 1) flag("ballOffScreen", sim, `${ndc.x.toFixed(2)},${ndc.y.toFixed(2)}`);
          else if (ndc.x < SAFE.left - 0.03 || ndc.x > SAFE.right + 0.03 || ndc.y < SAFE.bottom - 0.03 || ndc.y > SAFE.top + 0.03) flag("ballOutsideSafeArea", sim, `${ndc.x.toFixed(2)},${ndc.y.toFixed(2)}`);
        }
      }
    }
    return { matches: n, frames, playFrames, count, examples };
  };
}

/**
 * `?faces`: instead of the game, every player's head close up — straight on
 * and from the side (`?faces=1.2` sets that angle in radians; `&p=milo,theo`
 * picks players) — for lining up the photo crops in roster.ts. Returns the
 * function that draws it each frame, or null without `?faces`.
 */
export function faceSheet(renderer: THREE.WebGLRenderer, scene: THREE.Scene, roster: RosterPlayer[], models: Map<string, PlayerModel>) {
  const params = new URLSearchParams(location.search);
  if (!params.has("faces")) return null;
  const yaw = Number(params.get("faces")) || 0.7;
  const only = params.get("p")?.split(",");
  const players = only ? roster.filter((p) => only.includes(p.key)) : roster;
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 30);
  const head = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const labels = players.map((p) => {
    const l = document.createElement("div");
    l.className = "display";
    l.textContent = p.name;
    l.style.cssText = "position:fixed;font-size:13px;padding:1px 5px;background:rgba(0,0,0,.6);border-radius:4px;pointer-events:none";
    document.body.appendChild(l);
    return l;
  });

  return () => {
    const views = [0, yaw];
    const n = players.length;
    const perRow = n <= 2 ? n : n <= 6 ? Math.ceil(n / 2) : 4;
    const cw = Math.floor(innerWidth / (perRow * views.length)), ch = Math.floor(innerHeight / Math.ceil(n / perRow));
    renderer.setScissorTest(true);
    players.forEach((p, i) => {
      const m = models.get(p.key)!;
      m.head.getWorldPosition(head);
      m.head.getWorldQuaternion(q);
      const col = (i % perRow) * views.length, row = Math.floor(i / perRow);
      views.forEach((a, v) => {
        const x = (col + v) * cw, y = innerHeight - (row + 1) * ch;
        dir.set(Math.sin(a), 0.08, Math.cos(a)).applyQuaternion(q);
        // Far enough back to fit the whole head (about 0.36 × 0.42 m) in the cell.
        cam.aspect = cw / ch;
        cam.updateProjectionMatrix();
        cam.position.copy(head).addScaledVector(dir, Math.max(0.99, 0.85 / cam.aspect));
        cam.lookAt(head);
        renderer.setViewport(x, y, cw, ch);
        renderer.setScissor(x, y, cw, ch);
        renderer.render(scene, cam);
      });
      labels[i].style.left = `${col * cw + 4}px`;
      labels[i].style.top = `${row * ch + 4}px`;
    });
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  };
}
