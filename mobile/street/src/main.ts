/**
 * 5IVE STREET — 3v3 street football with the 5ive Guys squad in 3D.
 * Runs in the app's WebView (mobile/src/app/play/street.tsx) or any browser.
 */
import * as THREE from "three";
import { Audio } from "./audio";
import { haptic, host, rosterWithRatings, send } from "./bridge";
import { loadImage } from "./faces";
import { installDevTools } from "./dev";
import { Match, type Difficulty } from "./game/match";
import { KITS } from "./rig/kits";
import { buildPlayer, type PlayerModel } from "./rig/model";
import type { RosterPlayer } from "./roster";
import { Hud, pauseSheet, resultSheet } from "./ui/hud";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { buildArena } from "./world/arena";
import { CameraRig } from "./world/camera";
import { Fx } from "./world/fx";

const inApp = !!host.app || !!window.ReactNativeWebView;
const ui = document.body;

// ── Renderer and world ─────────────────────────────────────────────────────

const canvas = document.getElementById("gl") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog("#2a1748", 60, 170);
scene.add(buildArena().group);
const rig = new CameraRig();
const fx = new Fx(scene);
const audio = new Audio();

// Ring under the player you control.
const marker = new THREE.Group();
{
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.56, 40),
    new THREE.MeshBasicMaterial({ color: KITS.home.hud, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  const arrow = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 3),
    new THREE.MeshBasicMaterial({ color: "#f0abfc", transparent: true, opacity: 0.95, depthWrite: false }),
  );
  arrow.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  arrow.position.z = 0.72;
  marker.add(ring, arrow);
  marker.position.y = 0.02;
  scene.add(marker);
  marker.visible = false;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  rig.resize(w, h);
}
addEventListener("resize", resize);
resize();

// ── Players ────────────────────────────────────────────────────────────────

const roster = rosterWithRatings();
const models = new Map<string, PlayerModel>();
for (const p of roster) {
  const m = buildPlayer(p.name, p.look, "black");
  models.set(p.key, m);
  scene.add(m.root);
}
// Real faces from the card art; the drawn faces stay if a card can't load.
for (const p of roster) {
  loadImage(p.card).then((img) => models.get(p.key)!.applyFace(img, p.look.face)).catch(() => {});
}

// ── Screens ────────────────────────────────────────────────────────────────

let match: Match | null = null;
let hud: Hud | null = null;
let paused = false;
let lastTeams: { home: RosterPlayer[]; away: RosterPlayer[]; d: Difficulty } | null = null;

const input = new Input(ui, () => audio.unlock());
input.setEnabled(false);

const select = new Select(
  ui, roster, models, rig.cam, inApp,
  (home, away, d) => { audio.click(); startMatch(home, away, d); },
  () => send({ type: "exit" }),
  () => { audio.unlock(); audio.click(); },
);

function showSelect() {
  endMatch();
  select.show();
  rig.cut("select", null);
}

function endMatch() {
  if (match) {
    match.ball.mesh.removeFromParent();
    match.ball.shadow.removeFromParent();
  }
  match = null;
  hud?.destroy();
  hud = null;
  paused = false;
  marker.visible = false;
  input.setEnabled(false);
}

function startMatch(home: RosterPlayer[], away: RosterPlayer[], d: Difficulty) {
  endMatch();
  select.hide();
  lastTeams = { home, away, d };
  for (const p of home) models.get(p.key)!.setKit("home");
  for (const p of away) models.get(p.key)!.setKit("black");
  match = new Match(scene, home, away, d, (p) => models.get(p.key)!);
  if (!inApp) {
    // Dev: inspect from the console; ?autopilot lets the CPU play both sides.
    (window as unknown as { __match: Match }).__match = match;
    match.autopilot = new URLSearchParams(location.search).has("autopilot");
  }
  hud = new Hud(ui, ["home", "black"], pause);
  hud.firstMatchTip();
  input.setEnabled(true);
  marker.visible = true;
  rig.cut("match", match);
}

function pause() {
  if (!match || paused || match.state === "over") return;
  paused = true;
  audio.click();
  pauseSheet(ui, audio.muted, {
    resume: () => { paused = false; },
    restart: () => { if (lastTeams) startMatch(lastTeams.home, lastTeams.away, lastTeams.d); },
    quit: () => showSelect(),
    mute: (m) => audio.setMuted(m),
  });
}

document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key.toLowerCase() === "p") pause(); });

// ── Match events ───────────────────────────────────────────────────────────

