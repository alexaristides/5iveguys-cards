/**
 * Fantasy Div 1 — database side: loading a fan's team for the next gameweek, saving it,
 * and scoring a gameweek. Rules live in lib/fantasy.ts.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  entryError, freeTransfersFor, gameweekStatus, playerPoints, priceSquad, scoreEntry, transferCostFor, transfersBetween,
  type Chip, type EntryInput, type FantasyPosition, type Pick, type PlayerStats, type SquadPlayer,
} from "@/lib/fantasy";

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
  transfersMade: number; transferCost: number; points: number | null;
};

export const asPicks = (json: Prisma.JsonValue) => json as unknown as Pick[];

/** The gameweek fans are picking for: the first one whose deadline hasn't passed. */
export function nextGameweek(gameweeks: Gameweek[], now = Date.now()) {
  return [...gameweeks].sort((a, b) => a.number - b.number)
    .find((g) => gameweekStatus(g, now) === "upcoming") ?? null;
}

export function squadMap(players: { id: string; position: string; price: number; isActive: boolean }[]) {
  return new Map<string, SquadPlayer>(
    players.map((p) => [p.id, { id: p.id, position: p.position as FantasyPosition, price: p.price, isActive: p.isActive }]),
  );
}

/**
 * Everything needed to edit a team for `target`: the locked squad it starts from (transfers
 * are counted against it), free transfers, chips already played, and the current draft.
 */
export function teamState(gameweeks: Gameweek[], entries: EntryRow[], target: Gameweek, now = Date.now()) {
  const byId = new Map(gameweeks.map((g) => [g.id, g]));
  const numbered = entries
    .map((e) => ({ ...e, number: byId.get(e.gameweekId)?.number ?? 0 }))
    .sort((a, b) => a.number - b.number);
  const lockedNumbers = gameweeks
    .filter((g) => g.number < target.number && gameweekStatus(g, now) !== "upcoming")
    .map((g) => g.number);
  const locked = numbered.filter((e) => lockedNumbers.includes(e.number));

  const baselineEntry = locked.at(-1) ?? null;
  const freeTransfers = freeTransfersFor(
    lockedNumbers,
    new Map(locked.map((e) => [e.number, { transfersMade: e.transfersMade, chip: e.chip as Chip | null }])),
  );
  const usedChips = locked.flatMap((e) => (e.chip ? [e.chip as Chip] : []));

  const saved = numbered.find((e) => e.number === target.number);
  const latest = numbered.at(-1);
  const draft = saved
    ? { picks: asPicks(saved.picks), captainId: saved.captainId, viceCaptainId: saved.viceCaptainId,
        chip: saved.chip as Chip | null, transfersMade: saved.transfersMade, transferCost: saved.transferCost, saved: true }
    : latest
      ? { picks: asPicks(latest.picks), captainId: latest.captainId, viceCaptainId: latest.viceCaptainId,
          chip: null, transfersMade: 0, transferCost: 0, saved: false }
      : null;

  return { baseline: baselineEntry ? asPicks(baselineEntry.picks) : null, freeTransfers, usedChips, draft };
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

  const state = teamState(gameweeks, existing?.entries ?? [], target);
  const squad = squadMap(players);
  const error = entryError(input, squad, { budget: season.budget, baseline: state.baseline, usedChips: state.usedChips });
  if (error) throw new FantasyError(error);

  const picks = priceSquad(input.playerIds, squad, state.baseline);
  const transfersMade = transfersBetween(input.playerIds, state.baseline);
  const entry = {
    picks: picks as unknown as Prisma.InputJsonValue,
    captainId: input.captainId,
    viceCaptainId: input.viceCaptainId,
    chip: input.chip,
    transfersMade,
    transferCost: transferCostFor(transfersMade, state.freeTransfers, input.chip),
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
    played: s.played, goals: s.goals, assists: s.assists, cleanSheet: s.cleanSheet, yellowCards: s.yellowCards,
    redCard: s.redCard, ownGoals: s.ownGoals, penaltySaves: s.penaltySaves, penaltyMisses: s.penaltyMisses,
    motm: s.motm, bonus: s.bonus,
  };
}

