/**
 * Fantasy Div 1 — database side: a fan's team for the next gameweek, saving it, scoring a
 * gameweek (bonus, price changes, ranks), leagues and history. Rules live in lib/fantasy.ts.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  availableChips, awardBonus, buySquad, entryError, entryPositions, FANTASY_RULES, freeTransfersFor, gameweekStatus, isChip, keptCleanSheet,
  makeLeagueCode, playerPoints, priceChanges, scoreEntry, squadCost, teamValue, transferCostFor, transfersBetween, bpsScore,
  type EntryInput, type FantasyPosition, type LockedWeek, type Pick, type PlayerStats, type PlayerStatus,
  type Squad, type SquadPlayer,
} from "@/lib/fantasy";
import type { FantasyStats } from "@/lib/fantasy-stats";

export class FantasyError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function activeSeason() {
  return prisma.fantasySeason.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
}

type Gameweek = { id: string; number: number; name: string | null; deadline: Date; finalizedAt: Date | null };
type EntryRow = {
  gameweekId: string; picks: Prisma.JsonValue; captainId: string; viceCaptainId: string; chip: string | null;
  transfersMade: number; transferCost: number; bank: number | null; points: number | null;
};

/** Picks as saved; teams from before the 7-player rules had 2 subs after the 7. */
export const asPicks = (json: Prisma.JsonValue) => (json as unknown as Pick[]).slice(0, FANTASY_RULES.squadSize);
const chipOf = (e: { chip: string | null }) => (isChip(e.chip) ? e.chip : null);
const bankOf = (e: EntryRow, budget: number) => e.bank ?? budget - squadCost(asPicks(e.picks));
const squadOf = (e: EntryRow, budget: number): Squad => ({ picks: asPicks(e.picks), bank: bankOf(e, budget) });

/** The gameweek fans are picking for: the first one whose deadline hasn't passed. */
export function nextGameweek<G extends Gameweek>(gameweeks: G[], now = Date.now()) {
  return [...gameweeks].sort((a, b) => a.number - b.number).find((g) => gameweekStatus(g, now) === "upcoming") ?? null;
}

export function squadMap(players: { id: string; position: string; price: number; isActive: boolean }[]) {
  return new Map<string, SquadPlayer>(
    players.map((p) => [p.id, { id: p.id, position: p.position as FantasyPosition, price: p.price, isActive: p.isActive }]),
  );
}

function numberEntries<E extends EntryRow>(gameweeks: Gameweek[], entries: E[]) {
  const numberOf = new Map(gameweeks.map((g) => [g.id, g.number]));
  return entries.map((e) => ({ ...e, number: numberOf.get(e.gameweekId) ?? 0 })).sort((a, b) => a.number - b.number);
}

/**
 * The team a fan carries into a gameweek when they don't touch it: their last entry before it,
 * skipping Free Hit weeks (the team goes back to how it was before the Free Hit).
 */
function keptEntry<E extends EntryRow & { number: number }>(numbered: E[], before: number) {
  let kept: E | null = null;
  for (const e of numbered) if (e.number < before && chipOf(e) !== "free_hit") kept = e;
  return kept;
}

/** The entry that plays a gameweek: the one saved for it, or the team carried into it. */
export function entryForGameweek<E extends EntryRow>(gameweeks: Gameweek[], entries: E[], number: number) {
  const numbered = numberEntries(gameweeks, entries);
  const saved = numbered.find((e) => e.number === number);
  if (saved) return { entry: saved, saved: true };
  const kept = keptEntry(numbered, number);
  return kept ? { entry: kept, saved: false } : null;
}

/**
 * Everything needed to edit a team for `target`: the locked squad and bank transfers are made
 * from, free transfers, chips still available, and the current draft.
 */
export function teamState(
  gameweeks: Gameweek[], entries: EntryRow[], target: Gameweek,
  season: { budget: number; secondHalfFrom: number | null }, now = Date.now(),
) {
  const numbered = numberEntries(gameweeks, entries);
  const firstNumber = numbered[0]?.number ?? Infinity;
  const locked = [...gameweeks]
    .filter((g) => g.number < target.number && gameweekStatus(g, now) !== "upcoming")
    .sort((a, b) => a.number - b.number);
  const lockedEntries = numbered.filter((e) => locked.some((g) => g.number === e.number));

  const history: LockedWeek[] = locked.map((g) => {
    const e = numbered.find((x) => x.number === g.number);
    return { hasEntry: !!e || firstNumber < g.number, transfersMade: e?.transfersMade ?? 0, chip: e ? chipOf(e) : null };
  });
  const kept = keptEntry(lockedEntries, target.number);
  const baseline = kept ? squadOf(kept, season.budget) : null;

  const saved = numbered.find((e) => e.number === target.number);
  const played = [...lockedEntries, ...(saved ? [saved] : [])]
    .flatMap((e) => (chipOf(e) ? [{ chip: chipOf(e)!, gameweek: e.number }] : []));

  const draft = saved
    ? {
        picks: asPicks(saved.picks), captainId: saved.captainId, viceCaptainId: saved.viceCaptainId, chip: chipOf(saved),
        transfersMade: saved.transfersMade, transferCost: saved.transferCost, bank: bankOf(saved, season.budget), saved: true,
      }
    : kept
      ? {
          picks: asPicks(kept.picks), captainId: kept.captainId, viceCaptainId: kept.viceCaptainId, chip: null,
          transfersMade: 0, transferCost: 0, bank: bankOf(kept, season.budget), saved: false,
        }
      : null;

  return {
    baseline,
    freeTransfers: freeTransfersFor(history),
    availableChips: availableChips(target.number, played, season.secondHalfFrom),
    chipsPlayed: played.filter((p) => p.gameweek !== target.number),
    draft,
  };
}

