import { NextRequest, NextResponse } from "next/server";
import { ShopError, handleWebhook } from "@/lib/print-shop-db";

/** Stripe's webhook (checkout.session.completed): records the order straight away. Needs STRIPE_WEBHOOK_SECRET. */
export async function POST(req: NextRequest) {
  try {
    return NextResponse.json(await handleWebhook(await req.text(), req.headers.get("stripe-signature")));
  } catch (err) {
    if (err instanceof ShopError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[shop] webhook failed:", (err as Error).message);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
