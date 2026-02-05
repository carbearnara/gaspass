import { NextRequest, NextResponse } from "next/server";
import { chains, ChainConfig, SOLANA_BASE_FEE_LAMPORTS } from "@/lib/chains";

interface FeeHistory {
  baseFeePerGas: string[];
  reward: string[][];
  gasUsedRatio: number[];
}

async function rpcCall(rpcUrl: string, method: string, params: unknown[] = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`RPC returned non-JSON response: ${text.slice(0, 100)}`);
    }
    if (json.error) throw new Error(json.error.message);
    return json.result;
  } finally {
    clearTimeout(timeout);
  }
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const idx = Math.floor(arr.length * p);
  return arr[Math.min(idx, arr.length - 1)];
}

async function handleSolanaGas(chain: ChainConfig) {
  const [fees, currentSlot] = await Promise.all([
    rpcCall(chain.rpcUrl, "getRecentPrioritizationFees", [[]]),
    rpcCall(chain.rpcUrl, "getSlot"),
  ]);

  const feeValues = (fees as Array<{ slot: number; prioritizationFee: number }>)
    .map((f) => f.prioritizationFee)
    .sort((a, b) => a - b);

  const low = percentile(feeValues, 0.25);
  const average = percentile(feeValues, 0.5);
  const high = percentile(feeValues, 0.75);

  let tps = 0;
  try {
    const perfSamples = await rpcCall(chain.rpcUrl, "getRecentPerformanceSamples", [1]);
    if (perfSamples?.length > 0) {
      tps = Math.round(perfSamples[0].numTransactions / perfSamples[0].samplePeriodSecs);
    }
  } catch {
    // TPS unavailable
  }

  return NextResponse.json({
    chain: chain.id,
    blockNumber: currentSlot as number,
    low,
    average,
    high,
    baseFee: SOLANA_BASE_FEE_LAMPORTS,
    timestamp: Date.now(),
    networkStats: {
      txCount: tps,
      gasUsed: 0,
      gasLimit: 0,
      utilization: 0,
    },
  });
}

export async function GET(request: NextRequest) {
  const chainId = request.nextUrl.searchParams.get("chain") || "ethereum";
  const chain = chains.find((c) => c.id === chainId);

  if (!chain) {
    return NextResponse.json({ error: "Unknown chain" }, { status: 400 });
  }

  try {
    if (chain.chainType === "solana") {
      return await handleSolanaGas(chain);
    }

    const [blockHex, gasPrice] = await Promise.all([
      rpcCall(chain.rpcUrl, "eth_blockNumber"),
      rpcCall(chain.rpcUrl, "eth_gasPrice"),
    ]);

    const blockNumber = parseInt(blockHex, 16);
    const currentGasPrice = parseInt(gasPrice, 16) / 1e9;

    let low: number, average: number, high: number;
    let baseFee: number | null = null;

    if (chain.isEIP1559) {
      try {
        const feeHistory: FeeHistory = await rpcCall(
          chain.rpcUrl,
          "eth_feeHistory",
          ["0x14", "latest", [10, 50, 90]]
        );

        const baseFees = feeHistory.baseFeePerGas.map(
          (f: string) => parseInt(f, 16) / 1e9
        );
        baseFee = baseFees[baseFees.length - 1];

        const rewards = feeHistory.reward.map((r: string[]) => ({
          low: parseInt(r[0], 16) / 1e9,
          mid: parseInt(r[1], 16) / 1e9,
          high: parseInt(r[2], 16) / 1e9,
        }));

        const avgLowTip =
          rewards.reduce((s, r) => s + r.low, 0) / rewards.length;
        const avgMidTip =
          rewards.reduce((s, r) => s + r.mid, 0) / rewards.length;
        const avgHighTip =
          rewards.reduce((s, r) => s + r.high, 0) / rewards.length;

        low = Math.max(baseFee + avgLowTip, currentGasPrice * 0.85);
        average = Math.max(baseFee + avgMidTip, currentGasPrice);
        high = Math.max(baseFee + avgHighTip, currentGasPrice * 1.15);

        const gasUsedRatios = feeHistory.gasUsedRatio;
        const avgUtilization =
          gasUsedRatios.reduce((s: number, r: number) => s + r, 0) /
          gasUsedRatios.length;

        const block = await rpcCall(chain.rpcUrl, "eth_getBlockByNumber", [
          "latest",
          false,
        ]);
        const txCount = block?.transactions?.length ?? 0;
        const blockGasUsed = parseInt(block?.gasUsed ?? "0x0", 16);
        const blockGasLimit = parseInt(block?.gasLimit ?? "0x0", 16);

        return NextResponse.json({
          chain: chain.id,
          blockNumber,
          low,
          average,
          high,
          baseFee,
          timestamp: Date.now(),
          networkStats: {
            txCount,
            gasUsed: blockGasUsed,
            gasLimit: blockGasLimit,
            utilization: avgUtilization * 100,
          },
        });
      } catch {
        // Fallback if eth_feeHistory not supported
      }
    }

    low = currentGasPrice * 0.85;
    average = currentGasPrice;
    high = currentGasPrice * 1.15;

    const block = await rpcCall(chain.rpcUrl, "eth_getBlockByNumber", [
      "latest",
      false,
    ]);
    const txCount = block?.transactions?.length ?? 0;
    const blockGasUsed = parseInt(block?.gasUsed ?? "0x0", 16);
    const blockGasLimit = parseInt(block?.gasLimit ?? "0x0", 16);

    return NextResponse.json({
      chain: chain.id,
      blockNumber,
      low,
      average,
      high,
      baseFee,
      timestamp: Date.now(),
      networkStats: {
        txCount,
        gasUsed: blockGasUsed,
        gasLimit: blockGasLimit,
        utilization:
          blockGasLimit > 0 ? (blockGasUsed / blockGasLimit) * 100 : 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RPC error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
