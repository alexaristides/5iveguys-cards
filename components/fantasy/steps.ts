import { FANTASY_RULES } from "@/lib/fantasy";

/** The whole game in four steps, as in the app (mobile/src/components/fantasy/HowItWorks.tsx). */
export const STEPS = [
  { emoji: "👕", title: `Pick ${FANTASY_RULES.squadSize} players`, body: FANTASY_RULES.prices ? "Any of the 5ive Guys, within your budget." : "Any of the 5ive Guys. No prices, no budget." },
  { emoji: "⭐", title: "Choose a captain", body: "Your captain scores double points." },
  { emoji: "⚽", title: "Score points", body: "Goals, assists, clean sheets and more, from our real matches." },
  { emoji: "🏆", title: "Beat your mates", body: "Start a league and share the code." },
];
