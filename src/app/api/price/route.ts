import { NextRequest, NextResponse } from "next/server";

const FALLBACK_PRICES: Record<string, number> = {
  ethereum: 2500,
  "matic-network": 0.35,
  binancecoin: 600,
  "avalanche-2": 25,
  "berachain-bera": 4,
  xdai: 1.0,
  mantle: 0.75,
  celo: 0.5,
};

const priceCache: Record<string, { price: number; timestamp: number }> = {};
const CACHE_TTL = 60_000;

export async function GET(request: NextRequest) {
  const tokenId = request.nextUrl.searchParams.get("token") || "ethereum";

  const cached = priceCache[tokenId];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({ price: cached.price });
  }

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`,
      { next: { revalidate: 60 } }
    );
    const data = await res.json();
    const price = data[tokenId]?.usd;

    if (price) {
      priceCache[tokenId] = { price, timestamp: Date.now() };
      return NextResponse.json({ price });
    }
  } catch {
    // Fall through to cache/fallback
  }

  const fallback = cached?.price ?? FALLBACK_PRICES[tokenId] ?? 0;
  return NextResponse.json({ price: fallback });
}
