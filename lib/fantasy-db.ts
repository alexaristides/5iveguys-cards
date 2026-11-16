/**
 * Fantasy Div 1 — database side: a fan's team for the next gameweek, saving it, scoring a
 * gameweek (bonus, price changes, ranks), leagues and history. Rules live in lib/fantasy.ts.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  availableChips, awardBonus, buySquad, entryError, FANTASY_RULES, freeTransfersFor, gameweekStatus, isChip, keptCleanSheet,
  makeLeagueCode, playerPoints, priceChanges, scoreEntry, squadCost, teamValue, transferCostFor, transfersBetween, bpsScore,
  type Chip, type EntryInput, type FantasyPosition, type LockedWeek, type Pick, type PlayerStats, type PlayerStatus,
  type Squad, type SquadPlayer,
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

  const { picks, bank } = buySquad(input.playerIds, squad, opts);
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

  const teams = await prisma.fantasyTeam.findMany({
    where: { seasonId: gw.seasonId, entries: { some: { gameweek: { number: { lte: gw.number } } } } },
    select: { id: true, entries: true },
  });

  const carried: Prisma.FantasyEntryCreateManyInput[] = [];
  const scored: { teamId: string; entry: EntryRow }[] = [];
  const net = new Map<string, number>();
  for (const team of teams) {
    const numbered = numberEntries(gameweeks, team.entries);
    const before = keptEntry(numbered, gw.number);
    const mine = numbered.find((e) => e.number === gw.number);
    if (mine) {
      scored.push({ teamId: team.id, entry: mine });
      // Transfers into and out of the team this gameweek move prices.
      if (before) {
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
    carried.push({ teamId: team.id, ...copy, picks: copy.picks as Prisma.InputJsonValue });
    scored.push({ teamId: team.id, entry: copy });
  }
  if (carried.length) await prisma.fantasyEntry.createMany({ data: carried, skipDuplicates: true });

  const updates = scored.map(({ teamId, entry }) => {
    const score = scoreEntry(
      {
        playerIds: asPicks(entry.picks).map((p) => p.playerId),
        captainId: entry.captainId, viceCaptainId: entry.viceCaptainId,
        chip: chipOf(entry), transferCost: entry.transferCost,
      },
      positions, stats,
    );
    return prisma.fantasyEntry.update({
      where: { teamId_gameweekId: { teamId, gameweekId } },
      data: { points: score.total, breakdown: score as unknown as Prisma.InputJsonValue },
    });
  });
  for (let i = 0; i < updates.length; i += 50) await Promise.all(updates.slice(i, i + 50));

  // Prices move once, the first time the gameweek is scored.
  let changes: Map<string, number> | null = null;
  if (gw.priceChanges === null) {
    changes = priceChanges(net, teams.length, new Map(players.map((p) => [p.id, p.price])));
    await prisma.$transaction([
      ...[...changes].map(([id, change]) => prisma.fantasyPlayer.update({ where: { id }, data: { price: { increment: change } } })),
      prisma.fantasyGameweek.update({ where: { id: gameweekId }, data: { priceChanges: Object.fromEntries(changes) } }),
    ]);
  }

  await prisma.fantasyGameweek.update({ where: { id: gameweekId }, data: { finalizedAt: gw.finalizedAt ?? new Date() } });
  await updateStandings(gw.seasonId);
  return { teamsScored: scored.length, priceChanges: changes ? changes.size : null };
}

/** Season totals, plus each scored entry's gameweek rank, running total and overall rank. */
async function updateStandings(seasonId: string) {
  await prisma.$executeRaw`
    UPDATE "FantasyTeam" t SET "totalPoints" = s.total, "updatedAt" = NOW()
    FROM (
      SELECT e."teamId", COALESCE(SUM(e.points), 0)::int AS total
      FROM "FantasyEntry" e JOIN "FantasyGameweek" g ON g.id = e."gameweekId"
      WHERE g."seasonId" = ${seasonId} AND g."finalizedAt" IS NOT NULL
      GROUP BY e."teamId"
    ) s
    WHERE t.id = s."teamId"`;
  await prisma.$executeRaw`
    UPDATE "FantasyEntry" e SET "overallPoints" = r.cum, "overallRank" = r.overall, "gameweekRank" = r.week
    FROM (
      SELECT id, cum,
        RANK() OVER (PARTITION BY number ORDER BY cum DESC)::int AS overall,
        RANK() OVER (PARTITION BY number ORDER BY points DESC)::int AS week
      FROM (
        SELECT e.id, g.number, COALESCE(e.points, 0) AS points,
          SUM(COALESCE(e.points, 0)) OVER (PARTITION BY e."teamId" ORDER BY g.number)::int AS cum
        FROM "FantasyEntry" e JOIN "FantasyGameweek" g ON g.id = e."gameweekId"
        WHERE g."seasonId" = ${seasonId} AND g."finalizedAt" IS NOT NULL
      ) x
    ) r
    WHERE e.id = r.id`;
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
    // Each team's most recent entry (their current team).
    prisma.$queryRaw<{ picks: Pick[] }[]>`
      SELECT DISTINCT ON (e."teamId") e.picks FROM "FantasyEntry" e
      JOIN "FantasyGameweek" g ON g.id = e."gameweekId"
      WHERE g."seasonId" = ${seasonId}
      ORDER BY e."teamId", g.number DESC`,
  ]);
  const pickedBy = new Map<string, number>();
  for (const { picks } of latestPicks) for (const p of picks.slice(0, FANTASY_RULES.squadSize)) pickedBy.set(p.playerId, (pickedBy.get(p.playerId) ?? 0) + 1);
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
      selectedBy: latestPicks.length ? Math.round(((pickedBy.get(p.id) ?? 0) / latestPicks.length) * 100) : 0,
    };
  });
}

/** GET /api/fantasy: the season, its players and gameweeks, and the signed-in fan's team. */
export async function overview(userId?: string) {
  const season = await activeSeason();
  if (!season) return { season: null, gameweeks: [], nextGameweek: null, currentGameweek: null, players: [], team: null };

  const gameweeks = await prisma.fantasyGameweek.findMany({ where: { seasonId: season.id }, orderBy: { number: "asc" } });
  const [players, team] = await Promise.all([
    playerList(season.id, gameweeks),
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
  const at = (teamId: string, g?: { id: string }) => (g ? entries.find((e) => e.teamId === teamId && e.gameweekId === g.id) : undefined);

  const teams = league.members.map((m) => m.team);
  const rankBy = (score: (t: (typeof teams)[number]) => number | null) => (t: (typeof teams)[number]) => {
    const mine = score(t);
    return mine === null ? null : 1 + teams.filter((o) => (score(o) ?? -Infinity) > mine).length;
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
  return {
    league: { id: league.id, name: league.name, code: league.code, isMember: rows.some((r) => r.mine) },
    lastGameweek: finished[0]?.number ?? null,
    teams: rows,
  };
}
