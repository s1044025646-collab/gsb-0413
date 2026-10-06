import { test } from "node:test";
import assert from "node:assert/strict";
import { solveTurnpike } from "../src/turnpike";
import { verifyPoints } from "../src/verify";
import { validateDistances, validatePoints, ApiError } from "../src/validate";

function allPairDistances(points: number[]): number[] {
  const pts = [...points].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) out.push(pts[j] - pts[i]);
  return out;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

test("两个点：单一距离", () => {
  const r = solveTurnpike([5], 2, 1000);
  assert.deepEqual(r.solutions, [[0, 5]]);
  assert.equal(r.stats.exhaustive, true);
});

test("等距点：{0,1,2,3} 距离 1,1,1,2,2,3", () => {
  const r = solveTurnpike([1, 1, 1, 2, 2, 3], 4, 10000);
  assert.deepEqual(r.solutions, [[0, 1, 2, 3]]);
});

test("重复距离示例：2,2,3,4,5,7 -> {0,2,4,7}，镜像合并", () => {
  const r = solveTurnpike([2, 2, 3, 4, 5, 7], 4, 10000);
  assert.deepEqual(r.solutions, [[0, 2, 4, 7]]);
  assert.equal(r.stats.stopReason, "exhausted");
});

test("候选碰撞与回滚：分支事件包含 reject/accept/rollback", () => {
  const r = solveTurnpike([2, 2, 3, 4, 5, 7], 4, 10000);
  const actions = new Set(r.branchTrace.map((e) => e.action));
  assert.ok(actions.has("accept"));
  assert.ok(actions.has("rollback"));
  // 每次 accept 后必有对应 rollback，计数精确恢复
  const accepts = r.branchTrace.filter((e) => e.action === "accept").length;
  const rollbacks = r.branchTrace.filter((e) => e.action === "rollback").length;
  assert.ok(rollbacks >= accepts - 1);
});

test("无解输入：穷尽后报告无解", () => {
  const r = solveTurnpike([1, 2, 3, 4, 5, 9], 4, 100000);
  assert.deepEqual(r.solutions, []);
  assert.equal(r.stats.exhaustive, true);
});

test("小预算：搜索未完成，保留已验证解", () => {
  const r = solveTurnpike([2, 2, 3, 4, 5, 7], 4, 1);
  assert.equal(r.stats.exhaustive, false);
  assert.equal(r.stats.stopReason, "budget_exceeded");
  assert.ok(r.stats.nodesVisited <= 1);
});

test("独立验证器：正确与错误坐标", () => {
  const ok = verifyPoints([0, 2, 4, 7], [2, 2, 3, 4, 5, 7]);
  assert.equal(ok.valid, true);
  const mirror = verifyPoints([0, 3, 5, 7], [2, 2, 3, 4, 5, 7]);
  assert.equal(mirror.valid, true);
  const bad = verifyPoints([0, 2, 4, 6], [2, 2, 3, 4, 5, 7]);
  assert.equal(bad.valid, false);
  assert.ok(Object.keys(bad.missing).length > 0 || Object.keys(bad.extra).length > 0);
});

test("参数校验：拒绝非法输入", () => {
  assert.throws(() => validateDistances([0, 1, 2]), (e: ApiError) => e.code === "E_INVALID_DISTANCE");
  assert.throws(() => validateDistances([-1, 2, 3]), (e: ApiError) => e.code === "E_INVALID_DISTANCE");
  assert.throws(() => validateDistances([1.5, 2, 3]), (e: ApiError) => e.code === "E_INVALID_DISTANCE");
  assert.throws(() => validateDistances([1, 2, 3, 4]), (e: ApiError) => e.code === "E_INVALID_COUNT");
  assert.throws(() => validatePoints([1, 1, 2]), (e: ApiError) => e.code === "E_INVALID_POINTS");
});

test("穷举核对：小整数范围内全部坐标组合与暴力枚举一致", () => {
  // 暴力枚举：对给定距离多重集，枚举 0..D 内全部含 0 和 D 的 n 点子集，
  // 用独立验证器判定，再做镜像规范去重，作为基准解集。
  function bruteForce(distances: number[], n: number): number[][] {
    const D = Math.max(...distances);
    const out: number[][] = [];
    const seen = new Set<string>();
    const inner: number[] = [];
    const enumRec = (start: number) => {
      if (inner.length === n - 2) {
        const pts = [0, ...inner, D];
        if (verifyPoints(pts, distances).valid) {
          const sorted = pts;
          const mirror = sorted.map((p) => D - p).sort((a, b) => a - b);
          let canon = sorted;
          for (let i = 0; i < sorted.length; i++) {
            if (sorted[i] < mirror[i]) { canon = sorted; break; }
            if (sorted[i] > mirror[i]) { canon = mirror; break; }
          }
          const key = canon.join(",");
          if (!seen.has(key)) { seen.add(key); out.push(canon); }
        }
        return;
      }
      for (let x = start; x < D; x++) {
        inner.push(x);
        enumRec(x + 1);
        inner.pop();
      }
    };
    enumRec(1);
    return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  const cases: number[][] = [
    [0, 2, 4, 7],
    [0, 1, 2, 3],
    [0, 1, 4, 6],
    [0, 3, 5],
    [0, 2, 5, 6, 8],
  ];
  for (const pts of cases) {
    const distances = allPairDistances(pts);
    const n = pts.length;
    const expected = bruteForce(distances, n);
    const got = solveTurnpike(distances, n, 1000000).solutions;
    assert.deepEqual(got, expected, `points=${pts.join(",")}`);
  }
});

test("重排输入不影响答案", () => {
  const base = allPairDistances([0, 2, 4, 7]);
  const reference = solveTurnpike(base, 4, 10000).solutions;
  for (let seed = 1; seed <= 10; seed++) {
    const shuffled = shuffle(base, seed * 7919);
    assert.deepEqual(solveTurnpike(shuffled, 4, 10000).solutions, reference);
  }
});
