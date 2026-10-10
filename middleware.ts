import { NextResponse, type NextRequest } from "next/server";

// The iOS app authenticates with `Authorization: Bearer <sessionToken>`, where
// the token is a real NextAuth database Session row (see lib/mobile-auth.ts).
// Re-expose it as the NextAuth session cookie so every existing route's
// getServerSession(authOptions) works unchanged.
const SESSION_COOKIES = ["next-auth.session-token", "__Secure-next-auth.session-token"];

export function middleware(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.next();
  if (SESSION_COOKIES.some((name) => req.cookies.has(name))) return NextResponse.next();

  const token = auth.slice("Bearer ".length).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.next();

  const headers = new Headers(req.headers);
  const existing = headers.get("cookie");
  const injected = SESSION_COOKIES.map((name) => `${name}=${token}`).join("; ");
  headers.set("cookie", existing ? `${existing}; ${injected}` : injected);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
