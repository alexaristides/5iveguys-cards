/**
 * Fantasy Div 1 — the season's stats: who's most picked, transferred in and out, and who leads on
 * points, goals, assists… The tallies come from GET /api/fantasy/stats (lib/fantasy-db.ts); the
 * boards and their ranking live here so the website and the iOS app show the same lists.
 * Pure TypeScript (no Prisma/Next imports): the app imports it through @shared.
 */
import type { Chip, FantasyPosition } from "./fantasy";

/** One player's season so far. */
export interface StatsPlayer {
  id: string;
  name: string;
  position: FantasyPosition;
  imageUrl: string | null;
  isActive: boolean;
  // From scored gameweeks.
  points: number;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  saves: number;
  bonus: number;
  yellowCards: number;
  redCards: number;
  /** Videos where the fans voted them Man of the Match (joint top counts). */
  motmWins: number;
  // From every team's current team (the gameweek being picked, or the last one).
  /** Share of teams with them, 0–100. */
  selectedBy: number;
  /** Share of teams with them as captain, 0–100. */
  captainedBy: number;
  // Season so far, the open gameweek's changes included.
  transfersIn: number;
  transfersOut: number;
}

/** GET /api/fantasy/stats */
export interface FantasyStats {
  season: { name: string } | null;
  /** Points, goals and the rest count up to this gameweek (the latest scored one). */
  scoredThrough: number | null;
  teamCount: number;
  /** Player changes made this season (Free Hit weeks left out: those teams go back afterwards). */
  transfers: number;
  /** Chips played in gameweeks that have kicked off. */
  chips: Partial<Record<Chip, number>>;
  /** The best single-gameweek scores. */
  bestWeeks: { team: string; manager: string | null; gameweek: number; points: number }[];
  players: StatsPlayer[];
}

/** The page's sections, in order. */
export const STAT_GROUPS = [
  { id: "picks", title: "Fans' picks" },
  { id: "points", title: "Points" },
  { id: "pitch", title: "On the pitch" },
] as const;
export type StatGroup = (typeof STAT_GROUPS)[number]["id"];

export interface StatBoard {
  id: string;
  group: StatGroup;
  emoji: string;
  title: string;
  /** What the number means, under the title. */
  detail: string;
  value: (p: StatsPlayer) => number;
  /** How the number is shown in a row. */
  format?: (n: number) => string;
  /** Fewest first (default: most first). */
  ascending?: boolean;
  /** Players on 0 aren't listed (a board with nobody on it isn't shown). */
  skipZero?: boolean;
  /** Only players who've played a scored gameweek. */
  playedOnly?: boolean;
}

const percent = (n: number) => `${n}%`;

export const STAT_BOARDS: StatBoard[] = [
  { id: "picked", group: "picks", emoji: "👥", title: "Most picked", detail: "Share of teams with them", value: (p) => p.selectedBy, format: percent, skipZero: true },
  { id: "in", group: "picks", emoji: "📈", title: "Most transferred in", detail: "Times brought in this season", value: (p) => p.transfersIn, skipZero: true },
  { id: "out", group: "picks", emoji: "📉", title: "Most transferred out", detail: "Times sold this season", value: (p) => p.transfersOut, skipZero: true },
  { id: "captain", group: "picks", emoji: "©️", title: "Most captained", detail: "Share of teams with them as captain", value: (p) => p.captainedBy, format: percent, skipZero: true },
  { id: "points", group: "points", emoji: "⭐", title: "Most points", detail: "Fantasy points this season", value: (p) => p.points, playedOnly: true },
  { id: "fewest", group: "points", emoji: "🥶", title: "Fewest points", detail: "Fantasy points, of those who've played", value: (p) => p.points, ascending: true, playedOnly: true },
  { id: "bonus", group: "points", emoji: "✨", title: "Most bonus points", detail: "Bonus for the best players in each match", value: (p) => p.bonus, skipZero: true },
  { id: "goals", group: "pitch", emoji: "⚽", title: "Top scorers", detail: "Goals", value: (p) => p.goals, skipZero: true },
  { id: "assists", group: "pitch", emoji: "🎯", title: "Most assists", detail: "Assists", value: (p) => p.assists, skipZero: true },
  { id: "clean", group: "pitch", emoji: "🧤", title: "Clean sheets", detail: "Over half the game, nothing conceded while on", value: (p) => p.cleanSheets, skipZero: true },
  { id: "motm", group: "pitch", emoji: "🏅", title: "Man of the Match", detail: "Fan votes won on our match videos", value: (p) => p.motmWins, skipZero: true },
  { id: "saves", group: "pitch", emoji: "🧱", title: "Most saves", detail: "Saves", value: (p) => p.saves, skipZero: true },
  { id: "cards", group: "pitch", emoji: "🟨", title: "Most cards", detail: "Yellow and red cards", value: (p) => p.yellowCards + p.redCards, skipZero: true },
];

