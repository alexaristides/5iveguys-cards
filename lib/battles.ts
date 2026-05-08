import { type Attribute, type Rarity, CAP_COSTS, CARDS_BY_ID, SALARY_CAP } from "./cards";

export type { Attribute };
export { CAP_COSTS, SALARY_CAP };

export const ROLL_RANGES: Record<Rarity, [number, number]> = {
  common:    [1,  10],
  rare:      [11, 25],
  epic:      [26, 50],
  legendary: [51, 100],
};

// Pace beats Power, Power beats Skill, Skill beats Pace
export const BEATS: Record<Attribute, Attribute> = {
  Pace:  "Power",
  Power: "Skill",
  Skill: "Pace",
};

export const MIN_WAGER = 10;

export function rollForRarity(rarity: Rarity): number {
  const [min, max] = ROLL_RANGES[rarity];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export type BattleStatus = "PENDING" | "RESOLVED" | "CANCELLED";

export interface BattleChallenger {
  id: string;
  name: string | null;
  image: string | null;
}

// Challenger's cards are intentionally absent — blind wager mechanic
export interface BattleEntry {
  id: string;
  challengerId: string;
  challenger: BattleChallenger;
  wager: number;
  createdAt: string;
  status: BattleStatus;
}

export interface RoundResult {
  round: number;
  challengerCardId: string;
  acceptorCardId: string;
  challengerAttribute: Attribute;
  acceptorAttribute: Attribute;
  challengerBaseRoll: number;
  acceptorBaseRoll: number;
  challengerHasAdvantage: boolean;
  acceptorHasAdvantage: boolean;
  challengerFinalRoll: number;
  acceptorFinalRoll: number;
  roundWinner: "challenger" | "acceptor" | "tie";
}

export interface MatchResults {
  rounds: RoundResult[];
  challengerWins: number;
  acceptorWins: number;
  overallWinner: "challenger" | "acceptor" | "tie";
}

export interface ResolvedBattle {
  winnerId: string | null;
  matchResults: MatchResults;
  pot: number;
  tie: boolean;
  remainingPoints: number;
}

export function resolveMatch(
  challengerCardIds: string[],
  acceptorCardIds: string[],
): MatchResults {
  const rounds: RoundResult[] = [];
  let challengerWins = 0;
  let acceptorWins = 0;

  for (let i = 0; i < 3; i++) {
    const cCard = CARDS_BY_ID[challengerCardIds[i]];
    const aCard = CARDS_BY_ID[acceptorCardIds[i]];

    const cBase = rollForRarity(cCard.rarity);
    const aBase = rollForRarity(aCard.rarity);

    const cAdv = BEATS[cCard.attribute] === aCard.attribute;
    const aAdv = BEATS[aCard.attribute] === cCard.attribute;

    const cFinal = cAdv ? Math.floor(cBase * 1.5) : cBase;
    const aFinal = aAdv ? Math.floor(aBase * 1.5) : aBase;

    const roundWinner: RoundResult["roundWinner"] =
      cFinal > aFinal ? "challenger" : aFinal > cFinal ? "acceptor" : "tie";

    if (roundWinner === "challenger") challengerWins++;
    else if (roundWinner === "acceptor") acceptorWins++;

    rounds.push({
      round: i + 1,
      challengerCardId: challengerCardIds[i],
      acceptorCardId: acceptorCardIds[i],
      challengerAttribute: cCard.attribute,
      acceptorAttribute: aCard.attribute,
      challengerBaseRoll: cBase,
      acceptorBaseRoll: aBase,
      challengerHasAdvantage: cAdv,
      acceptorHasAdvantage: aAdv,
      challengerFinalRoll: cFinal,
      acceptorFinalRoll: aFinal,
      roundWinner,
    });
  }

  const overallWinner: MatchResults["overallWinner"] =
    challengerWins >= 2 ? "challenger" : acceptorWins >= 2 ? "acceptor" : "tie";

  return { rounds, challengerWins, acceptorWins, overallWinner };
}
