// Pure, deterministic 48-team World Cup engine (2026 format).
// Same seed + same user results ⇒ identical tournament.

import seedrandom from "seedrandom";
import { WC_NATIONS } from "./teams.generated";
import type {
  Entrant, Fixture, Group, StandingRow, Stage, TournamentState, SavedSlot,
} from "./types";
import type { Formation } from "@/lib/football";

const GROUP_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
export const USER_ID = "you";

// ── RNG helpers ───────────────────────────────────────────────────────────────
function rngFor(seed: string) { return seedrandom(seed); }
function shuffle<T>(arr: T[], rng: seedrandom.PRNG): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Seeded Poisson sample (Knuth).
function poisson(lambda: number, rng: seedrandom.PRNG): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

// ── Light background-match model (overall-driven) ──────────────────────────────
export function simFixture(
  aOverall: number, bOverall: number, seed: string, knockout: boolean,
): { ag: number; bg: number; aPens: number | null; bPens: number | null; aWins: boolean } {
  const rng = rngFor(seed);
  const d = aOverall - bOverall;
  const la = Math.max(0.2, Math.min(4, 1.35 + d * 0.045));
  const lb = Math.max(0.2, Math.min(4, 1.35 - d * 0.045));
  let ag = poisson(la, rng), bg = poisson(lb, rng);
  let aPens: number | null = null, bPens: number | null = null, aWins = ag > bg;
  if (knockout && ag === bg) {
    const pa = aOverall / (aOverall + bOverall);
    aWins = rng() < pa;
    const win = 3 + Math.floor(rng() * 3);       // 3..5
    const lose = Math.max(0, win - 1 - Math.floor(rng() * 2));
    aPens = aWins ? win : lose;
    bPens = aWins ? lose : win;
  } else if (knockout) {
    aWins = ag > bg;
  }
  return { ag, bg, aPens, bPens, aWins };
}

// ── Setup / draw ───────────────────────────────────────────────────────────────
export interface CreateArgs {
  seed: string;
  difficulty: "easy" | "even" | "hard";
  userName: string;
  userOverall: number;
  userFlag: string | null;
  userLineup: SavedSlot[];
  userFormation: Formation;
}

export function createTournament(args: CreateArgs): TournamentState {
  const rng = rngFor(`${args.seed}:draw`);

  // 47 nations + the user = 48 entrants, ranked by overall → 4 pots of 12.
  const nationEntrants: Entrant[] = WC_NATIONS.map((n) => ({
    id: n.id, name: n.name, flagUrl: n.flagUrl, overall: n.squadOverall, isUser: false, pot: 0,
  }));
  const userEntrant: Entrant = {
    id: USER_ID, name: args.userName, flagUrl: args.userFlag, overall: args.userOverall, isUser: true, pot: 0,
  };
  const all = [...nationEntrants, userEntrant].sort((a, b) => b.overall - a.overall);
  all.forEach((e, i) => { e.pot = Math.floor(i / 12) + 1; });

  // Draw: one team per pot into each of the 12 groups.
  const groups: Group[] = GROUP_IDS.map((id) => ({ id, entrantIds: [] }));
  for (let pot = 1; pot <= 4; pot++) {
    const inPot = shuffle(all.filter((e) => e.pot === pot), rng);
    inPot.forEach((e, i) => groups[i].entrantIds.push(e.id));
  }

  const userGroup = groups.find((g) => g.entrantIds.includes(USER_ID))!;

  // Group fixtures: 4-team round robin over 3 matchdays.
  const fixtures: Fixture[] = [];
  const sched: [number, number][][] = [[[0, 1], [2, 3]], [[0, 2], [3, 1]], [[0, 3], [1, 2]]];
  for (const g of groups) {
    sched.forEach((md, mdi) => {
      for (const [h, a] of md) {
        const homeId = g.entrantIds[h], awayId = g.entrantIds[a];
        fixtures.push({
          id: `g${g.id}-${mdi + 1}-${homeId}-${awayId}`,
          stage: "group", round: mdi + 1, homeId, awayId,
          homeGoals: null, awayGoals: null, played: false,
          isUser: homeId === USER_ID || awayId === USER_ID,
        });
      }
    });
  }

  return {
    seed: args.seed,
    difficulty: args.difficulty,
    entrants: all,
    groups,
    fixtures,
    stage: "group",
    userId: USER_ID,
    userGroupId: userGroup.id,
    userLineup: args.userLineup,
    userFormation: args.userFormation,
    champion: null,
    userPlacement: null,
  };
}

