/**
 * 5IVE STREET — 3v3 street football with the 5ive Guys squad in 3D.
 * Runs in the app's WebView (mobile/src/app/play/street.tsx) or any browser.
 */
import * as THREE from "three";
import { Audio } from "./audio";
import { applyRatings, fetchWebRatings, haptic, host, rosterWithRatings, send } from "./bridge";
import { loadImage } from "./faces";
import { faceSheet, installDevTools } from "./dev";
import { HALF_L } from "./game/field";
import { DIFFICULTIES, IDLE_PAD, Match, type Difficulty, type MatchEvent } from "./game/match";
import { KITS, type KitId } from "./rig/kits";
import { buildPlayer, type PlayerModel } from "./rig/model";
import type { RosterPlayer } from "./roster";
import { Online } from "./online";
import { installFullscreen } from "./ui/fullscreen";
import { Hud, pauseSheet, resultSheet } from "./ui/hud";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { needsSub, Story, subsSheet, type StoryMatch } from "./story/ui";
import { buildArena } from "./world/arena";
import { CameraRig } from "./world/camera";
import { Fx } from "./world/fx";

const inApp = !!host.app || !!window.ReactNativeWebView;
const ui = document.body;
// On the website on a phone: get the browser's bars out of the way.
installFullscreen(inApp);

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
const arena = buildArena().group;
scene.add(arena);
const rig = new CameraRig();
const fx = new Fx(scene);
const audio = new Audio();

// Ring under the player you control.
const marker = new THREE.Group();
const markerRing = new THREE.MeshBasicMaterial({ color: KITS.home.hud, transparent: true, opacity: 0.9, depthWrite: false });
{
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.56, 40), markerRing);
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
// Dev: `?faces` draws every player's head close up instead of the game (see dev.ts).
const faces = inApp ? null : faceSheet(renderer, scene, roster, models);

// ── Screens ────────────────────────────────────────────────────────────────

let match: Match | null = null;
let hud: Hud | null = null;
let paused = false;
/** Online: the menu is open over a match that carries on. */
let menuOpen = false;
let lastTeams: { home: RosterPlayer[]; away: RosterPlayer[]; d: Difficulty } | null = null;
/** The two sides' kits in the current match. */
let kits: [KitId, KitId] = ["home", "black"];
/** Story mode: this match is a career game (fatigue, subs, the result goes to the career). */
let storyOn = false;
/** Players made up for a story match (the other club), thrown away after it. */
const extraModels = new Map<string, PlayerModel>();

const input = new Input(ui, () => audio.unlock());
input.setEnabled(false);

const select = new Select(
  ui, roster, models, rig.cam, inApp,
  (home, away, d) => { audio.click(); startMatch(home, away, d); },
  () => leave(),
  () => { audio.unlock(); audio.click(); },
  () => online.open(),
  () => openStory(),
);

const story = new Story(ui, {
  models,
  camera: rig.cam,
  play: (s) => { audio.click(); startStory(s); },
  matchDone: () => { endMatch(); rig.cut("select", null); },
  leave: () => showSelect(),
  click: () => audio.click(),
});

function openStory() {
  endMatch();
  select.hide();
  rig.cut("select", null);
  void story.open();
}

/** A story match: your squad (subs on the bench) against a club in its own kit. */
function startStory(s: StoryMatch) {
  const awayModel = (p: RosterPlayer) => {
    let m = models.get(p.key) ?? extraModels.get(p.key);
    if (!m) {
      m = buildPlayer(p.name, p.look, s.awayKit);
      extraModels.set(p.key, m);
      scene.add(m.root);
    }
    return m;
  };
  for (const p of [...s.away, ...s.awayBench]) awayModel(p).setKit(s.awayKit);
  startMatch(s.home, s.away, s.difficulty, undefined, s);
}

const online = new Online(ui, inApp, {
  select,
  roster,
  play: (home, away, side, labels) => startMatch(home, away, DIFFICULTIES[1], { side, labels }),
  showSelect: () => showSelect(),
  click: () => audio.click(),
});

/** Exit: back to the app, or on the website back to where you came from. */
function leave() {
  if (online.active) online.leave();
  if (inApp) { send({ type: "exit" }); return; }
  const fromSite = document.referrer && new URL(document.referrer).origin === location.origin;
  if (fromSite && history.length > 1) history.back();
  else location.assign("/");
}

