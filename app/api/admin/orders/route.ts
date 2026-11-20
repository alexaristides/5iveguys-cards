import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ORDER_STATUSES, toMake, type OrderStatus } from "@/lib/print-shop";
import { orderView, shopOpen, syncRecentOrders } from "@/lib/print-shop-db";

const isAdmin = (req: NextRequest) =>
  !!process.env.ADMIN_SECRET && req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET;

/** Shop orders, newest first, and the packs still to make. `?tests=1` includes Stripe test-mode orders. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const includeTests = req.nextUrl.searchParams.get("tests") === "1";
  const rows = await prisma.printOrder.findMany({
    where: includeTests ? {} : { livemode: true },
    orderBy: { paidAt: "desc" },
    take: 500,
  });
  const orders = rows.map(orderView);
  return NextResponse.json({ shopOpen: shopOpen(), orders, toMake: toMake(orders) });
}

/** { action: "status", id, status } marks an order paid/posted/cancelled; { action: "note", id, note }; { action: "sync" } pulls missed orders from Stripe. */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";

  if (body.action === "status") {
    const status = body.status as OrderStatus;
    if (!ORDER_STATUSES.includes(status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    const order = await prisma.printOrder.update({
      where: { id },
      data: { status, postedAt: status === "posted" ? new Date() : null },
    });
    return NextResponse.json({ order: orderView(order) });
  }
  if (body.action === "note") {
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    const order = await prisma.printOrder.update({ where: { id }, data: { note: note || null } });
    return NextResponse.json({ order: orderView(order) });
  }
  if (body.action === "sync") {
    if (!shopOpen()) return NextResponse.json({ error: "STRIPE_SECRET_KEY isn't set." }, { status: 503 });
    return NextResponse.json(await syncRecentOrders(30));
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
