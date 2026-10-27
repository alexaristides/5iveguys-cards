/**
 * Story mode: Oscar, player-manager of Five Guys FC, takes them from Division 4 of
 * the Cage League to the Golden Cage. Pure rules and data (no DOM, no three.js):
 * the clubs, the season (five games, each harder than the last), the league table,
 * XP and levels, nemeses, and the save in localStorage. Screens are in `ui.ts`,
 * the words in `script.ts`.
 */
import { hashString, rng } from "../math";
import { CELEBRATIONS, overall, ROSTER, type HairStyle, type Look, type RosterPlayer, type Stats } from "../roster";
import type { Difficulty } from "../game/match";

export type DivId = 4 | 3 | 2 | 1;
type Style = "pace" | "power" | "skill" | "balanced";

export interface ClubKit { shirt: string; pattern: string; trim: string; text: string; shorts: string; socks: string; hud: string }

export interface Club {
  id: string;
  name: string;
  /** On the scoreboard and across their shirts. */
  short: string;
  /** Overall of their starters. */
  str: number;
  style: Style;
  kit: ClubKit;
  captain: string;
  /** Said before you play them (the rival's captain says it). */
  blurb: string;
  /** The division's rival (your last game of the season). */
  rival?: boolean;
}

export interface Division {
  id: DivId;
  name: string;
  /** Where it's played. */
  place: string;
  /** Five clubs, easiest first: you play them in this order. */
  clubs: Club[];
}

const kit = (shirt: string, trim: string, shorts: string, socks = shorts, text = trim): ClubKit =>
  ({ shirt, pattern: shade(shirt, -0.12), trim, text, shorts, socks, hud: trim === "#ffffff" ? shirt : trim });

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(Math.min(255, Math.max(0, c + 255 * k))).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

