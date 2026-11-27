export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export const PRIVACY_URL = `${API_URL}/privacy`;
export const TERMS_URL = `${API_URL}/terms`;
export const SUPPORT_URL = `${API_URL}/support`;

/** The team whose videos the MOTM tab lists. */
export const MOTM_CHANNEL = "5iveguysfc";
