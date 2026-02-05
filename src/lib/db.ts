import { neon } from "@neondatabase/serverless";

function getSQL() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL env var is not set");
  return neon(url);
}

let initialized = false;

async function ensureTable() {
  if (initialized) return;
  const sql = getSQL();
  await sql`
    CREATE TABLE IF NOT EXISTS gas_history (
      id SERIAL PRIMARY KEY,
      chain TEXT NOT NULL,
      avg_gwei DOUBLE PRECISION NOT NULL,
      swap_cost_usd DOUBLE PRECISION NOT NULL,
      token_price DOUBLE PRECISION NOT NULL,
      block_number INTEGER,
      timestamp BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_chain_ts ON gas_history(chain, timestamp)
  `;
  initialized = true;
}

export interface GasHistoryRow {
  id: number;
  chain: string;
  avg_gwei: number;
  swap_cost_usd: number;
  token_price: number;
  block_number: number | null;
  timestamp: number;
}

export async function insertGasData(
  rows: {
    chain: string;
    avgGwei: number;
    swapCostUsd: number;
    tokenPrice: number;
    blockNumber?: number;
    timestamp: number;
  }[]
) {
  await ensureTable();
  const sql = getSQL();

  // Batch insert using unnest for efficiency
  const chains = rows.map((r) => r.chain);
  const avgGweis = rows.map((r) => r.avgGwei);
  const swapCosts = rows.map((r) => r.swapCostUsd);
  const tokenPrices = rows.map((r) => r.tokenPrice);
  const blockNumbers = rows.map((r) => r.blockNumber ?? null);
  const timestamps = rows.map((r) => r.timestamp);

  await sql`
    INSERT INTO gas_history (chain, avg_gwei, swap_cost_usd, token_price, block_number, timestamp)
    SELECT * FROM unnest(
      ${chains}::text[],
      ${avgGweis}::double precision[],
      ${swapCosts}::double precision[],
      ${tokenPrices}::double precision[],
      ${blockNumbers}::integer[],
      ${timestamps}::bigint[]
    )
  `;
}

export async function queryAllChainsHistory(
  hours: number
): Promise<{ timestamp: number; chains: Record<string, number> }[]> {
  await ensureTable();
  const sql = getSQL();
  const since = Date.now() - hours * 3600_000;

  const rows = await sql`
    SELECT chain, swap_cost_usd, timestamp
    FROM gas_history
    WHERE timestamp > ${since}
    ORDER BY timestamp ASC
  ` as GasHistoryRow[];

  if (rows.length === 0) return [];

  // Group by timestamp (rows inserted together share the same timestamp)
  const grouped = new Map<number, Record<string, number>>();
  for (const row of rows) {
    const ts = Number(row.timestamp);
    let entry = grouped.get(ts);
    if (!entry) {
      entry = {};
      grouped.set(ts, entry);
    }
    entry[row.chain] = row.swap_cost_usd;
  }

  let points = Array.from(grouped.entries()).map(([timestamp, chains]) => ({
    timestamp,
    chains,
  }));

  // Downsample to ~200 points max
  if (points.length > 200) {
    const step = Math.ceil(points.length / 200);
    points = points.filter((_, i) => i % step === 0);
  }

  return points;
}

export async function queryChainHistory(
  chain: string,
  hours: number
): Promise<{ timestamp: number; low: number; average: number; high: number }[]> {
  await ensureTable();
  const sql = getSQL();
  const since = Date.now() - hours * 3600_000;

  const rows = await sql`
    SELECT avg_gwei, timestamp
    FROM gas_history
    WHERE chain = ${chain} AND timestamp > ${since}
    ORDER BY timestamp ASC
  ` as GasHistoryRow[];

  if (rows.length === 0) return [];

  // We only store avg_gwei; approximate low/high as ±15%
  let points = rows.map((row) => ({
    timestamp: Number(row.timestamp),
    low: row.avg_gwei * 0.85,
    average: row.avg_gwei,
    high: row.avg_gwei * 1.15,
  }));

  // Downsample to ~200 points max
  if (points.length > 200) {
    const step = Math.ceil(points.length / 200);
    points = points.filter((_, i) => i % step === 0);
  }

  return points;
}
