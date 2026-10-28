/**
 * Story mode screens (DOM over the 3D cage): the talking, picking players, the hub
 * (table, next game, your starting three stood in the cage), the squad, the result
 * with XP and levels, and the subs sheet in a match. Rules are in `career.ts`.
 */
import * as THREE from "three";
import type { Difficulty, Match } from "../game/match";
import type { Player } from "../game/player";
import { defineKit, KITS } from "../rig/kits";
import type { PlayerModel } from "../rig/model";
import { Animator, cheer, idle } from "../rig/pose";
import { overall, ROSTER, type RosterPlayer, type Stats } from "../roster";
import * as C from "./career";
import * as S from "./script";

/** What main.ts needs to set up a story match. */
export interface StoryMatch {
  home: RosterPlayer[];
  homeBench: RosterPlayer[];
  away: RosterPlayer[];
  awayBench: RosterPlayer[];
  awayKit: string;
  labels: [string, string];
  difficulty: Difficulty;
}

export interface StoryHost {
  /** The squad's 3D models (by player key). */
  models: Map<string, PlayerModel>;
  camera: THREE.PerspectiveCamera;
  play(m: StoryMatch): void;
  /** The match is done with (after the result): clear it away. */
  matchDone(): void;
  /** Back to team select. */
  leave(): void;
  click(): void;
}

const el = (html: string) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const STAT_LABELS: [keyof Stats, string][] = [["pace", "PAC"], ["shooting", "SHO"], ["passing", "PAS"], ["dribbling", "DRI"], ["defending", "DEF"], ["physical", "STA"]];
const card = (key: string) => ROSTER.find((p) => p.key === key);

/** A club's kit for the 3D players and the scoreboard. */
export function clubKit(club: C.Club): string {
  const id = `club:${club.id}`;
  if (!KITS[id]) defineKit({ id, label: club.short, chest: club.short, ...club.kit });
  return id;
}

/** A round photo of a player's face, cut from their card. */
function face(key: string, size: number): string {
  const p = card(key);
  if (!p) return "";
  const f = p.look.face;
  const h = (size * 0.4) / (f.chin - f.y);
  const w = h * (785 / 1085);
  const cy = f.y + (f.chin - f.y) * 0.3;
  return `<i class="av" style="width:${size}px;height:${size}px;background-image:url('${p.card}');background-size:${w.toFixed(0)}px ${h.toFixed(0)}px;background-position:${(size / 2 - f.x * w).toFixed(0)}px ${(size / 2 - cy * h).toFixed(0)}px"></i>`;
}

function badge(text: string, bg: string, fg: string, size: number) {
  return `<i class="av badge" style="width:${size}px;height:${size}px;background:${bg};color:${fg};font-size:${Math.round(size * 0.36)}px">${esc(text)}</i>`;
}

function clubBadge(club: C.Club, size: number) {
  return badge(club.short.slice(0, 3), club.kit.shirt, club.kit.trim === club.kit.shirt ? "#fff" : club.kit.trim, size);
}

/** Who's talking: a portrait and a name. */
function speaker(who: string, size = 54): { av: string; name: string } {
  if (who === S.REX) return { av: badge("RH", "#1d4ed8", "#fbbf24", size), name: "Rex Hollins · Royals owner" };
  if (who === S.GAZETTE) return { av: badge("CG", "#f5f5f4", "#111", size), name: "The Cage Gazette" };
  if (who === S.NARRATOR) return { av: "", name: "" };
  if (card(who)) return { av: face(who, size), name: who === C.MANAGER ? "Oscar · player-manager" : C.nameOf(who) };
  const club = C.clubById(who);
  if (club) return { av: clubBadge(club, size), name: `${club.captain} · ${club.name}` };
  return { av: "", name: who };
}

const ovrOf = C.ovrOf;

export class Story {
  readonly root: HTMLElement;
  active = false;
  /** Camera x (CameraRig frames the cage around it, as on team select). */
  viewX = 0;
  private c: C.Career | null = null;
  private screen: HTMLElement;
  private tags: HTMLElement;
  private stand: { model: PlayerModel; anim: Animator; x: number; tag: HTMLElement; hop: number }[] = [];
  private t = 0;
  /** The club we're playing now. */
  private playing: C.Club | null = null;