export const DIVISIONS: Division[] = [
  {
    id: 4, name: "Division 4", place: "The Car Park",
    clubs: [
      { id: "casuals", name: "Canal Street Casuals", short: "CANAL", str: 47, style: "balanced", kit: kit("#3b82f6", "#ffffff", "#1e3a8a"), captain: "Gaz",
        blurb: "Canal Street Casuals turn up in jeans. One of them is still eating a sausage roll." },
      { id: "buses", name: "Bus Garage Ballers", short: "BUSES", str: 50, style: "power", kit: kit("#f97316", "#111111", "#111111"), captain: "Nicky",
        blurb: "Bus Garage Ballers work nights. They look like they haven't slept since Thursday." },
      { id: "rovers", name: "Kebab Van Rovers", short: "ROVERS", str: 53, style: "skill", kit: kit("#16a34a", "#fde047", "#14532d"), captain: "Stavros",
        blurb: "Kebab Van Rovers. Sponsored by the kebab van, paid in chips. Don't let them near the chilli sauce." },
      { id: "nomads", name: "Northside Nomads", short: "NOMADS", str: 56, style: "pace", kit: kit("#0ea5e9", "#ffffff", "#ffffff", "#0ea5e9"), captain: "Deji",
        blurb: "Northside Nomads haven't had a home ground in six years. They take it out on everyone." },
      { id: "wolves", name: "Grime Street Wolves", short: "WOLVES", str: 60, style: "power", kit: kit("#b91c1c", "#111111", "#111111"), captain: "Big Tel", rival: true,
        blurb: "Five Guys? Sounds like a burger joint. We eat burger joints." },
    ],
  },
  {
    id: 3, name: "Division 3", place: "The Arches",
    clubs: [
      { id: "suds", name: "Laundrette Legends", short: "SUDS", str: 57, style: "balanced", kit: kit("#f5f5f4", "#2563eb", "#2563eb", "#f5f5f4"), captain: "Mo",
        blurb: "Laundrette Legends: kits washed at ninety degrees every week since 2009. They're very proud of it." },
      { id: "dynamos", name: "Chicken Shop Dynamos", short: "DYNAMO", str: 60, style: "pace", kit: kit("#facc15", "#dc2626", "#dc2626"), captain: "Junior",
        blurb: "Chicken Shop Dynamos warm up with wings. Hot ones." },
      { id: "titans", name: "Tower Block Titans", short: "TITANS", str: 63, style: "power", kit: kit("#334155", "#fb923c", "#1e293b"), captain: "Kwame",
        blurb: "Tower Block Titans: every one of them is six foot four. Even the sub." },
      { id: "skaters", name: "Southbank Skaters", short: "SKATE", str: 66, style: "skill", kit: kit("#14b8a6", "#111111", "#111111"), captain: "Rico",
        blurb: "Southbank Skaters do kickflips at half-time. Rumour is they're quick." },
      { id: "kings", name: "Concrete Kings", short: "KINGS", str: 70, style: "power", kit: kit("#a8a29e", "#eab308", "#1c1917", "#1c1917"), captain: "Dutch", rival: true,
        blurb: "Nice little run, Oscar. It stops under the Arches. Nobody gets past the Kings." },
    ],
  },
  {
    id: 2, name: "Division 2", place: "The Rooftop",
    clubs: [
      { id: "rangers", name: "Rooftop Rangers", short: "ROOF", str: 64, style: "balanced", kit: kit("#0891b2", "#ffffff", "#164e63"), captain: "Callum",
        blurb: "Rooftop Rangers. Lose a ball up here and it's gone forever. They've lost forty." },
      { id: "neon", name: "Neon Nights FC", short: "NEON", str: 67, style: "pace", kit: kit("#84cc16", "#111111", "#111111"), captain: "Kai",
        blurb: "Neon Nights FC only play after dark, and their kit glows. It's a lot." },
      { id: "dragons", name: "Docklands Dragons", short: "DRAGON", str: 70, style: "power", kit: kit("#ea580c", "#111111", "#111111", "#ea580c"), captain: "Femi",
        blurb: "Docklands Dragons. Their captain breathes actual fire. Allegedly." },
      { id: "united", name: "Underpass United", short: "UNITED", str: 73, style: "skill", kit: kit("#1e3a8a", "#facc15", "#1e3a8a"), captain: "Reece",
        blurb: "Underpass United: graffiti on their shirts, cement in their tackles." },
      { id: "vipers", name: "Viper Academy", short: "VIPERS", str: 77, style: "pace", kit: kit("#22c55e", "#052e16", "#052e16"), captain: "Silas", rival: true,
        blurb: "We've trained since we were six. You lot have trained since… Tuesday?" },
    ],
  },
  {
    id: 1, name: "Division 1", place: "The Golden Cage",
    clubs: [
      { id: "mavericks", name: "Midnight Mavericks", short: "MAVS", str: 72, style: "balanced", kit: kit("#1f2937", "#22d3ee", "#111827"), captain: "Andre",
        blurb: "Midnight Mavericks: runners-up last season. They haven't smiled since." },
      { id: "skyline", name: "Skyline Strikers", short: "SKY", str: 75, style: "skill", kit: kit("#38bdf8", "#ffffff", "#ffffff", "#38bdf8"), captain: "Leon",
        blurb: "Skyline Strikers. Their number nine has a clothing line and three million followers." },
      { id: "goldies", name: "Golden Boot Boys", short: "GOLDEN", str: 78, style: "pace", kit: kit("#fbbf24", "#111111", "#111111"), captain: "Goldie",
        blurb: "Golden Boot Boys: gold boots, gold chains, gold teeth. Their captain is called Goldie. Obviously." },
      { id: "inferno", name: "Inferno FC", short: "FIRE", str: 81, style: "power", kit: kit("#dc2626", "#fb923c", "#7f1d1d"), captain: "Nico",
        blurb: "Inferno FC won the Golden Cage two years ago. They want it back more than anyone. Except you." },
      { id: "royals", name: "Hollins Royals", short: "ROYALS", str: 85, style: "balanced", kit: kit("#1d4ed8", "#fbbf24", "#ffffff", "#1d4ed8"), captain: "Harrison", rival: true,
        blurb: "My Royals haven't lost in the Golden Cage for three years, Oscar. Today won't be any different." },
    ],
  },
];

export const ROYALS = "royals";
/** You, in the table. */
export const YOU = "you";
/** Oscar: player-manager, always in the squad and never for sale. */
export const MANAGER = "oscar";
export const SEASON_GAMES = 5;
/** Starting players' overall, and their first signings. */
const START_OVR = 55;
/** Four to start with, plus Oscar. */
export const FIRST_PICKS = 4;
/** Players who ask to join after each season, and how many of them you can sign. */
const OFFERS = 3;
export const SIGNINGS = 2;
/** The Royals take one of your best at the end of this season. */
const STEAL_SEASON = 2;

