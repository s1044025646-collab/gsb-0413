/**
 * 一维 Turnpike 重建核心：带距离计数的回溯搜索。
 */

export interface BranchEvent {
  depth: number;
  y: number;
  candidate: number;
  action: "try" | "reject" | "accept" | "rollback";
  needed?: number[];
  reason?: string;
}

export interface SolveStats {
  nodesVisited: number;
  exhaustive: boolean;
  stopReason: "exhausted" | "budget_exceeded";
}

export interface SolveResult {
  solutions: number[][];
  stats: SolveStats;
  branchTrace: BranchEvent[];
  traceTruncated: boolean;
}

export const MAX_TRACE_EVENTS = 200;

function canonical(points: number[], D: number): number[] {
  const sorted = [...points].sort((a, b) => a - b);
  const mirror = sorted.map((p) => D - p).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] < mirror[i]) return sorted;
    if (sorted[i] > mirror[i]) return mirror;
  }
  return sorted;
}

export function solveTurnpike(
  distances: number[],
  n: number,
  budget: number
): SolveResult {
  const D = Math.max(...distances);
  const remaining = new Map<number, number>();
  for (const d of distances) {
    remaining.set(d, (remaining.get(d) ?? 0) + 1);
  }
  const placed: number[] = [0, D];
  const placedSet = new Set<number>([0, D]);
  remaining.set(D, (remaining.get(D) as number) - 1);
  if (remaining.get(D) === 0) remaining.delete(D);

  const solutions: number[][] = [];
  const seenCanonical = new Set<string>();
  const trace: BranchEvent[] = [];
  let traceTruncated = false;
  let nodesVisited = 0;
  let budgetOut = false;

  const pushEvent = (e: BranchEvent) => {
    if (trace.length < MAX_TRACE_EVENTS) trace.push(e);
    else traceTruncated = true;
  };

  const maxRemaining = (): number => {
    let m = -1;
    for (const key of remaining.keys()) if (key > m) m = key;
    return m;
  };

  const search = (): void => {
    if (budgetOut) return;
    if (placed.length === n) {
      if (remaining.size === 0) {
        const canon = canonical(placed, D);
        const key = canon.join(",");
        if (!seenCanonical.has(key)) {
          seenCanonical.add(key);
          solutions.push(canon);
        }
      }
      return;
    }
    const y = maxRemaining();
    const depth = placed.length;
    const candidates = y === D - y ? [y] : [y, D - y];
    for (const cand of candidates) {
      if (budgetOut) return;
      if (cand <= 0 || cand >= D) {
        pushEvent({
          depth, y, candidate: cand, action: "reject",
          reason: "候选坐标越界（必须严格位于 0 与 D 之间）",
        });
        continue;
      }
      if (placedSet.has(cand)) {
        pushEvent({
          depth, y, candidate: cand, action: "reject",
          reason: "候选坐标已被放置，跳过重复分支",
        });
        continue;
      }
      nodesVisited++;
      if (nodesVisited > budget) {
        budgetOut = true;
        return;
      }
      const needed = placed.map((p) => Math.abs(cand - p));
      const needCount = new Map<number, number>();
      for (const d of needed) needCount.set(d, (needCount.get(d) ?? 0) + 1);
      let ok = true;
      for (const [d, c] of needCount) {
        if ((remaining.get(d) ?? 0) < c) {
          pushEvent({
            depth, y, candidate: cand, action: "reject", needed,
            reason: `距离 ${d} 需要 ${c} 次，剩余仅 ${remaining.get(d) ?? 0} 次`,
          });
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      for (const [d, c] of needCount) {
        const left = (remaining.get(d) as number) - c;
        if (left === 0) remaining.delete(d);
        else remaining.set(d, left);
      }
      placed.push(cand);
      placedSet.add(cand);
      pushEvent({ depth, y, candidate: cand, action: "accept", needed });
      search();
      placed.pop();
      placedSet.delete(cand);
      for (const [d, c] of needCount) {
        remaining.set(d, (remaining.get(d) ?? 0) + c);
      }
      pushEvent({ depth, y, candidate: cand, action: "rollback", needed });
    }
  };

  search();

  solutions.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  });

  return {
    solutions,
    stats: {
      nodesVisited: Math.min(nodesVisited, budget),
      exhaustive: !budgetOut,
      stopReason: budgetOut ? "budget_exceeded" : "exhausted",
    },
    branchTrace: trace,
    traceTruncated,
  };
}
