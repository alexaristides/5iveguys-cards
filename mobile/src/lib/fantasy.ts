import { API_URL } from "./config";

export * from "@shared/fantasy-lineup";
export { formatCountdown, formatDeadline } from "@shared/fantasy";

/** What "Invite friends" shares: the code, and a link that also works without the app. */
export const inviteMessage = (league: { name: string; code: string }) =>
  `Join my Fantasy Div 1 league "${league.name}" on 5iveG — code ${league.code}\n${API_URL}/fantasy/join/${league.code}`;
