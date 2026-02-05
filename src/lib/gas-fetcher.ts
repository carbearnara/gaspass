import { chains, SWAP_GAS_LIMIT } from "@/lib/chains";

export async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[] = []
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  } finally {
    clearTimeout(timeout);
  }
}

// Fallback prices (updated periodically as approximations)
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

// Batched price cache
const priceCache: Record<string, number> = { ...FALLBACK_PRICES };
let lastPriceFetch = 0;
const PRICE_CACHE_TTL = 120_000;

export async function fetchAllPrices(): Promise<Record<string, number>> {
  if (Date.now() - lastPriceFetch < PRICE_CACHE_TTL && lastPriceFetch > 0) {
    return priceCache;
  }

  const uniqueTokens = [...new Set(chains.map((c) => c.nativeToken))];
  const ids = uniqueTokens.join(",");

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    );
    const data = await res.json();
    if (!data.status) {
      for (const tokenId of uniqueTokens) {
        if (data[tokenId]?.usd) {
          priceCache[tokenId] = data[tokenId].usd;
        }
      }
      lastPriceFetch = Date.now();
    }
  } catch {
    // Use existing cache / fallback prices
  }

  return priceCache;
}

export async function getChainGasGwei(
  chain: (typeof chains)[number]
): Promise<number | null> {
  try {
    const gasPrice = await rpcCall(chain.rpcUrl, "eth_gasPrice");
    const gasPriceGwei = parseInt(gasPrice, 16) / 1e9;
    let avgGwei = gasPriceGwei;

    if (chain.isEIP1559) {
      try {
        const feeHistory = await rpcCall(chain.rpcUrl, "eth_feeHistory", [
          "0xA",
          "latest",
          [50],
        ]);
        const baseFees = feeHistory.baseFeePerGas.map(
          (f: string) => parseInt(f, 16) / 1e9
        );
        const tips = feeHistory.reward.map(
          (r: string[]) => parseInt(r[0], 16) / 1e9
        );
        const latestBase = baseFees[baseFees.length - 1];
        const avgTip =
          tips.reduce((s: number, t: number) => s + t, 0) / tips.length;
        const feeHistoryGwei = latestBase + avgTip;
        avgGwei = Math.max(feeHistoryGwei, gasPriceGwei);
      } catch {
        // Use gasPrice fallback
      }
    }

    return avgGwei;
  } catch {
    return null;
  }
}

export interface ChainGasResult {
  chain: string;
  name: string;
  color: string;
  avgGwei: number;
  swapCostUsd: number;
  tokenPrice: number;
  nativeTokenSymbol: string;
}

export async function fetchAllChainsGas(): Promise<{
  timestamp: number;
  chains: ChainGasResult[];
}> {
  const [prices, ...gasResults] = await Promise.all([
    fetchAllPrices(),
    ...chains.map((chain) => getChainGasGwei(chain)),
  ]);

  const data = chains
    .map((chain, i) => {
      const avgGwei = gasResults[i];
      if (avgGwei === null) return null;

      const tokenPrice = prices[chain.nativeToken] ?? 0;
      const swapCostToken = (avgGwei * SWAP_GAS_LIMIT) / 1e9;
      const swapCostUsd = swapCostToken * tokenPrice;

      return {
        chain: chain.id,
        name: chain.name,
        color: chain.color,
        avgGwei,
        swapCostUsd: Math.max(swapCostUsd, 0),
        tokenPrice,
        nativeTokenSymbol: chain.nativeTokenSymbol,
      };
    })
    .filter((c): c is ChainGasResult => c !== null);

  return {
    timestamp: Date.now(),
    chains: data,
  };
}
