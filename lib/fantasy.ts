/**
 * Fantasy Div 1 — rules and scoring for the 5ive Guys fantasy league.
 *
 * Fantasy Premier League's rules, scaled to 7-a-side: you pick 7 players (no bench), and
 * scoring, captaincy, transfers, prices and chips work the way they do in FPL (2025/26).
 * Bench Boost has no bench to boost, so Double Points takes its slot.
 *
 * Pure TypeScript (no Prisma/Next imports): the API routes, the admin page, the website and
 * the iOS app (via @shared/fantasy) all use these same functions.
 *
 * Prices are stored in tenths of £1m (65 = £6.5m) so they stay integers.
 */

export type FantasyPosition = "GK" | "DEF" | "MID" | "FWD";
export const POSITIONS: FantasyPosition[] = ["GK", "DEF", "MID", "FWD"];
export const POSITION_LABEL: Record<FantasyPosition, string> = {
  GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward",
};

export type Chip = "wildcard" | "free_hit" | "triple_captain" | "double_points";
export const CHIPS: { id: Chip; name: string; emoji: string; description: string }[] = [
  { id: "wildcard", name: "Wildcard", emoji: "🃏", description: "Unlimited free transfers this gameweek. Your new team stays." },
  { id: "free_hit", name: "Free Hit", emoji: "🔁", description: "Unlimited free transfers for one gameweek. Your team goes back to how it was the week after." },
  { id: "triple_captain", name: "Triple Captain", emoji: "👑", description: "Your captain scores triple instead of double." },
  { id: "double_points", name: "Double Points", emoji: "2️⃣", description: "Every player in your team scores double this gameweek." },
];
export const CHIP_IDS = CHIPS.map((c) => c.id);
export const isChip = (v: unknown): v is Chip => typeof v === "string" && (CHIP_IDS as string[]).includes(v);
/** Chips that make every transfer free. */
const FREE_TRANSFER_CHIPS: Chip[] = ["wildcard", "free_hit"];

export const FANTASY_RULES = {
  squadSize: 7,
  /** Each season starts with this budget (£50.0m) unless the admin sets another. */
  defaultBudget: 500,
  /** Free transfers gained each gameweek, and how many can be saved up. */
  freeTransfersPerWeek: 1,
  maxFreeTransfers: 5,
  /** Points deducted per transfer beyond the free ones. */
  transferCost: 4,
  /** Exactly one keeper; outfield players within these limits (2-4 DEF, 1-3 MID, 1-3 FWD). */
  min: { GK: 1, DEF: 2, MID: 1, FWD: 1 } as Record<FantasyPosition, number>,
  max: { GK: 1, DEF: 4, MID: 3, FWD: 3 } as Record<FantasyPosition, number>,
  /** Prices move by at most this much a gameweek, and never below the floor. */
  maxPriceChange: 3,
  minPrice: 35,
};

/** FPL 2025/26 points per event. */
export const FANTASY_POINTS = {
  /** Playing, and playing most of the match (FPL's 60 minutes). */
  appearance: 1,
  appearanceLong: 2,
  goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 } as Record<FantasyPosition, number>,
  assist: 3,
  /** Only if they played most of the match and nobody scored past them. */
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 } as Record<FantasyPosition, number>,
  /** +1 for every 3 saves. */
  savesPerPoint: 3,
  penaltySave: 5,
  /** -1 for every 2 goals conceded (keepers and defenders). */
  goalsConcededPerPoint: 2,
  /** +2 for this many tackles, blocks, interceptions and clearances (plus recoveries for MID/FWD). */
  defensiveContribution: 2,
  defensiveThreshold: { GK: 0, DEF: 10, MID: 12, FWD: 12 } as Record<FantasyPosition, number>,
  penaltyMiss: -2,
  yellowCard: -1,
  redCard: -3,
  ownGoal: -2,
  /** Bonus for the three best performers by BPS. */
  bonus: [3, 2, 1],
};

