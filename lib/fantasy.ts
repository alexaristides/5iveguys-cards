/**
 * Fantasy Div 1 — rules and scoring for the 5ive Guys fantasy league.
 *
 * Pure TypeScript (no Prisma/Next imports): the API routes, the admin page and the
 * iOS app (via @shared/fantasy) all use these same functions.
 *
 * Prices are stored in tenths of £1m (65 = £6.5m) so they stay integers.
 */

export type FantasyPosition = "GK" | "DEF" | "MID" | "FWD";
export const POSITIONS: FantasyPosition[] = ["GK", "DEF", "MID", "FWD"];
export const POSITION_LABEL: Record<FantasyPosition, string> = {
  GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward",
};

export type Chip = "double_points" | "triple_captain" | "bench_boost" | "wildcard";
export const CHIPS: { id: Chip; name: string; emoji: string; description: string }[] = [
  { id: "double_points", name: "Double Points", emoji: "2️⃣", description: "Every player in your team scores double this week." },
  { id: "triple_captain", name: "Triple Captain", emoji: "👑", description: "Your captain scores triple instead of double." },
  { id: "bench_boost", name: "Bench Boost", emoji: "🪑", description: "Your subs' points count too." },
  { id: "wildcard", name: "Wildcard", emoji: "🃏", description: "Unlimited free transfers this week." },
];
export const CHIP_IDS = CHIPS.map((c) => c.id);

export const FANTASY_RULES = {
  squadSize: 9,
  starters: 7,
  /** Each season starts with this budget unless the admin sets another. */
  defaultBudget: 600,
  maxFreeTransfers: 2,
  /** Points deducted per transfer beyond the free ones. */
  transferCost: 4,
  /** Starting 7: exactly one keeper and at least this many of each outfield role. */
  starterMin: { GK: 1, DEF: 2, MID: 1, FWD: 1 } as Record<FantasyPosition, number>,
  starterMaxGk: 1,
  squadMaxGk: 2,
};

/** Points per event. Clean sheets only score for keepers and defenders. */
export const FANTASY_POINTS = {
  played: 1,
  goal: 5,
  assist: 3,
  motm: 3,
  cleanSheet: 10,
  penaltySave: 5,
  hatTrick: 3,
  yellowCard: -1,
  redCard: -3,
  ownGoal: -5,
  penaltyMiss: -2,
};

export interface PlayerStats {
  played: boolean;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  yellowCards: number;
  redCard: boolean;
  ownGoals: number;
  penaltySaves: number;
  penaltyMisses: number;
  motm: boolean;
  /** Admin's discretionary bonus (can be negative). */
  bonus: number;
}

export const EMPTY_STATS: PlayerStats = {
  played: false, goals: 0, assists: 0, cleanSheet: false, yellowCards: 0, redCard: false,
  ownGoals: 0, penaltySaves: 0, penaltyMisses: 0, motm: false, bonus: 0,
};

/** Line-by-line points for one player in one gameweek (empty if they didn't play). */
export function pointsBreakdown(stats: PlayerStats | undefined, position: FantasyPosition) {
  const lines: { label: string; points: number }[] = [];
  if (!stats?.played) return lines;
  const P = FANTASY_POINTS;
  const add = (label: string, points: number) => { if (points) lines.push({ label, points }); };
  add("Appearance", P.played);
  add(plural(stats.goals, "Goal"), stats.goals * P.goal);
  if (stats.goals >= 3) add("Hat-trick", P.hatTrick);
  add(plural(stats.assists, "Assist"), stats.assists * P.assist);
  if (stats.cleanSheet && (position === "GK" || position === "DEF")) add("Clean sheet", P.cleanSheet);
  add(plural(stats.penaltySaves, "Penalty save"), stats.penaltySaves * P.penaltySave);
  if (stats.motm) add("Man of the Match", P.motm);
  add(plural(stats.yellowCards, "Yellow card"), stats.yellowCards * P.yellowCard);
  if (stats.redCard) add("Red card", P.redCard);
  add(plural(stats.ownGoals, "Own goal"), stats.ownGoals * P.ownGoal);
  add(plural(stats.penaltyMisses, "Penalty miss"), stats.penaltyMisses * P.penaltyMiss);
  add("Bonus", stats.bonus);
  return lines;
}

export function playerPoints(stats: PlayerStats | undefined, position: FantasyPosition) {
  return pointsBreakdown(stats, position).reduce((sum, l) => sum + l.points, 0);
}

function plural(n: number, word: string) {
  return n === 1 ? word : `${n} ${word}s`;
}

// ── Squad rules ───────────────────────────────────────────────────────────────

export interface SquadPlayer {
  id: string;
  position: FantasyPosition;
  price: number;
  isActive: boolean;
}

/** A squad slot: the player and what was paid for them (their sale value). */
export interface Pick {
  playerId: string;
  price: number;
}

