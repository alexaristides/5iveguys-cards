import { API_URL } from "./config";

/** Card art is stored as site-relative paths ("/cards/home/X.jpg") or full URLs. */
export function imageUri(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}
