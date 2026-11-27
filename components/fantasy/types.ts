import type { overview } from "@/lib/fantasy-db";

/** GET /api/fantasy as the browser receives it. */
export type FantasyOverview = Awaited<ReturnType<typeof overview>>;
export type FantasyPlayerRow = FantasyOverview["players"][number];