export interface BoardRow {
  player: StatsPlayer;
  value: number;
  /** 1 + how many are ahead: tied players share a rank. */
  rank: number;
}

/**
 * The top `limit` players on a board. Players who've left the squad are left out. Ties go to fewer
 * appearances on a "most" board (same total in fewer games) and more appearances on a "fewest" board
 * (played and still scored least), then by name; tied players share a rank.
 */
export function boardRows(players: StatsPlayer[], board: StatBoard, limit = 5): BoardRow[] {
  const dir = board.ascending ? 1 : -1;
  const sorted = players
    .filter((p) => p.isActive && (!board.skipZero || board.value(p) !== 0) && (!board.playedOnly || p.appearances > 0))
    .map((player) => ({ player, value: board.value(player) }))
    .sort((a, b) =>
      dir * (a.value - b.value) ||
      -dir * (a.player.appearances - b.player.appearances) ||
      a.player.name.localeCompare(b.player.name),
    );
  const rows: BoardRow[] = [];
  for (const [i, row] of sorted.slice(0, limit).entries()) {
    rows.push({ ...row, rank: i > 0 && row.value === rows[i - 1].value ? rows[i - 1].rank : i + 1 });
  }
  return rows;
}

/** The boards that have someone on them, with their rows. */
export function statBoards(players: StatsPlayer[], limit = 5) {
  return STAT_BOARDS.map((board) => ({ board, rows: boardRows(players, board, limit) })).filter((b) => b.rows.length > 0);
}

export const formatStat = (board: StatBoard, n: number) => (board.format ?? String)(n);

/** A column of the all-players table on the stats page (website and app). */
export interface TableColumn {
  id: string;
  /** Header in the table. */
  short: string;
  title: string;
  value: (p: StatsPlayer) => number;
}

export const TABLE_COLUMNS: TableColumn[] = [
  { id: "appearances", short: "Pl", title: "Played", value: (p) => p.appearances },
  { id: "goals", short: "G", title: "Goals", value: (p) => p.goals },
  { id: "assists", short: "A", title: "Assists", value: (p) => p.assists },
  { id: "cleanSheets", short: "CS", title: "Clean sheets", value: (p) => p.cleanSheets },
  { id: "points", short: "Pts", title: "Points", value: (p) => p.points },
];

/** Every player still in the squad, most first on a column (then most points, then by name). */
export function playerTable(players: StatsPlayer[], sortBy = "points") {
  const column = TABLE_COLUMNS.find((c) => c.id === sortBy) ?? TABLE_COLUMNS[TABLE_COLUMNS.length - 1];
  return players
    .filter((p) => p.isActive)
    .sort((a, b) => column.value(b) - column.value(a) || b.points - a.points || a.name.localeCompare(b.name));
}

/** The leaders My Team shows (website and app), in order. */
export const HIGHLIGHT_BOARDS = ["picked", "points", "goals", "in"];

/** Each highlight board's leader, and how many more share first place. Boards nobody is on are left out. */
export function statHighlights(players: StatsPlayer[]) {
  return HIGHLIGHT_BOARDS.flatMap((id) => {
    const board = STAT_BOARDS.find((b) => b.id === id);
    const rows = board ? boardRows(players, board, players.length) : [];
    return board && rows.length ? [{ board, ...rows[0], tied: rows.filter((r) => r.rank === 1).length - 1 }] : [];
  });
}
