/** CLI 入口 */
import path from "node:path";
import fs from "node:fs";
import { Store } from "./db";
import { solveTurnpike } from "./turnpike";
import { verifyPoints } from "./verify";
import { startServer } from "./server";
import {
  ApiError,
  validateBudget,
  validateDistances,
  validatePoints,
  DEFAULT_BUDGET,
} from "./validate";

const DATA_DIR = process.env.TURNPIKE_DATA_DIR ?? path.join(process.cwd(), "data");

function parseNumbers(s: string): number[] {
  return s
    .split(/[,\s]+/)
    .filter((t) => t.length > 0)
    .map((t) => Number(t));
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function printJson(v: unknown): void {
  console.log(JSON.stringify(v, null, 2));
}

function usage(): void {
  console.log(`用法：node dist/src/cli.js <命令> [参数]

命令：
  serve [--port N]                      启动 HTTP API（默认自动选择空闲端口）
  create --distances "2,2,3,4,5,7"      创建重建题
  solve --id 1 [--budget 100000]        从头求解并保存结果
  report --id 1                         查看题目与最近一次求解报告
  verify --distances "..." --points "0,2,4,7"   独立验证外部坐标
  export --id 1 [--out file.json]       导出题目与结果
  demo                                  运行内置演示（有解/无解/预算不足）
`);
}

function demo(store: Store): void {
  console.log("=== 演示 1：距离 2,2,3,4,5,7（可解） ===");
  const d1 = [2, 2, 3, 4, 5, 7];
  const { n: n1 } = validateDistances(d1);
  const p1 = store.createProblem(d1, n1);
  const r1 = solveTurnpike(d1, n1, DEFAULT_BUDGET);
  store.createRun(p1.id, DEFAULT_BUDGET, r1);
  printJson(r1);
  console.log("说明：{0,2,4,7} 与其镜像 {0,3,5,7} 合并为同一规范解。");

  console.log("\n=== 演示 2：无解输入 1,2,3,4,5,9 ===");
  const d2 = [1, 2, 3, 4, 5, 9];
  const { n: n2 } = validateDistances(d2);
  const p2 = store.createProblem(d2, n2);
  const r2 = solveTurnpike(d2, n2, DEFAULT_BUDGET);
  store.createRun(p2.id, DEFAULT_BUDGET, r2);
  printJson(r2.solutions);
  console.log(`穷尽搜索：${r2.stats.exhaustive}，停止原因：${r2.stats.stopReason}（穷尽后仍无解，可确信无解）`);

  console.log("\n=== 演示 3：小预算（budget=1）的未完成结果 ===");
  const r3 = solveTurnpike(d1, n1, 1);
  printJson({ solutions: r3.solutions, stats: r3.stats });
  console.log("说明：预算耗尽时搜索未完成，不能据此断言无解或唯一解。");
}

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "help" || cmd === "--help") return usage();

  const store = new Store(DATA_DIR);
  try {
    switch (cmd) {
      case "serve": {
        const portArg = argValue(args, "port");
        const port = portArg !== undefined ? Number(portArg) : Number(process.env.PORT ?? 0);
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          throw new ApiError("E_BAD_REQUEST", "端口必须是 0..65535 的整数（0 表示自动选择空闲端口）");
        }
        startServer(store, port).then((actual) => {
          console.log(`API 已启动: http://127.0.0.1:${actual}  (数据目录: ${DATA_DIR})`);
        });
        return; // 保持进程存活
      }
      case "create": {
        const { distances, n } = validateDistances(parseNumbers(argValue(args, "distances") ?? ""));
        const budget = validateBudget(
          argValue(args, "budget") !== undefined ? Number(argValue(args, "budget")) : undefined
        );
        printJson({ ...store.createProblem(distances, n), budget });
        break;
      }
      case "solve": {
        const id = Number(argValue(args, "id"));
        const problem = store.getProblem(id);
        if (!problem) throw new ApiError("E_NOT_FOUND", `题目 ${id} 不存在`);
        const budget = validateBudget(
          argValue(args, "budget") !== undefined ? Number(argValue(args, "budget")) : undefined
        );
        const result = solveTurnpike(problem.distances, problem.n, budget);
        const run = store.createRun(id, budget, result);
        printJson({ runId: run.id, ...result });
        break;
      }
      case "report": {
        const id = Number(argValue(args, "id"));
        const problem = store.getProblem(id);
        if (!problem) throw new ApiError("E_NOT_FOUND", `题目 ${id} 不存在`);
        printJson({ problem, latestRun: store.latestRun(id) });
        break;
      }
      case "verify": {
        const { distances } = validateDistances(parseNumbers(argValue(args, "distances") ?? ""));
        const points = validatePoints(parseNumbers(argValue(args, "points") ?? ""));
        printJson(verifyPoints(points, distances));
        break;
      }
      case "export": {
        const id = Number(argValue(args, "id"));
        const problem = store.getProblem(id);
        if (!problem) throw new ApiError("E_NOT_FOUND", `题目 ${id} 不存在`);
        const out = argValue(args, "out");
        const payload = JSON.stringify({ problem, latestRun: store.latestRun(id) }, null, 2);
        if (out) {
          fs.writeFileSync(out, payload, "utf-8");
          console.log(`已导出到 ${out}`);
        } else {
          console.log(payload);
        }
        break;
      }
      case "demo":
        demo(store);
        break;
      default:
        usage();
    }
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`错误 [${err.code}] ${err.message}`);
      process.exitCode = 2;
    } else {
      throw err;
    }
  } finally {
    if (process.argv.slice(2)[0] !== "serve") store.close();
  }
}

main();
