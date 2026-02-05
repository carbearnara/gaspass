"use client";

import { GasData } from "@/lib/types";
import { SOLANA_BASE_FEE_LAMPORTS } from "@/lib/chains";

interface GasTiersProps {
  data: GasData | null;
  tokenPrice: number;
  tokenSymbol: string;
  chainColor: string;
  chainType?: string;
}

function formatGwei(gwei: number): string {
  if (gwei === 0) return "0";
  if (gwei < 0.000001) return gwei.toExponential(2);
  if (gwei < 0.0001) return gwei.toFixed(8);
  if (gwei < 0.01) return gwei.toFixed(6);
  if (gwei < 1) return gwei.toFixed(4);
  if (gwei < 100) return gwei.toFixed(2);
  return gwei.toFixed(0);
}

function formatUsdSmart(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.000001) return `$${usd.toExponential(2)}`;
  if (usd < 0.0001) return `$${usd.toFixed(8)}`;
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function estimateUsd(feeValue: number, tokenPrice: number, chainType?: string): string {
  let usd: number;
  if (chainType === "solana") {
    // SOL transfer: 1 sig base fee + priority fee * ~450 CU
    const baseLamports = SOLANA_BASE_FEE_LAMPORTS;
    const priorityLamports = (feeValue * 450) / 1e6;
    usd = ((baseLamports + priorityLamports) / 1e9) * tokenPrice;
  } else {
    usd = ((feeValue * 21000) / 1e9) * tokenPrice;
  }
  return formatUsdSmart(usd);
}

const evmTierStyles = {
  low: { label: "Low", speed: "~5 min", border: "#10b98133", bg: "#10b9810f", accent: "#34d399" },
  average: { label: "Average", speed: "~30 sec", border: "#3b82f633", bg: "#3b82f60f", accent: "#60a5fa" },
  high: { label: "High", speed: "~15 sec", border: "#f9731633", bg: "#f973160f", accent: "#fb923c" },
};

const solanaTierStyles = {
  low: { label: "Low", speed: "~2s", border: "#10b98133", bg: "#10b9810f", accent: "#34d399" },
  average: { label: "Average", speed: "~400ms", border: "#3b82f633", bg: "#3b82f60f", accent: "#60a5fa" },
  high: { label: "High", speed: "~400ms", border: "#f9731633", bg: "#f973160f", accent: "#fb923c" },
};

export default function GasTiers({ data, tokenPrice, tokenSymbol, chainType }: GasTiersProps) {
  if (!data) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {(["low", "average", "high"] as const).map((k) => (
          <div key={k} className="bg-white/[0.03] rounded-xl p-4 animate-pulse">
            <div className="h-3 bg-white/10 rounded w-12 mb-3" />
            <div className="h-7 bg-white/10 rounded w-20 mb-1.5" />
            <div className="h-3 bg-white/10 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  const isSolana = chainType === "solana";
  const tierStyles = isSolana ? solanaTierStyles : evmTierStyles;
  const unitLabel = isSolana ? "μL/CU" : "Gwei";
  const values = { low: data.low, average: data.average, high: data.high };

  return (
    <div className="grid grid-cols-3 gap-3">
      {(["low", "average", "high"] as const).map((key) => {
        const s = tierStyles[key];
        const value = values[key];
        return (
          <div
            key={key}
            className="rounded-xl p-4"
            style={{ border: `1px solid ${s.border}`, backgroundColor: s.bg }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: s.accent }}
              >
                {s.label}
              </span>
              <span className="text-[10px] text-gray-600">{s.speed}</span>
            </div>
            <div className="text-2xl font-bold text-white leading-none mb-1">
              {formatGwei(value)}
              <span className="text-[11px] font-normal text-gray-500 ml-1.5">{unitLabel}</span>
            </div>
            <div className="text-xs text-gray-500">
              {estimateUsd(value, tokenPrice, chainType)} / transfer
            </div>
            {key === "average" && (
              <div className="mt-2.5 pt-2.5 border-t border-white/5 text-[10px] text-gray-600">
                {isSolana
                  ? `Base: ${SOLANA_BASE_FEE_LAMPORTS.toLocaleString()} lamports/sig`
                  : data.baseFee !== null
                  ? `Base: ${formatGwei(data.baseFee)} Gwei (${tokenSymbol})`
                  : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