/**
 * Score a gameweek from its player stats. Teams that didn't touch this gameweek play their
 * previous entry. Safe to re-run after correcting stats: everything is recomputed.
 */
export async function finalizeGameweek(gameweekId: string) {
  const gw = await prisma.fantasyGameweek.findUnique({ where: { id: gameweekId } });
  if (!gw) throw new FantasyError("Gameweek not found.", 404);
  if (gw.deadline.getTime() > Date.now()) throw new FantasyError("That gameweek's deadline hasn't passed yet.");

  const [players, statRows, gameweeks] = await Promise.all([
    prisma.fantasyPlayer.findMany({ where: { seasonId: gw.seasonId }, select: { id: true, position: true } }),
    prisma.fantasyPlayerStats.findMany({ where: { gameweekId } }),
    prisma.fantasyGameweek.findMany({ where: { seasonId: gw.seasonId }, select: { id: true, number: true } }),
  ]);
  const positions = new Map(players.map((p) => [p.id, p.position as FantasyPosition]));
  const stats = new Map(statRows.map((s) => [s.playerId, toPlayerStats(s)]));
  const numberOf = new Map(gameweeks.map((g) => [g.id, g.number]));

  const teams = await prisma.fantasyTeam.findMany({
    where: { seasonId: gw.seasonId, entries: { some: { gameweek: { number: { lte: gw.number } } } } },
    select: { id: true, entries: true },
  });

  const carried: Prisma.FantasyEntryCreateManyInput[] = [];
  const scored: { teamId: string; entry: EntryRow }[] = [];
  for (const team of teams) {
    const mine = team.entries.find((e) => e.gameweekId === gameweekId);
    if (mine) { scored.push({ teamId: team.id, entry: mine }); continue; }
    const previous = team.entries
      .filter((e) => (numberOf.get(e.gameweekId) ?? 0) < gw.number)
      .sort((a, b) => (numberOf.get(b.gameweekId) ?? 0) - (numberOf.get(a.gameweekId) ?? 0))[0];
    if (!previous) continue;
    const copy = {
      gameweekId, picks: previous.picks, captainId: previous.captainId,
      viceCaptainId: previous.viceCaptainId, chip: null, transfersMade: 0, transferCost: 0, points: null,
    };
    carried.push({ teamId: team.id, ...copy, picks: copy.picks as Prisma.InputJsonValue });
    scored.push({ teamId: team.id, entry: copy });
  }
  if (carried.length) await prisma.fantasyEntry.createMany({ data: carried, skipDuplicates: true });

  // Per-player points, then each team's entry.
  for (const s of statRows) {
    const points = playerPoints(stats.get(s.playerId), positions.get(s.playerId) ?? "MID");
    if (points !== s.points) await prisma.fantasyPlayerStats.update({ where: { id: s.id }, data: { points } });
  }
  const updates = scored.map(({ teamId, entry }) => {
    const score = scoreEntry(
      {
        playerIds: asPicks(entry.picks).map((p) => p.playerId),
        captainId: entry.captainId, viceCaptainId: entry.viceCaptainId,
        chip: entry.chip as Chip | null, transferCost: entry.transferCost,
      },
      positions, stats,
    );
    return prisma.fantasyEntry.update({
      where: { teamId_gameweekId: { teamId, gameweekId } },
      data: { points: score.total, breakdown: score as unknown as Prisma.InputJsonValue },
    });
  });
  for (let i = 0; i < updates.length; i += 50) await Promise.all(updates.slice(i, i + 50));

  await prisma.fantasyGameweek.update({ where: { id: gameweekId }, data: { finalizedAt: new Date() } });
  await prisma.$executeRaw`
    UPDATE "FantasyTeam" t SET "totalPoints" = s.total, "updatedAt" = NOW()
    FROM (
      SELECT e."teamId", COALESCE(SUM(e.points), 0)::int AS total
      FROM "FantasyEntry" e JOIN "FantasyGameweek" g ON g.id = e."gameweekId"
      WHERE g."seasonId" = ${gw.seasonId} AND g."finalizedAt" IS NOT NULL
      GROUP BY e."teamId"
    ) s
    WHERE t.id = s."teamId"`;

  return { teamsScored: scored.length };
}

