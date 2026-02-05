export interface GasData {
  chain: string;
  blockNumber: number;
  low: number;
  average: number;
  high: number;
  baseFee: number | null;
  timestamp: number;
  networkStats: {
    txCount: number;
    gasUsed: number;
    gasLimit: number;
    utilization: number;
  };
}

export interface GasHistoryPoint {
  time: string;
  timestamp: number;
  low: number;
  average: number;
  high: number;
}
