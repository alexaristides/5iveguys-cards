/**
 * Dev tools for the browser console (not used in the app):
 *   __sim(20)     headless CPU-vs-CPU matches → goals, shots, tackles… (balance)
 *   __glitch(10)  the same, checking every frame for glitches and the camera
 *                 losing the ball
 */
import * as THREE from "three";
import { dist, wrapAngle } from "./math";
import { DIFFICULTIES, Match, type Pad } from "./game/match";
import { BALL_R, GOAL_DEPTH, HALF_L, HALF_W } from "./game/field";
import { buildPlayer } from "./rig/model";
import type { RosterPlayer } from "./roster";
import { CameraRig, SAFE } from "./world/camera";

const PAD: Pad = { move: { x: 0, z: 0 }, pass: false, shootDown: false, shootHeld: false, shootUp: false, skill: false };

function newSim(roster: RosterPlayer[], d: number) {
  const sim = new Match(new THREE.Group(), roster.slice(0, 3), roster.slice(3, 6), DIFFICULTIES[d], (p) => buildPlayer(p.name, p.look, "home"));
  sim.autopilot = true;
  return sim;
}

export function installDevTools(roster: RosterPlayer[]) {
  const w = window as unknown as Record<string, unknown>;

  w.__sim = (n: number, d = 1) => {
    const out: string[] = [];
    const goalDist: number[] = [];
    const total = { goals: [0, 0], shots: [0, 0], blocks: [0, 0], tackles: [0, 0], pokes: [0, 0], tricks: [0, 0], passes: [0, 0], possession: [0, 0] };
    for (let i = 0; i < n; i++) {
      const sim = newSim(roster, d);
      let guard = 0;
      while (sim.state !== "over" && guard++ < 60 * 400) sim.step(1 / 60, PAD);
      out.push(`${sim.score[0]}-${sim.score[1]}`);
      goalDist.push(...sim.log.goalDist);
      total.goals[0] += sim.score[0]; total.goals[1] += sim.score[1];
      for (const k of ["shots", "blocks", "tackles", "pokes", "tricks", "passes", "possession"] as const) {
        total[k][0] += sim.log[k][0]; total[k][1] += sim.log[k][1];
      }
    }
    const avg = Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v.map((x) => +(x / n).toFixed(1))]));
    const hist: Record<string, number> = {};
    for (const g of goalDist) { const k = `${Math.floor(g / 3) * 3}m`; hist[k] = (hist[k] ?? 0) + 1; }
    return { scores: out.join(" "), avg, goalsFrom: hist };
  };

  w.__glitch = (n: number, d = 1, aspect = 844 / 390) => {
    const count: Record<string, number> = {};
    const examples: string[] = [];
    let frames = 0, playFrames = 0;
    const flag = (kind: string, sim: Match, detail = "") => {
      count[kind] = (count[kind] ?? 0) + 1;
      if (examples.length < 30 && count[kind] <= 8) examples.push(`${kind} @${sim.t.toFixed(1)}s ${sim.state} ${detail}`);
    };
    for (let i = 0; i < n; i++) {
      const sim = newSim(roster, d);
      const rig = new CameraRig();
      rig.resize(aspect * 390, 390);
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
        if ([b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z].some(bad) || sim.players.some((p) => [p.pos.x, p.pos.z, p.vel.x, p.vel.z, p.facing].some(bad))) flag("NaN", sim);

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
          if (p.speed > 1.2 && Math.hypot(pv.x, pv.z) > 1.2 && p.vel.x * pv.x + p.vel.z * pv.z < 0) flag("velocityFlip", sim, p.name);
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