export interface PlayerStats {
  played: boolean;
  /** Played most of the match (FPL: 60 minutes or more). */
  playedMost: boolean;
  goals: number;
  assists: number;
  /** Goals the team conceded while they were on the pitch. */
  goalsConceded: number;
  saves: number;
  penaltySaves: number;
  penaltyMisses: number;
  yellowCards: number;
  redCard: boolean;
  ownGoals: number;
  defensiveContributions: number;
  /** 0-3, from the gameweek's BPS (see awardBonus). */
  bonus: number;
}

export const EMPTY_STATS: PlayerStats = {
  played: false, playedMost: false, goals: 0, assists: 0, goalsConceded: 0, saves: 0, penaltySaves: 0,
  penaltyMisses: 0, yellowCards: 0, redCard: false, ownGoals: 0, defensiveContributions: 0, bonus: 0,
};

const defends = (position: FantasyPosition) => position === "GK" || position === "DEF";

export function keptCleanSheet(stats: PlayerStats) {
  return stats.played && stats.playedMost && stats.goalsConceded === 0;
}

/** Line-by-line points for one player in one gameweek (empty if they didn't play). */
export function pointsBreakdown(stats: PlayerStats | undefined, position: FantasyPosition) {
  const lines: { label: string; points: number }[] = [];
  if (!stats?.played) return lines;
  const P = FANTASY_POINTS;
  const add = (label: string, points: number) => { if (points) lines.push({ label, points }); };
  add(stats.playedMost ? "Played most of the match" : "Played", stats.playedMost ? P.appearanceLong : P.appearance);
  add(plural(stats.goals, "Goal"), stats.goals * P.goal[position]);
  add(plural(stats.assists, "Assist"), stats.assists * P.assist);
  if (keptCleanSheet(stats)) add("Clean sheet", P.cleanSheet[position]);
  add(`${stats.saves} saves`, Math.floor(stats.saves / P.savesPerPoint));
  add(plural(stats.penaltySaves, "Penalty save"), stats.penaltySaves * P.penaltySave);
  if (defends(position)) add(`${stats.goalsConceded} goals conceded`, -Math.floor(stats.goalsConceded / P.goalsConcededPerPoint));
  const threshold = P.defensiveThreshold[position];
  if (threshold && stats.defensiveContributions >= threshold) add("Defensive contributions", P.defensiveContribution);
  add(plural(stats.yellowCards, "Yellow card"), stats.yellowCards * P.yellowCard);
  if (stats.redCard) add("Red card", P.redCard);
  add(plural(stats.ownGoals, "Own goal"), stats.ownGoals * P.ownGoal);
  add(plural(stats.penaltyMisses, "Penalty miss", "Penalty misses"), stats.penaltyMisses * P.penaltyMiss);
  add("Bonus", stats.bonus);
  return lines;
}

export function playerPoints(stats: PlayerStats | undefined, position: FantasyPosition) {
  return pointsBreakdown(stats, position).reduce((sum, l) => sum + l.points, 0);
}

function plural(n: number, word: string, many = `${word}s`) {
  return n === 1 ? word : `${n} ${many}`;
}

// ── Bonus points ──────────────────────────────────────────────────────────────

/** FPL's Bonus Points System, from the stats we record. */
export function bpsScore(s: PlayerStats, position: FantasyPosition) {
  if (!s.played) return 0;
  let bps = s.playedMost ? 6 : 3;
  bps += s.goals * (position === "FWD" ? 24 : position === "MID" ? 18 : 12);
  bps += s.assists * 9;
  if (defends(position) && keptCleanSheet(s)) bps += 12;
  if (defends(position)) bps -= s.goalsConceded * 4;
  bps += s.saves * 2 + s.penaltySaves * 15;
  bps += Math.floor(s.defensiveContributions / 2);
  bps -= s.penaltyMisses * 6 + s.yellowCards * 3 + (s.redCard ? 9 : 0) + s.ownGoals * 6;
  return bps;
}

/**
 * Bonus for one gameweek: 3, 2 and 1 to the top three by BPS, with FPL's ties (two tied
 * first both get 3 and the next gets 1, and so on). Only players who did more than turn up
 * qualify, so a gameweek without stats yet hands out nothing.
 */
