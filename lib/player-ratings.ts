/**
 * The squad with its fan ratings, for the app's Players tab. Pure (no Prisma/Next imports)
 * so it can be unit-tested and shared with the app.
 *
 * A player is rated on their squad card (Home Kit when they have one, see `buildSquad`), the
 * same card the website, 5IVE STREET and the old Players tab use, so every vote lands in one pool.
 */
import { computeOverall, STAT_FIELDS, type StatsMap } from "./card-rating";
import { buildSquad, type SquadCard } from "./motm";

export interface SquadRating {
  /** The squad card the votes are on: `/api/cards/{cardId}/votes`. */
  cardId: string;
  name: string;
  position: string | null;
  imageUrl: string;
  /** Position-weighted overall from the fans' average, or null before anyone has rated them. */
  overall: number | null;
  voteCount: number;
  /** The signed-in fan has rated this player. */
  rated: boolean;
  /** Same player in the active fantasy season, matched by name. */
  fantasyPlayerId: string | null;
}

export type CardVoteRow = StatsMap & { cardId: string; userId: string };

const nameKey = (name: string) => name.trim().toLowerCase();

/** Every squad player with their fan rating: best rated first, unrated players last, then by name. */
export function squadRatings(
  cards: SquadCard[],
  votes: CardVoteRow[],
  userId: string | null,
  fantasyPlayers: { id: string; name: string }[] = [],
): SquadRating[] {
  const votesByCard = new Map<string, CardVoteRow[]>();
  for (const v of votes) {
    const list = votesByCard.get(v.cardId);
    if (list) list.push(v);
    else votesByCard.set(v.cardId, [v]);
  }
  const fantasyByName = new Map(fantasyPlayers.map((p) => [nameKey(p.name), p.id]));

  return buildSquad(cards)
    .map((p) => {
      const list = votesByCard.get(p.id) ?? [];
      let overall: number | null = null;
      if (list.length) {
        const avg = {} as StatsMap;
        for (const f of STAT_FIELDS) avg[f] = list.reduce((s, v) => s + v[f], 0) / list.length;
        overall = computeOverall(avg, p.position);
      }
      return {
        cardId: p.id,
        name: p.name,
        position: p.position,
        imageUrl: p.imageUrl,
        overall,
        voteCount: list.length,
        rated: !!userId && list.some((v) => v.userId === userId),
        fantasyPlayerId: fantasyByName.get(nameKey(p.name)) ?? null,
      };
    })
    .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1) || a.name.localeCompare(b.name));
}