  constructor(parent: HTMLElement, private host: StoryHost) {
    this.root = el(`<div class="layer hidden" id="story"><div class="st-tags"></div><div class="st-screen"></div></div>`);
    parent.appendChild(this.root);
    this.screen = this.root.querySelector(".st-screen")!;
    this.tags = this.root.querySelector(".st-tags")!;
  }

  // ── Flow ──────────────────────────────────────────────────────────────────

  /** Open story mode: carry on the saved career, or start one. */
  async open() {
    this.show();
    const c = (this.c = C.loadCareer() ?? C.newCareer());
    this.lineup([C.MANAGER]);
    this.screen.innerHTML = "";
    if (c.phase === "intro") {
      await this.talk(S.intro());
      c.phase = "draft";
      C.saveCareer(c);
    }
    if (c.phase === "draft") {
      const picks = await this.pick(C.draftPool(), C.FIRST_PICKS, "Pick four players to start with Oscar", "Sign them");
      C.draft(c, picks);
      C.saveCareer(c);
    }
    await this.flush();
    this.hub();
  }

  /** Tell the news (and run the transfer window if it's open). */
  private async flush() {
    const c = this.c!;
    const tell = async () => {
      if (!c.news.length) return;
      const lines = S.newsScenes(c);
      const up = c.news.some((n) => n.kind === "season" && (n.outcome === "champions" || n.outcome === "promoted" || n.outcome === "title"));
      c.news = [];
      C.saveCareer(c);
      this.lineup(c.starters, up);
      await this.talk(lines);
    };
    await tell();
    if (c.phase === "window") {
      this.lineup(c.starters);
      await this.talk(S.transferWindow(c));
      const n = Math.min(C.SIGNINGS, c.offers.length);
      const picks = await this.pick(c.offers, n, n > 1 ? `Sign ${n} of them` : "Sign them", "Sign");
      C.sign(c, picks);
      C.saveCareer(c);
      await tell();
    }
  }

  private async play() {
    const c = this.c!;
    const club = C.nextClub(c);
    if (!club) return;
    this.host.click();
    this.screen.innerHTML = "";
    await this.talk(S.preMatch(c, club));
    const opp = C.clubSquad(club, c.stolen);
    const mine = c.starters.map((k) => c.squad.find((p) => p.key === k)!).filter(Boolean);
    const bench = c.squad.filter((p) => !c.starters.includes(p.key)).sort((a, b) => ovrOf(b) - ovrOf(a));
    this.playing = club;
    this.hide();
    this.host.play({
      home: mine.map(C.asRoster),
      homeBench: bench.map(C.asRoster),
      away: opp.starters,
      awayBench: opp.bench,
      awayKit: clubKit(club),
      labels: ["5IVE", club.short],
      difficulty: C.fixtureDifficulty(c.div, c.round),
    });
  }

  /** Back out of a match without a result (it's played again). */
  quitMatch() {
    this.playing = null;
    this.host.matchDone();
    this.show();
    this.hub();
  }

  /** Full time in a story match: the result over the match, then back to the hub. */
  async finished(m: Match) {
    const c = this.c, club = this.playing;
    if (!c || !club) return;
    this.playing = null;
    const lines: C.Line[] = [...m.teams[0], ...m.bench[0]].map((p) => ({ key: p.info.key, secs: p.secs, goals: p.goals, assists: p.assists, tackles: p.tackles }));
    const motm = m.motm();
    const rep: C.MatchReport = { club: club.id, mine: m.score[0], theirs: m.score[1], lines, motm: motm.team === 0 ? motm.info.key : null };
    const settled = C.settleMatch(c, rep);
    c.news = c.news.filter((n) => n.kind !== "home"); // said just below
    C.saveCareer(c);
    this.show();
    this.screen.innerHTML = "";
    await this.result(club, rep, settled, m);
    this.host.matchDone();
    this.lineup(c.starters, true);
    await this.talk(S.postMatch(c, club, rep, settled));
    if (C.seasonOver(c)) {
      await this.finalTable();
      C.endSeason(c);
      C.saveCareer(c);
    }
    await this.flush();
    this.hub();
  }

