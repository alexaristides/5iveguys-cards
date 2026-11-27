import { NextResponse } from "next/server";
import { shopOpen, syncRecentOrders } from "@/lib/print-shop-db";

/**
 * Vercel cron (vercel.json): records any paid shop order the thanks page and webhook missed,
 * e.g. a buyer who closed the tab straight after paying.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!shopOpen()) return NextResponse.json({ skipped: "STRIPE_SECRET_KEY not set" });
  return NextResponse.json(await syncRecentOrders(2));
}
