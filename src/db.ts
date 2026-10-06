/** SQLite 持久化：题目、求解运行与已验证结果 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { SolveResult } from "./turnpike";

export const ALGORITHM_VERSION = "turnpike-backtrack-v1";

export interface ProblemRow {
  id: number;
  distances: number[];
  n: number;
  createdAt: string;
}

export interface RunRow {
  id: number;
  problemId: number;
  budget: number;
  algorithm: string;
  result: SolveResult;
  createdAt: string;
}

export class Store {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "turnpike.db"));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS problems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        n INTEGER NOT NULL,
        distances TEXT NOT NULL,
        counts TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        problem_id INTEGER NOT NULL REFERENCES problems(id),
        budget INTEGER NOT NULL,
        algorithm TEXT NOT NULL,
        result TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  createProblem(distances: number[], n: number): ProblemRow {
    const counts: Record<string, number> = {};
    for (const d of distances) counts[String(d)] = (counts[String(d)] ?? 0) + 1;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      "INSERT INTO problems (n, distances, counts, created_at) VALUES (?, ?, ?, ?)"
    );
    const r = stmt.run(n, JSON.stringify(distances), JSON.stringify(counts), now);
    return { id: Number(r.lastInsertRowid), distances, n, createdAt: now };
  }

  getProblem(id: number): (ProblemRow & { counts: Record<string, number> }) | null {
    const row = this.db.prepare("SELECT * FROM problems WHERE id = ?").get(id) as
      | { id: number; n: number; distances: string; counts: string; created_at: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      n: row.n,
      distances: JSON.parse(row.distances) as number[],
      counts: JSON.parse(row.counts) as Record<string, number>,
      createdAt: row.created_at,
    };
  }

  createRun(problemId: number, budget: number, result: SolveResult): RunRow {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      "INSERT INTO runs (problem_id, budget, algorithm, result, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    const r = stmt.run(problemId, budget, ALGORITHM_VERSION, JSON.stringify(result), now);
    return {
      id: Number(r.lastInsertRowid),
      problemId, budget, algorithm: ALGORITHM_VERSION, result, createdAt: now,
    };
  }

  latestRun(problemId: number): RunRow | null {
    const row = this.db.prepare(
      "SELECT * FROM runs WHERE problem_id = ? ORDER BY id DESC LIMIT 1"
    ).get(problemId) as
      | { id: number; problem_id: number; budget: number; algorithm: string; result: string; created_at: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      problemId: row.problem_id,
      budget: row.budget,
      algorithm: row.algorithm,
      result: JSON.parse(row.result) as SolveResult,
      createdAt: row.created_at,
    };
  }

  close(): void {
    this.db.close();
  }
}
