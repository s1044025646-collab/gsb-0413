/**
 * 独立验证器：直接从候选坐标枚举全部点对距离，
 * 逐项与目标多重集比较计数。不依赖求解器任何内部状态。
 */

export interface VerifyResult {
  valid: boolean;
  /** 目标中有而候选缺失/不足的距离及次数 */
  missing: Record<string, number>;
  /** 候选中多出的距离及次数 */
  extra: Record<string, number>;
  pointCount: number;
  distanceCount: number;
}

function multiset(arr: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

export function verifyPoints(points: number[], distances: number[]): VerifyResult {
  const pts = [...points].sort((a, b) => a - b);
  const actual: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      actual.push(pts[j] - pts[i]);
    }
  }
  const want = multiset(distances);
  const got = multiset(actual);
  const missing: Record<string, number> = {};
  const extra: Record<string, number> = {};
  for (const [d, c] of want) {
    const g = got.get(d) ?? 0;
    if (g < c) missing[String(d)] = c - g;
  }
  for (const [d, c] of got) {
    const w = want.get(d) ?? 0;
    if (c > w) extra[String(d)] = c - w;
  }
  return {
    valid: Object.keys(missing).length === 0 && Object.keys(extra).length === 0,
    missing,
    extra,
    pointCount: pts.length,
    distanceCount: actual.length,
  };
}
