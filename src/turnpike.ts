export interface BranchTrace {
  depth: number;
  y: number;
  candidate: number;
  needed: number[];
  ok: boolean;
  reason: string;
}

export interface SolveOptions {
  nodeBudget?: number;
  traceLimit?: number;
}

export interface SolveResult {
  solutions: number[][];
  exhaustive: boolean;
  nodesVisited: number;
  stopReason: 'exhausted' | 'budget_exceeded';
  traces: BranchTrace[];
  traceTruncated: boolean;
}

export const DEFAULT_NODE_BUDGET = 100000;
const DEFAULT_TRACE_LIMIT = 200;

export function canonicalOf(points: number[]): number[] {
  const sorted = [...points].sort((a, b) => a - b);
  const d = sorted[sorted.length - 1];
  const mirror = sorted.map((x) => d - x).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] < mirror[i]) return sorted;
    if (sorted[i] > mirror[i]) return mirror;
  }
  return sorted;
}

export function countDistances(distances: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const d of distances) counts.set(d, (counts.get(d) ?? 0) + 1);
  return counts;
}

export function solveTurnpike(
  n: number,
  distances: number[],
  options: SolveOptions = {},
): SolveResult {
  const nodeBudget = options.nodeBudget ?? DEFAULT_NODE_BUDGET;
  const traceLimit = options.traceLimit ?? DEFAULT_TRACE_LIMIT;

  const counts = countDistances(distances);
  const dMax = Math.max(...distances);
  counts.set(dMax, (counts.get(dMax) as number) - 1);
  if (counts.get(dMax) === 0) counts.delete(dMax);

  const placed: number[] = [0, dMax];
  const placedSet = new Set<number>(placed);
  const found = new Map<string, number[]>();
  const traces: BranchTrace[] = [];
  let nodesVisited = 0;
  let budgetOut = false;
  let traceTruncated = false;

  function record(trace: BranchTrace): void {
    if (traces.length < traceLimit) traces.push(trace);
    else traceTruncated = true;
  }

  function maxRemaining(): number {
    let m = -1;
    for (const [key, c] of counts) if (c > 0 && key > m) m = key;
    return m;
  }

  function tryPlace(x: number, depth: number, y: number): void {
    const needed: number[] = [];
    for (const p of placed) needed.push(Math.abs(x - p));
    const needCounts = countDistances(needed);
    for (const [dist, c] of needCounts) {
      if ((counts.get(dist) ?? 0) < c) {
        record({
          depth, y, candidate: x, needed, ok: false,
          reason: `距离 ${dist} 需要 ${c} 次，剩余仅 ${counts.get(dist) ?? 0} 次，跳过该候选`,
        });
        return;
      }
    }
    for (const [dist, c] of needCounts) {
      const left = (counts.get(dist) as number) - c;
      if (left === 0) counts.delete(dist);
      else counts.set(dist, left);
    }
    placed.push(x);
    placedSet.add(x);
    record({ depth, y, candidate: x, needed, ok: true, reason: '计数足够，扣除并递归' });
    recurse(depth + 1);
    placed.pop();
    placedSet.delete(x);
    for (const [dist, c] of needCounts) {
      counts.set(dist, (counts.get(dist) ?? 0) + c);
    }
    record({ depth, y, candidate: x, needed, ok: true, reason: '分支结束，回滚扣除的距离计数' });
  }

  function recurse(depth: number): void {
    if (budgetOut) return;
    nodesVisited++;
    if (nodesVisited > nodeBudget) {
      budgetOut = true;
      return;
    }
    if (placed.length === n) {
      if (counts.size === 0) {
        const canonical = canonicalOf(placed);
        const key = canonical.join(',');
        if (!found.has(key)) found.set(key, canonical);
      }
      return;
    }
    const y = maxRemaining();
    const candidates: number[] = [];
    for (const c of [y, dMax - y]) {
      if (c <= 0 || c >= dMax) continue;
      if (placedSet.has(c)) continue;
      if (!candidates.includes(c)) candidates.push(c);
    }
    for (const c of candidates) {
      tryPlace(c, depth, y);
      if (budgetOut) return;
    }
  }

  recurse(1);

  return {
    solutions: [...found.values()].sort((a, b) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
      return 0;
    }),
    exhaustive: !budgetOut,
    nodesVisited,
    stopReason: budgetOut ? 'budget_exceeded' : 'exhausted',
    traces,
    traceTruncated,
  };
}
