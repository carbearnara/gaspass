import { chains, SWAP_GAS_LIMIT, SOLANA_BASE_FEE_LAMPORTS } from "@/lib/chains";

export async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[] = []
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
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
  solana: 150,
  monad: 0.5,
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

async function fetchGasFromRpc(
  rpcUrl: string,
  isEIP1559: boolean
): Promise<number> {
  const gasPrice = await rpcCall(rpcUrl, "eth_gasPrice");
  const gasPriceGwei = parseInt(gasPrice, 16) / 1e9;
  let avgGwei = gasPriceGwei;

  if (isEIP1559) {
    try {
      const feeHistory = await rpcCall(rpcUrl, "eth_feeHistory", [
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
}

async function fetchSolanaGas(rpcUrl: string): Promise<number> {
  const fees: Array<{ slot: number; prioritizationFee: number }> =
    await rpcCall(rpcUrl, "getRecentPrioritizationFees", [[]]);

  if (!fees || fees.length === 0) return 0;

  const nonZero = fees
    .map((f) => f.prioritizationFee)
    .filter((f) => f > 0)
    .sort((a, b) => a - b);

  if (nonZero.length === 0) return 0;

  // Return median as the "average" priority fee in micro-lamports per CU
  return nonZero[Math.floor(nonZero.length / 2)];
}

export async function getChainGasGwei(
  chain: (typeof chains)[number]
): Promise<number | null> {
  const rpcs = [chain.rpcUrl, ...(chain.rpcFallbacks ?? [])];
  for (const rpc of rpcs) {
    try {
      if (chain.chainType === "solana") {
        return await fetchSolanaGas(rpc);
      }
      return await fetchGasFromRpc(rpc, chain.isEIP1559 ?? true);
    } catch {
      // Try next RPC
    }
  }
  return null;
}

export interface ChainGasResult {
  chain: string;
  name: string;
  color: string;
  avgGwei: number;
  swapCostUsd: number;
  tokenPrice: number;
  nativeTokenSymbol: string;
  chainType?: string;
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
      let swapCostUsd: number;

      if (chain.chainType === "solana") {
        const sigs = chain.signaturesPerSwap ?? 1;
        const cu = chain.computeUnitsPerSwap ?? 300000;
        const baseLamports = SOLANA_BASE_FEE_LAMPORTS * sigs;
        const priorityLamports = (avgGwei * cu) / 1e6;
        const totalSol = (baseLamports + priorityLamports) / 1e9;
        swapCostUsd = totalSol * tokenPrice;
      } else {
        const swapCostToken = (avgGwei * SWAP_GAS_LIMIT) / 1e9;
        swapCostUsd = swapCostToken * tokenPrice;
      }

      return {
        chain: chain.id,
        name: chain.name,
        color: chain.color,
        avgGwei,
        swapCostUsd: Math.max(swapCostUsd, 0),
        tokenPrice,
        nativeTokenSymbol: chain.nativeTokenSymbol,
        chainType: chain.chainType as string | undefined,
      };
    })
    .filter((c) => c !== null) as ChainGasResult[];

  return {
    timestamp: Date.now(),
    chains: data,
  };
}
