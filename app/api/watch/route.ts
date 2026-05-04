import { NextResponse } from "next/server";

// Watch time tracking was removed — YouTube API doesn't support it for external channels
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 410 });
}
