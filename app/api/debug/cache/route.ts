import { NextRequest, NextResponse } from "next/server";
import { snapshotCounters } from "@/lib/cache/cacheMetrics";

export async function GET(req: NextRequest) {
  const token = process.env.CACHE_DEBUG_TOKEN;
  if (token) {
    const url = new URL(req.url);
    const provided = url.searchParams.get("token");
    if (provided !== token) {
      return new NextResponse("Not found", { status: 404 });
    }
  }
  return NextResponse.json({
    counters: snapshotCounters(),
    now: new Date().toISOString()
  });
}