// On the website, fetch the fan ratings ourselves (the app passes them in).
if (!inApp && !host.ratings) {
  fetchWebRatings()
    .then((r) => { applyRatings(roster, r); select.refreshStats(); })
    .catch(() => { /* not on the site (local dev) or offline: built-in stats */ });
}

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
  for (const m of extraModels.values()) m.dispose();
  extraModels.clear();
  storyOn = false;
  kits = ["home", "black"];
  match = null;
  hud?.destroy();
  hud = null;
  paused = false;
  menuOpen = false;
  marker.visible = false;
  input.setEnabled(false);
  setView(1);
}

/**
 * Which touchline this screen watches from (`Match.camSide`). From the other one the
 * cage is turned round with the camera, so it looks the same and only the match is mirrored.
 */
function setView(side: 1 | -1) {
  rig.flipped = input.mirrored = side < 0;
  arena.rotation.y = side < 0 ? Math.PI : 0;
}

/** Auto switch (pause menu), on unless turned off. */
const AUTO_SWITCH_KEY = "street.autoSwitch";
let autoSwitch = true;
try { autoSwitch = localStorage.getItem(AUTO_SWITCH_KEY) !== "0"; } catch { /* storage unavailable */ }

/**
 * Start a match. Online, `net` says which side this screen plays and the names for the scoreboard.
 * Story mode (`s`): both benches, tiring legs, and the other club's kit and players.
 */
function startMatch(home: RosterPlayer[], away: RosterPlayer[], d: Difficulty, net?: { side: 0 | 1; labels: [string, string] }, s?: StoryMatch): Match {
  const keep = s ? new Map(extraModels) : null;
  extraModels.clear(); // endMatch would throw away the other club, made just now
  endMatch();
  if (keep) for (const [k, m] of keep) extraModels.set(k, m);
  select.hide();
  storyOn = !!s;
  kits = ["home", s?.awayKit ?? "black"];
  lastTeams = net || s ? null : { home, away, d };
  // Only the six on the pitch are drawn; the bench waits for the next team select.
  const model = (p: RosterPlayer) => (models.get(p.key) ?? extraModels.get(p.key))!;
  for (const m of [...models.values(), ...extraModels.values()]) m.root.visible = false;
  for (const p of [...home, ...(s?.homeBench ?? [])]) model(p).setKit(kits[0]);
  for (const p of [...away, ...(s?.awayBench ?? [])]) model(p).setKit(kits[1]);
  for (const p of [...home, ...away]) model(p).root.visible = true;
  match = new Match(scene, home, away, d, model,
    net ? { humans: [true, true], userTeam: net.side } : s ? { bench: [s.homeBench, s.awayBench], fatigue: true } : {});
  match.autoSwitch = autoSwitch;
  setView(match.camSide(match.userTeam));
  markerRing.color.set(net?.side === 1 ? KITS.black.hud : KITS.home.hud);
  if (!inApp) {
    // Dev: inspect from the console; ?autopilot lets the CPU play both sides.
    (window as unknown as { __match: Match }).__match = match;
    if (!net) match.autopilot = new URLSearchParams(location.search).has("autopilot");
  }
  hud = new Hud(ui, kits, pause, net?.labels ?? s?.labels, s ? () => openSubs() : undefined);
  hud.root.classList.toggle("away", net?.side === 1);
  hud.firstMatchTip();
  input.setEnabled(true);
  marker.visible = true;
  rig.cut("match", match);
  return match;
}

/** Story mode: the subs sheet (the match waits). */
function openSubs() {
  const m = match;
  if (!m || !storyOn || paused || m.state === "over") return;
  audio.click();
  paused = true;
  subsSheet(ui, m, () => audio.click(), () => { paused = false; });
}

function pause() {
  if (!match || paused || menuOpen || match.state === "over") return;
  audio.click();
  if (storyOn) {
    paused = true;
    pauseSheet(ui, audio.muted, autoSwitch, {
      resume: () => { paused = false; },
      restart: () => {},
      quit: () => story.quitMatch(),
      subs: () => { paused = false; openSubs(); },
      mute: (m) => audio.setMuted(m),
      autoSwitch: (on) => setAutoSwitch(on),
    });
    return;
  }
  if (online.active) {
    // Nobody can stop the other player's match: settings and a way out, while play goes on.
    menuOpen = true;
    pauseSheet(ui, audio.muted, autoSwitch, {
      resume: () => { menuOpen = false; },
      restart: () => {},
      quit: () => { menuOpen = false; online.leave(); },
      mute: (m) => audio.setMuted(m),
      autoSwitch: (on) => setAutoSwitch(on),
    }, true);
    return;
  }
  paused = true;
  pauseSheet(ui, audio.muted, autoSwitch, {
    resume: () => { paused = false; },
    restart: () => { if (lastTeams) startMatch(lastTeams.home, lastTeams.away, lastTeams.d); },
    quit: () => showSelect(),
    menu: () => leave(),
    mute: (m) => audio.setMuted(m),
    autoSwitch: (on) => setAutoSwitch(on),
  });
}

