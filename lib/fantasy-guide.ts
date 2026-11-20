/**
 * Fantasy Div 1 — the "How it works" copy, built from the rules so the website and the app
 * always explain the numbers the game actually uses. Pure TypeScript.
 */
import { CHIPS, FANTASY_POINTS as P, FANTASY_RULES as R, formatPrice } from "./fantasy";

/** "+3" or "−2" (a real minus sign). */
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

export function fantasyGuide(season: { budget: number; secondHalfFrom: number | null }) {
  const sections: { title: string; body: string }[] = [
    {
      title: "Your team",
      body: (R.prices ? `Pick 7 of the 5ive Guys with a ${formatPrice(season.budget)} budget ` : "Pick any 7 of the 5ive Guys (there are no prices) ")
        + "and play them wherever you like: 1 in goal, 2–4 in defence, 1–3 in midfield and 1–3 up front. "
        + "Everyone scores as the position you put them in, so a forward in defence gets a defender's points. "
        + "It's 7-a-side, so there's no bench: all 7 play. Your team locks at each gameweek's deadline.",
    },
    {
      title: "Captain",
      body: "Your captain scores double points. If they don't play, your vice-captain wears the armband instead.",
    },
    {
      title: "Transfers",
      body: `Change your team as much as you like until your first deadline. After that you get ${R.freeTransfersPerWeek} free transfer a gameweek, `
        + `and unused ones are saved (up to ${R.maxFreeTransfers}). Every extra transfer costs ${R.transferCost} points.`,
    },
    ...(R.prices ? [{
      title: "Prices",
      body: `Prices go up and down by up to ${formatPrice(R.maxPriceChange)} a gameweek as fans transfer players in and out. `
        + "When you sell, you get what you paid plus half of any rise (or the lower price if they've dropped).",
    }] : []),
    {
      title: "Chips",
      body: (season.secondHalfFrom
        ? `Each chip can be played once before gameweek ${season.secondHalfFrom} and once more from then on.`
        : "Each chip can be played once a season.") + " Only one chip a gameweek.",
    },
    {
      title: "Bonus points",
      body: "After every match the three best performers, by Fantasy Premier League's Bonus Points System, get 3, 2 and 1 extra points.",
    },
    {
      title: "Leagues",
      body: "Everyone plays in the overall league. Start a private league and share its code to take on your mates.",
    },
  ];

  const scoring: { label: string; points: string }[] = [
    { label: "Played", points: `+${P.appearance}` },
    { label: "Played most of the match (FPL's 60 mins)", points: `+${P.appearanceLong}` },
    { label: "Goal", points: `GK +${P.goal.GK} · DEF +${P.goal.DEF} · MID +${P.goal.MID} · FWD +${P.goal.FWD}` },
    { label: "Assist", points: `+${P.assist}` },
    { label: "Clean sheet (most of the match)", points: `GK/DEF +${P.cleanSheet.GK} · MID +${P.cleanSheet.MID}` },
    { label: `Every ${P.savesPerPoint} saves`, points: "+1" },
    { label: "Penalty save", points: `+${P.penaltySave}` },
    { label: `Defensive contributions (DEF ${P.defensiveThreshold.DEF}, MID/FWD ${P.defensiveThreshold.MID})`, points: `+${P.defensiveContribution}` },
    { label: "Bonus", points: `+${P.bonus.at(-1)} to +${P.bonus[0]}` },
    { label: `Every ${P.goalsConcededPerPoint} goals conceded (GK/DEF)`, points: "−1" },
    { label: "Penalty miss", points: signed(P.penaltyMiss) },
    { label: "Yellow card", points: signed(P.yellowCard) },
    { label: "Red card", points: signed(P.redCard) },
    { label: "Own goal", points: signed(P.ownGoal) },
  ];

  return { sections, chips: CHIPS, scoring };
}