  show() {
    this.active = true;
    this.root.classList.remove("hidden");
  }

  hide() {
    this.active = false;
    this.root.classList.add("hidden");
    this.clearLineup();
  }

  // ── The hub ───────────────────────────────────────────────────────────────

  private hub() {
    const c = this.c!;
    const d = C.division(c.div);
    const club = C.nextClub(c);
    this.lineup(c.starters);
    const s = el(`
      <div class="st-hub">
        <div class="st-head">
          <div class="logo display">FIVE GUYS FC<small>${esc(`${d.name} · ${d.place} · Season ${c.season}`)}${c.titles ? ` · ${"🏆".repeat(Math.min(c.titles, 5))}` : ""}</small></div>
          <div class="st-btns">
            <button class="btn ghost sm" data-squad>Squad</button>
            <button class="btn ghost sm" data-more>⋯</button>
            <button class="btn ghost sm" data-exit>Back</button>
          </div>
        </div>
        <div class="st-side">
          ${tableHtml(c, false)}
          ${club ? `
          <div class="st-next">
            <div class="fx">
              <div class="lbl">GAME ${c.round + 1} OF ${C.SEASON_GAMES}${c.nemeses.includes(club.id) ? ` · <b class="nem">NEMESIS ☠</b>` : club.rival ? ` · <b class="nem">RIVAL</b>` : ""}</div>
              <div class="club">${clubBadge(club, 26)}<span>${esc(club.name)}</span></div>
              <div class="meta">${"★".repeat(C.stars(club))}<span class="dim">${"★".repeat(5 - C.stars(club))}</span> · OVR ${club.str}</div>
            </div>
            <button class="btn play" data-play>Play</button>
          </div>` : ""}
        </div>
      </div>`);
    this.screen.replaceChildren(s);
    s.querySelector("[data-play]")?.addEventListener("click", () => void this.play());
    s.querySelector("[data-squad]")!.addEventListener("click", () => { this.host.click(); void this.squad(); });
    s.querySelector("[data-exit]")!.addEventListener("click", () => { this.host.click(); this.hide(); this.host.leave(); });
    s.querySelector("[data-more]")!.addEventListener("click", () => { this.host.click(); this.more(); });
  }

  private more() {
    const c = this.c!;
    const sheet = el(`
      <div class="sheet st-menu"><div class="panel">
        <h2 class="display">Story</h2>
        <div class="sub">${c.history.length ? esc(c.history.map((h) => `S${h.season}: Div ${h.div}, ${h.pos}${["st", "nd", "rd"][h.pos - 1] ?? "th"}`).join(" · ")) : "Your first season"}</div>
        <div class="row"><button class="btn" data-close>Close</button><button class="btn ghost" data-help>How it works</button></div>
        <div class="row"><button class="btn ghost danger" data-new>Start a new career</button></div>
      </div></div>`);
    this.screen.appendChild(sheet);
    sheet.querySelector("[data-close]")!.addEventListener("click", () => sheet.remove());
    sheet.querySelector("[data-help]")!.addEventListener("click", () => {
      sheet.remove();
      void this.talk(S.welcome(c.squad.filter((p) => p.key !== C.MANAGER).slice(0, 4).map((p) => p.key)).slice(2).concat([
        { who: S.NARRATOR, text: "Six clubs a division, five games a season, easiest first. Top two go up, bottom goes down. Win Division 1 for the Golden Cage." },
        { who: S.NARRATOR, text: "Lose to a club and they become your nemesis. Beat a nemesis for a REVENGE bonus." },
      ]));
    });
    const nb = sheet.querySelector("[data-new]") as HTMLButtonElement;
    nb.addEventListener("click", () => {
      if (!nb.dataset.sure) { nb.dataset.sure = "1"; nb.textContent = "Sure? Your career will be lost"; return; }
      sheet.remove();
      C.deleteCareer();
      void this.open();
    });
  }

