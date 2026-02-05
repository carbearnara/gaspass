"use client";

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
}

interface PayloadEntry {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: PayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-950/95 backdrop-blur border border-white/10 rounded-lg px-3 py-2.5 shadow-2xl">
      <p className="text-[11px] text-gray-500 mb-1.5">{label}</p>
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
              : entry.value} Gwei
          </span>
        </div>
      ))}
    </div>
  );
}

export default function GasChart({ history, chainColor }: GasChartProps) {
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
      <h3 className="text-sm font-semibold text-white mb-0.5">Gas Price History</h3>
      <p className="text-[11px] text-gray-600 mb-3">{history.length} readings (Gwei) &middot; log scale</p>
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
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="high" stroke="#f97316" fill="url(#colorHigh)" strokeWidth={1.5} name="High" dot={false} />
            <Area type="monotone" dataKey="average" stroke={chainColor} fill="url(#colorAvg)" strokeWidth={2} name="Average" dot={false} />
            <Area type="monotone" dataKey="low" stroke="#10b981" fill="url(#colorLow)" strokeWidth={1.5} name="Low" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