export function awardBonus(players: { id: string; position: FantasyPosition; stats: PlayerStats }[]) {
  const scored = players
    .filter((p) => p.stats.played)
    .map((p) => ({ id: p.id, bps: bpsScore(p.stats, p.position), base: p.stats.playedMost ? 6 : 3 }))
    .filter((p) => p.bps > p.base)
    .sort((a, b) => b.bps - a.bps);
  const bonus = new Map<string, number>();
  let place = 0;
  for (let i = 0; i < scored.length && place < FANTASY_POINTS.bonus.length;) {
    const tied = scored.filter((p) => p.bps === scored[i].bps);
    for (const p of tied) bonus.set(p.id, FANTASY_POINTS.bonus[place]);
    place += tied.length;
    i += tied.length;
  }
  return bonus;
}

// ── Squad rules ───────────────────────────────────────────────────────────────

export interface SquadPlayer {
  id: string;
  position: FantasyPosition;
  price: number;
  isActive: boolean;
}

/** A squad slot: the player and what was paid for them. */
export interface Pick {
  playerId: string;
  price: number;
}

/** The locked team transfers are made from: who's in it and the money in the bank. */
export interface Squad {
  picks: Pick[];
  bank: number;
}

export function positionCounts(positions: FantasyPosition[]) {
  const c: Record<FantasyPosition, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of positions) c[p]++;
  return c;
}

/** Whether 7 positions make a legal team: 1 keeper, 2-4 defenders, 1-3 midfielders, 1-3 forwards. */
export function isValidTeam(positions: FantasyPosition[]) {
  if (positions.length !== FANTASY_RULES.squadSize) return false;
  const c = positionCounts(positions);
  return POSITIONS.every((p) => c[p] >= FANTASY_RULES.min[p] && c[p] <= FANTASY_RULES.max[p]);
}

/** What a player sells for: FPL keeps half of any rise (rounded down), and all of any fall. */
export function sellingPrice(paid: number, current: number) {
  return current > paid ? paid + Math.floor((current - paid) / 2) : current;
}

/**
 * Buy a team. Without a locked squad it's the first pick: everyone at today's price out of the
 * budget. Otherwise players kept keep their purchase price, players sold add their selling price
 * to the bank and new signings cost today's price (or what this gameweek's saved draft already
 * paid for them).
 */
export function buySquad(
  playerIds: string[],
  players: Map<string, { price: number }>,
  opts: { budget: number; from: Squad | null; draft?: Pick[] | null },
): Squad {
  const now = (id: string) => players.get(id)?.price ?? 0;
  if (!opts.from) {
    const picks = playerIds.map((id) => ({ playerId: id, price: now(id) }));
    return { picks, bank: opts.budget - squadCost(picks) };
  }
  const owned = new Map(opts.from.picks.map((p) => [p.playerId, p.price]));
  const drafted = new Map((opts.draft ?? []).map((p) => [p.playerId, p.price]));
  let bank = opts.from.bank;
  for (const [id, paid] of owned) if (!playerIds.includes(id)) bank += sellingPrice(paid, now(id));
  const picks = playerIds.map((id) => {
    const price = owned.get(id) ?? drafted.get(id) ?? now(id);
    if (!owned.has(id)) bank -= price;
    return { playerId: id, price };
  });
  return { picks, bank };
}

export function squadCost(picks: Pick[]) {
  return picks.reduce((sum, p) => sum + p.price, 0);
}

/** Bank + what the players would sell for today. */
export function teamValue(squad: Squad, players: Map<string, { price: number }>) {
  return squad.bank + squad.picks.reduce((sum, p) => sum + sellingPrice(p.price, players.get(p.playerId)?.price ?? p.price), 0);
}

/** Players in the new team who weren't in the locked one. */
export function transfersBetween(playerIds: string[], from: Squad | null) {
  if (!from) return 0;
  const before = new Set(from.picks.map((p) => p.playerId));
  return playerIds.filter((id) => !before.has(id)).length;
}

export interface EntryInput {
  playerIds: string[];
  captainId: string;
  viceCaptainId: string;
  chip: Chip | null;
}