/** Create the team (first save) or update this gameweek's entry. */
export async function saveEntry(userId: string, input: EntryInput & { gameweek: number; name?: string }) {
  const season = await activeSeason();
  if (!season) throw new FantasyError("Fantasy isn't open yet.", 404);

  const [players, gameweeks, existing] = await Promise.all([
    prisma.fantasyPlayer.findMany({ where: { seasonId: season.id } }),
    prisma.fantasyGameweek.findMany({ where: { seasonId: season.id } }),
    prisma.fantasyTeam.findUnique({ where: { userId_seasonId: { userId, seasonId: season.id } }, include: { entries: true } }),
  ]);
  const target = nextGameweek(gameweeks);
  if (!target) throw new FantasyError("There's no gameweek open for picks right now.", 409);
  if (target.number !== input.gameweek) throw new FantasyError("The deadline has passed — your team is locked for that gameweek.", 409);

  const name = input.name?.trim();
  if (!existing && !name) throw new FantasyError("Give your team a name.");
  if (name !== undefined && (name.length < 2 || name.length > 30)) throw new FantasyError("Team names are 2–30 characters.");

  const state = teamState(gameweeks, existing?.entries ?? [], target, season);
  const draftPicks = state.draft?.saved ? state.draft.picks : null;
  const squad = squadMap(players);
  const opts = { budget: season.budget, from: state.baseline, draft: draftPicks };
  const error = entryError(input, squad, { ...opts, availableChips: state.availableChips });
  if (error) throw new FantasyError(error);

  const bought = buySquad(input.playerIds, squad, opts);
  const roles = entryPositions(input, squad);
  const picks = bought.picks.map((p, i) => ({ ...p, position: roles[i] }));
  const bank = bought.bank;
  const transfersMade = transfersBetween(input.playerIds, state.baseline);
  const entry = {
    picks: picks as unknown as Prisma.InputJsonValue,
    captainId: input.captainId,
    viceCaptainId: input.viceCaptainId,
    chip: input.chip,
    transfersMade,
    transferCost: transferCostFor(transfersMade, state.freeTransfers, input.chip),
    bank,
  };

  const team = existing
    ? name ? await prisma.fantasyTeam.update({ where: { id: existing.id }, data: { name } }) : existing
    : await prisma.fantasyTeam.create({ data: { userId, seasonId: season.id, name: name! } });
  await prisma.fantasyEntry.upsert({
    where: { teamId_gameweekId: { teamId: team.id, gameweekId: target.id } },
    create: { teamId: team.id, gameweekId: target.id, ...entry },
    update: entry,
  });
}

export function toPlayerStats(s: PlayerStats): PlayerStats {
  return {
    played: s.played, playedMost: s.playedMost, goals: s.goals, assists: s.assists, goalsConceded: s.goalsConceded,
    saves: s.saves, penaltySaves: s.penaltySaves, penaltyMisses: s.penaltyMisses, yellowCards: s.yellowCards,
    redCard: s.redCard, ownGoals: s.ownGoals, defensiveContributions: s.defensiveContributions, bonus: s.bonus,
  };
}

/** Recompute BPS, bonus, clean sheets and points for every player's stats in a gameweek. */
export async function scoreGameweekStats(gameweekId: string) {
  const rows = await prisma.fantasyPlayerStats.findMany({ where: { gameweekId }, include: { player: { select: { position: true } } } });
  const players = rows.map((r) => ({ id: r.id, position: r.player.position as FantasyPosition, stats: toPlayerStats(r) }));
  const bonus = awardBonus(players);
  const updates = players.flatMap(({ id, position, stats }) => {
    const row = rows.find((r) => r.id === id)!;
    const scored = { ...stats, bonus: bonus.get(id) ?? 0 };
    const data = { bonus: scored.bonus, bps: bpsScore(scored, position), cleanSheet: keptCleanSheet(scored), points: playerPoints(scored, position) };
    const same = row.bonus === data.bonus && row.bps === data.bps && row.cleanSheet === data.cleanSheet && row.points === data.points;
    return same ? [] : [prisma.fantasyPlayerStats.update({ where: { id }, data })];
  });
  if (updates.length) await prisma.$transaction(updates);
}

/**
 * Score a gameweek from its player stats. Teams that didn't touch this gameweek play the team
 * they carried into it. The first time a gameweek is scored, prices move with its transfers.
 * Safe to re-run after correcting stats: points and ranks are recomputed.
 */
