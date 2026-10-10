/**
 * Man of the Match voting: who can be voted for on a video, and the standings.
 * Pure (no Prisma/Next imports) so it can be unit-tested and shared.
 */

export interface SquadCard {
  id: string;
  channelId: string;
  name: string;
  kit: string | null;
  position: string | null;
  imageUrl: string;
}

export interface MotmPlayer {
  /** One of the player's cards. Any of their cards identifies them when voting. */
  id: string;
  name: string;
  position: string | null;
  imageUrl: string;
  channelId: string;
}

export interface MotmStanding extends MotmPlayer {
  votes: number;
  /** Share of all counted votes, 0–100, rounded. */
  percent: number;
}

export interface MotmTally {
  playerChannelId: string;
  playerName: string;
  votes: number;
}

/** Kit cards ("Home Kit", "OG Kit"…) are the squad; moments and special editions aren't players. */
export function isSquadCard(card: { kit: string | null }): boolean {
  return !!card.kit && /\bKit$/.test(card.kit);
}

export const playerKey = (channelId: string, name: string) => `${channelId}:${name}`;

/** One entry per player (team + name), shown with their Home Kit card when they have one. */
export function buildSquad(cards: SquadCard[]): MotmPlayer[] {
  const byPlayer = new Map<string, SquadCard>();
  for (const card of cards) {
    if (!isSquadCard(card)) continue;
    const key = playerKey(card.channelId, card.name);
    const current = byPlayer.get(key);
    if (!current || (card.kit === "Home Kit" && current.kit !== "Home Kit")) byPlayer.set(key, card);
  }
  return [...byPlayer.values()].map(({ id, name, position, imageUrl, channelId }) => ({
    id, name, position, imageUrl, channelId,
  }));
}

/**
 * Every squad player with their votes, most votes first. Ties go to the video's own team,
 * then by name. Votes for players no longer in a squad are ignored.
 */
export function rankStandings(players: MotmPlayer[], tally: MotmTally[], homeChannelId: string) {
  const votesByPlayer = new Map(tally.map((t) => [playerKey(t.playerChannelId, t.playerName), t.votes]));
  const counted = players.map((p) => ({ ...p, votes: votesByPlayer.get(playerKey(p.channelId, p.name)) ?? 0 }));
  const totalVotes = counted.reduce((sum, p) => sum + p.votes, 0);

  const standings: MotmStanding[] = counted
    .map((p) => ({ ...p, percent: totalVotes ? Math.round((p.votes / totalVotes) * 100) : 0 }))
    .sort((a, b) =>
      b.votes - a.votes ||
      Number(b.channelId === homeChannelId) - Number(a.channelId === homeChannelId) ||
      a.name.localeCompare(b.name),
    );

  return { standings, totalVotes };
}
