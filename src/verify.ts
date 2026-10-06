import { countDistances } from './turnpike.js';

export const MIN_N = 2;
export const MAX_N = 8;

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_COUNT'
  | 'INVALID_DISTANCE'
  | 'NOT_FOUND'
  | 'OUT_OF_RANGE';

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public status = 400) {
    super(message);
  }
}

export function validateDistances(input: unknown): { n: number; distances: number[] } {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ApiError('INVALID_INPUT', 'distances 必须是非空数组');
  }
  const distances: number[] = [];
  for (const v of input) {
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      throw new ApiError('INVALID_DISTANCE', `距离 ${String(v)} 不是整数`);
    }
    if (!Number.isSafeInteger(v)) {
      throw new ApiError('OUT_OF_RANGE', `距离 ${v} 超出 JavaScript 安全整数范围`);
    }
    if (v <= 0) {
      throw new ApiError('INVALID_DISTANCE', `距离 ${v} 必须为正整数（拒绝零与负数）`);
    }
    distances.push(v);
  }
  const m = distances.length;
  const n = (1 + Math.sqrt(1 + 8 * m)) / 2;
  if (!Number.isInteger(n)) {
    throw new ApiError('INVALID_COUNT', `距离数量 ${m} 不是合法的 n*(n-1)/2`);
  }
  if (n < MIN_N || n > MAX_N) {
    throw new ApiError('INVALID_COUNT', `n=${n} 超出允许范围 ${MIN_N}..${MAX_N}`);
  }
  return { n, distances };
}

export interface VerifyResult {
  valid: boolean;
  n: number;
  dMax: number;
  missing: { distance: number; count: number }[];
  extra: { distance: number; count: number }[];
  reason?: string;
}

// 独立验证器：直接从候选坐标枚举全部点对距离，逐项比较计数。
export function verifyCoordinates(distances: number[], coordinates: unknown): VerifyResult {
  const { n } = validateDistances(distances);
  if (!Array.isArray(coordinates)) {
    throw new ApiError('INVALID_INPUT', 'coordinates 必须是数组');
  }
  if (coordinates.length !== n) {
    throw new ApiError('INVALID_COUNT', `坐标数量 ${coordinates.length} 与 n=${n} 不一致`);
  }
  const coords: number[] = [];
  for (const v of coordinates) {
    if (typeof v !== 'number' || !Number.isInteger(v) || !Number.isSafeInteger(v)) {
      throw new ApiError('INVALID_INPUT', `坐标 ${String(v)} 不是安全整数`);
    }
    coords.push(v);
  }
  const sorted = [...coords].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) {
      throw new ApiError('INVALID_INPUT', `坐标 ${sorted[i]} 重复，点必须互不相同`);
    }
  }
  const dMax = Math.max(...distances);
  if (sorted[0] !== 0 || sorted[sorted.length - 1] !== dMax) {
    throw new ApiError('OUT_OF_RANGE', `坐标必须归一化到 [0, ${dMax}]，最小为 0 且最大为 D`);
  }
  for (const c of sorted) {
    if (c < 0 || c > dMax) throw new ApiError('OUT_OF_RANGE', `坐标 ${c} 越界 [0, ${dMax}]`);
  }
  const want = countDistances(distances);
  const got = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const d = sorted[j] - sorted[i];
      got.set(d, (got.get(d) ?? 0) + 1);
    }
  }
  const missing: { distance: number; count: number }[] = [];
  const extra: { distance: number; count: number }[] = [];
  for (const [d, c] of want) {
    const g = got.get(d) ?? 0;
    if (g < c) missing.push({ distance: d, count: c - g });
  }
  for (const [d, g] of got) {
    const c = want.get(d) ?? 0;
    if (g > c) extra.push({ distance: d, count: g - c });
  }
  const valid = missing.length === 0 && extra.length === 0;
  return {
    valid, n, dMax, missing, extra,
    reason: valid ? '全部点对距离计数与输入完全一致' : '点对距离计数与输入不一致',
  };
}
