import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.TURNPIKE_DATA_DIR ?? path.join(here, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.TURNPIKE_DB ?? path.join(DATA_DIR, 'turnpike.db');

export const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  n INTEGER NOT NULL,
  distances TEXT NOT NULL,
  counts TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id),
  budget INTEGER NOT NULL,
  algorithm TEXT NOT NULL,
  exhaustive INTEGER NOT NULL,
  nodes_visited INTEGER NOT NULL,
  stop_reason TEXT NOT NULL,
  solutions TEXT NOT NULL,
  traces TEXT NOT NULL,
  trace_truncated INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export const ALGORITHM = 'turnpike-backtracking-multiset-v1';

export interface ProblemRow { id: number; n: number; distances: string; counts: string; created_at: string }
export interface RunRow {
  id: number; problem_id: number; budget: number; algorithm: string;
  exhaustive: number; nodes_visited: number; stop_reason: string;
  solutions: string; traces: string; trace_truncated: number; created_at: string;
}

export function createProblem(n: number, distances: number[]): ProblemRow {
  const counts: Record<number, number> = {};
  for (const d of distances) counts[d] = (counts[d] ?? 0) + 1;
  const stmt = db.prepare('INSERT INTO problems (n, distances, counts) VALUES (?, ?, ?)');
  const res = stmt.run(n, JSON.stringify(distances), JSON.stringify(counts));
  return getProblem(Number(res.lastInsertRowid))!;
}

export function getProblem(id: number): ProblemRow | undefined {
  return db.prepare('SELECT * FROM problems WHERE id = ?').get(id) as ProblemRow | undefined;
}

export function listProblems(): ProblemRow[] {
  return db.prepare('SELECT * FROM problems ORDER BY id').all() as unknown as ProblemRow[];
}

export function createRun(run: Omit<RunRow, 'id' | 'created_at'>): RunRow {
  const stmt = db.prepare(`INSERT INTO runs
    (problem_id, budget, algorithm, exhaustive, nodes_visited, stop_reason, solutions, traces, trace_truncated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const res = stmt.run(
    run.problem_id, run.budget, run.algorithm, run.exhaustive, run.nodes_visited,
    run.stop_reason, run.solutions, run.traces, run.trace_truncated,
  );
  return getRun(Number(res.lastInsertRowid))!;
}

export function getRun(id: number): RunRow | undefined {
  return db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined;
}

export function runsForProblem(problemId: number): RunRow[] {
  return db.prepare('SELECT * FROM runs WHERE problem_id = ? ORDER BY id').all(problemId) as unknown as RunRow[];
}