export const division = (id: DivId) => DIVISIONS.find((d) => d.id === id)!;
export const clubById = (id: string) => DIVISIONS.flatMap((d) => d.clubs).find((c) => c.id === id);

// ── Save ─────────────────────────────────────────────────────────────────────

export interface SquadPlayer {
  key: string;
  stats: Stats;
  xp: number;
  level: number;
  apps: number;
  goals: number;
  assists: number;
  tackles: number;
  motm: number;
  /** Season they joined. */
  joined: number;
}

export interface Row { id: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }

export interface Played { round: number; club: string; mine: number; theirs: number }

/** Something to tell the player when they next look at the hub (see `script.ts`). */
export type News =
  | { kind: "welcome"; picks: string[] }
  | { kind: "division"; div: DivId; season: number; back: boolean }
  | { kind: "season"; div: DivId; pos: number; outcome: Outcome; next: DivId }
  | { kind: "stolen"; key: string }
  | { kind: "signed"; keys: string[] }
  | { kind: "home"; key: string }
  | { kind: "champions"; season: number };

export type Outcome = "champions" | "promoted" | "stayed" | "relegated" | "title" | "runnersUp";

export type Phase = "intro" | "draft" | "season" | "window";

export interface Career {
  v: 1;
  phase: Phase;
  div: DivId;
  /** Seasons started (1 = the first). */
  season: number;
  /** Games played this season (SEASON_GAMES = season over). */
  round: number;
  squad: SquadPlayer[];
  /** Keys of the three who start. */
  starters: string[];
  table: Row[];
  results: Played[];
  /** Nemeses: clubs who've beaten you and haven't been beaten back yet. */
  nemeses: string[];
  /** Your player in the Royals' squad, until you beat them. */
  stolen: SquadPlayer | null;
  stealDone: boolean;
  /** Players asking to sign (the window after a season). */
  offers: string[];
  /** Golden Cages won. */
  titles: number;
  history: { season: number; div: DivId; pos: number; pts: number }[];
  news: News[];
}

const SAVE_KEY = "street.story.v1";

export function loadCareer(): Career | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const c = raw ? (JSON.parse(raw) as Career) : null;
    return c && c.v === 1 && Array.isArray(c.squad) ? c : null;
  } catch {
    return null;
  }
}

export function saveCareer(c: Career) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(c)); } catch { /* storage unavailable: this session only */ }
}

export function deleteCareer() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
}

// ── Players ──────────────────────────────────────────────────────────────────

const STAT_KEYS: (keyof Stats)[] = ["pace", "shooting", "passing", "dribbling", "defending", "physical"];
const card = (key: string) => ROSTER.find((p) => p.key === key)!;

/**
 * Everyone starts level: the same overall, with a hint of who they are on their card
 * (a defender a few points better at defending, a winger a bit quicker…).
 */
export function freshStats(key: string, ovr: number): Stats {
  const s = card(key).stats;
  const avg = overall(s);
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = Math.round(Math.min(99, Math.max(40, ovr + (s[k] - avg) * 0.25)));
  return out;
}

function newSquadPlayer(key: string, ovr: number, season: number): SquadPlayer {
  return { key, stats: freshStats(key, ovr), xp: 0, level: 1, apps: 0, goals: 0, assists: 0, tackles: 0, motm: 0, joined: season };
}

/** Their two best stats on their real card: where their levels go. */
function focus(key: string): (keyof Stats)[] {
  const s = card(key).stats;
  return [...STAT_KEYS].sort((a, b) => s[b] - s[a]).slice(0, 2);
}

export const ovrOf = (p: { stats: Stats }) => overall(p.stats);

/** For the match: the card player (looks, celebration) with their story stats. */
export function asRoster(p: SquadPlayer): RosterPlayer {
  return { ...card(p.key), stats: { ...p.stats } };
}

export function nameOf(key: string) {
  return card(key)?.name ?? key;
}

// ── A new career ─────────────────────────────────────────────────────────────

export function newCareer(): Career {
  return {
    v: 1, phase: "intro", div: 4, season: 1, round: 0,
    squad: [newSquadPlayer(MANAGER, START_OVR, 1)], starters: [MANAGER],
    table: freshTable(4), results: [],
    nemeses: [],
    stolen: null, stealDone: false, offers: [], titles: 0, history: [], news: [],
  };
}

