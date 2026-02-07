"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { chains } from "@/lib/chains";
import { GasData, GasHistoryPoint } from "@/lib/types";
import ChainSelector from "@/components/ChainSelector";
import GasTiers from "@/components/GasTiers";
import CostEstimates from "@/components/CostEstimates";
import GasChart from "@/components/GasChart";
import NetworkStats from "@/components/NetworkStats";
import AllChainsSwapChart from "@/components/AllChainsSwapChart";

const REFRESH_INTERVAL = 15_000;
const MAX_HISTORY = 60;

export default function Home() {
  const [selectedChain, setSelectedChain] = useState("ethereum");
  const [gasData, setGasData] = useState<GasData | null>(null);
  const [tokenPrice, setTokenPrice] = useState(0);
  const [, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const historyRef = useRef<Record<string, GasHistoryPoint[]>>({});
  const [history, setHistory] = useState<GasHistoryPoint[]>([]);

  const chain = chains.find((c) => c.id === selectedChain)!;

  // Load per-chain historical data from DB when chain changes
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/history?chain=${selectedChain}&hours=6`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.points?.length > 0) {
          const points: GasHistoryPoint[] = data.points.map(
            (p: { timestamp: number; low: number; average: number; high: number }) => {
              const date = new Date(p.timestamp);
              return {
                time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                timestamp: p.timestamp,
                low: p.low,
                average: p.average,
                high: p.high,
              };
            }
          );
          historyRef.current[selectedChain] = points.slice(-MAX_HISTORY);
          setHistory([...historyRef.current[selectedChain]]);
        }
      } catch {
        // silent — will build from live data
      }
    })();
  }, [selectedChain]);

  const fetchGasData = useCallback(async () => {
    try {
      const [gasRes, priceRes] = await Promise.all([
        fetch(`/api/gas?chain=${selectedChain}`),
        fetch(`/api/price?token=${chain.nativeToken}`),
      ]);

      if (!gasRes.ok) {
        const err = await gasRes.json();
        throw new Error(err.error || "Failed to fetch gas data");
      }

      const gas: GasData = await gasRes.json();
      const price = await priceRes.json();

      setGasData(gas);
      setTokenPrice(price.price);
      setError(null);
      setLastUpdated(new Date());

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const point: GasHistoryPoint = {
        time: timeStr,
        timestamp: now.getTime(),
        low: gas.low,
        average: gas.average,
        high: gas.high,
      };

      const chainHistory = historyRef.current[selectedChain] || [];
      const updatedHistory = [...chainHistory, point].slice(-MAX_HISTORY);
      historyRef.current[selectedChain] = updatedHistory;
      setHistory(updatedHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [selectedChain, chain.nativeToken]);

  useEffect(() => {
    setLoading(true);
    setGasData(null);
    setHistory(historyRef.current[selectedChain] || []);
    fetchGasData();
  }, [selectedChain, fetchGasData]);

  useEffect(() => {
    const interval = setInterval(fetchGasData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchGasData]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <header className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Mind The <span style={{ color: chain.color }}>Gas</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Real-time gas tracker
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {lastUpdated && (
            <span className="hidden sm:inline">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse-dot"
              style={{ backgroundColor: error ? "#ef4444" : "#22c55e" }}
            />
            {error ? "Error" : "Live"}
          </span>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={fetchGasData}
            className="text-xs underline hover:no-underline ml-4 shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* === All Chains Comparison (top-level, always visible) === */}
      <section className="mb-10">
        <AllChainsSwapChart />
      </section>

      {/* === Per-Chain Detail === */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-1 h-5 rounded-full" style={{ backgroundColor: chain.color }} />
          <h2 className="text-base font-semibold text-white">Chain Detail</h2>
        </div>

        <div className="mb-5">
          <ChainSelector selected={selectedChain} onSelect={setSelectedChain} />
        </div>

        <div className="mb-5">
          <GasTiers
            data={gasData}
            tokenPrice={tokenPrice}
            tokenSymbol={chain.nativeTokenSymbol}
            chainColor={chain.color}
            chainType={chain.chainType}
          />
        </div>

        <div className="mb-5">
          <NetworkStats data={gasData} chain={chain} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <GasChart history={history} chainColor={chain.color} chainType={chain.chainType} />
          <CostEstimates
            data={gasData}
            tokenPrice={tokenPrice}
            tokenSymbol={chain.nativeTokenSymbol}
            chainType={chain.chainType}
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-[11px] text-gray-600 mt-12 pt-6 border-t border-white/5">
        Mind The Gas &middot; Public RPCs &middot; CoinGecko prices &middot; Refreshes every {REFRESH_INTERVAL / 1000}s
      </footer>
    </main>
  );
}