  // ── Squad ─────────────────────────────────────────────────────────────────

  private squad(): Promise<void> {
    const c = this.c!;
    const starters = [...c.starters];
    return new Promise((done) => {
      const s = el(`
        <div class="st-pick">
          <div class="st-pick-head">
            <div class="display ttl">Squad<small>Tap to pick your starting three. The rest are subs: bring them on in a match with SUBS.</small></div>
            <button class="btn" data-done>Done</button>
          </div>
          <div class="cards"></div>
        </div>`);
      const cards = s.querySelector(".cards")!;
      const players = [...c.squad].sort((a, b) => Number(starters.includes(b.key)) - Number(starters.includes(a.key)) || ovrOf(b) - ovrOf(a));
      const nodes = players.map((p) => {
        const n = el(playerCard(p.key, p.stats, p));
        n.addEventListener("click", () => {
          this.host.click();
          const i = starters.indexOf(p.key);
          if (i >= 0) starters.splice(i, 1);
          else { starters.push(p.key); if (starters.length > 3) starters.shift(); }
          refresh();
        });
        cards.appendChild(n);
        return { p, n };
      });
      const doneBtn = s.querySelector("[data-done]") as HTMLButtonElement;
      const refresh = () => {
        for (const { p, n } of nodes) {
          const on = starters.includes(p.key);
          n.classList.toggle("on", on);
          n.querySelector(".tagline")!.textContent = on ? "STARTS" : "SUB";
        }
        doneBtn.disabled = starters.length !== 3;
        doneBtn.textContent = starters.length === 3 ? "Done" : `Pick ${3 - starters.length} more`;
      };
      refresh();
      doneBtn.addEventListener("click", () => {
        C.setStarters(c, starters);
        C.saveCareer(c);
        this.host.click();
        s.remove();
        this.hub();
        done();
      });
      this.screen.replaceChildren(s);
    });
  }

  /** Pick `n` players from `keys` (the first squad, signings). */
  private pick(keys: string[], n: number, title: string, confirm: string): Promise<string[]> {
    const c = this.c!;
    const ovr = c.phase === "draft" ? 55 : C.signingOvr(c);
    return new Promise((done) => {
      const chosen: string[] = [];
      const s = el(`
        <div class="st-pick">
          <div class="st-pick-head">
            <div class="display ttl">${esc(title)}<small>${c.phase === "draft" ? "Everyone starts on the same level; their best stats are a touch higher. Who you play is who grows." : `Players who want to join Five Guys FC. They start at about ${ovr}.`}</small></div>
            <div class="st-btns"><button class="btn ghost sm" data-back>Back</button><button class="btn" data-done></button></div>
          </div>
          <div class="cards"></div>
        </div>`);
      const cards = s.querySelector(".cards")!;
      const nodes = keys.map((k) => {
        const node = el(playerCard(k, C.freshStats(k, ovr)));
        node.addEventListener("click", () => {
          this.host.click();
          const i = chosen.indexOf(k);
          if (i >= 0) chosen.splice(i, 1);
          else { chosen.push(k); if (chosen.length > n) chosen.shift(); }
          refresh();
        });
        cards.appendChild(node);
        return { k, node };
      });
      const btn = s.querySelector("[data-done]") as HTMLButtonElement;
      const refresh = () => {
        for (const { k, node } of nodes) {
          node.classList.toggle("on", chosen.includes(k));
          node.querySelector(".tagline")!.textContent = chosen.includes(k) ? "SIGNED" : "";
        }
        btn.disabled = chosen.length !== n;
        btn.textContent = chosen.length === n ? confirm : `Pick ${n - chosen.length} more`;
      };
      refresh();
      // Leave and come back later: the career is saved, and this picks up where it was.
      s.querySelector("[data-back]")!.addEventListener("click", () => { this.host.click(); this.hide(); this.host.leave(); });
      btn.addEventListener("click", () => {
        if (chosen.length !== n) return;
        this.host.click();
        s.remove();
        done([...chosen]);
      });
      this.screen.replaceChildren(s);
    });
  }