/** Why an entry can't be saved, or null if it's legal. */
export function entryError(
  entry: EntryInput,
  players: Map<string, SquadPlayer>,
  opts: { budget: number; from: Squad | null; draft?: Pick[] | null; availableChips: Chip[] },
): string | null {
  const { playerIds, captainId, viceCaptainId, chip } = entry;
  if (playerIds.length !== FANTASY_RULES.squadSize) return `Pick ${FANTASY_RULES.squadSize} players.`;
  if (new Set(playerIds).size !== playerIds.length) return "You can't pick the same player twice.";

  const kept = new Set((opts.from?.picks ?? []).map((p) => p.playerId));
  for (const id of playerIds) {
    const p = players.get(id);
    if (!p) return "That player isn't in the squad.";
    if (!p.isActive && !kept.has(id)) return "That player has left the squad.";
  }

  if (!isValidTeam(playerIds.map((id) => players.get(id)!.position))) {
    return "Your 7 needs 1 goalkeeper, 2-4 defenders, 1-3 midfielders and 1-3 forwards.";
  }
  if (!playerIds.includes(captainId)) return "Pick a captain from your team.";
  if (!playerIds.includes(viceCaptainId)) return "Pick a vice-captain from your team.";
  if (captainId === viceCaptainId) return "Pick a different vice-captain.";

  if (chip) {
    if (!isChip(chip)) return "Unknown chip.";
    if (FREE_TRANSFER_CHIPS.includes(chip) && !opts.from) return "Your first team is free to pick — save that chip for later.";
    if (!opts.availableChips.includes(chip)) return "You've already played that chip.";
  }

  const { bank } = buySquad(playerIds, players, opts);
  if (bank < 0) return `That team is ${formatPrice(-bank)} over budget.`;
  return null;
}

// ── Transfers and chips ───────────────────────────────────────────────────────

/** One locked gameweek in a team's history, oldest first. */
export interface LockedWeek {
  /** Whether the team existed (had an entry) that gameweek. */
  hasEntry: boolean;
  transfersMade: number;
  chip: Chip | null;
}

/**
 * Free transfers for the next gameweek, replaying the team's locked gameweeks in order.
 * Returns null while the team has never been locked (picking the first team is free).
 * One a week, saved up to 5; Wildcard and Free Hit weeks don't use any.
 */
export function freeTransfersFor(history: LockedWeek[]) {
  let free: number | null = null;
  for (const week of history) {
    if (free === null) {
      if (week.hasEntry) free = FANTASY_RULES.freeTransfersPerWeek;
      continue;
    }
    const used = week.chip && FREE_TRANSFER_CHIPS.includes(week.chip) ? 0 : Math.min(week.transfersMade, free);
    free = Math.min(FANTASY_RULES.maxFreeTransfers, free - used + FANTASY_RULES.freeTransfersPerWeek);
  }
  return free;
}

/** Points deducted for this many transfers. */
export function transferCostFor(made: number, free: number | null, chip: Chip | null) {
  if (free === null || (chip && FREE_TRANSFER_CHIPS.includes(chip))) return 0;
  return Math.max(0, made - free) * FANTASY_RULES.transferCost;
}

/** 1 or 2: chips come back for the second half of the season (from `secondHalfFrom`), as in FPL. */
export function seasonHalf(gameweek: number, secondHalfFrom: number | null) {
  return secondHalfFrom && gameweek >= secondHalfFrom ? 2 : 1;
}

/** Chips that can still be played in `gameweek`: each one once per half. */
export function availableChips(gameweek: number, played: { chip: Chip; gameweek: number }[], secondHalfFrom: number | null) {
  const half = seasonHalf(gameweek, secondHalfFrom);
  const used = new Set(played.filter((p) => p.gameweek !== gameweek && seasonHalf(p.gameweek, secondHalfFrom) === half).map((p) => p.chip));
  return CHIP_IDS.filter((c) => !used.has(c));
}

// ── Scoring a gameweek ────────────────────────────────────────────────────────

export interface ScoredPlayer {
  playerId: string;
  points: number;
  /** 0 = didn't play, 1, 2 (captain) or 3 (triple captain). */
  multiplier: number;
}

