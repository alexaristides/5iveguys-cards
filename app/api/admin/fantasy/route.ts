import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { overallFromVotes, STAT_FIELDS, type StatsMap } from "@/lib/card-rating";
import { buildSquad } from "@/lib/motm";
import { EMPTY_STATS, FANTASY_RULES, playerPoints, POSITIONS, suggestPrices, toFantasyPosition, type FantasyPosition, type PlayerStats } from "@/lib/fantasy";
import { FantasyError, finalizeGameweek } from "@/lib/fantasy-db";

const isAdmin = (req: NextRequest) =>
  !!process.env.ADMIN_SECRET && req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;

/** Seasons, plus the chosen (or active) season's players and gameweeks with their stats. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const seasons = await prisma.fantasySeason.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { teams: true } } } });
  const wanted = req.nextUrl.searchParams.get("seasonId");
  const season = seasons.find((s) => s.id === wanted) ?? seasons.find((s) => s.isActive) ?? seasons[0] ?? null;
  if (!season) return NextResponse.json({ seasons: [], season: null, players: [], gameweeks: [] });

  const [players, gameweeks] = await Promise.all([
    prisma.fantasyPlayer.findMany({ where: { seasonId: season.id }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    prisma.fantasyGameweek.findMany({
      where: { seasonId: season.id },
      orderBy: { number: "asc" },
      include: { stats: true, _count: { select: { entries: true } } },
    }),
  ]);
  return NextResponse.json({
    seasons: seasons.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive, budget: s.budget, teams: s._count.teams })),
    season: { id: season.id, name: season.name, isActive: season.isActive, budget: season.budget },
    players,
    gameweeks: gameweeks.map(({ _count, ...g }) => ({ ...g, entries: _count.entries })),
  });
}

type Body = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const int = (v: unknown, min = 0) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min ? n : null;
};

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Body;
  try {
    return NextResponse.json(await handle(body));
  } catch (err) {
    if (err instanceof FantasyError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

async function handle(body: Body) {
  switch (body.action) {
    case "createSeason": {
      const name = str(body.name);
      if (!name) throw new FantasyError("Name the season.");
      const budget = int(body.budget, 1) ?? FANTASY_RULES.defaultBudget;
      // One active season at a time.
      await prisma.fantasySeason.updateMany({ where: { isActive: true }, data: { isActive: false } });
      const season = await prisma.fantasySeason.create({ data: { name, budget } });
      const imported = body.importPlayers ? await importSquad(season.id) : 0;
      return { season, imported };
    }

    case "updateSeason": {
      const id = str(body.seasonId);
      if (body.isActive === true) await prisma.fantasySeason.updateMany({ where: { isActive: true, NOT: { id } }, data: { isActive: false } });
      const season = await prisma.fantasySeason.update({
        where: { id },
        data: {
          ...(str(body.name) ? { name: str(body.name) } : {}),
          ...(int(body.budget, 1) !== null ? { budget: int(body.budget, 1)! } : {}),
          ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
        },
      });
      return { season };
    }

    case "importPlayers":
      return { imported: await importSquad(str(body.seasonId)) };

    case "savePlayer": {
      const name = str(body.name);
      const position = str(body.position) as FantasyPosition;
      const price = int(body.price, 1);
      if (!name || !POSITIONS.includes(position) || price === null) throw new FantasyError("A player needs a name, position and price.");
      const data = { name, position, price, imageUrl: str(body.imageUrl) || null, isActive: body.isActive !== false };
      const player = body.id
        ? await prisma.fantasyPlayer.update({ where: { id: str(body.id) }, data })
        : await prisma.fantasyPlayer.create({ data: { ...data, seasonId: str(body.seasonId) } });
      return { player };
    }

    case "saveGameweek": {
      const number = int(body.number, 1);
      const deadline = new Date(str(body.deadline));
      if (number === null || Number.isNaN(deadline.getTime())) throw new FantasyError("A gameweek needs a number and a deadline.");
      const data = { number, name: str(body.name) || null, deadline };
      const gameweek = body.id
        ? await prisma.fantasyGameweek.update({ where: { id: str(body.id) }, data })
        : await prisma.fantasyGameweek.create({ data: { ...data, seasonId: str(body.seasonId) } });
      return { gameweek };
    }

    case "deleteGameweek": {
      const id = str(body.id);
      if (await prisma.fantasyEntry.count({ where: { gameweekId: id } })) {
        throw new FantasyError("Fans have already picked teams for this gameweek — change its deadline instead.");
      }
      await prisma.fantasyGameweek.delete({ where: { id } });
      return { ok: true };
    }

    case "saveStats": {
      const gameweekId = str(body.gameweekId);
      const gw = await prisma.fantasyGameweek.findUnique({ where: { id: gameweekId } });
      if (!gw) throw new FantasyError("Gameweek not found.", 404);
      const rows = Array.isArray(body.stats) ? (body.stats as Body[]) : [];
      const players = new Map(
        (await prisma.fantasyPlayer.findMany({ where: { seasonId: gw.seasonId } })).map((p) => [p.id, p]),
      );
      for (const row of rows) {
        const player = players.get(str(row.playerId));
        if (!player) throw new FantasyError("Unknown player in stats.");
        const stats = parseStats(row);
        const data = { ...stats, points: playerPoints(stats, player.position as FantasyPosition) };
        await prisma.fantasyPlayerStats.upsert({
          where: { gameweekId_playerId: { gameweekId, playerId: player.id } },
          create: { gameweekId, playerId: player.id, ...data },
          update: data,
        });
      }
      // Corrections to a scored gameweek re-score it straight away.
      const rescored = gw.finalizedAt ? await finalizeGameweek(gameweekId) : null;
      return { saved: rows.length, rescored };
    }

    case "finalize":
      return finalizeGameweek(str(body.gameweekId));

    default:
      throw new FantasyError("Unknown action.");
  }
}

function parseStats(row: Body): PlayerStats {
  const count = (k: keyof PlayerStats) => {
    const n = int(row[k]);
    if (n === null) throw new FantasyError(`Invalid ${k}.`);
    return n;
  };
  const bonus = Number(row.bonus ?? 0);
  if (!Number.isInteger(bonus)) throw new FantasyError("Invalid bonus.");
  return {
    ...EMPTY_STATS,
    played: row.played === true,
    goals: count("goals"),
    assists: count("assists"),
    cleanSheet: row.cleanSheet === true,
    yellowCards: count("yellowCards"),
    redCard: row.redCard === true,
    ownGoals: count("ownGoals"),
    penaltySaves: count("penaltySaves"),
    penaltyMisses: count("penaltyMisses"),
    motm: row.motm === true,
    bonus,
  };
}

/** Seed a season's players from the 5ive Guys kit cards, priced from the fans' card ratings. */
async function importSquad(seasonId: string) {
  const channel = await prisma.channel.findUnique({ where: { slug: "5iveguysfc" }, select: { id: true } });
  if (!channel) throw new FantasyError("5iveguysfc channel not found.", 404);
  const cards = await prisma.card.findMany({
    where: { channelId: channel.id, kit: { endsWith: "Kit" } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, channelId: true, name: true, kit: true, position: true, imageUrl: true,
      votes: { select: Object.fromEntries(STAT_FIELDS.map((f) => [f, true])) as Record<(typeof STAT_FIELDS)[number], true> },
    },
  });
  const existing = new Set((await prisma.fantasyPlayer.findMany({ where: { seasonId }, select: { name: true } })).map((p) => p.name));
  const squad = buildSquad(cards).filter((p) => !existing.has(p.name));

  const ratings = squad.map((p) => {
    const rated = cards.filter((c) => c.name === p.name && c.votes.length);
    const overall = rated.length
      ? rated.reduce((sum, c) => sum + overallFromVotes(c.votes as StatsMap[], c.position), 0) / rated.length
      : null;
    return { id: p.id, overall };
  });
  const prices = suggestPrices(ratings);

  await prisma.fantasyPlayer.createMany({
    data: squad.map((p) => ({
      seasonId, name: p.name, position: toFantasyPosition(p.position), price: prices.get(p.id)!, imageUrl: p.imageUrl,
    })),
  });
  return squad.length;
}
