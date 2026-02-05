import { NextRequest, NextResponse } from "next/server";
import { queryAllChainsHistory, queryChainHistory } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const chain = request.nextUrl.searchParams.get("chain") || "all";
  const hours = Math.min(
    Math.max(parseFloat(request.nextUrl.searchParams.get("hours") || "24"), 0.1),
    168 // max 7 days
  );

  if (chain === "all") {
    const points = queryAllChainsHistory(hours);
    return NextResponse.json({ points });
  }

  const points = queryChainHistory(chain, hours);
  return NextResponse.json({ points });
}