  // ── Result ────────────────────────────────────────────────────────────────

  private result(club: C.Club, rep: C.MatchReport, settled: C.Settled, m: Match): Promise<void> {
    const c = this.c!;
    return new Promise((done) => {
      const won = rep.mine > rep.theirs, drew = rep.mine === rep.theirs;
      const scorers = (team: 0 | 1) => m.scorers.filter((x) => x.team === team).map((x) => `${esc(x.name)}${x.og ? " (OG)" : ""}`).join(", ");
      const gains = [...settled.gains].sort((a, b) => b.xp - a.xp);
      const s = el(`
        <div class="sheet"><div class="panel st-result">
          <div class="cols">
            <div class="left">
              <div class="display" style="font-size:13px;color:#a1a1aa;letter-spacing:.12em">FULL TIME · GAME ${c.round} OF ${C.SEASON_GAMES}</div>
              <h2 class="display">${won ? (settled.revenge ? "REVENGE!" : "WIN") : drew ? "DRAW" : "DEFEAT"}</h2>
              <div class="final display"><span class="h">${rep.mine}</span><span style="color:#71717a">–</span><span class="a" style="color:${club.kit.hud}">${rep.theirs}</span></div>
              <div class="vs">5IVE <span class="dim">v</span> ${esc(club.name)}</div>
              <div class="scorers"><div>${scorers(0)}</div><div>${scorers(1)}</div></div>
              <div class="news">${esc(S.headline(club, rep))}</div>
              ${rep.motm ? `<div class="motm">Man of the match: <b>${esc(C.nameOf(rep.motm))}</b></div>` : ""}
            </div>
            <div class="gains">${gains.map((g) => gainRow(c, g)).join("")}</div>
          </div>
          <div class="row"><button class="btn" data-go>Continue</button></div>
        </div></div>`);
      this.screen.replaceChildren(s);
      s.querySelector("[data-go]")!.addEventListener("click", () => { this.host.click(); s.remove(); done(); });
    });
  }

  private finalTable(): Promise<void> {
    const c = this.c!;
    const d = C.division(c.div);
    return new Promise((done) => {
      const s = el(`
        <div class="sheet"><div class="panel st-final">
          <div class="display" style="font-size:13px;color:#a1a1aa;letter-spacing:.12em">FINAL TABLE · SEASON ${c.season}</div>
          <h2 class="display">${esc(d.name)}</h2>
          ${tableHtml(c, true)}
          <div class="row"><button class="btn" data-go>Continue</button></div>
        </div></div>`);
      this.screen.replaceChildren(s);
      s.querySelector("[data-go]")!.addEventListener("click", () => { this.host.click(); s.remove(); done(); });
    });
  }

  // ── Talking ───────────────────────────────────────────────────────────────

