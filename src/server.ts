/** HTTP API 服务（node:http，无外部依赖） */
import http from "node:http";
import { Store } from "./db";
import { solveTurnpike } from "./turnpike";
import { verifyPoints } from "./verify";
import {
  ApiError,
  validateBudget,
  validateDistances,
  validatePoints,
} from "./validate";

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(data);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        reject(new ApiError("E_BAD_REQUEST", "请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function createServer(store: Store): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      const method = req.method ?? "GET";

      // POST /verify  独立验证外部坐标
      if (method === "POST" && url.pathname === "/verify") {
        const body = (await readBody(req)) as Record<string, unknown>;
        const { distances } = validateDistances(body.distances);
        const points = validatePoints(body.points);
        return sendJson(res, 200, verifyPoints(points, distances));
      }

      // POST /problems  创建重建题
      if (method === "POST" && url.pathname === "/problems") {
        const body = (await readBody(req)) as Record<string, unknown>;
        const { distances, n } = validateDistances(body.distances);
        const budget = validateBudget(body.budget);
        const problem = store.createProblem(distances, n);
        return sendJson(res, 201, { ...problem, budget });
      }

      if (parts[0] === "problems" && parts.length >= 2) {
        const id = Number(parts[1]);
        if (!Number.isInteger(id)) throw new ApiError("E_BAD_REQUEST", "题目 id 非法");
        const problem = store.getProblem(id);
        if (!problem) throw new ApiError("E_NOT_FOUND", `题目 ${id} 不存在`);

        // GET /problems/:id  查看解与分支摘要
        if (method === "GET" && parts.length === 2) {
          const run = store.latestRun(id);
          return sendJson(res, 200, { problem, latestRun: run });
        }

        // GET /problems/:id/export  导出完整记录
        if (method === "GET" && parts[2] === "export") {
          const run = store.latestRun(id);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="problem-${id}.json"`,
          });
          return res.end(JSON.stringify({ problem, latestRun: run }, null, 2));
        }

        // POST /problems/:id/validate  校验输入
        if (method === "POST" && parts[2] === "validate") {
          const { n } = validateDistances(problem.distances);
          return sendJson(res, 200, { valid: true, n, count: problem.distances.length });
        }

        // POST /problems/:id/solve  启动求解（每次从头新建一次运行）
        if (method === "POST" && parts[2] === "solve") {
          const body = (await readBody(req)) as Record<string, unknown>;
          const budget = validateBudget(body.budget);
          const result = solveTurnpike(problem.distances, problem.n, budget);
          const run = store.createRun(id, budget, result);
          return sendJson(res, 200, { run, problem: { id: problem.id, n: problem.n } });
        }
      }

      throw new ApiError("E_NOT_FOUND", `未知路由 ${method} ${url.pathname}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const status =
          err.code === "E_NOT_FOUND" ? 404 : err.code === "E_BAD_REQUEST" ? 400 : 422;
        return sendJson(res, status, { error: { code: err.code, message: err.message } });
      }
      return sendJson(res, 500, {
        error: { code: "E_INTERNAL", message: String(err) },
      });
    }
  });
}

export function startServer(store: Store, port: number): Promise<number> {
  const server = createServer(store);
  return new Promise((resolve) => {
    server.listen(port, () => {
      const addr = server.address();
      const actual = typeof addr === "object" && addr ? addr.port : port;
      resolve(actual);
    });
  });
}
