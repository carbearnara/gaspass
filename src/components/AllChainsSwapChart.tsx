"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  chainType?: string;
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

type Metric = "cost" | "perDollar";

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

function formatCount(v: number): string {
  if (v === 0) return "0";
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

function formatTickCount(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  if (v >= 1) return v.toFixed(0);
  return v.toFixed(1);
}

interface BarPayloadEntry {
  name: string;
  value: number;
  payload: ChainGasEntry & { fill: string; displayValue: number };
}

function makeBarTooltip(metric: Metric) {
  return function BarTooltipContent({ active, payload }: { active?: boolean; payload?: BarPayloadEntry[] }) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const perDollar = metric === "perDollar";
    return (
      <div className="bg-gray-950/95 backdrop-blur border border-white/10 rounded-lg px-3 py-2.5 shadow-2xl text-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
          <span className="font-medium text-white">{d.name}</span>
        </div>
        <div className="text-gray-300 font-mono">
          {perDollar
            ? `${formatCount(d.displayValue)} swaps / $1`
            : formatUsd(d.swapCostUsd)}
        </div>
        <div className="text-gray-500 text-xs mt-1">
          {perDollar && <span>{formatUsd(d.swapCostUsd)} per swap &middot; </span>}
          {d.avgGwei < 0.01 ? d.avgGwei.toFixed(6) : d.avgGwei.toFixed(2)} {d.chainType === "solana" ? "μL/CU" : "Gwei"} &middot; {d.nativeTokenSymbol} @ ${d.tokenPrice.toFixed(2)}
        </div>
      </div>
    );
  };
}