function counts(positions: FantasyPosition[]) {
  const c: Record<FantasyPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of positions) c[p]++;
  return c;
}

/** Whether 7 positions make a legal starting line-up. */
export function isValidStartingSeven(positions: FantasyPosition[]) {
  if (positions.length !== FANTASY_RULES.starters) return false;
  const c = counts(positions);
  return c.GK === FANTASY_RULES.starterMin.GK && c.GK <= FANTASY_RULES.starterMaxGk &&
    c.DEF >= FANTASY_RULES.starterMin.DEF && c.MID >= FANTASY_RULES.starterMin.MID && c.FWD >= FANTASY_RULES.starterMin.FWD;
}

/**
 * Picks for a squad: players kept from the locked squad keep the price paid for them,
 * new signings cost their current price.
 */
export function priceSquad(playerIds: string[], players: Map<string, SquadPlayer>, baseline: Pick[] | null): Pick[] {
  const paid = new Map((baseline ?? []).map((p) => [p.playerId, p.price]));
  return playerIds.map((id) => ({ playerId: id, price: paid.get(id) ?? players.get(id)?.price ?? 0 }));
}

export function squadCost(picks: Pick[]) {
  return picks.reduce((sum, p) => sum + p.price, 0);
}

/** Players in the new squad who weren't in the locked one. */
export function transfersBetween(playerIds: string[], baseline: Pick[] | null) {
  if (!baseline) return 0;
  const before = new Set(baseline.map((p) => p.playerId));
  return playerIds.filter((id) => !before.has(id)).length;
}

export interface EntryInput {
  /** 7 starters then the subs in bench order. */
  playerIds: string[];
  captainId: string;
  viceCaptainId: string;
  chip: Chip | null;
}

/** Why an entry can't be saved, or null if it's legal. */
export function entryError(
  entry: EntryInput,
  players: Map<string, SquadPlayer>,
  opts: { budget: number; baseline: Pick[] | null; usedChips: Chip[] },
): string | null {
  const { playerIds, captainId, viceCaptainId, chip } = entry;
  if (playerIds.length !== FANTASY_RULES.squadSize) return `Pick ${FANTASY_RULES.squadSize} players (7 starters and 2 subs).`;
  if (new Set(playerIds).size !== playerIds.length) return "You can't pick the same player twice.";

  const kept = new Set((opts.baseline ?? []).map((p) => p.playerId));
  for (const id of playerIds) {
    const p = players.get(id);
    if (!p) return "That player isn't in the squad.";
    if (!p.isActive && !kept.has(id)) return "That player has left the squad.";
  }

  const positions = playerIds.map((id) => players.get(id)!.position);
  if (!isValidStartingSeven(positions.slice(0, FANTASY_RULES.starters))) {
    return "Your starting 7 needs 1 goalkeeper, at least 2 defenders, 1 midfielder and 1 forward.";
  }
  if (counts(positions).GK > FANTASY_RULES.squadMaxGk) return "You can have at most 2 goalkeepers.";

  const starters = playerIds.slice(0, FANTASY_RULES.starters);
  if (!starters.includes(captainId)) return "Your captain must be in your starting 7.";
  if (!starters.includes(viceCaptainId)) return "Your vice-captain must be in your starting 7.";
  if (captainId === viceCaptainId) return "Pick a different vice-captain.";

  if (chip) {
    if (!CHIP_IDS.includes(chip)) return "Unknown chip.";
    if (opts.usedChips.includes(chip)) return "You've already used that chip this season.";
    if (chip === "wildcard" && !opts.baseline) return "Your first team is free to pick — save the Wildcard for later.";
  }

  if (squadCost(priceSquad(playerIds, players, opts.baseline)) > opts.budget) {
    return `That team is over your ${formatPrice(opts.budget)} budget.`;
  }
  return null;
}

// ── Transfers ─────────────────────────────────────────────────────────────────

/**
 * Free transfers for the next gameweek, replaying the team's locked gameweeks in order.
 * Returns null while the team has never been locked (picking the first squad is free).
 *
 * `locked` = every locked gameweek number before the one being edited; `entries` = the
 * team's entries by gameweek number (gameweeks without one carried the team over).
 */
export function freeTransfersFor(locked: number[], entries: Map<number, { transfersMade: number; chip: Chip | null }>) {
  let free: number | null = null;
  for (const gw of [...locked].sort((a, b) => a - b)) {
    const e = entries.get(gw);
    if (free === null) {
      if (e) free = 1; // first squad locked: one free transfer next week
      continue;
    }
    const used = e?.chip === "wildcard" ? 0 : Math.min(e?.transfersMade ?? 0, free);
    free = Math.min(FANTASY_RULES.maxFreeTransfers, free - used + 1);
  }
  return free;
}

/** Points deducted for this many transfers. */
export function transferCostFor(made: number, free: number | null, chip: Chip | null) {
  if (free === null || chip === "wildcard") return 0;
  return Math.max(0, made - free) * FANTASY_RULES.transferCost;
}

