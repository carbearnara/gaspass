import { NextResponse } from "next/server";
import { fetchAllChainsGas } from "@/lib/gas-fetcher";
import { insertGasData } from "@/lib/db";

// Throttle DB writes to once per 60s across all requests
let lastWrite = 0;
const WRITE_INTERVAL = 60_000;

export async function GET() {
  const result = await fetchAllChainsGas();

  // Persist to DB if enough time has passed (piggyback on client polling)
  const now = Date.now();
  if (now - lastWrite > WRITE_INTERVAL && process.env.DATABASE_URL) {
    lastWrite = now;
    const rows = result.chains.map((c) => ({
      chain: c.chain,
      avgGwei: c.avgGwei,
      swapCostUsd: c.swapCostUsd,
      tokenPrice: c.tokenPrice,
      timestamp: result.timestamp,
    }));
    // Fire and forget — don't block the response
    insertGasData(rows).catch(() => {});
  }

  return NextResponse.json({
    timestamp: result.timestamp,
    chains: result.chains,
  });
}
