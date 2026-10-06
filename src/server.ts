import http from 'node:http';
import { solveTurnpike, DEFAULT_NODE_BUDGET } from './turnpike.js';
import { validateDistances, verifyCoordinates, ApiError } from './verify.js';
import * as store from './db.js';

function runView(run: store.RunRow) {
  return {
    id: run.id,
    problemId: run.problem_id,
    budget: run.budget,
    algorithm: run.algorithm,
    exhaustive: !!run.exhaustive,
    nodesVisited: run.nodes_visited,
    stopReason: run.stop_reason,
    solutions: JSON.parse(run.solutions) as number[][],
    solutionCount: (JSON.parse(run.solutions) as number[][]).length,
    traces: JSON.parse(run.traces),
    traceTruncated: !!run.trace_truncated,
    createdAt: run.created_at,
  };
}

function problemView(p: store.ProblemRow) {
  return {
    id: p.id,
    n: p.n,
    distances: JSON.parse(p.distances),
    counts: JSON.parse(p.counts),
    createdAt: p.created_at,
    runs: store.runsForProblem(p.id).map((r) => r.id),
  };
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('INVALID_INPUT', '请求体不是合法 JSON');
  }
}

function parseBudget(v: unknown): number {
  if (v === undefined || v === null) return DEFAULT_NODE_BUDGET;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1 || v > 10_000_000) {
    throw new ApiError('INVALID_INPUT', 'budget 必须是 1..10000000 的整数');
  }
  return v;
}

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      const text = JSON.stringify(body, null, 2);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(text);
    };
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);
      const method = req.method ?? 'GET';

      if (method === 'GET' && url.pathname === '/') {
        return send(200, { name: 'turnpike-reconstruction', endpoints: [
          'POST /problems {distances:[...]}',
          'GET /problems, GET /problems/:id',
          'POST /problems/:id/validate',
          'POST /problems/:id/solve {budget?}',
          'GET /runs/:id, GET /runs/:id/export',
          'POST /verify {distances, coordinates}',
        ]});
      }

      if (method === 'POST' && url.pathname === '/problems') {
        const body = (await readBody(req)) as { distances?: unknown };
        const { n, distances } = validateDistances(body.distances);
        const p = store.createProblem(n, distances);
        return send(201, problemView(p));
      }

      if (method === 'GET' && url.pathname === '/problems') {
        return send(200, store.listProblems().map(problemView));
      }

      if (parts[0] === 'problems' && parts.length >= 2) {
        const id = Number(parts[1]);
        const p = store.getProblem(id);
        if (!p) throw new ApiError('NOT_FOUND', `题目 ${parts[1]} 不存在`, 404);
        if (method === 'GET' && parts.length === 2) return send(200, problemView(p));
        if (method === 'POST' && parts[2] === 'validate') {
          const distances = JSON.parse(p.distances) as number[];
          const { n } = validateDistances(distances);
          return send(200, { valid: true, n, count: distances.length, expected: (n * (n - 1)) / 2 });
        }
        if (method === 'POST' && parts[2] === 'solve') {
          const body = (await readBody(req)) as { budget?: unknown };
          const budget = parseBudget(body.budget);
          const distances = JSON.parse(p.distances) as number[];
          const result = solveTurnpike(p.n, distances, { nodeBudget: budget });
          const run = store.createRun({
            problem_id: p.id,
            budget,
            algorithm: store.ALGORITHM,
            exhaustive: result.exhaustive ? 1 : 0,
            nodes_visited: result.nodesVisited,
            stop_reason: result.stopReason,
            solutions: JSON.stringify(result.solutions),
            traces: JSON.stringify(result.traces),
            trace_truncated: result.traceTruncated ? 1 : 0,
          });
          return send(200, runView(run));
        }
      }

      if (parts[0] === 'runs' && parts.length >= 2) {
        const run = store.getRun(Number(parts[1]));
        if (!run) throw new ApiError('NOT_FOUND', `求解运行 ${parts[1]} 不存在`, 404);
        if (method === 'GET' && parts.length === 2) return send(200, runView(run));
        if (method === 'GET' && parts[2] === 'export') {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="run-${run.id}.json"`,
          });
          return res.end(JSON.stringify(runView(run), null, 2));
        }
      }

      if (method === 'POST' && url.pathname === '/verify') {
        const body = (await readBody(req)) as { distances?: unknown; coordinates?: unknown };
        const { distances } = validateDistances(body.distances);
        return send(200, verifyCoordinates(distances, body.coordinates));
      }

      throw new ApiError('NOT_FOUND', `路由不存在: ${method} ${url.pathname}`, 404);
    } catch (err) {
      if (err instanceof ApiError) return send(err.status, { error: err.code, message: err.message });
      send(500, { error: 'INTERNAL', message: String(err) });
    }
  });
}

export function startServer(port?: number): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer();
    const wanted = port ?? (process.env.PORT ? Number(process.env.PORT) : 0);
    server.listen(wanted, () => {
      const addr = server.address();
      const actual = typeof addr === 'object' && addr ? addr.port : wanted;
      resolve({ server, port: actual });
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer().then(({ port }) => {
    console.log(`Turnpike API 已启动: http://localhost:${port}`);
  });
}