/** Everyone you can pick from at the start (the squad bar Oscar). */
export function draftPool(): string[] {
  return ROSTER.map((p) => p.key).filter((k) => k !== MANAGER);
}

export function draft(c: Career, keys: string[]) {
  for (const k of keys.slice(0, FIRST_PICKS)) c.squad.push(newSquadPlayer(k, START_OVR, 1));
  c.starters = [MANAGER, ...keys.slice(0, 2)];
  c.phase = "season";
  c.news.push({ kind: "welcome", picks: keys.slice(0, FIRST_PICKS) });
  c.news.push({ kind: "division", div: 4, season: 1, back: false });
}

export function setStarters(c: Career, keys: string[]) {
  const owned = new Set(c.squad.map((p) => p.key));
  const picked = keys.filter((k) => owned.has(k));
  if (picked.length === 3) c.starters = picked;
}

/** Keep three starters, filling gaps with the best of the rest. */
function fixStarters(c: Career) {
  const owned = new Set(c.squad.map((p) => p.key));
  c.starters = c.starters.filter((k) => owned.has(k));
  for (const p of [...c.squad].sort((a, b) => ovrOf(b) - ovrOf(a))) {
    if (c.starters.length >= 3) break;
    if (!c.starters.includes(p.key)) c.starters.push(p.key);
  }
}

// ── Fixtures and the table ───────────────────────────────────────────────────

