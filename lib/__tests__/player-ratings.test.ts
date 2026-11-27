import { describe, expect, it } from "vitest";
import { STAT_FIELDS, type StatsMap } from "../card-rating";
import type { SquadCard } from "../motm";
import { squadRatings, type CardVoteRow } from "../player-ratings";

const card = (id: string, name: string, kit: string | null, position: string | null = "ST"): SquadCard =>
  ({ id, channelId: "c1", name, kit, position, imageUrl: `/cards/${id}.jpg` });

const flat = (n: number): StatsMap => Object.fromEntries(STAT_FIELDS.map((f) => [f, n])) as StatsMap;
const vote = (cardId: string, userId: string, n: number): CardVoteRow => ({ ...flat(n), cardId, userId });

describe("squadRatings", () => {
  const cards = [
    card("milo-away", "Milo", "Away Kit"),
    card("milo-home", "Milo", "Home Kit"),
    card("theo-home", "Theo", "Home Kit", "GK"),
    card("ana-home", "Ana", "Home Kit"),
    card("moment", "Milo", "Goal of the Season"), // not a squad card
  ];

  it("lists one entry per player on their Home Kit card", () => {
    const rows = squadRatings(cards, [], null);
    expect(rows.map((r) => r.cardId).sort()).toEqual(["ana-home", "milo-home", "theo-home"]);
  });

  it("averages the votes into a position-weighted overall, best first, unrated last", () => {
    const rows = squadRatings(cards, [
      vote("milo-home", "u1", 60), vote("milo-home", "u2", 80), // avg 70
      vote("theo-home", "u1", 90),
      vote("milo-away", "u1", 10), // a vote on another of Milo's cards doesn't count
    ], null);
    expect(rows.map((r) => [r.name, r.overall, r.voteCount])).toEqual([
      ["Theo", 90, 1],
      ["Milo", 70, 2],
      ["Ana", null, 0],
    ]);
  });

  it("flags the players the signed-in fan has rated", () => {
    const votes = [vote("milo-home", "me", 50), vote("ana-home", "someone", 50)];
    const rows = squadRatings(cards, votes, "me");
    expect(Object.fromEntries(rows.map((r) => [r.name, r.rated]))).toEqual({ Milo: true, Ana: false, Theo: false });
    expect(squadRatings(cards, votes, null).some((r) => r.rated)).toBe(false);
  });

  it("matches fantasy players by name, ignoring case and spaces", () => {
    const rows = squadRatings(cards, [], null, [{ id: "f-milo", name: " milo " }, { id: "f-zed", name: "Zed" }]);
    expect(Object.fromEntries(rows.map((r) => [r.name, r.fantasyPlayerId]))).toEqual({ Milo: "f-milo", Theo: null, Ana: null });
  });
});