export async function finalizeGameweek(gameweekId: string) {
  const gw = await prisma.fantasyGameweek.findUnique({ where: { id: gameweekId }, include: { season: true } });
  if (!gw) throw new FantasyError("Gameweek not found.", 404);
  if (gw.deadline.getTime() > Date.now()) throw new FantasyError("That gameweek's deadline hasn't passed yet.");

  await scoreGameweekStats(gameweekId);
  const [players, statRows, gameweeks] = await Promise.all([
    prisma.fantasyPlayer.findMany({ where: { seasonId: gw.seasonId }, select: { id: true, position: true, price: true } }),
    prisma.fantasyPlayerStats.findMany({ where: { gameweekId } }),
    prisma.fantasyGameweek.findMany({ where: { seasonId: gw.seasonId } }),
  ]);
  const positions = new Map(players.map((p) => [p.id, p.position as FantasyPosition]));
  const stats = new Map(statRows.map((s) => [s.playerId, toPlayerStats(s)]));

  // Only what scoring needs, so this stays quick with tens of thousands of teams: each team's entry
  // for this gameweek, and the team it carries in otherwise (its last entry before, skipping Free Hit
  // weeks, which revert).
  const entryColumns = { teamId: true, gameweekId: true, picks: true, captainId: true, viceCaptainId: true, chip: true, transfersMade: true, transferCost: true, bank: true, points: true } as const;
  // Every team that existed by the last scored gameweek has an entry there (scoring carries teams
  // over), so the kept team is at most a couple of weeks back (a Free Hit week is skipped, and with
  // two sets of chips there can be two in a row). Looking back that far, not the whole season, keeps
  // this quick late in the season.
  const lastScored = gameweeks.filter((g) => g.finalizedAt && g.number < gw.number).reduce((n, g) => Math.max(n, g.number), 0);
  const lookBackFrom = lastScored ? lastScored - 2 : 0;
  const [mineRows, beforeRows] = await Promise.all([
    prisma.fantasyEntry.findMany({ where: { gameweekId }, select: entryColumns }),
    prisma.$queryRaw<(EntryRow & { teamId: string })[]>`
      SELECT DISTINCT ON (e."teamId") e."teamId", e."gameweekId", e.picks, e."captainId", e."viceCaptainId", e.chip,
        e."transfersMade", e."transferCost", e.bank, e.points
      FROM "FantasyEntry" e JOIN "FantasyGameweek" g ON g.id = e."gameweekId"
      WHERE g."seasonId" = ${gw.seasonId} AND g.number < ${gw.number} AND g.number >= ${lookBackFrom}
        AND (e.chip IS NULL OR e.chip <> 'free_hit')
      ORDER BY e."teamId", g.number DESC`,
  ]);
  const mineByTeam = new Map(mineRows.map((e) => [e.teamId, e]));
  const beforeByTeam = new Map(beforeRows.map((e) => [e.teamId, e]));
  const teamIds = new Set([...mineByTeam.keys(), ...beforeByTeam.keys()]);

  const carried: Prisma.FantasyEntryCreateManyInput[] = [];
  const scored: { teamId: string; entry: EntryRow }[] = [];
  const net = new Map<string, number>();
  for (const teamId of teamIds) {
    const before = beforeByTeam.get(teamId);
    const mine = mineByTeam.get(teamId);
    if (mine) {
      scored.push({ teamId, entry: mine });
      // Transfers into and out of the team this gameweek move prices.
      if (before && FANTASY_RULES.prices) {
        const now = new Set(asPicks(mine.picks).map((p) => p.playerId));
        const was = new Set(asPicks(before.picks).map((p) => p.playerId));
        for (const id of now) if (!was.has(id)) net.set(id, (net.get(id) ?? 0) + 1);
        for (const id of was) if (!now.has(id)) net.set(id, (net.get(id) ?? 0) - 1);
      }
      continue;
    }
    if (!before) continue;
    const copy: EntryRow = {
      gameweekId, picks: before.picks, captainId: before.captainId, viceCaptainId: before.viceCaptainId, chip: null,
      transfersMade: 0, transferCost: 0, bank: bankOf(before, gw.season.budget), points: null,
    };
    carried.push({ teamId, ...copy, picks: copy.picks as Prisma.InputJsonValue });
    scored.push({ teamId, entry: copy });
  }
  for (let i = 0; i < carried.length; i += 5000) {
    await prisma.fantasyEntry.createMany({ data: carried.slice(i, i + 5000), skipDuplicates: true });
  }

  const results = scored.map(({ teamId, entry }) => {
    const score = scoreEntry(
      {
        playerIds: asPicks(entry.picks).map((p) => p.playerId),
        captainId: entry.captainId, viceCaptainId: entry.viceCaptainId,
        chip: chipOf(entry), transferCost: entry.transferCost,
      },
      positions, stats,
    );
    return { teamId, points: score.total, breakdown: JSON.stringify(score) };
  });
  // A few big UPDATEs instead of one per team.
  for (let i = 0; i < results.length; i += 2000) {
    const chunk = results.slice(i, i + 2000);
    await prisma.$executeRaw`
      UPDATE "FantasyEntry" e SET points = v.points, breakdown = v.breakdown::jsonb, "updatedAt" = NOW()
      FROM unnest(${chunk.map((r) => r.teamId)}::text[], ${chunk.map((r) => r.points)}::int[], ${chunk.map((r) => r.breakdown)}::text[])
        AS v("teamId", points, breakdown)
      WHERE e."teamId" = v."teamId" AND e."gameweekId" = ${gameweekId}`;
  }
  // Prices move once, the first time the gameweek is scored.
  let changes: Map<string, number> | null = null;
  if (gw.priceChanges === null) {
    changes = priceChanges(net, teamIds.size, new Map(players.map((p) => [p.id, p.price])));
    await prisma.$transaction([
      ...[...changes].map(([id, change]) => prisma.fantasyPlayer.update({ where: { id }, data: { price: { increment: change } } })),
      prisma.fantasyGameweek.update({ where: { id: gameweekId }, data: { priceChanges: Object.fromEntries(changes) } }),
    ]);
  }

  await prisma.fantasyGameweek.update({ where: { id: gameweekId }, data: { finalizedAt: gw.finalizedAt ?? new Date() } });
  await updateStandings(gw.seasonId, gw.number);
  return { teamsScored: scored.length, priceChanges: changes ? changes.size : null };
}

