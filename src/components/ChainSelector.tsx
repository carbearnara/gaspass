"use client";

import { chains, ChainConfig } from "@/lib/chains";

interface ChainSelectorProps {
  selected: string;
  onSelect: (chainId: string) => void;
}

export default function ChainSelector({ selected, onSelect }: ChainSelectorProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {chains.map((chain: ChainConfig) => {
        const active = selected === chain.id;
        return (
          <button
            key={chain.id}
            onClick={() => onSelect(chain.id)}
            className={`
              flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
              transition-all duration-150 cursor-pointer
              ${active
                ? "bg-white text-gray-900 shadow-md shadow-black/10"
                : "bg-white/[0.04] text-gray-500 hover:bg-white/[0.08] hover:text-gray-300"
              }
            `}
          >
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
              style={{ backgroundColor: chain.color }}
            >
              {chain.icon}
            </span>
            <span className="hidden sm:inline">{chain.name}</span>
            <span className="sm:hidden">{chain.name.slice(0, 3)}</span>
          </button>
        );
      })}
    </div>
  );
}