function handleEvents(m: Match) {
  for (const e of m.events) {
    switch (e.type) {
      case "sound": audio.play(e.name, e.v); break;
      case "haptic": haptic(e.style); break;
      case "style": hud?.style(e.text, e.team); break;
      case "fiveMode":
        hud?.popup("5IVE MODE", e.team === m.userTeam ? "Your team is on fire" : "CPU on fire — hold tight", e.team !== 0);
        if (e.team === m.userTeam) haptic("success");
        break;
      case "goal": {
        const who = e.og ? "Own goal" : e.scorer?.name ?? "";
        hud?.popup("GOAL!", e.label ? `${who} · ${e.label}` : who, e.team !== 0);
        const kit = e.team === 0 ? KITS.home : KITS.black;
        fx.confetti(new THREE.Vector3(e.team === 0 ? 15.4 : -15.4, 0.5, 0), [e.team === 0 ? kit.shirt : kit.hud, kit.trim, "#ffffff"]);
        break;
      }
      case "kickoff":
        hud?.countdown(m.score[0] + m.score[1] === 0 ? "KICK OFF" : "GO");
        break;
      case "end": {
        const [h, a] = m.score;
        send({ type: "result", home: h, away: a, won: h > a });
        resultSheet(ui, m, m.motm(), inApp, {
          rematch: () => { if (lastTeams) startMatch(lastTeams.home, lastTeams.away, lastTeams.d); },
          teams: () => showSelect(),
          exit: () => send({ type: "exit" }),
        });
        input.setEnabled(false);
        break;
      }
    }
  }
  m.events.length = 0;
}

// ── Loop ───────────────────────────────────────────────────────────────────

const offscreen = new THREE.Vector3(0, -10, 0);
let last = performance.now();
let time = 0;
// Dynamic resolution: drop the pixel ratio if frames run slow for a few seconds.
let pixelRatio = Math.min(devicePixelRatio, 2);
let slowFor = 0;
function adaptResolution(dt: number) {
  slowFor = dt > 1 / 45 ? slowFor + dt : Math.max(0, slowFor - dt * 0.5);
  if (slowFor > 2 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    resize();
    slowFor = 0;
  }
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  time += dt;
  if (!document.hidden) adaptResolution(raw);

  const m = match;
  if (m) {
    const step = paused ? 0 : dt;
    if (!paused) {
      const pad = input.read();
      // Substeps keep fast balls and tackles stable on slow frames.
      const n = Math.max(1, Math.ceil(dt / (1 / 90)));
      const quiet = { ...pad, pass: false, shootDown: false, shootUp: false, skill: false };
      for (let i = 0; i < n; i++) m.step(dt / n, i === 0 ? pad : quiet);
      handleEvents(m);
    }
    for (const p of m.players) p.render(step, time, m.ball.pos);
    m.ball.render(step);
    const u = m.user;
    marker.position.set(u.pos.x, 0.02, u.pos.z);
    marker.rotation.y = u.facing;
    marker.visible = m.state === "play" || m.state === "kickoff";
    const attacking = m.ball.owner?.team === m.userTeam || (!m.ball.owner && m.ball.kick?.target === u);
    input.setMode(attacking);
    input.setVisible(m.state === "play" || m.state === "kickoff");
    input.setCharge(m.chargeStart !== null ? Math.min(1, (m.t - m.chargeStart) / 0.85) : 0);
    hud?.update(m);
    if (marker.visible) {
      const head = new THREE.Vector3(u.pos.x, 2.25 * (u.info.look.height / 1.8), u.pos.z).project(rig.cam);
      hud?.meTag(u.name, ((head.x + 1) / 2) * innerWidth, ((1 - head.y) / 2) * innerHeight);
    } else hud?.meTag(null);
    const kick = m.ball.kick;
    const shot = kick?.kind === "shot" && m.ball.speed > 12;
    fx.update(step, m.ball.pos, shot, kick && m.fiveMode[kick.by.team] > 0 ? "#e879f9" : "#fff7d6");
    rig.update(dt, "match", m);
  } else {
    select.update(dt);
    fx.update(dt, offscreen, false, "#fff");
    rig.update(dt, "select", null);
  }
  renderer.render(scene, rig.cam);
});

// Dev: `__sim(20)` / `__glitch(10)` in the browser console (see dev.ts).
if (!inApp) installDevTools(roster);

document.getElementById("loading")?.remove();
showSelect();
send({ type: "ready" });
