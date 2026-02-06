"use client";

import { useState } from "react";
import { GasHistoryPoint } from "@/lib/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface GasChartProps {
  history: GasHistoryPoint[];
  chainColor: string;
  chainType?: string;
}

interface PayloadEntry {
  name: string;
  value: number;
  color: string;
}

function formatTimeTick(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function makeTooltip(unitLabel: string) {
  return function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: PayloadEntry[]; label?: number }) {
    if (!active || !payload?.length) return null;
    const timeStr = typeof label === "number"
      ? new Date(label).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : label;
    return (
      <div className="bg-gray-950/95 backdrop-blur border border-white/10 rounded-lg px-3 py-2.5 shadow-2xl">
        <p className="text-[11px] text-gray-500 mb-1.5">{timeStr}</p>
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2 text-xs py-px">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-400">{entry.name}</span>
            <span className="font-mono text-white ml-auto pl-3">
              {typeof entry.value === "number"
                ? entry.value < 0.0001
                  ? entry.value.toExponential(2)
                  : entry.value < 0.01
                  ? entry.value.toFixed(6)
                  : entry.value < 1
                  ? entry.value.toFixed(4)
                  : entry.value.toFixed(2)
                : entry.value} {unitLabel}
            </span>
          </div>
        ))}
      </div>
    );
  };
}

export default function GasChart({ history, chainColor, chainType }: GasChartProps) {
  const [yScale, setYScale] = useState<"log" | "linear">("log");
  const isSolana = chainType === "solana";
  const unitLabel = isSolana ? "μL/CU" : "Gwei";
  const TooltipContent = makeTooltip(unitLabel);

  if (history.length < 2) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
        <h3 className="text-sm font-semibold text-white mb-0.5">Gas Price History</h3>
        <p className="text-[11px] text-gray-600 mb-4">Collecting data... ({history.length}/2)</p>
        <div className="h-56 flex items-center justify-center text-gray-700 text-sm">
          Chart appears after a few data points
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white mb-0.5">Gas Price History</h3>
          <p className="text-[11px] text-gray-600">{history.length} readings ({unitLabel}) &middot; {yScale} scale</p>
        </div>
        <div className="flex gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
          {(["log", "linear"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setYScale(s)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                yScale === s ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {s === "log" ? "Log" : "Linear"}
            </button>
          ))}
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="colorHigh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chainColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={chainColor} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorLow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["auto", "auto"]}
              tickFormatter={formatTimeTick}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              scale={yScale}
              domain={["auto", "auto"]}
              allowDataOverflow
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip content={<TooltipContent />} />
            <Area type="monotone" dataKey="high" stroke="#f97316" fill="url(#colorHigh)" strokeWidth={1.5} name="High" dot={false} />
            <Area type="monotone" dataKey="average" stroke={chainColor} fill="url(#colorAvg)" strokeWidth={2} name="Average" dot={false} />
            <Area type="monotone" dataKey="low" stroke="#10b981" fill="url(#colorLow)" strokeWidth={1.5} name="Low" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
