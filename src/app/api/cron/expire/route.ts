export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { releaseExpiredReservations } = await import("@/lib/expiry");
    const count = await releaseExpiredReservations();
    return Response.json({ released: count, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[CRON]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}