/**
 * Season totals, plus each scored entry's gameweek rank, running total and overall rank, for the
 * gameweeks from `fromNumber` on (earlier ones can't change). Running totals carry on from the
 * previous scored gameweek's stored totals when it's the one just before (every team has an entry
 * there), so this reads a couple of gameweeks of entries rather than the whole season; otherwise it
 * adds the season up from the start. Rows are only written where a value moved.
 */
async function updateStandings(seasonId: string, fromNumber = 1) {
  const previous = fromNumber > 1
    ? await prisma.fantasyGameweek.findFirst({ where: { seasonId, number: fromNumber - 1, finalizedAt: { not: null } }, select: { id: true } })
    : null;
  const from = previous ? fromNumber : 1;
  await prisma.$executeRaw`
    UPDATE "FantasyEntry" e SET "overallPoints" = r.cum, "overallRank" = r.overall, "gameweekRank" = r.week
    FROM (
      SELECT id, cum,
        RANK() OVER (PARTITION BY number ORDER BY cum DESC)::int AS overall,
        RANK() OVER (PARTITION BY number ORDER BY points DESC)::int AS week
      FROM (
        SELECT e.id, g.number, COALESCE(e.points, 0) AS points,
          (COALESCE(b."overallPoints", 0) + SUM(COALESCE(e.points, 0)) OVER (PARTITION BY e."teamId" ORDER BY g.number))::int AS cum
        FROM "FantasyEntry" e
        JOIN "FantasyGameweek" g ON g.id = e."gameweekId"
        LEFT JOIN "FantasyEntry" b ON b."teamId" = e."teamId" AND b."gameweekId" = ${previous?.id ?? ""}
        WHERE g."seasonId" = ${seasonId} AND g."finalizedAt" IS NOT NULL AND g.number >= ${from}
      ) x
    ) r
    WHERE e.id = r.id AND (e."overallPoints" IS DISTINCT FROM r.cum OR e."overallRank" IS DISTINCT FROM r.overall OR e."gameweekRank" IS DISTINCT FROM r.week)`;
  // A team's season total is its running total in the latest scored gameweek.
  const latest = await prisma.fantasyGameweek.findFirst({
    where: { seasonId, finalizedAt: { not: null } }, orderBy: { number: "desc" }, select: { id: true },
  });
  if (!latest) return;
  await prisma.$executeRaw`
    UPDATE "FantasyTeam" t SET "totalPoints" = COALESCE(e."overallPoints", 0), "updatedAt" = NOW()
    FROM "FantasyEntry" e
    WHERE e."gameweekId" = ${latest.id} AND e."teamId" = t.id AND t."totalPoints" IS DISTINCT FROM COALESCE(e."overallPoints", 0)`;
}

// ── Reading ───────────────────────────────────────────────────────────────────

/** Players with season stats, form, last gameweek's points, price moves and ownership. */
async function playerList(seasonId: string, gameweeks: (Gameweek & { priceChanges: Prisma.JsonValue })[]) {
  const finished = gameweeks.filter((g) => g.finalizedAt).sort((a, b) => b.number - a.number);
  const recent = finished.slice(0, 4);
  const [players, rows, latestPicks] = await Promise.all([
    prisma.fantasyPlayer.findMany({ where: { seasonId }, orderBy: [{ price: "desc" }, { name: "asc" }] }),
    prisma.fantasyPlayerStats.findMany({
      where: { gameweekId: { in: finished.map((g) => g.id) } },
      select: { playerId: true, gameweekId: true, points: true, goals: true, assists: true, cleanSheet: true, bonus: true, played: true },
    }),
    // How many teams have each player in their current team (their most recent entry), counted in
    // the database: with thousands of teams, fetching every team's picks here would be megabytes.
    // Every team has an entry in the last scored gameweek, so nothing older needs reading.
    prisma.$queryRaw<{ playerId: string; n: number; teams: number }[]>`
      WITH latest AS (
        SELECT DISTINCT ON (e."teamId") e.picks FROM "FantasyEntry" e
        JOIN "FantasyGameweek" g ON g.id = e."gameweekId"
        WHERE g."seasonId" = ${seasonId} AND g.number >= ${finished[0]?.number ?? 0}
        ORDER BY e."teamId", g.number DESC
      )
      SELECT x.pick->>'playerId' AS "playerId", COUNT(*)::int AS n, (SELECT COUNT(*) FROM latest)::int AS teams
      FROM latest, jsonb_array_elements(latest.picks) WITH ORDINALITY AS x(pick, i)
      WHERE x.i <= ${FANTASY_RULES.squadSize}
      GROUP BY 1`,
  ]);
  const pickedBy = new Map(latestPicks.map((r) => [r.playerId, r.n]));
  const teamCount = latestPicks[0]?.teams ?? 0;
  const lastChanges = (finished[0]?.priceChanges ?? {}) as Record<string, number>;

  return players.map((p) => {
    const mine = rows.filter((r) => r.playerId === p.id);
    const sum = (f: (r: (typeof mine)[number]) => number) => mine.reduce((s, r) => s + f(r), 0);
    const recentPoints = recent.reduce((s, g) => s + (mine.find((r) => r.gameweekId === g.id)?.points ?? 0), 0);
    return {
      id: p.id, name: p.name, position: p.position as FantasyPosition, price: p.price, imageUrl: p.imageUrl, isActive: p.isActive,
      status: p.status as PlayerStatus, news: p.news,
      totalPoints: sum((r) => r.points),
      form: recent.length ? Math.round((recentPoints / recent.length) * 10) / 10 : 0,
      lastPoints: finished[0] ? (mine.find((r) => r.gameweekId === finished[0].id)?.points ?? 0) : null,
      priceChange: lastChanges[p.id] ?? 0,
      appearances: sum((r) => Number(r.played)),
      goals: sum((r) => r.goals),
      assists: sum((r) => r.assists),
      cleanSheets: sum((r) => Number(r.cleanSheet)),
      bonus: sum((r) => r.bonus),
      selectedBy: teamCount ? Math.round(((pickedBy.get(p.id) ?? 0) / teamCount) * 100) : 0,
    };
  });
}

