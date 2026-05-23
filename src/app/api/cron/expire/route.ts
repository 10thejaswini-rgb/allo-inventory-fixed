import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/expiry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await releaseExpiredReservations();
    return NextResponse.json({ released: count, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[CRON /api/cron/expire]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}