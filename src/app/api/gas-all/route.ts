import { NextResponse } from "next/server";
import { fetchAllChainsGas } from "@/lib/gas-fetcher";

export async function GET() {
  const result = await fetchAllChainsGas();

  return NextResponse.json({
    timestamp: result.timestamp,
    chains: result.chains,
  });
}
