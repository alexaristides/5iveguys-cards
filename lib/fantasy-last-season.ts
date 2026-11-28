/**
 * Last season's fantasy (the old Fantasy 5ive game at https://www.fantasy5ive.com), shown as the
 * "Last season" section of the stats page on the website and in the app. Static: that game is over.
 * Pure TypeScript (no Prisma/Next imports): the app imports it through @shared.
 *
 * Checked 2026-11-28 and found nothing usable, so this stays null and the section is hidden:
 * - www.fantasy5ive.com is down: Vercel answers 402 DEPLOYMENT_DISABLED ("This deployment is
 *   temporarily paused").
 * - The Wayback Machine has one crawl (10–12 Jul 2025) of the home page only. Its standings load in the
 *   browser from an API the crawl didn't save, so no numbers. /leaderboard, /stats and /history were
 *   never archived. archive.today has no snapshots.
 *
 * To fill it in, copy the numbers from a real source (the old site once it's back, or its database),
 * set `source` and `checked`, and don't add anything that source doesn't show.
 */

export interface LastSeasonTeam {
  team: string;
  manager: string | null;
  points: number;
}

export interface LastSeasonBoard {
  emoji: string;
  /** e.g. "Most points", "Top scorers". */
  title: string;
  /** What the number is, e.g. "Fantasy points", "Goals". */
  detail: string;
  rows: { name: string; value: number }[];
}

export interface LastSeason {
  /** e.g. "2025/26". */
  season: string;
  /** Where the numbers came from (a URL), and when they were read (YYYY-MM-DD). */
  source: string;
  checked: string;
  /** The final table, winner first. */
  table: LastSeasonTeam[];
  /** The players' tallies: most points, goals, assists… in the order to show them. */
  boards: LastSeasonBoard[];
}

export const LAST_SEASON: LastSeason | null = null;
