/** 输入校验与错误码 */

export type ErrorCode =
  | "E_INVALID_COUNT"
  | "E_INVALID_DISTANCE"
  | "E_RANGE"
  | "E_INVALID_POINTS"
  | "E_INVALID_BUDGET"
  | "E_NOT_FOUND"
  | "E_BAD_REQUEST";

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

export const MIN_N = 2;
export const MAX_N = 8;
export const DEFAULT_BUDGET = 100000;
export const MAX_BUDGET = 10_000_000;

export function expectedCount(n: number): number {
  return (n * (n - 1)) / 2;
}

/** 由距离数量反推 n，数量不合法时返回 null */
export function inferN(count: number): number | null {
  for (let n = MIN_N; n <= MAX_N; n++) {
    if (expectedCount(n) === count) return n;
  }
  return null;
}

export function validateDistances(input: unknown): { distances: number[]; n: number } {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ApiError("E_INVALID_COUNT", "distances 必须是非空数组");
  }
  const n = inferN(input.length);
  if (n === null) {
    throw new ApiError(
      "E_INVALID_COUNT",
      `距离数量 ${input.length} 不合法：必须等于 n*(n-1)/2，且 n 在 ${MIN_N}..${MAX_N} 之间`
    );
  }
  for (const d of input) {
    if (typeof d !== "number" || !Number.isInteger(d)) {
      throw new ApiError("E_INVALID_DISTANCE", `距离 ${String(d)} 不是整数`);
    }
    if (d <= 0) {
      throw new ApiError("E_INVALID_DISTANCE", `距离 ${d} 必须为正整数`);
    }
    if (!Number.isSafeInteger(d)) {
      throw new ApiError("E_RANGE", `距离 ${d} 超出安全整数范围`);
    }
  }
  return { distances: input as number[], n };
}

export function validateBudget(input: unknown): number {
  if (input === undefined || input === null) return DEFAULT_BUDGET;
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1 || input > MAX_BUDGET) {
    throw new ApiError("E_INVALID_BUDGET", `budget 必须是 1..${MAX_BUDGET} 的整数`);
  }
  return input;
}

export function validatePoints(input: unknown): number[] {
  if (!Array.isArray(input) || input.length < 2) {
    throw new ApiError("E_INVALID_POINTS", "points 必须是至少含 2 个坐标的数组");
  }
  const pts = input as number[];
  for (const p of pts) {
    if (typeof p !== "number" || !Number.isInteger(p)) {
      throw new ApiError("E_INVALID_POINTS", `坐标 ${String(p)} 不是整数`);
    }
    if (!Number.isSafeInteger(p)) {
      throw new ApiError("E_RANGE", `坐标 ${p} 超出安全整数范围`);
    }
  }
  const set = new Set(pts);
  if (set.size !== pts.length) {
    throw new ApiError("E_INVALID_POINTS", "坐标必须互不相同");
  }
  const n = pts.length;
  if (n < MIN_N || n > MAX_N) {
    throw new ApiError("E_INVALID_POINTS", `点数 n 必须在 ${MIN_N}..${MAX_N} 之间`);
  }
  return [...pts].sort((a, b) => a - b);
}