/** Players with season points, last gameweek's points and how many teams picked them. */
async function playerList(seasonId: string, gameweeks: Gameweek[]) {
  const finished = gameweeks.filter((g) => g.finalizedAt).sort((a, b) => b.number - a.number);
  const [players, totals, last, latestPicks] = await Promise.all([
    prisma.fantasyPlayer.findMany({ where: { seasonId }, orderBy: [{ price: "desc" }, { name: "asc" }] }),
    prisma.fantasyPlayerStats.groupBy({
      by: ["playerId"],
      where: { gameweekId: { in: finished.map((g) => g.id) } },
      _sum: { points: true },
    }),
    finished[0]
      ? prisma.fantasyPlayerStats.findMany({ where: { gameweekId: finished[0].id }, select: { playerId: true, points: true } })
      : [],
    // Each team's most recent entry (their current squad).
    prisma.$queryRaw<{ picks: Pick[] }[]>`
      SELECT DISTINCT ON (e."teamId") e.picks FROM "FantasyEntry" e
      JOIN "FantasyGameweek" g ON g.id = e."gameweekId"
      WHERE g."seasonId" = ${seasonId}
      ORDER BY e."teamId", g.number DESC`,
  ]);
  const totalBy = new Map(totals.map((t) => [t.playerId, t._sum.points ?? 0]));
  const lastBy = new Map(last.map((s) => [s.playerId, s.points]));
  const pickedBy = new Map<string, number>();
  for (const { picks } of latestPicks) for (const p of picks) pickedBy.set(p.playerId, (pickedBy.get(p.playerId) ?? 0) + 1);

  return players.map((p) => ({
    id: p.id, name: p.name, position: p.position as FantasyPosition, price: p.price, imageUrl: p.imageUrl, isActive: p.isActive,
    totalPoints: totalBy.get(p.id) ?? 0,
    lastPoints: lastBy.get(p.id) ?? null,
    selectedBy: latestPicks.length ? Math.round(((pickedBy.get(p.id) ?? 0) / latestPicks.length) * 100) : 0,
  }));
}

/** GET /api/fantasy: the season, its players and gameweeks, and the signed-in fan's team. */
export async function overview(userId?: string) {
  const season = await activeSeason();
  if (!season) return { season: null, gameweeks: [], nextGameweek: null, players: [], team: null };

  const gameweeks = await prisma.fantasyGameweek.findMany({ where: { seasonId: season.id }, orderBy: { number: "asc" } });
  const [players, team] = await Promise.all([
    playerList(season.id, gameweeks),
    userId
      ? prisma.fantasyTeam.findUnique({ where: { userId_seasonId: { userId, seasonId: season.id } }, include: { entries: true } })
      : null,
  ]);
  const target = nextGameweek(gameweeks);
  const lastFinished = gameweeks.filter((g) => g.finalizedAt).at(-1);

  let myTeam = null;
  if (team) {
    const [ahead, teamCount] = await Promise.all([
      prisma.fantasyTeam.count({ where: { seasonId: season.id, totalPoints: { gt: team.totalPoints } } }),
      prisma.fantasyTeam.count({ where: { seasonId: season.id } }),
    ]);
    // With no gameweek open, show the team as it stands (its latest entry).
    const state = target
      ? teamState(gameweeks, team.entries, target)
      : teamState(gameweeks, team.entries, { id: "", number: Number.MAX_SAFE_INTEGER, name: null, deadline: new Date(0), finalizedAt: null });
    const lastEntry = lastFinished && team.entries.find((e) => e.gameweekId === lastFinished.id);
    myTeam = {
      id: team.id,
      name: team.name,
      totalPoints: team.totalPoints,
      rank: ahead + 1,
      teamCount,
      lastGameweek: lastFinished ? { number: lastFinished.number, points: lastEntry?.points ?? 0 } : null,
      ...state,
    };
  }

  return {
    season: { id: season.id, name: season.name, budget: season.budget },
    gameweeks: gameweeks.map((g) => ({
      number: g.number, name: g.name, deadline: g.deadline.toISOString(), status: gameweekStatus(g),
    })),
    nextGameweek: target?.number ?? null,
    players,
    team: myTeam,
  };
}
