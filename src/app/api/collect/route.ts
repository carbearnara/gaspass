import { NextRequest, NextResponse } from "next/server";
import { fetchAllChainsGas } from "@/lib/gas-fetcher";
import { insertGasData } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      request.headers.get("authorization")?.replace("Bearer ", "") ||
      request.nextUrl.searchParams.get("key");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await fetchAllChainsGas();

    const rows = result.chains.map((c) => ({
      chain: c.chain,
      avgGwei: c.avgGwei,
      swapCostUsd: c.swapCostUsd,
      tokenPrice: c.tokenPrice,
      timestamp: result.timestamp,
    }));

    await insertGasData(rows);

    return NextResponse.json({
      ok: true,
      collected: rows.length,
      timestamp: result.timestamp,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Collection failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
