/** Cage dimensions (metres). The pitch runs along x; the home side attacks +x. */
export const HALF_L = 15;
export const HALF_W = 9;
export const GOAL_HALF = 1.75;
export const GOAL_H = 1.75;
export const GOAL_DEPTH = 1.1;
export const BALL_R = 0.13;
export const POST_R = 0.06;
export const GRAVITY = 11.5;

/** x of the goal line a team attacks (team 0 attacks +x). */
export const attackX = (team: 0 | 1) => (team === 0 ? HALF_L : -HALF_L);
export const attackDir = (team: 0 | 1) => (team === 0 ? 1 : -1);