  /** Show lines one at a time (tap to go on, Skip for the lot). */
  talk(lines: S.Say[]): Promise<void> {
    if (!lines.length) return Promise.resolve();
    return new Promise((done) => {
      const box = el(`
        <div class="st-talk">
          <button class="skip" aria-label="Skip">Skip ›</button>
          <div class="box"><div class="who"></div><div class="body"><div class="name display"></div><div class="text"></div></div><i class="more">▸</i></div>
        </div>`);
      this.root.appendChild(box);
      let i = -1;
      const next = () => {
        i++;
        if (i >= lines.length) { box.remove(); done(); return; }
        const l = lines[i];
        const sp = speaker(l.who);
        box.classList.toggle("narrator", l.who === S.NARRATOR);
        box.classList.toggle("news", l.who === S.GAZETTE);
        box.querySelector(".who")!.innerHTML = sp.av;
        box.querySelector(".name")!.textContent = sp.name;
        const t = box.querySelector(".text") as HTMLElement;
        t.textContent = l.text;
        const b = box.querySelector(".box") as HTMLElement;
        b.classList.remove("in");
        void b.offsetWidth;
        b.classList.add("in");
        // A player's line: they hop in the line-up if they're stood there.
        const st = this.stand.find((x) => x.model === this.host.models.get(l.who));
        if (st) st.hop = 0.9;
      };
      box.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".skip")) { box.remove(); done(); return; }
        this.host.click();
        next();
      });
      next();
    });
  }

  // ── Your starting three in the cage ───────────────────────────────────────

  private lineup(keys: string[], celebrate = false) {
    this.clearLineup();
    for (const m of this.host.models.values()) m.root.visible = false;
    keys.forEach((k, i) => {
      const model = this.host.models.get(k);
      if (!model) return;
      model.setKit("home");
      model.setGlow(false);
      const x = -3.3 + i * 1.25;
      model.root.visible = true;
      model.root.position.set(x, 0, 0.4);
      model.root.rotation.set(0, 0.25, 0);
      const anim = new Animator(model);
      idle(anim.target, i);
      anim.snap();
      const p = this.c?.squad.find((s) => s.key === k);
      const tag = el(`<div class="tag display home"><div class="nm">${esc(C.nameOf(k))}</div>${p ? `<span class="ovr">${ovrOf(p)}</span><span class="side">LV ${p.level}</span>` : ""}</div>`);
      this.tags.appendChild(tag);
      this.stand.push({ model, anim, x, tag, hop: celebrate ? 2.5 + i * 0.3 : 0 });
    });
  }

  private clearLineup() {
    this.stand = [];
    this.tags.replaceChildren();
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    this.viewX = 0;
    // Spread the three across whatever's left of the table (on a small phone that's not much).
    const cam = this.host.camera;
    const side = this.screen.querySelector(".st-side")?.getBoundingClientRect();
    const room = side ? (side.left / innerWidth) * 2 - 1 - 0.04 : 0.1;
    const halfW = (cam.position.z - 0.4) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
    const n = this.stand.length;
    const v = new THREE.Vector3();
    this.stand.forEach((s, i) => {
      s.x = (-0.9 + ((room + 0.9) * (i + 0.5)) / n) * halfW;
      s.model.root.position.x = s.x;
      if (s.hop > 0) { s.hop -= dt; cheer(s.anim.target, 0.9 - s.hop); } else idle(s.anim.target, this.t + i * 1.3);
      s.anim.update(dt, 10);
      v.set(s.x, -0.05, 0.75).project(this.host.camera);
      s.tag.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
      s.tag.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    });
  }
}

function tableHtml(c: C.Career, final: boolean) {
  const rows = C.sortTable(c.table);
  const up = c.div === 1 ? 1 : 2;
  return `<table class="st-table${final ? " final" : ""}">
    <thead><tr><th></th><th class="l">${esc(C.division(c.div).name)}</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>PTS</th></tr></thead>
    <tbody>${rows.map((r, i) => {
      const club = C.clubById(r.id);
      const you = r.id === C.YOU;
      const zone = i < up ? (c.div === 1 ? "gold" : "up") : i === 5 && c.div < 4 ? "down" : "";
      const nem = club && c.nemeses.includes(club.id) ? ` <b class="nem" title="Nemesis">☠</b>` : club?.rival ? ` <b class="nem" title="Rival">⚔</b>` : "";
      return `<tr class="${you ? "you" : ""} ${zone}"><td>${i + 1}</td><td class="l">${you ? "<b>Five Guys FC</b>" : esc(club?.name ?? r.id)}${nem}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf - r.ga > 0 ? "+" : ""}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`;
    }).join("")}</tbody></table>`;
}

function playerCard(key: string, stats: Stats, p?: C.SquadPlayer) {
  const r = card(key)!;
  const best = new Set([...STAT_LABELS].sort((a, b) => stats[b[0]] - stats[a[0]]).slice(0, 2).map((s) => s[0]));
  return `
    <button class="pcard">
      <div class="art" style="background-image:url('${r.card}')"></div>
      <div class="top"><span class="ovr display">${overall(stats)}</span>${p ? `<span class="lv">LV ${p.level}</span>` : ""}</div>
      <div class="tagline display"></div>
      <div class="info">
        <div class="nm display">${esc(r.name)}${key === C.MANAGER ? ` <small>GAFFER</small>` : ""}</div>
        ${p ? `<div class="xp"><i style="width:${Math.round((p.xp / C.levelXp(p.level)) * 100)}%"></i></div>` : ""}
        <div class="stats">${STAT_LABELS.map(([k, l]) => `<span class="${best.has(k) ? "hi" : ""}">${l} <b>${stats[k]}</b></span>`).join("")}</div>
        ${p ? `<div class="tally">${p.apps} apps · ${p.goals} G · ${p.assists} A</div>` : ""}
      </div>
    </button>`;
}

