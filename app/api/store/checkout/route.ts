import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseCart } from "@/lib/print-shop";
import { ShopError, createCheckout } from "@/lib/print-shop-db";

/** Starts a Stripe Checkout for the basket ({ items: [{ packId, qty }], zone: "uk" | "world" }). Returns { url }. */
export async function POST(req: NextRequest) {
  const cart = parseCart(await req.json().catch(() => null));
  if (!cart.ok) return NextResponse.json({ error: cart.error }, { status: 400 });
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const url = await createCheckout({ items: cart.items, zone: cart.zone, origin: req.nextUrl.origin, userId: session?.user?.id });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof ShopError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[shop] checkout failed:", (err as Error).message);
    return NextResponse.json({ error: "Checkout couldn't start. Please try again." }, { status: 502 });
  }
}
