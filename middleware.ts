import { NextResponse, type NextRequest } from "next/server";

// The iOS app authenticates with `Authorization: Bearer <sessionToken>`, where
// the token is a real NextAuth database Session row (see lib/mobile-auth.ts).
// Re-expose it as the NextAuth session cookie so every existing route's
// getServerSession(authOptions) works unchanged. The Bearer token wins over any
// session cookie the native HTTP stack may have kept from an earlier sign-in.
const SESSION_COOKIES = ["next-auth.session-token", "__Secure-next-auth.session-token"];

export function middleware(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.next();

  const token = auth.slice("Bearer ".length).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.next();

  const kept = req.cookies
    .getAll()
    .filter((c) => !SESSION_COOKIES.includes(c.name))
    .map((c) => `${c.name}=${c.value}`);
  const injected = SESSION_COOKIES.map((name) => `${name}=${token}`);

  const headers = new Headers(req.headers);
  headers.set("cookie", [...kept, ...injected].join("; "));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
