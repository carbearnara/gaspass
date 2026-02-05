"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

interface ChainGasEntry {
  chain: string;
  name: string;
  color: string;
  avgGwei: number;
  swapCostUsd: number;
  tokenPrice: number;
  nativeTokenSymbol: string;
}

interface AllChainsResponse {
  timestamp: number;
  chains: ChainGasEntry[];
}

interface HistoryPoint {
  time: string;
  timestamp: number;
  [chainId: string]: string | number;
}

const REFRESH_INTERVAL = 20_000;
const MAX_HISTORY = 40;

function formatUsd(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.000001) return `$${v.toExponential(2)}`;
  if (v < 0.0001) return `$${v.toFixed(8)}`;
  if (v < 0.01) return `$${v.toFixed(6)}`;
  if (v < 1) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function formatTickUsd(v: number): string {
  if (v >= 1) return `$${v.toFixed(0)}`;
  if (v >= 0.01) return `$${v.toFixed(2)}`;
  if (v >= 0.0001) return `$${v.toFixed(4)}`;
  return `$${v.toExponential(0)}`;
}

interface BarPayloadEntry {
  name: string;
  value: number;
  payload: ChainGasEntry & { fill: string };
}

function BarTooltip({ active, payload }: { active?: boolean; payload?: BarPayloadEntry[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-950/95 backdrop-blur border border-white/10 rounded-lg px-3 py-2.5 shadow-2xl text-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
        <span className="font-medium text-white">{d.name}</span>
      </div>
      <div className="text-gray-300 font-mono">
        {formatUsd(d.swapCostUsd)}
      </div>
      <div className="text-gray-500 text-xs mt-1">
        {d.avgGwei < 0.01 ? d.avgGwei.toFixed(6) : d.avgGwei.toFixed(2)} Gwei &middot; {d.nativeTokenSymbol} @ ${d.tokenPrice.toFixed(2)}
      </div>
    </div>
  );
}

interface LinePayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function LineTooltip({ active, payload, label }: { active?: boolean; payload?: LinePayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
  return (
    <div className="bg-gray-950/95 backdrop-blur border border-white/10 rounded-lg px-3 py-2.5 shadow-2xl text-xs max-h-72 overflow-y-auto">
      <p className="text-gray-500 mb-2 text-[11px]">{label}</p>
      {sorted.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-px">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-400 truncate min-w-0">{entry.name}</span>
          <span className="font-mono text-white ml-auto pl-3">
            {formatUsd(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AllChainsSwapChart() {
  const [latestData, setLatestData] = useState<ChainGasEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"bar" | "line">("bar");
  const historyRef = useRef<HistoryPoint[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const chainColorsRef = useRef<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/gas-all");
      if (!res.ok) return;
      const data: AllChainsResponse = await res.json();
      setLatestData(data.chains);

      for (const c of data.chains) {
        chainColorsRef.current[c.chain] = c.color;
      }

      const now = new Date();
      const point: HistoryPoint = {
        time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        timestamp: now.getTime(),
      };
      for (const c of data.chains) {
        // Use actual value; floor at 1e-12 only to avoid log(0)
        point[c.chain] = Math.max(c.swapCostUsd, 1e-12);
      }
      historyRef.current = [...historyRef.current, point].slice(-MAX_HISTORY);
      setHistory([...historyRef.current]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const barData = [...latestData]
    .sort((a, b) => b.swapCostUsd - a.swapCostUsd)
    .map((c) => ({ ...c, swapCostUsd: Math.max(c.swapCostUsd, 1e-12), fill: c.color }));

  const chainIds = latestData.map((c) => c.chain);
  const barHeight = Math.max(400, barData.length * 32);

  if (loading) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-6">
        <div className="h-5 bg-white/10 rounded w-48 mb-4 animate-pulse" />
        <div className="h-96 bg-white/[0.03] rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-white">
            Swap Fee Comparison
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Uniswap-style swap (184K gas) in USD &middot; log scale
          </p>
        </div>
        <div className="flex gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
          {(["bar", "line"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                view === v ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {v === "bar" ? "Current" : "Over Time"}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {view === "bar" ? (
        <div style={{ height: barHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="transparent" horizontal={false} />
              <XAxis
                type="number"
                scale="log"
                domain={["auto", "auto"]}
                allowDataOverflow
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatTickUsd}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#d1d5db", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
              <Bar dataKey="swapCostUsd" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-96">
          {history.length < 2 ? (
            <div className="h-full flex items-center justify-center text-gray-600 text-sm">
              Collecting data... ({history.length}/2)
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  scale="log"
                  domain={["auto", "auto"]}
                  allowDataOverflow
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatTickUsd}
                  width={56}
                />
                <Tooltip content={<LineTooltip />} />
                <Legend iconType="circle" iconSize={7} />
                {chainIds.map((chainId) => (
                  <Line
                    key={chainId}
                    type="monotone"
                    dataKey={chainId}
                    stroke={chainColorsRef.current[chainId] || "#888"}
                    strokeWidth={1.5}
                    dot={false}
                    name={latestData.find((c) => c.chain === chainId)?.name ?? chainId}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Quick reference */}
      <div className="mt-4 pt-4 border-t border-white/[0.04]">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
          {[...latestData]
            .sort((a, b) => a.swapCostUsd - b.swapCostUsd)
            .map((c) => (
              <div
                key={c.chain}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.03] text-[11px]"
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-gray-500 truncate">{c.name}</span>
                <span className="text-gray-300 font-mono ml-auto">
                  {formatUsd(c.swapCostUsd)}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
