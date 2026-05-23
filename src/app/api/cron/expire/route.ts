// src/app/api/cron/expire/route.ts
/**
 * Called by Vercel Cron every minute: * * * * *
 * Configured in vercel.json
 *
 * Protected by CRON_SECRET so only Vercel (or authorized callers) can invoke it.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/expiry";


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