function freshTable(div: DivId): Row[] {
  return [YOU, ...division(div).clubs.map((c) => c.id)].map((id) => ({ id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
}

export function sortTable(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || (a.id === YOU ? -1 : b.id === YOU ? 1 : 0));
}

export const position = (c: Career) => sortTable(c.table).findIndex((r) => r.id === YOU) + 1;

/** This round's opponent. */
export function nextClub(c: Career): Club | null {
  return c.round < SEASON_GAMES ? division(c.div).clubs[c.round] : null;
}

/**
 * The other two games each round, so every club plays every other once over the
 * five rounds while you take them on easiest first (a round-robin of six, with
 * you meeting club r in round r).
 */
export function otherFixtures(round: number): [number, number][] {
  const m = (i: number) => (((round + i) % 5) + 5) % 5;
  return [[m(1), m(4)], [m(2), m(3)]];
}

function poisson(lambda: number, r: () => number) {
  const l = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > l);
  return k - 1;
}

/** A street 3v3 score between two clubs of these strengths (the 3-minute game averages about 8 goals). */
function simScore(a: number, b: number, r: () => number): [number, number] {
  const la = Math.min(7, Math.max(0.7, 4 + (a - b) * 0.18));
  const lb = Math.min(7, Math.max(0.7, 4 + (b - a) * 0.18));
  return [poisson(la, r), poisson(lb, r)];
}

function record(rows: Row[], id: string, gf: number, ga: number) {
  const r = rows.find((x) => x.id === id);
  if (!r) return;
  r.p++; r.gf += gf; r.ga += ga;
  if (gf > ga) { r.w++; r.pts += 3; } else if (gf === ga) { r.d++; r.pts += 1; } else r.l++;
}

// ── Opponents ────────────────────────────────────────────────────────────────

const NAMES = [
  "Dazza", "Kofi", "Smudge", "Tommo", "Ash", "Jaden", "Bilal", "Yusuf", "Danny", "Kai", "Femi", "Callum", "Ty", "Leon", "Mo",
  "Nico", "Zak", "Andre", "Jamal", "Ollie", "Sami", "Rocco", "Dev", "Marlon", "Tunde", "Elijah", "Kieran", "Rhys", "Arlo", "Luca",
  "Benji", "Ibby", "Conor", "Tariq", "Sonny", "Jaylen", "Archie", "Ezra", "Malik", "Finn", "Rafa", "Hamza", "Joel", "Kenzo", "Dre",
];
const SKINS = ["#f1c7a5", "#e2b391", "#d39d78", "#b9805a", "#9c6646", "#7a4b32", "#5b3826", "#4a2c1c"];
const HAIR = ["#141010", "#2a1b12", "#3b2416", "#6b3f22", "#8a6a3a", "#c9a46b", "#1d1410"];
const STYLES: HairStyle[] = ["curlyMop", "curlyTop", "shortCurly", "messy", "locs", "quiff", "longCurly", "afro", "twists"];
const BOOTS = ["#ff3d9a", "#ff7a1a", "#f4f4f5", "#b8ff3a", "#18181b", "#2f7bff", "#f5c518", "#22c55e", "#14b8a6", "#dc2626", "#38bdf8"];

const STYLE_TILT: Record<Style, Partial<Stats>> = {
  pace: { pace: 6, dribbling: 2, physical: -4, defending: -2 },
  power: { physical: 6, defending: 3, pace: -3, dribbling: -3 },
  skill: { dribbling: 6, passing: 3, physical: -4, defending: -3 },
  balanced: {},
};
/** Each club's line-up: a captain, two more starters (one who defends), and a sub or two. */
const ROLES: { lift: number; tilt: Partial<Stats> }[] = [
  { lift: 3, tilt: { shooting: 4, dribbling: 2, defending: -4 } },
  { lift: 0, tilt: { passing: 3, pace: 2 } },
  { lift: -1, tilt: { defending: 7, physical: 3, shooting: -7, dribbling: -3 } },
  { lift: -3, tilt: {} },
  { lift: -4, tilt: { pace: 4, defending: -2 } },
];

export interface ClubSquad { club: Club; starters: RosterPlayer[]; bench: RosterPlayer[] }

/** A club's players for the match: made up from their name (the same every time), plus your old player at the Royals. */
export function clubSquad(club: Club, stolen: SquadPlayer | null): ClubSquad {
  const r = rng(hashString(club.id));
  const pool = [...NAMES];
  const used = new Set([club.captain]);
  const size = club.id === ROYALS ? 5 : 4;
  const players: RosterPlayer[] = [];
  for (let i = 0; i < size; i++) {
    let name = club.captain;
    if (i > 0) {
      do name = pool[Math.floor(r() * pool.length)]; while (used.has(name));
      used.add(name);
    }
    const role = ROLES[i];
    const stats = {} as Stats;
    for (const k of STAT_KEYS) {
      const v = club.str + role.lift + (role.tilt[k] ?? 0) + (STYLE_TILT[club.style][k] ?? 0) + Math.round((r() - 0.5) * 8);
      stats[k] = Math.min(99, Math.max(40, Math.round(v)));
    }
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const look: Look = {
      skin: pick(SKINS), hair: pick(HAIR), hairStyle: pick(STYLES), hairSize: 0.7 + r() * 0.5,
      beard: pick(["none", "none", "stubble", "goatee", "full"] as const),
      height: 1.72 + r() * 0.2, build: 0.92 + r() * 0.2, boots: pick(BOOTS), smile: r() < 0.4,
      earrings: r() < 0.25,
      face: { x: 0.5, y: 0.3, chin: 0.53 },
    };
    players.push({ key: `${club.id}:${i}`, name, card: "", look, stats, celebration: pick(CELEBRATIONS) });
  }
  const starters = players.slice(0, 3), bench = players.slice(3);
  if (club.id === ROYALS && stolen) {
    // Your old player starts for them, and their third man drops to the bench.
    bench.unshift(starters.splice(2, 1, asRoster(stolen))[0]);
  }
  return { club, starters, bench };
}

/**
 * How the CPU plays this fixture: from about Amateur in your first game in
 * Division 4 to Legend in the last game of Division 1, a step harder every game.
 */
export function fixtureDifficulty(div: DivId, round: number): Difficulty {
  const t = Math.min(1, Math.max(0, ((4 - div) * SEASON_GAMES + round) / (4 * SEASON_GAMES - 1)));
  const l = (a: number, b: number) => a + (b - a) * t;
  return { id: "story", label: "Story", react: l(0.5, 0.16), speed: l(0.9, 1.03), steal: l(0.6, 1.2), aim: l(1.5, 0.85), flair: l(0.4, 1.2) };
}

/** Stars out of five for how hard a club is (for the fixture card). */
export function stars(club: Club) {
  return Math.max(1, Math.min(5, Math.round((club.str - 44) / 8.5)));
}

// ── After a match ────────────────────────────────────────────────────────────

/** What one of your players did in a match. */
export interface Line { key: string; secs: number; goals: number; assists: number; tackles: number }

export interface MatchReport {
  club: string;
  mine: number;
  theirs: number;
  lines: Line[];
  /** Man of the match, if they're one of yours. */
  motm: string | null;
}

export interface Gain {
  key: string;
  xp: number;
  /** Why (e.g. "2 goals", "win"). */
  why: string[];
  levels: number;
  /** Overall before and after. */
  from: number;
  to: number;
}

export interface Settled {
  gains: Gain[];
  /** Beat a nemesis. */
  revenge: boolean;
  /** Beat the division's rival. */
  derby: boolean;
  /** Lost to a club who didn't have one before: they do now. */
  newNemesis: boolean;
  /** Your old player comes home (you beat the Royals). */
  home: string | null;
  /** The rest of the round. */
  others: { a: string; b: string; ga: number; gb: number }[];
}

export const XP = { played: 15, goal: 25, assist: 15, tackle: 4, win: 25, draw: 10, cleanSheet: 20, motm: 25, revenge: 20, training: 6 };
/** XP from one level to the next: a bit more each time, so stars grow but don't run away. */
export const levelXp = (level: number) => 100 + 15 * (level - 1);
/** Seconds on the pitch to count as having played. */
const PLAYED_SECS = 20;

/** Level up: +1 to everything and +2 more to the two things they're best at. */
function levelUp(p: SquadPlayer) {
  const f = focus(p.key);
  for (const k of STAT_KEYS) p.stats[k] = Math.min(99, p.stats[k] + 1 + (f.includes(k) ? 2 : 0));
  p.level++;
}

/** Put a finished match into the career: XP and levels, the table, grudges, the steal coming home. */
export function settleMatch(c: Career, rep: MatchReport, seed = Date.now()): Settled {
  const club = clubById(rep.club)!;
  const won = rep.mine > rep.theirs, drew = rep.mine === rep.theirs;
  const grudge = c.nemeses.includes(club.id);
  const revenge = won && grudge;
  const derby = won && !!club.rival;
  const gains: Gain[] = [];
  for (const p of c.squad) {
    const line = rep.lines.find((l) => l.key === p.key);
    const played = !!line && line.secs >= PLAYED_SECS;
    const why: string[] = [];
    let xp = 0;
    const add = (n: number, w: string) => { if (n > 0) { xp += n; why.push(w); } };
    if (played) {
      p.apps++;
      add(XP.played, "played");
      add(XP.goal * line!.goals, line!.goals > 1 ? `${line!.goals} goals` : "goal");
      add(XP.assist * line!.assists, line!.assists > 1 ? `${line!.assists} assists` : "assist");
      add(XP.tackle * Math.min(5, line!.tackles), line!.tackles > 1 ? `${line!.tackles} tackles` : "tackle");
      add(won ? XP.win : drew ? XP.draw : 0, won ? "win" : "draw");
      add(rep.theirs === 0 ? XP.cleanSheet : 0, "clean sheet");
      add(rep.motm === p.key ? XP.motm : 0, "man of the match");
      add(revenge ? XP.revenge : derby ? XP.revenge : 0, revenge ? "revenge" : "beat the rival");
      p.goals += line!.goals;
      p.assists += line!.assists;
      p.tackles += line!.tackles;
      if (rep.motm === p.key) p.motm++;
    } else add(XP.training, "training");
    const from = ovrOf(p);
    p.xp += xp;
    let levels = 0;
    while (p.xp >= levelXp(p.level)) { p.xp -= levelXp(p.level); levelUp(p); levels++; }
    gains.push({ key: p.key, xp, why, levels, from, to: ovrOf(p) });
  }

  // The table: your game, then the other two.
  const r = rng(seed >>> 0);
  record(c.table, YOU, rep.mine, rep.theirs);
  record(c.table, club.id, rep.theirs, rep.mine);
  const clubs = division(c.div).clubs;
  const others = otherFixtures(c.round).map(([i, j]) => {
    const [ga, gb] = simScore(clubs[i].str, clubs[j].str, r);
    record(c.table, clubs[i].id, ga, gb);
    record(c.table, clubs[j].id, gb, ga);
    return { a: clubs[i].id, b: clubs[j].id, ga, gb };
  });
  c.results.push({ round: c.round, club: club.id, mine: rep.mine, theirs: rep.theirs });
  c.round++;

  // Lose to someone and they've got one over you until you beat them.
  const newNemesis = !won && !drew && !grudge;
  if (newNemesis) c.nemeses.push(club.id);
  if (revenge) c.nemeses = c.nemeses.filter((id) => id !== club.id);

  // Beat the Royals with your old player in their side: he wants to come home.
  let home: string | null = null;
  if (won && club.id === ROYALS && c.stolen) {
    home = c.stolen.key;
    c.squad.push(c.stolen);
    c.stolen = null;
    c.news.push({ kind: "home", key: home });
  }
  return { gains, revenge, derby, newNemesis, home, others };
}

// ── End of the season ────────────────────────────────────────────────────────

export interface SeasonEnd {
  pos: number;
  outcome: Outcome;
  from: DivId;
  to: DivId;
  /** Who the Royals took. */
  stolen: string | null;
}

export function seasonOver(c: Career) {
  return c.phase === "season" && c.round >= SEASON_GAMES;
}

/**
 * Top two go up (you have to win Division 1 for the Golden Cage), bottom goes
 * down. At the end of the second season the Royals take one of your best three.
 * Then a few players ask to join.
 */
export function endSeason(c: Career, seed = Date.now()): SeasonEnd {
  const pos = position(c);
  const from = c.div;
  let outcome: Outcome;
  if (from === 1) outcome = pos === 1 ? "title" : pos === 2 ? "runnersUp" : pos === 6 ? "relegated" : "stayed";
  else outcome = pos === 1 ? "champions" : pos === 2 ? "promoted" : pos === 6 && from < 4 ? "relegated" : "stayed";
  const to = (outcome === "champions" || outcome === "promoted" ? from - 1 : outcome === "relegated" ? from + 1 : from) as DivId;
  const pts = c.table.find((r) => r.id === YOU)!.pts;
  c.history.push({ season: c.season, div: from, pos, pts });
  if (outcome === "title") c.titles++;
  c.news.push({ kind: "season", div: from, pos, outcome, next: to });
  if (outcome === "title") c.news.push({ kind: "champions", season: c.season });

  const r = rng(seed >>> 0);
  let stolen: string | null = null;
  if (!c.stealDone && c.season >= STEAL_SEASON) {
    const best = c.squad.filter((p) => p.key !== MANAGER).sort((a, b) => ovrOf(b) - ovrOf(a)).slice(0, 3);
    if (best.length) {
      const p = best[Math.floor(r() * best.length)];
      c.squad = c.squad.filter((x) => x !== p);
      c.stolen = p;
      c.stealDone = true;
      stolen = p.key;
      c.news.push({ kind: "stolen", key: p.key });
      fixStarters(c);
    }
  }

  // Who's left to sign: a few of them ask.
  const taken = new Set([...c.squad.map((p) => p.key), ...(c.stolen ? [c.stolen.key] : [])]);
  const free = ROSTER.map((p) => p.key).filter((k) => !taken.has(k));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  c.offers = free.slice(0, OFFERS);
  c.div = to;
  c.phase = c.offers.length ? "window" : "season";
  if (!c.offers.length) startSeason(c);
  return { pos, outcome, from, to, stolen };
}

/** New signings join at about the squad's level, a little behind the regulars. */
export function signingOvr(c: Career) {
  const avg = c.squad.reduce((a, p) => a + ovrOf(p), 0) / Math.max(1, c.squad.length);
  return Math.max(START_OVR, Math.round(avg - 3));
}

export function sign(c: Career, keys: string[]) {
  const ovr = signingOvr(c);
  const picked = keys.filter((k) => c.offers.includes(k)).slice(0, SIGNINGS);
  for (const k of picked) c.squad.push(newSquadPlayer(k, ovr, c.season + 1));
  c.offers = [];
  if (picked.length) c.news.push({ kind: "signed", keys: picked });
  startSeason(c);
}

function startSeason(c: Career) {
  const prev = c.history[c.history.length - 1];
  c.season++;
  c.round = 0;
  c.results = [];
  c.table = freshTable(c.div);
  c.phase = "season";
  // Grudges from a division you've left are forgotten.
  const here = new Set(division(c.div).clubs.map((cl) => cl.id));
  c.nemeses = c.nemeses.filter((id) => here.has(id));
  fixStarters(c);
  c.news.push({ kind: "division", div: c.div, season: c.season, back: !!prev && prev.div === c.div });
}