/**
 * The player list is the same for every fan and is the heaviest part of GET /api/fantasy, so each
 * server keeps it for a short while (and straight away rebuilds it once a gameweek is scored).
 * Admin changes call invalidateFantasyCache(); other servers catch up within PLAYER_LIST_TTL.
 */
const PLAYER_LIST_TTL = 30_000;
const playerListCache = new Map<string, { at: number; value: ReturnType<typeof playerList> }>();

export function invalidateFantasyCache() {
  playerListCache.clear();
  statsCache = null;
}

function cachedPlayerList(seasonId: string, gameweeks: (Gameweek & { priceChanges: Prisma.JsonValue })[]) {
  const key = `${seasonId}:${gameweeks.map((g) => `${g.id}.${g.finalizedAt?.getTime() ?? 0}`).join(",")}`;
  const hit = playerListCache.get(key);
  if (hit && Date.now() - hit.at < PLAYER_LIST_TTL) return hit.value;
  const value = playerList(seasonId, gameweeks);
  playerListCache.set(key, { at: Date.now(), value });
  value.catch(() => playerListCache.delete(key));
  if (playerListCache.size > 20) playerListCache.delete(playerListCache.keys().next().value!);
  return value;
}

/** GET /api/fantasy: the season, its players and gameweeks, and the signed-in fan's team. */
export async function overview(userId?: string) {
  const season = await activeSeason();
  if (!season) return { season: null, gameweeks: [], nextGameweek: null, currentGameweek: null, players: [], team: null };

  const gameweeks = await prisma.fantasyGameweek.findMany({ where: { seasonId: season.id }, orderBy: { number: "asc" } });
  const [players, team] = await Promise.all([
    cachedPlayerList(season.id, gameweeks),
    userId
      ? prisma.fantasyTeam.findUnique({ where: { userId_seasonId: { userId, seasonId: season.id } }, include: { entries: true } })
      : null,
  ]);
  const target = nextGameweek(gameweeks);
  const started = gameweeks.filter((g) => gameweekStatus(g) !== "upcoming");
  const finished = gameweeks.filter((g) => g.finalizedAt);
  const lastFinished = finished.at(-1);

  let myTeam = null;
  if (team) {
    const [ahead, teamCount] = await Promise.all([
      prisma.fantasyTeam.count({ where: { seasonId: season.id, totalPoints: { gt: team.totalPoints } } }),
      prisma.fantasyTeam.count({ where: { seasonId: season.id } }),
    ]);
    // With no gameweek open, show the team as it stands.
    const state = teamState(
      gameweeks, team.entries,
      target ?? { id: "", number: Number.MAX_SAFE_INTEGER, name: null, deadline: new Date(0), finalizedAt: null },
      season,
    );
    const entryAt = (g: Gameweek | undefined) => (g ? team.entries.find((e) => e.gameweekId === g.id) : undefined);
    const last = entryAt(lastFinished);
    const previous = entryAt(finished.at(-2));
    const prices = new Map(players.map((p) => [p.id, p]));
    myTeam = {
      id: team.id,
      name: team.name,
      totalPoints: team.totalPoints,
      rank: ahead + 1,
      previousRank: previous?.overallRank ?? null,
      teamCount,
      lastGameweek: lastFinished ? { number: lastFinished.number, points: last?.points ?? 0, rank: last?.gameweekRank ?? null } : null,
      value: state.draft ? teamValue({ picks: state.draft.picks, bank: state.draft.bank }, prices) : null,
      ...state,
    };
  }

  return {
    season: { id: season.id, name: season.name, budget: season.budget, secondHalfFrom: season.secondHalfFrom },
    gameweeks: gameweeks.map((g) => ({
      number: g.number, name: g.name, deadline: g.deadline.toISOString(), status: gameweekStatus(g),
      goalsFor: g.goalsFor, goalsAgainst: g.goalsAgainst,
    })),
    nextGameweek: target?.number ?? null,
    /** The latest gameweek that has kicked off (live or finished). */
    currentGameweek: started.at(-1)?.number ?? null,
    players,
    team: myTeam,
  };
}

/** A team's season so far, gameweek by gameweek. */
export async function teamHistory(teamId: string) {
  const team = await prisma.fantasyTeam.findUnique({
    where: { id: teamId },
    include: { user: { select: { name: true } }, entries: { include: { gameweek: true } }, season: true },
  });
  if (!team) throw new FantasyError("Team not found", 404);
  const players = await prisma.fantasyPlayer.findMany({ where: { seasonId: team.seasonId }, select: { id: true, price: true } });
  const prices = new Map(players.map((p) => [p.id, p]));
  const weeks = team.entries
    .filter((e) => gameweekStatus(e.gameweek) !== "upcoming")
    .sort((a, b) => a.gameweek.number - b.gameweek.number)
    .map((e) => ({
      number: e.gameweek.number,
      name: e.gameweek.name,
      status: gameweekStatus(e.gameweek),
      points: e.points,
      overallPoints: e.overallPoints,
      overallRank: e.overallRank,
      gameweekRank: e.gameweekRank,
      transfersMade: e.transfersMade,
      transferCost: e.transferCost,
      chip: chipOf(e),
      bank: bankOf(e, team.season.budget),
      value: teamValue(squadOf(e, team.season.budget), prices),
    }));
  return { team: { id: team.id, name: team.name, manager: team.user.name, totalPoints: team.totalPoints }, weeks };
}

