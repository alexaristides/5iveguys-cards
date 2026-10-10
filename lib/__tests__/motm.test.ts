import { describe, expect, it } from "vitest";
import { buildSquad, isSquadCard, rankStandings, type SquadCard } from "../motm";

const card = (id: string, channelId: string, name: string, kit: string | null): SquadCard => ({
  id, channelId, name, kit, position: "ST", imageUrl: `/cards/${id}.jpg`,
});

describe("isSquadCard", () => {
  it("accepts kit cards and rejects moments and specials", () => {
    expect(isSquadCard({ kit: "Home Kit" })).toBe(true);
    expect(isSquadCard({ kit: "OG Kit" })).toBe(true);
    expect(isSquadCard({ kit: "Special" })).toBe(false);
    expect(isSquadCard({ kit: null })).toBe(false);
  });
});

describe("buildSquad", () => {
  it("lists each player once, preferring their Home Kit card", () => {
    const squad = buildSquad([
      card("camo-adrian", "5g", "Adrian", "Camo Kit"),
      card("home-adrian", "5g", "Adrian", "Home Kit"),
      card("black-adrian", "5g", "Adrian", "Black Kit"),
      card("epic-adrian", "5g", "Adrian Clamptown", null),
      card("og-jack", "og", "Jack", "OG Kit"),
      card("home-jack", "5g", "Jack", "Home Kit"),
    ]);
    expect(squad.map((p) => p.id).sort()).toEqual(["home-adrian", "home-jack", "og-jack"]);
  });
});

describe("rankStandings", () => {
  const players = buildSquad([
    card("og-sam", "og", "Sam", "OG Kit"),
    card("og-cem", "og", "Cem", "OG Kit"),
    card("home-neymar", "5g", "Neymar", "Home Kit"),
    card("home-adrian", "5g", "Adrian", "Home Kit"),
  ]);

  it("orders by votes, then home team, then name, with percentages", () => {
    const { standings, totalVotes } = rankStandings(
      players,
      [
        { playerChannelId: "5g", playerName: "Neymar", votes: 3 },
        { playerChannelId: "og", playerName: "Sam", votes: 1 },
        { playerChannelId: "og", playerName: "Gone", votes: 5 }, // no longer in the squad
      ],
      "og",
    );
    expect(totalVotes).toBe(4);
    expect(standings.map((s) => [s.name, s.votes, s.percent])).toEqual([
      ["Neymar", 3, 75],
      ["Sam", 1, 25],
      ["Cem", 0, 0],
      ["Adrian", 0, 0],
    ]);
  });

  it("handles a video with no votes", () => {
    const { standings, totalVotes } = rankStandings(players, [], "5g");
    expect(totalVotes).toBe(0);
    expect(standings[0].name).toBe("Adrian");
    expect(standings.every((s) => s.percent === 0)).toBe(true);
  });
});