interface LinePayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function makeLineTooltip(metric: Metric) {
  return function LineTooltipContent({ active, payload, label }: { active?: boolean; payload?: LinePayloadEntry[]; label?: string }) {
    if (!active || !payload?.length) return null;
    const sorted = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
    const perDollar = metric === "perDollar";
    return (
      <div className="bg-gray-950/95 backdrop-blur border border-white/10 rounded-lg px-3 py-2.5 shadow-2xl text-xs max-h-72 overflow-y-auto">
        <p className="text-gray-500 mb-2 text-[11px]">{label}</p>
        {sorted.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2 py-px">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-400 truncate min-w-0">{entry.name}</span>
            <span className="font-mono text-white ml-auto pl-3">
              {perDollar ? formatCount(entry.value) : formatUsd(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };
}

export default function AllChainsSwapChart() {
  const [latestData, setLatestData] = useState<ChainGasEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"bar" | "line">("bar");
  const [axisScale, setAxisScale] = useState<"log" | "linear">("log");
  const [metric, setMetric] = useState<Metric>("perDollar");
  const historyRef = useRef<HistoryPoint[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const chainColorsRef = useRef<Record<string, string>>({});
  // Accumulate all chain data — merge new fetches so intermittent RPC
  // failures don't remove chains from the UI
  const chainMapRef = useRef<Record<string, ChainGasEntry>>({});
  const chainNamesRef = useRef<Record<string, string>>({});

  const BarTooltipComponent = useMemo(() => makeBarTooltip(metric), [metric]);
  const LineTooltipComponent = useMemo(() => makeLineTooltip(metric), [metric]);

  // Load historical data from DB on mount
  const historyLoaded = useRef(false);
  useEffect(() => {
    if (historyLoaded.current) return;
    historyLoaded.current = true;
    (async () => {
      try {
        const res = await fetch("/api/history?chain=all&hours=24");
        if (!res.ok) return;
        const data = await res.json();
        if (data.points?.length > 0) {
          const points: HistoryPoint[] = data.points.map(
            (p: { timestamp: number; chains: Record<string, number> }) => {
              const date = new Date(p.timestamp);
              const point: HistoryPoint = {
                time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                timestamp: p.timestamp,
              };
              for (const [chainId, cost] of Object.entries(p.chains)) {
                point[chainId] = Math.max(cost, 1e-12);
              }
              return point;
            }
          );
          historyRef.current = points.slice(-MAX_HISTORY);
          setHistory([...historyRef.current]);
        }
      } catch {
        // silent — will build history from live data
      }
    })();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/gas-all");
      if (!res.ok) return;
      const data: AllChainsResponse = await res.json();

      // Merge into accumulated map so chains survive intermittent RPC failures
      for (const c of data.chains) {
        chainMapRef.current[c.chain] = c;
        chainColorsRef.current[c.chain] = c.color;
        chainNamesRef.current[c.chain] = c.name;
      }
      setLatestData(Object.values(chainMapRef.current));

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

  const isPerDollar = metric === "perDollar";

  const barData = useMemo(() => {
    const sorted = [...latestData].sort((a, b) =>
      isPerDollar
        ? a.swapCostUsd - b.swapCostUsd // cheapest first = most swaps = biggest bar at top
        : b.swapCostUsd - a.swapCostUsd
    );
    return sorted.map((c) => {
      const cost = Math.max(c.swapCostUsd, 1e-12);
      return {
        ...c,
        swapCostUsd: cost,
        displayValue: isPerDollar ? 1 / cost : cost,
        fill: c.color,
      };
    });
  }, [latestData, isPerDollar]);

  const displayHistory = useMemo(() => {
    if (!isPerDollar) return history;
    return history.map((point) => {
      const transformed: HistoryPoint = { time: point.time, timestamp: point.timestamp as number };
      for (const [key, val] of Object.entries(point)) {
        if (key === "time" || key === "timestamp") continue;
        const num = typeof val === "number" ? val : parseFloat(val as string);
        transformed[key] = num > 0 ? 1 / num : 0;
      }
      return transformed;
    });
  }, [history, isPerDollar]);

  // Set domain floor 100x below smallest value so every bar is visible on log scale
  const minDisplay = barData.length > 0
    ? Math.min(...barData.map((c) => c.displayValue))
    : 1e-12;
  const barDomainMin = minDisplay / 100;

  // Use all ever-seen chains so lines don't vanish on intermittent RPC failures
  const chainIds = Object.keys(chainMapRef.current);
  const barHeight = Math.max(400, barData.length * 32);

  const tickFormatter = isPerDollar ? formatTickCount : formatTickUsd;
  const subtitle = isPerDollar
    ? "DEX swaps per $1 of gas"
    : "DEX swap cost in USD";

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-white">
            Swap Fee Comparison
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {subtitle} &middot; {axisScale} scale
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
            {(["perDollar", "cost"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                  metric === m ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {m === "cost" ? "Cost/Swap" : "Swaps/$1"}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
            {(["log", "linear"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setAxisScale(s)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                  axisScale === s ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {s === "log" ? "Log" : "Linear"}
              </button>
            ))}
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
      </div>

      {/* Chart */}
      {view === "bar" ? (
        <div style={{ height: barHeight }} className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/30 backdrop-blur-[1px] rounded-xl">
              <p className="text-sm text-gray-400 animate-pulse">Loading gas prices...</p>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="transparent" horizontal={false} />
              <XAxis
                type="number"
                scale={axisScale}
                domain={axisScale === "log" ? [barDomainMin, "auto"] : [0, "auto"]}
                allowDataOverflow
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={tickFormatter}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#d1d5db", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip content={<BarTooltipComponent />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
              <Bar dataKey="displayValue" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-96 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/30 backdrop-blur-[1px] rounded-xl">
              <p className="text-sm text-gray-400 animate-pulse">Loading gas prices...</p>
            </div>
          )}
          {displayHistory.length < 2 ? (
            <div className="h-full flex items-center justify-center text-gray-600 text-sm">
              {loading ? "" : `Collecting data... (${displayHistory.length}/2)`}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayHistory} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  scale={axisScale}
                  domain={axisScale === "log" ? ["auto", "auto"] : [0, "auto"]}
                  allowDataOverflow
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={tickFormatter}
                  width={56}
                />
                <Tooltip content={<LineTooltipComponent />} />
                <Legend iconType="circle" iconSize={7} />
                {chainIds.map((chainId) => (
                  <Line
                    key={chainId}
                    type="monotone"
                    dataKey={chainId}
                    stroke={chainColorsRef.current[chainId] || "#888"}
                    strokeWidth={1.5}
                    dot={false}
                    name={chainNamesRef.current[chainId] ?? chainId}
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
            .sort((a, b) => isPerDollar ? a.swapCostUsd - b.swapCostUsd : a.swapCostUsd - b.swapCostUsd)
            .map((c) => (
              <div
                key={c.chain}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.03] text-[11px]"
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-gray-500 truncate">{c.name}</span>
                <span className="text-gray-300 font-mono ml-auto">
                  {isPerDollar
                    ? `${formatCount(1 / Math.max(c.swapCostUsd, 1e-12))}`
                    : formatUsd(c.swapCostUsd)}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
