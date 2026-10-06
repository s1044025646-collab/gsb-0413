import { solveTurnpike, DEFAULT_NODE_BUDGET } from './turnpike.js';
import { validateDistances, verifyCoordinates, ApiError } from './verify.js';
import * as store from './db.js';

function print(obj: unknown): void {
  console.log(JSON.stringify(obj, null, 2));
}

function parseNums(args: string[]): number[] {
  return args.map((s) => {
    const v = Number(s);
    if (!Number.isFinite(v)) throw new ApiError('INVALID_INPUT', `无法解析数字: ${s}`);
    return v;
  });
}

const USAGE = `用法:
  node dist/cli.js create <d1 d2 ...>        创建重建题
  node dist/cli.js validate <problemId>      校验题目
  node dist/cli.js solve <problemId> [budget] 启动求解（默认预算 ${DEFAULT_NODE_BUDGET}）
  node dist/cli.js show <runId>              查看解与分支摘要
  node dist/cli.js verify <d...> -- <c...>   独立验证外部坐标
  node dist/cli.js export <runId> <file>     导出运行结果 JSON
  node dist/cli.js list                      列出全部题目
  node dist/cli.js demo                      运行内置演示
  node dist/cli.js serve [port]              启动 API（默认空闲端口）`;

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'create': {
      const { n, distances } = validateDistances(parseNums(args));
      print(store.createProblem(n, distances));
      break;
    }
    case 'list':
      print(store.listProblems());
      break;
    case 'validate': {
      const p = store.getProblem(Number(args[0]));
      if (!p) throw new ApiError('NOT_FOUND', '题目不存在', 404);
      const distances = JSON.parse(p.distances) as number[];
      const { n } = validateDistances(distances);
      print({ valid: true, n, count: distances.length });
      break;
    }
    case 'solve': {
      const p = store.getProblem(Number(args[0]));
      if (!p) throw new ApiError('NOT_FOUND', '题目不存在', 404);
      const budget = args[1] !== undefined ? Number(args[1]) : DEFAULT_NODE_BUDGET;
      if (!Number.isSafeInteger(budget) || budget < 1) throw new ApiError('INVALID_INPUT', '预算必须为正整数');
      const distances = JSON.parse(p.distances) as number[];
      const r = solveTurnpike(p.n, distances, { nodeBudget: budget });
      const run = store.createRun({
        problem_id: p.id, budget, algorithm: store.ALGORITHM,
        exhaustive: r.exhaustive ? 1 : 0, nodes_visited: r.nodesVisited,
        stop_reason: r.stopReason, solutions: JSON.stringify(r.solutions),
        traces: JSON.stringify(r.traces), trace_truncated: r.traceTruncated ? 1 : 0,
      });
      print({ runId: run.id, ...r, traces: `共 ${r.traces.length} 条（show 查看）` });
      break;
    }
    case 'show': {
      const run = store.getRun(Number(args[0]));
      if (!run) throw new ApiError('NOT_FOUND', '运行不存在', 404);
      print({
        id: run.id, problemId: run.problem_id, budget: run.budget,
        algorithm: run.algorithm, exhaustive: !!run.exhaustive,
        nodesVisited: run.nodes_visited, stopReason: run.stop_reason,
        solutions: JSON.parse(run.solutions),
        traces: JSON.parse(run.traces),
        traceTruncated: !!run.trace_truncated,
      });
      break;
    }
    case 'verify': {
      const sep = args.indexOf('--');
      if (sep < 0) throw new ApiError('INVALID_INPUT', '用法: verify <距离...> -- <坐标...>');
      const { distances } = validateDistances(parseNums(args.slice(0, sep)));
      print(verifyCoordinates(distances, parseNums(args.slice(sep + 1))));
      break;
    }
    case 'export': {
      const run = store.getRun(Number(args[0]));
      if (!run) throw new ApiError('NOT_FOUND', '运行不存在', 404);
      const fs = await import('node:fs');
      fs.writeFileSync(args[1], JSON.stringify(run, null, 2));
      console.log(`已导出到 ${args[1]}`);
      break;
    }
    case 'serve': {
      const { startServer } = await import('./server.js');
      const { port } = await startServer(args[0] ? Number(args[0]) : undefined);
      console.log(`Turnpike API 已启动: http://localhost:${port}`);
      break;
    }
    case 'demo': {
      const { runDemo } = await import('./demo.js');
      runDemo();
      break;
    }
    default:
      console.log(USAGE);
  }
}

main().catch((err) => {
  if (err instanceof ApiError) {
    console.error(JSON.stringify({ error: err.code, message: err.message }));
    process.exit(2);
  }
  console.error(err);
  process.exit(1);
});
