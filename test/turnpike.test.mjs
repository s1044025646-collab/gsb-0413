import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveTurnpike, canonicalOf } from '../dist/turnpike.js';
import { verifyCoordinates, validateDistances } from '../dist/verify.js';

function allPairDistances(points) {
  const out = [];
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) out.push(points[j] - points[i]);
  return out;
}

test('两个点: n=2', () => {
  const r = solveTurnpike(2, [5]);
  assert.deepEqual(r.solutions, [[0, 5]]);
  assert.equal(r.exhaustive, true);
});

test('演示输入 [2,2,3,4,5,7] 唯一规范解 [0,2,4,7]', () => {
  const r = solveTurnpike(4, [2, 2, 3, 4, 5, 7]);
  assert.deepEqual(r.solutions, [[0, 2, 4, 7]]);
  assert.equal(r.stopReason, 'exhausted');
});

test('镜像合并为同一规范解', () => {
  assert.deepEqual(canonicalOf([0, 3, 5, 7]), [0, 2, 4, 7]);
  assert.deepEqual(canonicalOf([0, 2, 4, 7]), [0, 2, 4, 7]);
});

test('等距点 [0,1,2,3] 重复距离不去重', () => {
  const r = solveTurnpike(4, [1, 1, 1, 2, 2, 3]);
  assert.deepEqual(r.solutions, [[0, 1, 2, 3]]);
});

test('重复距离计数不足会被拒绝（多重集而非集合）', () => {
  const r = solveTurnpike(3, [1, 1, 3]);
  assert.deepEqual(r.solutions, []);
  assert.equal(r.exhaustive, true);
});

test('无解输入穷尽后报告无解', () => {
  const r = solveTurnpike(4, [1, 2, 3, 4, 5, 100]);
  assert.deepEqual(r.solutions, []);
  assert.equal(r.exhaustive, true);
  assert.equal(r.stopReason, 'exhausted');
});

test('小预算: 搜索未完成，保留已验证解', () => {
  const r = solveTurnpike(4, [2, 2, 3, 4, 5, 7], { nodeBudget: 2 });
  assert.equal(r.exhaustive, false);
  assert.equal(r.stopReason, 'budget_exceeded');
});

test('候选碰撞与 y == D-y 不产生重复分支', () => {
  const r = solveTurnpike(3, [2, 2, 4]);
  assert.deepEqual(r.solutions, [[0, 2, 4]]);
  const enters = r.traces.filter((t) => t.depth === 1 && t.ok && t.reason.includes('递归'));
  assert.equal(enters.length, 1);
});

test('分支回滚后计数精确恢复', () => {
  const r = solveTurnpike(4, [2, 2, 3, 4, 5, 7]);
  assert.ok(r.traces.some((t) => !t.ok), '应存在计数不足被拒的分支');
  assert.ok(r.traces.some((t) => t.reason.includes('回滚')), '应记录回滚');
  assert.deepEqual(r.solutions, [[0, 2, 4, 7]]);
});

test('独立验证器: 正确与错误坐标', () => {
  assert.equal(verifyCoordinates([2, 2, 3, 4, 5, 7], [0, 2, 4, 7]).valid, true);
  assert.equal(verifyCoordinates([2, 2, 3, 4, 5, 7], [0, 3, 5, 7]).valid, true);
  const bad = verifyCoordinates([2, 2, 3, 4, 5, 7], [0, 2, 3, 7]);
  assert.equal(bad.valid, false);
  assert.ok(bad.missing.length + bad.extra.length > 0);
});

test('输入校验: 零、负数、非整数、非法数量、越界、重复点', () => {
  assert.throws(() => validateDistances([0, 1, 2]), (e) => e.code === 'INVALID_DISTANCE');
  assert.throws(() => validateDistances([-1, 1, 2]), (e) => e.code === 'INVALID_DISTANCE');
  assert.throws(() => validateDistances([1.5, 1, 2]), (e) => e.code === 'INVALID_DISTANCE');
  assert.throws(() => validateDistances([1, 2, 3, 4]), (e) => e.code === 'INVALID_COUNT');
  assert.throws(() => validateDistances([1, 2]), (e) => e.code === 'INVALID_COUNT');
  assert.throws(() => verifyCoordinates([1, 2, 3], [0, 1, 1]), (e) => e.code === 'INVALID_INPUT');
  assert.throws(() => verifyCoordinates([1, 2, 3], [0, 1, 5]), (e) => e.code === 'OUT_OF_RANGE');
});

test('小整数范围独立枚举核对解集（n=4, D<=8 抽样）', () => {
  const combos = [];
  for (let a = 0; a <= 0; a++) // 只枚举最小点为 0 的规范组合
    for (let b = a + 1; b <= 8; b++)
      for (let c = b + 1; c <= 8; c++)
        for (let d = c + 1; d <= 8; d++)
          combos.push([a, b, c, d]);
  const key = (arr) => [...arr].sort((x, y) => x - y).join(',');
  const samples = combos.filter((_, i) => i % 37 === 0);
  for (const coords of samples) {
    const distances = allPairDistances(coords);
    const r = solveTurnpike(4, distances);
    const target = key(distances);
    const expected = new Set();
    for (const c of combos) {
      if (key(allPairDistances(c)) === target) expected.add(canonicalOf(c).join(','));
    }
    const got = new Set(r.solutions.map((s) => s.join(',')));
    assert.deepEqual(got, expected, `坐标 ${coords} 的解集与枚举不一致`);
  }
});

test('重排输入不影响答案', () => {
  const r1 = solveTurnpike(4, [2, 2, 3, 4, 5, 7]);
  const r2 = solveTurnpike(4, [7, 3, 2, 5, 2, 4]);
  assert.deepEqual(r1.solutions, r2.solutions);
});

test('多解情形: 非镜像同距离集的两个规范解', () => {
  const distances = [1, 1, 2, 2, 3, 4, 5, 5, 6, 6, 7, 8, 9, 10, 11];
  const r = solveTurnpike(6, distances);
  assert.equal(r.solutions.length, 2);
  assert.ok(r.solutions.some((s) => s.join(',') === '0,1,2,6,8,11'));
  assert.ok(r.solutions.some((s) => s.join(',') === '0,1,6,7,9,11'));
});