/** One player's season: price, ownership and points gameweek by gameweek. */
export async function playerDetail(playerId: string) {
  const player = await prisma.fantasyPlayer.findUnique({ where: { id: playerId } });
  if (!player) throw new FantasyError("Player not found", 404);
  const gameweeks = await prisma.fantasyGameweek.findMany({
    where: { seasonId: player.seasonId }, orderBy: { number: "asc" }, include: { stats: { where: { playerId } } },
  });
  const finished = gameweeks.filter((g) => g.finalizedAt || g.stats.length);
  return {
    player: { id: player.id, name: player.name, position: player.position as FantasyPosition, price: player.price, imageUrl: player.imageUrl, status: player.status as PlayerStatus, news: player.news, isActive: player.isActive },
    gameweeks: finished.map((g) => {
      const s = g.stats[0];
      return {
        number: g.number,
        name: g.name,
        result: g.goalsFor !== null && g.goalsAgainst !== null ? `${g.goalsFor}–${g.goalsAgainst}` : null,
        status: gameweekStatus(g),
        played: s?.played ?? false,
        points: s?.points ?? 0,
        goals: s?.goals ?? 0,
        assists: s?.assists ?? 0,
        cleanSheet: s?.cleanSheet ?? false,
        bonus: s?.bonus ?? 0,
        priceChange: ((g.priceChanges ?? {}) as Record<string, number>)[playerId] ?? 0,
      };
    }),
  };
}

// ── Stats ─────────────────────────────────────────────────────────────────────

/** The team whose match videos the Man of the Match votes count on. */
const TEAM_CHANNEL = "5iveguysfc";

/**
 * Every player's season tallies for the stats page (lib/fantasy-stats.ts turns them into boards).
 * Picks, captains and transfers are counted in the database: with thousands of teams, reading every
 * entry's picks here would be megabytes.
 */
