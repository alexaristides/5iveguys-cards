"use client";

import Image from "next/image";
import { CARDS_BY_ID, type Attribute, type Rarity } from "@/lib/cards";
import { type MatchResults } from "@/lib/battles";

const RARITY_STYLES: Record<Rarity, string> = {
  common:    "border-zinc-600",
  rare:      "border-blue-400",
  epic:      "border-purple-400",
  legendary: "border-amber-400",
};

const ATTR_STYLES: Record<Attribute, { dot: string; text: string }> = {
  Pace:  { dot: "bg-blue-400",  text: "text-blue-400" },
  Power: { dot: "bg-red-400",   text: "text-red-400" },
  Skill: { dot: "bg-green-400", text: "text-green-400" },
};

interface BattleReportProps {
  matchResults: MatchResults;
  winnerId: string | null;
  currentUserId: string;
  challengerId: string;
  pot: number;
  tie: boolean;
  onDismiss: () => void;
}

export default function BattleReport({
  matchResults,
  winnerId,
  currentUserId,
  challengerId,
  pot,
  tie,
  onDismiss,
}: BattleReportProps) {
  const iWon = !tie && winnerId === currentUserId;
  const iLost = !tie && winnerId !== null && winnerId !== currentUserId;

  const headline = tie
    ? { icon: "🤝", text: "Tie — wagers refunded", cls: "text-zinc-300" }
    : iWon
    ? { icon: "🏆", text: `You won ${pot.toLocaleString()} pts!`, cls: "text-green-400" }
    : { icon: "💀", text: "You lost — better luck next time", cls: "text-red-400" };

  // Determine which side the current user is on for labelling
  const isChallenger = currentUserId === challengerId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Headline */}
        <div className="text-center px-6 pt-6 pb-4 border-b border-zinc-800">
          <div className="text-4xl mb-2">{headline.icon}</div>
          <p className={`font-bold text-lg ${headline.cls}`}>{headline.text}</p>

          {/* Score */}
          <div className="flex items-center justify-center gap-4 mt-3">
            <div className="text-right">
              <p className="text-zinc-500 text-xs mb-0.5">{isChallenger ? "You" : "Challenger"}</p>
              <p className={`text-3xl font-black ${matchResults.challengerWins >= 2 ? "text-green-400" : "text-zinc-500"}`}>
                {matchResults.challengerWins}
              </p>
            </div>
            <span className="text-zinc-700 text-2xl font-light">–</span>
            <div className="text-left">
              <p className="text-zinc-500 text-xs mb-0.5">{!isChallenger ? "You" : "Opponent"}</p>
              <p className={`text-3xl font-black ${matchResults.acceptorWins >= 2 ? "text-green-400" : "text-zinc-500"}`}>
                {matchResults.acceptorWins}
              </p>
            </div>
          </div>
        </div>

        {/* Round-by-round breakdown */}
        <div className="p-4 space-y-3">
          {matchResults.rounds.map((round) => {
            const cCard = CARDS_BY_ID[round.challengerCardId];
            const aCard = CARDS_BY_ID[round.acceptorCardId];
            const cAttr = ATTR_STYLES[round.challengerAttribute];
            const aAttr = ATTR_STYLES[round.acceptorAttribute];
            const roundWon = round.roundWinner;

            return (
              <div
                key={round.round}
                className="bg-zinc-800/60 rounded-xl border border-zinc-700/40 overflow-hidden"
              >
                {/* Round header */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700/40">
                  <span className="text-zinc-400 text-xs font-medium">Round {round.round}</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      roundWon === "tie"
                        ? "bg-zinc-700 text-zinc-300"
                        : roundWon === "challenger"
                        ? isChallenger ? "bg-green-900/60 text-green-400" : "bg-red-900/60 text-red-400"
                        : !isChallenger ? "bg-green-900/60 text-green-400" : "bg-red-900/60 text-red-400"
                    }`}
                  >
                    {roundWon === "tie" ? "Tie" : roundWon === "challenger"
                      ? (isChallenger ? "You win" : "They win")
                      : (!isChallenger ? "You win" : "They win")}
                  </span>
                </div>

                {/* Cards side by side */}
                <div className="flex items-stretch divide-x divide-zinc-700/40">
                  {/* Challenger side */}
                  <div className={`flex-1 flex flex-col items-center gap-2 p-3 ${roundWon === "challenger" ? "bg-green-900/10" : roundWon === "tie" ? "" : "bg-red-900/10"}`}>
                    {cCard && (
                      <>
                        <div className={`relative w-14 h-20 rounded-lg overflow-hidden border-2 shrink-0 ${RARITY_STYLES[cCard.rarity]}`}>
                          <Image src={cCard.image} alt={cCard.name} fill className="object-cover" sizes="56px" />
                        </div>
                        <div className="text-center">
                          <p className="text-zinc-300 text-xs font-medium leading-tight">{cCard.name}</p>
                          <div className="flex items-center justify-center gap-1 mt-0.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${cAttr.dot}`} />
                            <span className={`text-[10px] ${cAttr.text}`}>{round.challengerAttribute}</span>
                          </div>
                        </div>
                        {round.challengerHasAdvantage && (
                          <span className="text-yellow-400 text-[10px] font-bold">⚡ +50%</span>
                        )}
                        <div className="text-center">
                          {round.challengerHasAdvantage ? (
                            <p className="text-white text-sm font-bold">
                              <span className="text-zinc-500 text-xs font-normal">{round.challengerBaseRoll} × 1.5 = </span>
                              {round.challengerFinalRoll}
                            </p>
                          ) : (
                            <p className="text-white text-sm font-bold">{round.challengerFinalRoll}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* VS divider */}
                  <div className="flex items-center px-2">
                    <span className="text-zinc-600 text-xs font-bold">vs</span>
                  </div>

                  {/* Acceptor side */}
                  <div className={`flex-1 flex flex-col items-center gap-2 p-3 ${roundWon === "acceptor" ? "bg-green-900/10" : roundWon === "tie" ? "" : "bg-red-900/10"}`}>
                    {aCard && (
                      <>
                        <div className={`relative w-14 h-20 rounded-lg overflow-hidden border-2 shrink-0 ${RARITY_STYLES[aCard.rarity]}`}>
                          <Image src={aCard.image} alt={aCard.name} fill className="object-cover" sizes="56px" />
                        </div>
                        <div className="text-center">
                          <p className="text-zinc-300 text-xs font-medium leading-tight">{aCard.name}</p>
                          <div className="flex items-center justify-center gap-1 mt-0.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${aAttr.dot}`} />
                            <span className={`text-[10px] ${aAttr.text}`}>{round.acceptorAttribute}</span>
                          </div>
                        </div>
                        {round.acceptorHasAdvantage && (
                          <span className="text-yellow-400 text-[10px] font-bold">⚡ +50%</span>
                        )}
                        <div className="text-center">
                          {round.acceptorHasAdvantage ? (
                            <p className="text-white text-sm font-bold">
                              <span className="text-zinc-500 text-xs font-normal">{round.acceptorBaseRoll} × 1.5 = </span>
                              {round.acceptorFinalRoll}
                            </p>
                          ) : (
                            <p className="text-white text-sm font-bold">{round.acceptorFinalRoll}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dismiss */}
        <div className="px-5 pb-5 pt-2">
          <button
            onClick={onDismiss}
            className="w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 text-sm font-medium transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