function setAutoSwitch(on: boolean) {
  autoSwitch = on;
  if (match) match.autoSwitch = on;
  try { localStorage.setItem(AUTO_SWITCH_KEY, on ? "1" : "0"); } catch { /* storage unavailable */ }
}

// Closing the page: tell the other player straight away rather than leave them waiting.
addEventListener("pagehide", () => { if (online.active) online.leave(); });
// Leaving the app pauses (online the match can't wait, so it carries on).
document.addEventListener("visibilitychange", () => { if (document.hidden && !online.active) pause(); });
addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key.toLowerCase() === "p") pause(); });

// ── Match events ───────────────────────────────────────────────────────────

function handleEvents(m: Match, events: MatchEvent[]) {
  for (const e of events) {
    switch (e.type) {
      case "sound": audio.play(e.name, e.v); break;
      case "haptic": if (e.team === undefined || e.team === m.userTeam) haptic(e.style); break;
      case "style": hud?.style(e.text, e.team); break;
      case "fiveMode":
        hud?.popup("5IVE MODE", e.team === m.userTeam ? "Your team is on fire" : `${online.active ? online.opponent : "CPU"} on fire — hold tight`, e.team !== 0);
        if (e.team === m.userTeam) haptic("success");
        break;
      case "hit": {
        // Freeze-frame, shake, dust.
        hitStop = Math.max(hitStop, 0.04 + 0.04 * e.power);
        rig.shake(0.18 * e.power);
        fx.confetti(new THREE.Vector3(e.x, 0.1, e.z), ["#e7e5e4", "#a8a29e", "#78716c", "#fde047"], 28, 0.4);
        break;
      }
      case "sub":
        hud?.note(e.team === m.userTeam ? `${e.on.name} on · ${e.off.name} off` : `${KITS[kits[e.team]].label} sub: ${e.on.name} on`);
        break;
      case "tired":
        hud?.note(`${e.player.name}'s legs are going · SUBS`);
        break;
      case "goal": {
        const who = e.og ? "Own goal" : e.scorer?.name ?? "";
        hud?.popup("GOAL!", e.label ? `${who} · ${e.label}` : who, e.team !== 0);
        const kit = KITS[kits[e.team]] ?? (e.team === 0 ? KITS.home : KITS.black);
        fx.confetti(new THREE.Vector3((e.team === 0 ? 1 : -1) * (HALF_L + 0.4), 0.5, 0), [e.team === 0 ? kit.shirt : kit.hud, kit.trim, "#ffffff"]);
        break;
      }
      case "kickoff":
        hud?.countdown(m.score[0] + m.score[1] === 0 ? "KICK OFF" : "GO");
        break;
      case "end": {
        const [h, a] = m.score;
        const [mine, theirs] = m.userTeam === 0 ? [h, a] : [a, h];
        send({ type: "result", home: mine, away: theirs, won: mine > theirs, online: online.active });
        input.setEnabled(false);
        if (storyOn) {
          hud?.setVisible(false);
          void story.finished(m);
          break;
        }
        const sheet = resultSheet(ui, m, e.motm ?? m.motm(), inApp, online.active ? online.resultActions : {
          rematch: () => { if (lastTeams) startMatch(lastTeams.home, lastTeams.away, lastTeams.d); },
          teams: () => showSelect(),
          exit: () => leave(),
        }, online.active);
        if (online.active) online.ended(sheet);
        input.setEnabled(false);
        break;
      }
    }
  }
}

// ── Loop ───────────────────────────────────────────────────────────────────

const offscreen = new THREE.Vector3(0, -10, 0);
let hitStop = 0;
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

