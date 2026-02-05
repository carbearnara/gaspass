import Database from "better-sqlite3";
import path from "path";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(process.cwd(), "gaspass.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS gas_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chain TEXT NOT NULL,
      avg_gwei REAL NOT NULL,
      swap_cost_usd REAL NOT NULL,
      token_price REAL NOT NULL,
      block_number INTEGER,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chain_ts ON gas_history(chain, timestamp);
  `);

  return db;
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

export function insertGasData(
  rows: {
    chain: string;
    avgGwei: number;
    swapCostUsd: number;
    tokenPrice: number;
    blockNumber?: number;
    timestamp: number;
  }[]
) {
  const database = getDb();
  const stmt = database.prepare(
    `INSERT INTO gas_history (chain, avg_gwei, swap_cost_usd, token_price, block_number, timestamp)
     VALUES (@chain, @avgGwei, @swapCostUsd, @tokenPrice, @blockNumber, @timestamp)`
  );

  const insertMany = database.transaction(
    (
      items: {
        chain: string;
        avgGwei: number;
        swapCostUsd: number;
        tokenPrice: number;
        blockNumber?: number;
        timestamp: number;
      }[]
    ) => {
      for (const item of items) {
        stmt.run({
          chain: item.chain,
          avgGwei: item.avgGwei,
          swapCostUsd: item.swapCostUsd,
          tokenPrice: item.tokenPrice,
          blockNumber: item.blockNumber ?? null,
          timestamp: item.timestamp,
        });
      }
    }
  );

  insertMany(rows);
}

export function queryAllChainsHistory(
  hours: number
): { timestamp: number; chains: Record<string, number> }[] {
  const database = getDb();
  const since = Date.now() - hours * 3600_000;

  const rows = database
    .prepare(
      `SELECT chain, avg_gwei, swap_cost_usd, token_price, timestamp
       FROM gas_history
       WHERE timestamp > ?
       ORDER BY timestamp ASC`
    )
    .all(since) as GasHistoryRow[];

  if (rows.length === 0) return [];

  // Group by timestamp (rows inserted together share the same timestamp)
  const grouped = new Map<number, Record<string, number>>();
  for (const row of rows) {
    let entry = grouped.get(row.timestamp);
    if (!entry) {
      entry = {};
      grouped.set(row.timestamp, entry);
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

export function queryChainHistory(
  chain: string,
  hours: number
): { timestamp: number; low: number; average: number; high: number }[] {
  const database = getDb();
  const since = Date.now() - hours * 3600_000;

  const rows = database
    .prepare(
      `SELECT avg_gwei, swap_cost_usd, token_price, timestamp
       FROM gas_history
       WHERE chain = ? AND timestamp > ?
       ORDER BY timestamp ASC`
    )
    .all(chain, since) as GasHistoryRow[];

  if (rows.length === 0) return [];

  // We only store avg_gwei; approximate low/high as ±15% like the fallback in gas/route.ts
  let points = rows.map((row) => ({
    timestamp: row.timestamp,
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
