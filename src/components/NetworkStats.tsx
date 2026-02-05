"use client";

import { GasData } from "@/lib/types";
import { ChainConfig } from "@/lib/chains";

interface NetworkStatsProps {
  data: GasData | null;
  chain: ChainConfig;
}

function formatNumber(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatFee(v: number): string {
  if (v === 0) return "0";
  if (v < 0.01) return v.toFixed(6);
  if (v < 1) return v.toFixed(4);
  return v.toLocaleString();
}

export default function NetworkStats({ data, chain }: NetworkStatsProps) {
  if (!data) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white/[0.03] rounded-xl p-3.5 animate-pulse">
            <div className="h-2.5 bg-white/10 rounded w-14 mb-2" />
            <div className="h-5 bg-white/10 rounded w-18" />
          </div>
        ))}
      </div>
    );
  }

  const isSolana = chain.chainType === "solana";

  const stats = isSolana
    ? [
        { label: "Slot", value: `#${data.blockNumber.toLocaleString()}`, link: `${chain.explorerUrl}/block/${data.blockNumber}` },
        { label: "TPS", value: data.networkStats.txCount.toLocaleString() },
        { label: "Base Fee", value: "5,000 lamports" },
        { label: "Priority", value: `${formatFee(data.average)} μL/CU` },
      ]
    : [
        { label: "Block", value: `#${data.blockNumber.toLocaleString()}`, link: `${chain.explorerUrl}/block/${data.blockNumber}` },
        { label: "Txns", value: data.networkStats.txCount.toString() },
        { label: "Gas Used", value: formatNumber(data.networkStats.gasUsed) },
        { label: "Utilization", value: `${data.networkStats.utilization.toFixed(1)}%` },
      ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="bg-white/[0.03] rounded-xl border border-white/[0.04] p-3.5">
          <div className="text-[10px] text-gray-600 mb-1">{s.label}</div>
          {s.link ? (
            <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-white hover:underline">
              {s.value}
            </a>
          ) : (
            <div className="text-sm font-semibold text-white">{s.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}