async function seasonStats(): Promise<FantasyStats> {
  const season = await activeSeason();
  if (!season) return { season: null, scoredThrough: null, teamCount: 0, transfers: 0, chips: {}, bestWeeks: [], players: [] };

  const gameweeks = await prisma.fantasyGameweek.findMany({
    where: { seasonId: season.id }, orderBy: { number: "asc" }, select: { id: true, number: true, deadline: true, finalizedAt: true },
  });
  const finished = gameweeks.filter((g) => g.finalizedAt);
  const lastScored = finished.at(-1)?.number ?? 0;
  const squad = FANTASY_RULES.squadSize;
  const channel = await prisma.channel.findUnique({ where: { slug: TEAM_CHANNEL }, select: { id: true } });
  // This season's match videos: published since the first gameweek kicked off.
  const seasonStart = gameweeks[0]?.deadline ?? null;

  const [players, rows, current, moves, chips, best, motm] = await Promise.all([
    prisma.fantasyPlayer.findMany({ where: { seasonId: season.id }, orderBy: { name: "asc" } }),
    prisma.fantasyPlayerStats.findMany({
      where: { gameweekId: { in: finished.map((g) => g.id) } },
      select: {
        playerId: true, played: true, points: true, goals: true, assists: true, cleanSheet: true, saves: true, bonus: true,
        yellowCards: true, redCard: true,
      },
    }),
    // Every team's current team (its most recent entry: every team has one in the last scored
    // gameweek, so nothing older is read), and who's captain of it.
    prisma.$queryRaw<{ playerId: string; picked: number; captained: number; teams: number }[]>`
      WITH latest AS (
        SELECT DISTINCT ON (e."teamId") e.picks, e."captainId" FROM "FantasyEntry" e
        JOIN "FantasyGameweek" g ON g.id = e."gameweekId"
        WHERE g."seasonId" = ${season.id} AND g.number >= ${lastScored}
        ORDER BY e."teamId", g.number DESC
      )
      SELECT x.pick->>'playerId' AS "playerId", COUNT(*)::int AS picked,
        COUNT(*) FILTER (WHERE x.pick->>'playerId' = latest."captainId")::int AS captained,
        (SELECT COUNT(*) FROM latest)::int AS teams
      FROM latest, jsonb_array_elements(latest.picks) WITH ORDINALITY AS x(pick, i)
      WHERE x.i <= ${squad}
      GROUP BY 1`,
    // Transfers: each entry that made some, against the team before it, as saveEntry counts them
    // (Free Hit weeks are skipped: the team goes back to how it was). The team before is looked up
    // per entry (by team, through its index), so this never sorts the whole season's picks.
    prisma.$queryRaw<{ playerId: string; in: number; out: number }[]>`
      WITH changed AS (
        SELECT
          ARRAY(SELECT p->>'playerId' FROM jsonb_array_elements(e.picks) WITH ORDINALITY AS a(p, i) WHERE i <= ${squad}) AS ids,
          ARRAY(SELECT p->>'playerId' FROM jsonb_array_elements(b.picks) WITH ORDINALITY AS a(p, i) WHERE i <= ${squad}) AS was
        FROM "FantasyEntry" e
        JOIN "FantasyGameweek" g ON g.id = e."gameweekId"
        CROSS JOIN LATERAL (
          SELECT p.picks FROM "FantasyEntry" p JOIN "FantasyGameweek" pg ON pg.id = p."gameweekId"
          WHERE p."teamId" = e."teamId" AND pg."seasonId" = g."seasonId" AND pg.number < g.number
            AND (p.chip IS NULL OR p.chip <> 'free_hit')
          ORDER BY pg.number DESC LIMIT 1
        ) b
        WHERE g."seasonId" = ${season.id} AND e."transfersMade" > 0 AND (e.chip IS NULL OR e.chip <> 'free_hit')
      )
      SELECT id AS "playerId", SUM(t_in)::int AS "in", SUM(t_out)::int AS "out" FROM (
        SELECT id, 1 AS t_in, 0 AS t_out FROM changed, unnest(ids) AS id WHERE NOT (id = ANY(was))
        UNION ALL
        SELECT id, 0, 1 FROM changed, unnest(was) AS id WHERE NOT (id = ANY(ids))
      ) m
      GROUP BY 1`,
    prisma.fantasyEntry.groupBy({
      by: ["chip"],
      where: { chip: { not: null }, gameweek: { seasonId: season.id, deadline: { lte: new Date() } } },
      _count: { _all: true },
    }),
    prisma.fantasyEntry.findMany({
      where: { points: { gt: 0 }, gameweek: { seasonId: season.id, finalizedAt: { not: null } } },
      orderBy: [{ points: "desc" }, { updatedAt: "asc" }],
      take: 3,
      select: { points: true, gameweek: { select: { number: true } }, team: { select: { name: true, user: { select: { name: true } } } } },
    }),
    // Man of the Match: on each of this season's match videos, whoever the fans voted top (joint top
    // counts for each). Guests from another team can top a vote; only our own players are counted.
    channel && seasonStart
      ? prisma.$queryRaw<{ playerName: string; wins: number }[]>`
          WITH tally AS (
            SELECT v."videoId", v."playerChannelId", v."playerName", COUNT(*) AS votes
            FROM "MotmVote" v
            JOIN "VideoMeta" m ON m."videoId" = v."videoId" AND m."channelId" = v."channelId"
            WHERE v."channelId" = ${channel.id} AND m."publishedAt" >= ${seasonStart} AND m."isShort" IS NOT TRUE
            GROUP BY 1, 2, 3
          ),
          ranked AS (SELECT *, MAX(votes) OVER (PARTITION BY "videoId") AS top FROM tally)
          SELECT "playerName", COUNT(*)::int AS wins FROM ranked
          WHERE votes = top AND "playerChannelId" = ${channel.id}
          GROUP BY 1`
      : Promise.resolve([]),
  ]);

  const teams = current[0]?.teams ?? 0;
  const share = (n: number | undefined) => (teams ? Math.round(((n ?? 0) / teams) * 100) : 0);
  const now = new Map(current.map((r) => [r.playerId, r]));
  const transfers = new Map(moves.map((r) => [r.playerId, r]));
  const motmWins = new Map(motm.map((r) => [r.playerName.trim().toLowerCase(), r.wins]));

  return {
    season: { name: season.name },
    scoredThrough: finished.at(-1)?.number ?? null,
    teamCount: teams,
    transfers: moves.reduce((n, r) => n + r.in, 0),
    chips: Object.fromEntries(chips.flatMap((c) => (isChip(c.chip) ? [[c.chip, c._count._all]] : []))),
    bestWeeks: best.map((e) => ({ team: e.team.name, manager: e.team.user.name, gameweek: e.gameweek.number, points: e.points! })),
    players: players.map((p) => {
      const mine = rows.filter((r) => r.playerId === p.id);
      const sum = (f: (r: (typeof mine)[number]) => number) => mine.reduce((s, r) => s + f(r), 0);
      return {
        id: p.id, name: p.name, position: p.position as FantasyPosition, imageUrl: p.imageUrl, isActive: p.isActive,
        points: sum((r) => r.points),
        appearances: sum((r) => Number(r.played)),
        goals: sum((r) => r.goals),
        assists: sum((r) => r.assists),
        cleanSheets: sum((r) => Number(r.cleanSheet)),
        saves: sum((r) => r.saves),
        bonus: sum((r) => r.bonus),
        yellowCards: sum((r) => r.yellowCards),
        redCards: sum((r) => Number(r.redCard)),
        motmWins: motmWins.get(p.name.trim().toLowerCase()) ?? 0,
        selectedBy: share(now.get(p.id)?.picked),
        captainedBy: share(now.get(p.id)?.captained),
        transfersIn: transfers.get(p.id)?.in ?? 0,
        transfersOut: transfers.get(p.id)?.out ?? 0,
      };
    }),
  };
}

/** The stats are the same for everyone, so each server keeps them for a minute (admin changes clear them). */
const STATS_TTL = 60_000;
let statsCache: { at: number; value: Promise<FantasyStats> } | null = null;

/** GET /api/fantasy/stats */
export function fantasyStats() {
  if (statsCache && Date.now() - statsCache.at < STATS_TTL) return statsCache.value;
  const value = seasonStats();
  const entry = { at: Date.now(), value };
  statsCache = entry;
  value.catch(() => {
    if (statsCache === entry) statsCache = null;
  });
  return value;
}

// ── Leagues ───────────────────────────────────────────────────────────────────

async function myTeam(userId: string) {
  const season = await activeSeason();
  if (!season) throw new FantasyError("Fantasy isn't open yet.", 404);
  const team = await prisma.fantasyTeam.findUnique({ where: { userId_seasonId: { userId, seasonId: season.id } } });
  return { season, team };
}

