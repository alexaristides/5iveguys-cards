import { describe, expect, it } from "vitest";
import seedrandom from "seedrandom";
import {
  cardPlayer, drawPlayerPack, formatMilli, formatPence, guaranteedOdds, otherCardOdds, PLAYER_PACK, playerCards,
  squadNames, summariseEarnings,
} from "../player-packs";

const card = (id: string, name: string, kit: string | null, rarity: string) => ({ id, name, kit, rarity });

const POOL = [
  card("home-ryan", "Ryan", "Home Kit", "common"),
  card("black-ryan", "Ryan", "Black Kit", "common"),
  card("camo-ryan", "Ryan", "Camo Kit", "common"),
  card("home-louis", "Louis", "Home Kit", "common"),
  card("louis-bdo", "Louis Ballon d'Or", "Special", "rare"),
  card("home-adrian", "Adrian", "Home Kit", "common"),
  card("adrian-clamp", "Adrian Clamptown", null, "epic"),
  card("adrian-clamp-gold", "Adrian Clamptown", null, "legendary"),
  card("home-neymar", "Neymar", "Home Kit", "common"),
  card("kid-neymar", "Kid Neymar Farewell", null, "epic"),
  card("trophy", "Div 1 Trophy", null, "epic"),
];

describe("whose card", () => {
  const squad = squadNames(POOL);

  it("lists the squad once per player from kit cards", () => {
    expect(squad).toEqual(["Adrian", "Louis", "Neymar", "Ryan"]);
  });

  it("gives kit cards and cards named after a player to that player", () => {
    expect(cardPlayer(POOL[1], squad)).toBe("Ryan");
    expect(cardPlayer(POOL[4], squad)).toBe("Louis");
    expect(cardPlayer(POOL[6], squad)).toBe("Adrian");
  });

  it("leaves team moments and other names alone", () => {
    expect(cardPlayer(POOL[10], squad)).toBeNull();
    expect(cardPlayer(POOL[9], squad)).toBeNull(); // "Kid Neymar…" isn't Neymar's
  });

  it("collects a player's cards", () => {
    expect(playerCards(POOL, "Ryan").map((c) => c.id)).toEqual(["home-ryan", "black-ryan", "camo-ryan"]);
    expect(playerCards(POOL, "Adrian").map((c) => c.id)).toEqual(["home-adrian", "adrian-clamp", "adrian-clamp-gold"]);
    expect(playerCards(POOL, "Nobody")).toEqual([]);
  });
});

describe("odds", () => {
  it("are the pack odds among the rarities the player has", () => {
    expect(guaranteedOdds(playerCards(POOL, "Ryan"))).toEqual({ common: 100, rare: 0, epic: 0, legendary: 0 });
    // 60 : 12 : 3 of 75
    expect(guaranteedOdds(playerCards(POOL, "Adrian"))).toEqual({ common: 80, rare: 0, epic: 16, legendary: 4 });
  });

  it("turn a rarity the team hasn't got into commons for the other cards", () => {
    expect(otherCardOdds(POOL)).toEqual(PLAYER_PACK.odds);
    const noLegends = POOL.filter((c) => c.rarity !== "legendary");
    expect(otherCardOdds(noLegends)).toEqual({ common: 63, rare: 25, epic: 12, legendary: 0 });
  });

  it("add up to 100", () => {
    for (const odds of [guaranteedOdds(playerCards(POOL, "Louis")), otherCardOdds(POOL)]) {
      expect(Object.values(odds).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    }
  });
});

describe("drawing a pack", () => {
  it("has 5 cards with the player's card last", () => {
    const rng = seedrandom("ryan");
    for (let i = 0; i < 200; i++) {
      const pack = drawPlayerPack(POOL, "Ryan", rng);
      expect(pack).toHaveLength(PLAYER_PACK.cardCount);
      expect(["home-ryan", "black-ryan", "camo-ryan"]).toContain(pack[4].id);
    }
  });

  it("follows the odds", () => {
    const rng = seedrandom("odds");
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const guaranteed: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const pack = drawPlayerPack(POOL, "Adrian", rng);
      for (const c of pack.slice(0, 4)) counts[c.rarity]++;
      guaranteed[pack[4].rarity]++;
    }
    expect(counts.common / (n * 4)).toBeCloseTo(0.6, 1);
    expect(counts.rare / (n * 4)).toBeCloseTo(0.25, 1);
    expect(counts.legendary / (n * 4)).toBeCloseTo(0.03, 1);
    expect(guaranteed.epic / n).toBeCloseTo(0.16, 1);
    expect(guaranteed.legendary / n).toBeCloseTo(0.04, 1);
  });

  it("refuses a player with no cards", () => {
    expect(() => drawPlayerPack(POOL, "Nobody")).toThrow();
  });
});

describe("money", () => {
  it("formats pence and App Store prices", () => {
    expect(formatPence(100)).toBe("£1.00");
    expect(formatPence(1250)).toBe("£12.50");
    expect(formatPence(-300)).toBe("−£3.00");
    expect(formatPence(100, { short: true })).toBe("£1");
    expect(formatPence(150, { short: true })).toBe("£1.50");
    expect(formatMilli(7990, "GBP")).toBe("£7.99");
    expect(formatMilli(7990, "USD")).toBe("US$7.99");
  });

  it("sums each player's earnings, refunds and payouts", () => {
    const sale = (playerName: string | null, status: string, channelId = "c1") => ({ channelId, playerName, status, playerSharePence: 100 });
    const rows = summariseEarnings(
      [sale("Ryan", "paid"), sale("Ryan", "opened"), sale("Ryan", "refunded"), sale("Louis", "opened"), sale(null, "paid"), sale("Ryan", "pending"), sale("Ryan", "opened", "c2")],
      [{ channelId: "c1", playerName: "Ryan", amountPence: 100 }, { channelId: "c1", playerName: "Theo", amountPence: 50 }],
    );
    expect(rows.find((r) => r.channelId === "c1" && r.playerName === "Ryan")).toMatchObject({ packs: 2, refunded: 1, earnedPence: 200, paidOutPence: 100, owedPence: 100 });
    expect(rows.find((r) => r.playerName === "Louis")).toMatchObject({ packs: 1, owedPence: 100 });
    expect(rows.find((r) => r.channelId === "c2")).toMatchObject({ packs: 1, owedPence: 100 });
    expect(rows.find((r) => r.playerName === "Theo")).toMatchObject({ packs: 0, owedPence: -50 });
  });
});