function frame(now = performance.now()) {
  const raw = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.05, raw);
  last = now;
  time += dt;
  if (!document.hidden) adaptResolution(raw);

  const m = match;
  if (m) {
    // Hit-stop: a big tackle freezes play for a few frames.
    const frozen = hitStop > 0;
    hitStop = Math.max(0, hitStop - raw);
    const step = paused || frozen ? 0 : dt;
    if (online.replica) {
      // Online guest: send our buttons, draw the host's match.
      handleEvents(m, online.guestFrame(m, input.read(), dt, autoSwitch));
    } else if (!paused && !frozen) {
      const pad = input.read();
      // Online host: the guest's buttons drive the away side.
      const away = online.awayPad(m) ?? IDLE_PAD;
      // Substeps keep fast balls and tackles stable on slow frames.
      const n = Math.max(1, Math.ceil(dt / (1 / 90)));
      const still = { passDown: false, passUp: false, shootDown: false, shootUp: false, skill: false, passHeldFor: undefined, shootHeldFor: undefined };
      const quiet = { ...pad, ...still }, quietAway = { ...away, ...still };
      for (let i = 0; i < n; i++) m.step(dt / n, i === 0 ? pad : quiet, i === 0 ? away : quietAway);
      online.hostFrame(m.events);
      handleEvents(m, m.events);
      m.events.length = 0;
    } else online.hostFrame([]);
    for (const p of m.players) p.render(step, time, m.ball.pos);
    m.ball.render(step);
    const u = m.user;
    marker.position.set(u.pos.x, 0.02, u.pos.z);
    marker.rotation.y = u.facing;
    marker.visible = m.state === "play" || m.state === "kickoff";
    const attacking = m.ball.owner?.team === m.userTeam || (!m.ball.owner && m.ball.kick?.target === u);
    input.setMode(attacking);
    input.setVisible(m.state === "play" || m.state === "kickoff");
    if (online.replica) input.setCharge(...online.charges());
    else input.setCharge(m.shotCharge, m.passCharge);
    input.setStamina(u.stamina, u.winded, u.sprinting);
    hud?.update(m);
    if (storyOn) {
      hud?.subsAlert(needsSub(m));
      hud?.meTired(m.user.energy < 0.4);
    }
    if (online.active) {
      hud?.banner(online.banner(m));
      hud?.link(online.room?.direct ?? null);
    }
    if (marker.visible) {
      const head = new THREE.Vector3(u.pos.x, 2.25 * (u.info.look.height / 1.8), u.pos.z).project(rig.cam);
      hud?.meTag(u.name, ((head.x + 1) / 2) * innerWidth, ((1 - head.y) / 2) * innerHeight, u.stamina, u.winded);
    } else hud?.meTag(null);
    fx.dazed(m.players.filter((p) => p.action?.kind === "floored" && p.action.t / p.action.dur > 0.3 && p.action.t / p.action.dur < 0.85)
      .map((p) => p.model.head.getWorldPosition(new THREE.Vector3())), time);
    const kick = m.ball.kick;
    const shot = kick?.kind === "shot" && m.ball.speed > 12;
    fx.update(step, m.ball.pos, shot, kick && m.fiveMode[kick.by.team] > 0 ? "#e879f9" : "#fff7d6");
    rig.update(dt, "match", m);
  } else {
    select.update(dt);
    story.update(dt);
    fx.update(dt, offscreen, false, "#fff");
    fx.dazed([], time);
    rig.selectX = story.active ? story.viewX : select.viewX;
    rig.update(dt, "select", null);
  }
  if (faces) faces();
  else renderer.render(scene, rig.cam);
}
renderer.setAnimationLoop(() => frame());

// Dev: `__sim(20)` / `__glitch(10)` in the browser console (see dev.ts), and `__online` (the room, sync).
if (!inApp) {
  installDevTools(roster);
  (window as unknown as { __online: Online }).__online = online;
  // The renderer, scene and camera, for grabbing frames from the console.
  (window as unknown as { __gfx: unknown }).__gfx = { renderer, scene, rig };
  // Run `n` frames of `dt` straight away, e.g. when the browser has stopped animating a hidden page.
  (window as unknown as { __frames: unknown }).__frames = (n: number, dt = 1 / 30) => {
    for (let i = 0; i < n; i++) frame(last + dt * 1000);
  };
}

document.getElementById("loading")?.remove();
showSelect();
// Invite link (?room=CODE on the website, or passed in by the app): straight into that room.
const invite = host.room ?? new URLSearchParams(location.search).get("room");
if (invite && !faces) online.invited(invite);
if (faces) {
  select.cull = false;
  select.root.style.display = "none";
}
send({ type: "ready" });