export interface EntryScore {
  /** After chips and transfer cost. */
  total: number;
  players: ScoredPlayer[];
  /** Who wore the armband: the captain, or the vice if the captain didn't play. */
  captainId: string | null;
  transferCost: number;
}

/** Score an entry: captain double (the vice's if the captain didn't play), chips, then the transfer cost. */
export function scoreEntry(
  entry: { playerIds: string[]; captainId: string; viceCaptainId: string; chip: Chip | null; transferCost: number },
  positions: Map<string, FantasyPosition>,
  stats: Map<string, PlayerStats>,
): EntryScore {
  const played = (id: string) => !!stats.get(id)?.played;
  // Teams saved under the old 7 + 2 subs rules count their first 7.
  const team = entry.playerIds.slice(0, FANTASY_RULES.squadSize);
  const captainId = played(entry.captainId) && team.includes(entry.captainId) ? entry.captainId
    : played(entry.viceCaptainId) && team.includes(entry.viceCaptainId) ? entry.viceCaptainId
      : null;
  const captainMultiplier = entry.chip === "triple_captain" ? 3 : 2;

  const players: ScoredPlayer[] = team.map((id) => ({
    playerId: id,
    points: playerPoints(stats.get(id), positions.get(id) ?? "MID"),
    multiplier: !played(id) ? 0 : id === captainId ? captainMultiplier : 1,
  }));
  const playerTotal = players.reduce((sum, p) => sum + p.points * p.multiplier, 0);
  const total = playerTotal * (entry.chip === "double_points" ? 2 : 1) - entry.transferCost;
  return { total, players, captainId, transferCost: entry.transferCost };
}

// ── Prices ────────────────────────────────────────────────────────────────────

/**
 * Price moves after a gameweek from its net transfers, FPL style: every `step` net transfers in
 * (5% of teams, at least 2) adds £0.1m, every `step` out takes £0.1m off, at most £0.3m either way.
 */
export function priceChanges(netTransfers: Map<string, number>, teamCount: number, prices: Map<string, number>) {
  const step = Math.max(2, Math.ceil(teamCount * 0.05));
  const changes = new Map<string, number>();
  for (const [id, net] of netTransfers) {
    const steps = Math.min(FANTASY_RULES.maxPriceChange, Math.floor(Math.abs(net) / step)) * Math.sign(net);
    const price = prices.get(id);
    if (!steps || price === undefined) continue;
    const next = Math.max(FANTASY_RULES.minPrice, price + steps);
    if (next !== price) changes.set(id, next - price);
  }
  return changes;
}

// ── Gameweeks ─────────────────────────────────────────────────────────────────

export type GameweekStatus = "upcoming" | "live" | "finished";

/** upcoming = teams still editable; live = locked, waiting for results; finished = scored. */
export function gameweekStatus(gw: { deadline: Date | string; finalizedAt: Date | string | null }, now = Date.now()): GameweekStatus {
  if (gw.finalizedAt) return "finished";
  return new Date(gw.deadline).getTime() > now ? "upcoming" : "live";
}

/** Player availability, FPL's codes. */
export type PlayerStatus = "a" | "d" | "i" | "s" | "u";
export const PLAYER_STATUS: Record<PlayerStatus, { label: string; color: string }> = {
  a: { label: "Available", color: "#22c55e" },
  d: { label: "Doubtful", color: "#f59e0b" },
  i: { label: "Injured", color: "#ef4444" },
  s: { label: "Suspended", color: "#ef4444" },
  u: { label: "Unavailable", color: "#ef4444" },
};
export const isPlayerStatus = (v: unknown): v is PlayerStatus => typeof v === "string" && v in PLAYER_STATUS;

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatPrice(tenths: number) {
  return `£${(tenths / 10).toFixed(1)}m`;
}

/** "2d 4h", "3h 12m", "45m" until a deadline, or "Locked". */
export function formatCountdown(ms: number) {
  if (ms <= 0) return "Locked";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** e.g. "Sun 1 Nov, 14:00" in the viewer's time zone. */
export function formatDeadline(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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

/** Six-letter league codes, without look-alike characters. */
export function makeLeagueCode(random: () => number = Math.random) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(random() * chars.length)]).join("");
}