// ── Scoring a gameweek ────────────────────────────────────────────────────────

export interface ScoredPlayer {
  playerId: string;
  points: number;
  /** 0 = didn't count (bench / didn't play), 1, 2 (captain) or 3 (triple captain). */
  multiplier: number;
  isStarter: boolean;
  subbedIn?: boolean;
  subbedOut?: boolean;
}

export interface EntryScore {
  /** After chips and transfer cost. */
  total: number;
  players: ScoredPlayer[];
  /** Who wore the armband: the captain, or the vice if the captain didn't play. */
  captainId: string | null;
  autoSubs: { out: string; in: string }[];
  transferCost: number;
}

/**
 * Score an entry: auto-subs (bench in order, only if the line-up stays legal), captain
 * double (vice if the captain didn't play), chips, then the transfer cost.
 */
export function scoreEntry(
  entry: { playerIds: string[]; captainId: string; viceCaptainId: string; chip: Chip | null; transferCost: number },
  positions: Map<string, FantasyPosition>,
  stats: Map<string, PlayerStats>,
): EntryScore {
  const played = (id: string) => !!stats.get(id)?.played;
  const pos = (id: string) => positions.get(id) ?? "MID";
  const starters = entry.playerIds.slice(0, FANTASY_RULES.starters);
  const bench = entry.playerIds.slice(FANTASY_RULES.starters);

  let counted: string[];
  const autoSubs: { out: string; in: string }[] = [];
  if (entry.chip === "bench_boost") {
    counted = [...entry.playerIds];
  } else {
    const xi = [...starters];
    for (const sub of bench) {
      if (!played(sub)) continue;
      for (let i = 0; i < xi.length; i++) {
        const out = xi[i];
        if (played(out)) continue;
        const trial = xi.map((id, j) => (j === i ? sub : id));
        if (!isValidStartingSeven(trial.map(pos))) continue;
        xi[i] = sub;
        autoSubs.push({ out, in: sub });
        break;
      }
    }
    counted = xi;
  }

  const countedSet = new Set(counted);
  const captainId =
    played(entry.captainId) && countedSet.has(entry.captainId) ? entry.captainId
      : played(entry.viceCaptainId) && countedSet.has(entry.viceCaptainId) ? entry.viceCaptainId
        : null;
  const captainMultiplier = entry.chip === "triple_captain" ? 3 : 2;

  const players: ScoredPlayer[] = entry.playerIds.map((id, i) => {
    const multiplier = !countedSet.has(id) ? 0 : id === captainId ? captainMultiplier : 1;
    return {
      playerId: id,
      points: playerPoints(stats.get(id), pos(id)),
      multiplier,
      isStarter: i < FANTASY_RULES.starters,
      ...(autoSubs.some((s) => s.in === id) ? { subbedIn: true } : {}),
      ...(autoSubs.some((s) => s.out === id) ? { subbedOut: true } : {}),
    };
  });

  const playerTotal = players.reduce((sum, p) => sum + p.points * p.multiplier, 0);
  const total = playerTotal * (entry.chip === "double_points" ? 2 : 1) - entry.transferCost;
  return { total, players, captainId, autoSubs, transferCost: entry.transferCost };
}

// ── Gameweeks ─────────────────────────────────────────────────────────────────

export type GameweekStatus = "upcoming" | "live" | "finished";

/** upcoming = teams still editable; live = locked, waiting for results; finished = scored. */
export function gameweekStatus(gw: { deadline: Date | string; finalizedAt: Date | string | null }, now = Date.now()): GameweekStatus {
  if (gw.finalizedAt) return "finished";
  return new Date(gw.deadline).getTime() > now ? "upcoming" : "live";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatPrice(tenths: number) {
  return `£${(tenths / 10).toFixed(1)}m`;
}

/** Card positions (LW, CAM…) → fantasy roles. */
export function toFantasyPosition(cardPosition: string | null | undefined): FantasyPosition {
  switch (cardPosition) {
    case "GK": return "GK";
    case "DEF": return "DEF";
    case "CDM": case "CM": case "CAM": return "MID";
    default: return "FWD";
  }
}

/**
 * Starting prices from the fans' card ratings, by rank so a few generous votes can't push
 * everyone to the top: best rated £10.0m down to £4.5m in £0.5m steps. Unrated players start at £5.0m.
 */
export function suggestPrices(players: { id: string; overall: number | null }[]) {
  const MAX = 100, MIN = 45, UNRATED = 50;
  const rated = players.filter((p) => p.overall !== null).sort((a, b) => b.overall! - a.overall!);
  const prices = new Map(players.map((p) => [p.id, UNRATED]));
  rated.forEach((p, i) => {
    const t = rated.length > 1 ? i / (rated.length - 1) : 0;
    prices.set(p.id, Math.round((MAX - t * (MAX - MIN)) / 5) * 5);
  });
  return prices;
}