// ── Lookups ────────────────────────────────────────────────────────────────────
export function entrant(state: TournamentState, id: string): Entrant {
  return state.entrants.find((e) => e.id === id)!;
}

export function standings(state: TournamentState, groupId: string): StandingRow[] {
  const group = state.groups.find((g) => g.id === groupId)!;
  const rows = new Map<string, StandingRow>();
  for (const id of group.entrantIds) {
    rows.set(id, { entrantId: id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, groupId });
  }
  for (const f of state.fixtures) {
    if (f.stage !== "group" || !f.played || f.homeGoals == null || f.awayGoals == null) continue;
    if (!rows.has(f.homeId) || !rows.has(f.awayId)) continue;
    const h = rows.get(f.homeId)!, a = rows.get(f.awayId)!;
    h.p++; a.p++; h.gf += f.homeGoals; h.ga += f.awayGoals; a.gf += f.awayGoals; a.ga += f.homeGoals;
    if (f.homeGoals > f.awayGoals) { h.w++; a.l++; h.pts += 3; }
    else if (f.homeGoals < f.awayGoals) { a.w++; h.l++; a.pts += 3; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  return [...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.entrantId.localeCompare(y.entrantId));
}

export function nextUserFixture(state: TournamentState): Fixture | null {
  return state.fixtures.find((f) => f.isUser && !f.played) ?? null;
}

const STAGE_LABEL: Record<Stage, string> = {
  group: "Group stage", R32: "Round of 32", R16: "Round of 16",
  QF: "Quarter-finals", SF: "Semi-finals", final: "Final", done: "Done",
};

// ── Knockout bracket helpers ────────────────────────────────────────────────────
// Classic single-elimination seed order for a power-of-two bracket.
function seedOrder(n: number): number[] {
  let order = [1, 2];
  while (order.length < n) {
    const len = order.length * 2;
    const next: number[] = [];
    for (const s of order) { next.push(s); next.push(len + 1 - s); }
    order = next;
  }
  return order;
}

const KO_NEXT: Record<string, Stage> = { R32: "R16", R16: "QF", QF: "SF", SF: "final" };

function buildBracketFromQualifiers(state: TournamentState, qualifiers: string[]) {
  // Seed 32 qualifiers by overall (strongest = seed 1) then lay out the bracket.
  const seeded = [...qualifiers].sort((a, b) => entrant(state, b).overall - entrant(state, a).overall);
  const order = seedOrder(32);
  const slots = order.map((seed) => seeded[seed - 1]);
  addRoundFixtures(state, "R32", slots);
}

function addRoundFixtures(state: TournamentState, stage: Stage, slots: string[]) {
  for (let m = 0; m < slots.length / 2; m++) {
    const homeId = slots[2 * m], awayId = slots[2 * m + 1];
    state.fixtures.push({
      id: `${stage}-${m}-${homeId}-${awayId}`,
      stage, round: m, homeId, awayId,
      homeGoals: null, awayGoals: null, homePens: null, awayPens: null,
      winnerId: null, played: false,
      isUser: homeId === USER_ID || awayId === USER_ID,
    });
  }
}

function roundFixtures(state: TournamentState, stage: Stage): Fixture[] {
  return state.fixtures.filter((f) => f.stage === stage).sort((a, b) => a.round - b.round);
}

// ── Advancement ──────────────────────────────────────────────────────────────────
// Apply the user's reported result, then sim everything else for that round and
// progress the tournament. Mutates a copy and returns it.
export function advance(
  prev: TournamentState,
  fixtureId: string,
  result: { userScore: number; cpuScore: number; userWon?: boolean; userPens?: number; cpuPens?: number },
): TournamentState {
  const state: TournamentState = structuredCloneState(prev);
  const fx = state.fixtures.find((f) => f.id === fixtureId);
  if (!fx || fx.played || !fx.isUser) return state;

  const userIsHome = fx.homeId === USER_ID;
  fx.homeGoals = userIsHome ? result.userScore : result.cpuScore;
  fx.awayGoals = userIsHome ? result.cpuScore : result.userScore;
  fx.played = true;
  if (fx.stage !== "group") {
    const userWon = result.userWon ?? result.userScore > result.cpuScore;
    fx.winnerId = userWon ? USER_ID : (userIsHome ? fx.awayId : fx.homeId);
    if (result.userPens != null) {
      fx.homePens = userIsHome ? result.userPens : (result.cpuPens ?? null);
      fx.awayPens = userIsHome ? (result.cpuPens ?? null) : result.userPens;
    }
  }

  // Sim the rest of this round (same stage + same group-matchday for groups).
  simRestOfRound(state, fx);

  // Progress stage if it just completed.
  progressStage(state);
  return state;
}

function simRestOfRound(state: TournamentState, userFx: Fixture) {
  const pending = state.fixtures.filter((f) =>
    !f.played && f.stage === userFx.stage &&
    (userFx.stage !== "group" || f.round === userFx.round));
  for (const f of pending) {
    const oa = entrant(state, f.homeId).overall, ob = entrant(state, f.awayId).overall;
    const r = simFixture(oa, ob, `${state.seed}:${f.id}`, f.stage !== "group");
    f.homeGoals = r.ag; f.awayGoals = r.bg; f.played = true;
    if (f.stage !== "group") {
      f.homePens = r.aPens; f.awayPens = r.bPens;
      f.winnerId = r.aWins ? f.homeId : f.awayId;
    }
  }
}

function progressStage(state: TournamentState) {
  if (state.stage === "group") {
    const groupsDone = state.fixtures.filter((f) => f.stage === "group").every((f) => f.played);
    if (!groupsDone) return;
    // Top 2 of each group + 8 best third-placed.
    const winners: string[] = [], runners: string[] = [];
    const thirds: StandingRow[] = [];
    for (const g of state.groups) {
      const s = standings(state, g.id);
      winners.push(s[0].entrantId); runners.push(s[1].entrantId); thirds.push(s[2]);
    }
    thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.entrantId.localeCompare(b.entrantId));
    const bestThirds = thirds.slice(0, 8).map((r) => r.entrantId);
    buildBracketFromQualifiers(state, [...winners, ...runners, ...bestThirds]);
    state.stage = "R32";
    maybeUserOut(state, "R32");
    return;
  }

  // Knockout rounds
  const stage = state.stage;
  if (stage === "done") return;
  const fixturesThisRound = roundFixtures(state, stage);
  if (fixturesThisRound.length === 0 || !fixturesThisRound.every((f) => f.played)) return;

  if (stage === "final") {
    const f = fixturesThisRound[0];
    state.champion = f.winnerId!;
    state.userPlacement = state.champion === USER_ID ? "Champions" : "Runner-up";
    state.stage = "done";
    return;
  }

  // Build next round from winners (slot order preserved).
  const winnersBySlot = fixturesThisRound.map((f) => f.winnerId!);
  const nextStage = KO_NEXT[stage];
  addRoundFixtures(state, nextStage, winnersBySlot);
  state.stage = nextStage;
  maybeUserOut(state, nextStage);
}

// If the user is no longer in the bracket, fast-forward the rest to a champion.
function maybeUserOut(state: TournamentState, stage: Stage) {
  const userStillIn = state.fixtures.some((f) => f.stage === stage && f.isUser);
  if (userStillIn) return;
  // record where they fell
  if (!state.userPlacement) {
    const lastUser = [...state.fixtures].reverse().find((f) => f.isUser && f.played);
    state.userPlacement = lastUser ? STAGE_LABEL[lastUser.stage] : "Group stage";
  }
  // sim remaining rounds with the light model until a champion is crowned
  let guard = 0;
  while (state.stage !== "done" && guard++ < 10) {
    const cur = state.stage;
    const fxs = roundFixtures(state, cur);
    for (const f of fxs) {
      if (f.played) continue;
      const oa = entrant(state, f.homeId).overall, ob = entrant(state, f.awayId).overall;
      const r = simFixture(oa, ob, `${state.seed}:${f.id}`, true);
      f.homeGoals = r.ag; f.awayGoals = r.bg; f.homePens = r.aPens; f.awayPens = r.bPens;
      f.winnerId = r.aWins ? f.homeId : f.awayId; f.played = true;
    }
    if (cur === "final") { state.champion = fxs[0].winnerId!; state.stage = "done"; break; }
    addRoundFixtures(state, KO_NEXT[cur], fxs.map((f) => f.winnerId!));
    state.stage = KO_NEXT[cur];
  }
}

// structuredClone is available in Node 18+ / modern browsers; fall back to JSON.
function structuredCloneState(s: TournamentState): TournamentState {
  return typeof structuredClone === "function"
    ? structuredClone(s)
    : (JSON.parse(JSON.stringify(s)) as TournamentState);
}

export { STAGE_LABEL };