function gainRow(c: C.Career, g: C.Gain) {
  const p = c.squad.find((s) => s.key === g.key);
  if (!p) return "";
  return `
    <div class="gain${g.levels ? " up" : ""}">
      ${face(g.key, 30)}
      <div class="g-main">
        <div class="g-top"><b>${esc(C.nameOf(g.key))}</b><span class="xpn">+${g.xp} XP</span></div>
        <div class="xp"><i style="width:${Math.round((p.xp / C.levelXp(p.level)) * 100)}%"></i></div>
        <div class="why">${esc(g.why.join(" · "))}</div>
      </div>
      ${g.levels ? `<div class="lvup display">LEVEL UP<small>${g.from} → ${g.to}</small></div>` : `<div class="ovrn display">${g.to}</div>`}
    </div>`;
}

// ── In a match: subs ─────────────────────────────────────────────────────────

/** Someone on the pitch is running low and there's a fresher sub. */
export function needsSub(m: Match) {
  const fresh = Math.max(0, ...m.bench[0].map((p) => p.energy));
  return m.teams[0].some((p) => p.energy < 0.4 && fresh > p.energy + 0.25);
}

/**
 * Rolling subs (the match is paused while it's open): tap someone on the pitch,
 * then who comes on for them.
 */
export function subsSheet(parent: HTMLElement, m: Match, click: () => void, close: () => void) {
  const s = el(`
    <div class="layer"><div class="sheet"><div class="panel st-subs">
      <h2 class="display">Subs</h2>
      <div class="sub">Tap a tired player, then who comes on. Rested players get their legs back on the bench.</div>
      <div class="cols"><div><div class="label">On the pitch</div><div class="list" data-on></div></div><div><div class="label">Bench</div><div class="list" data-bench></div></div></div>
      <div class="row"><button class="btn" data-done>Back to the match</button></div>
    </div></div></div>`);
  parent.appendChild(s);
  let off: Player | null = null;
  const row = (p: Player, onPitch: boolean) => {
    const pct = Math.round(p.energy * 100);
    const b = el(`
      <button class="srow${onPitch && p === off ? " sel" : ""}${onPitch && m.isUser(p) ? " me" : ""}">
        ${face(p.info.key, 30)}
        <span class="sn"><b>${esc(p.name)}</b><small>OVR ${overall(p.base)}${p.goals ? ` · ${p.goals} ⚽` : ""}</small></span>
        <span class="en ${pct < 40 ? "low" : pct < 65 ? "mid" : ""}"><i style="width:${pct}%"></i></span><span class="pct">${pct}%</span>
      </button>`);
    b.addEventListener("click", () => {
      click();
      if (onPitch) off = off === p ? null : p;
      else if (off) { m.substitute(off, p); off = null; }
      else off = [...m.teams[0]].sort((a, x) => a.energy - x.energy)[0] ?? null;
      draw();
    });
    return b;
  };
  const draw = () => {
    s.querySelector("[data-on]")!.replaceChildren(...m.teams[0].map((p) => row(p, true)));
    const bench = s.querySelector("[data-bench]")!;
    bench.replaceChildren(...m.bench[0].map((p) => row(p, false)));
    if (!m.bench[0].length) bench.innerHTML = `<div class="sub">Nobody on the bench yet. Sign more players at the end of the season.</div>`;
    s.querySelector(".panel")!.classList.toggle("picking", !!off);
  };
  draw();
  s.querySelector("[data-done]")!.addEventListener("click", () => { click(); s.remove(); close(); });
  return s;
}
