"use client";

import { GasData } from "@/lib/types";
import { COMMON_TRANSACTIONS } from "@/lib/chains";

interface CostEstimatesProps {
  data: GasData | null;
  tokenPrice: number;
  tokenSymbol: string;
}

function cost(gasLimit: number, gweiPrice: number, tokenPrice: number): string {
  const usd = ((gweiPrice * gasLimit) / 1e9) * tokenPrice;
  if (usd === 0) return "$0";
  if (usd < 0.000001) return `$${usd.toExponential(2)}`;
  if (usd < 0.0001) return `$${usd.toFixed(8)}`;
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

const icons: Record<string, string> = {
  "arrow-right": "\u2192",
  coin: "\u{1FA99}",
  check: "\u2713",
  swap: "\u21C4",
  image: "\u{1F5BC}",
  plus: "+",
  bridge: "\u{1F309}",
  code: "\u{1F4BB}",
};

export default function CostEstimates({ data, tokenPrice, tokenSymbol }: CostEstimatesProps) {
  if (!data) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
        <div className="h-4 bg-white/10 rounded w-40 mb-4 animate-pulse" />
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-white/[0.04] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
      <h3 className="text-sm font-semibold text-white mb-0.5">Cost Estimates</h3>
      <p className="text-[11px] text-gray-600 mb-3">Current prices ({tokenSymbol})</p>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
              <th className="text-left pb-2 pl-1 font-medium">Action</th>
              <th className="text-right pb-2 font-medium">Gas</th>
              <th className="text-right pb-2 font-medium" style={{ color: "#34d399" }}>Low</th>
              <th className="text-right pb-2 font-medium" style={{ color: "#60a5fa" }}>Avg</th>
              <th className="text-right pb-2 pr-1 font-medium" style={{ color: "#fb923c" }}>High</th>
            </tr>
          </thead>
          <tbody>
            {COMMON_TRANSACTIONS.map((tx, i) => (
              <tr key={tx.name} className={i % 2 === 0 ? "bg-white/[0.015]" : ""}>
                <td className="py-2 pl-1 text-gray-400">
                  <span className="mr-1.5 opacity-60">{icons[tx.icon] || ""}</span>
                  {tx.name}
                </td>
                <td className="py-2 text-gray-600 text-right font-mono">
                  {tx.gasLimit >= 1000 ? `${(tx.gasLimit / 1000).toFixed(0)}K` : tx.gasLimit}
                </td>
                <td className="py-2 text-right font-mono" style={{ color: "#34d399" }}>
                  {cost(tx.gasLimit, data.low, tokenPrice)}
                </td>
                <td className="py-2 text-right font-mono" style={{ color: "#60a5fa" }}>
                  {cost(tx.gasLimit, data.average, tokenPrice)}
                </td>
                <td className="py-2 pr-1 text-right font-mono" style={{ color: "#fb923c" }}>
                  {cost(tx.gasLimit, data.high, tokenPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
