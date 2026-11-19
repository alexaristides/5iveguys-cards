export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const PUSHER_KEY = process.env.EXPO_PUBLIC_PUSHER_KEY ?? "";
export const PUSHER_CLUSTER = process.env.EXPO_PUBLIC_PUSHER_CLUSTER ?? "";

/** Channels the app covers. Add a slug here to add a channel. */
export const CHANNELS = [
  { slug: "5iveguysfc", name: "5ive Guys" },
  { slug: "OGFC", name: "Other Guys" },
] as const;

export type ChannelSlug = (typeof CHANNELS)[number]["slug"];

export const PRIVACY_URL = `${API_URL}/privacy`;
export const TERMS_URL = `${API_URL}/terms`;
export const SUPPORT_URL = `${API_URL}/support`;

/**
 * Features held back from the App Store release. Set one to true to bring it back.
 * `packs` = packs bought with points; `shop` = player packs bought with real money (In-App Purchase)
 * plus the Cards tab's collection.
 */
export const FEATURES = { packs: false, shop: true, fantasy: true, game: true, street: true } as const;