/** The fan's leagues with their rank in each. */
export async function myLeagues(userId: string) {
  const { season, team } = await myTeam(userId);
  if (!team) return { leagues: [] };
  const leagues = await prisma.fantasyLeague.findMany({
    where: { seasonId: season.id, members: { some: { teamId: team.id } } },
    orderBy: { createdAt: "asc" },
    include: { members: { select: { team: { select: { id: true, totalPoints: true } } } } },
  });
  return {
    leagues: leagues.map((l) => ({
      id: l.id, name: l.name, code: l.code, members: l.members.length,
      rank: 1 + l.members.filter((m) => m.team.totalPoints > team.totalPoints).length,
    })),
  };
}

export async function createLeague(userId: string, rawName: string) {
  const { season, team } = await myTeam(userId);
  if (!team) throw new FantasyError("Pick your team first, then start a league.");
  const name = rawName.trim();
  if (name.length < 2 || name.length > 30) throw new FantasyError("League names are 2–30 characters.");
  if (await prisma.fantasyLeague.count({ where: { createdBy: team.id } }) >= 20) throw new FantasyError("You've started the maximum of 20 leagues.");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.fantasyLeague.create({
        data: { seasonId: season.id, name, code: makeLeagueCode(), createdBy: team.id, members: { create: { teamId: team.id } } },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  throw new FantasyError("Couldn't make a league code — try again.", 500);
}

export async function joinLeague(userId: string, rawCode: string) {
  const { season, team } = await myTeam(userId);
  if (!team) throw new FantasyError("Pick your team first, then join the league.");
  const code = rawCode.trim().toUpperCase();
  const league = await prisma.fantasyLeague.findUnique({ where: { code } });
  if (!league || league.seasonId !== season.id) throw new FantasyError("No league has that code.", 404);
  await prisma.fantasyLeagueMember.upsert({
    where: { leagueId_teamId: { leagueId: league.id, teamId: team.id } },
    create: { leagueId: league.id, teamId: team.id },
    update: {},
  });
  return league;
}

/** Leaving the last seat in a league deletes it. */
export async function leaveLeague(userId: string, leagueId: string) {
  const { team } = await myTeam(userId);
  if (!team) throw new FantasyError("You're not in that league.", 404);
  await prisma.fantasyLeagueMember.deleteMany({ where: { leagueId, teamId: team.id } });
  if (await prisma.fantasyLeagueMember.count({ where: { leagueId } }) === 0) {
    await prisma.fantasyLeague.deleteMany({ where: { id: leagueId } });
  }
}

/** A league table: rank (with movement since the gameweek before), last gameweek and total points. */
export async function leagueStandings(leagueId: string, userId?: string) {
  const league = await prisma.fantasyLeague.findUnique({
    where: { id: leagueId },
    include: { members: { include: { team: { include: { user: { select: { name: true, image: true } } } } } } },
  });
  if (!league) throw new FantasyError("League not found", 404);
  const finished = await prisma.fantasyGameweek.findMany({
    where: { seasonId: league.seasonId, finalizedAt: { not: null } }, orderBy: { number: "desc" }, take: 2, select: { id: true, number: true },
  });
  const teamIds = league.members.map((m) => m.teamId);
  const entries = finished.length
    ? await prisma.fantasyEntry.findMany({
        where: { teamId: { in: teamIds }, gameweekId: { in: finished.map((g) => g.id) } },
        select: { teamId: true, gameweekId: true, points: true, overallPoints: true },
      })
    : [];
  // Lookups and ranks in one pass each, so a league with thousands of members stays quick.
  const byTeamWeek = new Map(entries.map((e) => [`${e.teamId}:${e.gameweekId}`, e]));
  const at = (teamId: string, g?: { id: string }) => (g ? byTeamWeek.get(`${teamId}:${g.id}`) : undefined);

  const teams = league.members.map((m) => m.team);
  const rankBy = (score: (t: (typeof teams)[number]) => number | null) => {
    const ranks = competitionRanks(teams.map((t) => [t.id, score(t)]));
    return (t: (typeof teams)[number]) => ranks.get(t.id) ?? null;
  };
  const rank = rankBy((t) => t.totalPoints);
  const previousRank = rankBy((t) => at(t.id, finished[1])?.overallPoints ?? null);

  const rows = teams
    .map((t) => ({
      rank: rank(t)!,
      previousRank: finished[1] ? previousRank(t) : null,
      id: t.id,
      name: t.name,
      manager: t.user.name,
      image: t.user.image,
      totalPoints: t.totalPoints,
      lastPoints: at(t.id, finished[0])?.points ?? null,
      mine: !!userId && t.userId === userId,
    }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  // Big leagues send the top LEAGUE_ROWS and your own row, not thousands of rows.
  const shown = rows.length > LEAGUE_ROWS ? rows.filter((r, i) => i < LEAGUE_ROWS || r.mine) : rows;
  return {
    league: { id: league.id, name: league.name, code: league.code, isMember: rows.some((r) => r.mine) },
    lastGameweek: finished[0]?.number ?? null,
    teamCount: rows.length,
    teams: shown,
  };
}

const LEAGUE_ROWS = 100;

/** 1 + how many are strictly ahead (ties share a rank), for everyone with a score; null without one. */
function competitionRanks(scores: [string, number | null][]) {
  const ranked = scores.filter((s): s is [string, number] => s[1] !== null).sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number | null>(scores.map(([id]) => [id, null]));
  ranked.forEach(([id, score], i) => ranks.set(id, i > 0 && ranked[i - 1][1] === score ? ranks.get(ranked[i - 1][0])! : i + 1));
  return ranks;
}
