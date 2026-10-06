# 一维距离多重集重建（Turnpike）后端

教学用的一维 Turnpike 重建服务：输入 n 个不同点之间全部两两正整数距离（无点对标签、允许重复），
恢复所有可能的坐标集合。仅提供 HTTP API 与 CLI，纯 TypeScript + Node.js + SQLite（`node:sqlite`），
Windows 本地运行，不依赖 Docker / WSL / 外部服务。

## 适用条件与结论口径

- 输入必须是**完整**的两两距离：数量恰为 `n*(n-1)/2`，`n` 限定 2..8。
- 距离为**正整数多重集**：允许重复，求解按计数扣除，绝不去重成集合。
- 不处理二维定位、带噪测量、GPS、缺失距离或连续优化。
- 坐标归一化：最小点为 0，最大点为最大距离 D，升序输出；平移不产生新解。
- **镜像去重**：每个解与其关于 D/2 的镜像比较，取字典序较小者为规范代表，按代表去重。
  例如 `[0,2,4,7]` 与镜像 `[0,3,5,7]` 只算一个规范解。
- **唯一性/无解结论仅在搜索穷尽（`exhaustive=true`）后有效**；预算耗尽时保留已验证解，
  但明确报告搜索未完成（`stopReason=budget_exceeded`），此时不得报告无解或唯一解。

## 算法

自行实现的带距离计数回溯（`src/turnpike.ts`）：

1. 先放置 0 和 D，并扣除端点距离 D 的计数。
2. 每步取剩余多重集中最大距离 y，尝试把新点放在 `y` 或 `D-y`。
3. 试放时计算候选点到所有已放点的距离，逐项检查剩余计数是否足够；全部可扣才递归，
   分支失败后精确回滚计数。
4. `y == D-y` 或候选已放置时自动去重分支。
5. 终止条件：恰有 n 个点且所有距离计数耗尽，才接受为解。
6. 记录节点访问数、停止原因，以及分支摘要（候选坐标、扣除需求、计数不足原因、回滚），
   摘要上限 200 条，不输出指数规模的完整搜索树。

独立验证器（`src/verify.ts`）不依赖求解器内部状态：直接从候选坐标枚举全部点对距离，
逐项与输入多重集比较计数，报告缺失与多余距离。

## 构建 / 测试 / 启动 / 演示

```powershell
npm install
npm run build     # tsc 编译到 dist/
npm test          # 构建并运行 node:test 测试（14 个用例）
npm start         # 启动 API（默认选择空闲端口，PORT 环境变量可指定）
npm run demo      # 内置演示：可解 / 无解 / 小预算未完成 三种情形
```

## CLI

```
node dist/cli.js create <d1 d2 ...>          创建重建题（校验数量与取值）
node dist/cli.js validate <problemId>        校验题目
node dist/cli.js solve <problemId> [budget]  启动求解（默认预算 100000 节点）
node dist/cli.js show <runId>                查看解与分支摘要
node dist/cli.js verify <d...> -- <c...>     独立验证外部坐标
node dist/cli.js export <runId> <file>       导出运行结果 JSON
node dist/cli.js list                        列出全部题目
node dist/cli.js demo                        运行内置演示
node dist/cli.js serve [port]                启动 API（缺省选空闲端口）
```

示例：

```powershell
node dist/cli.js create 2 2 3 4 5 7
node dist/cli.js solve 1
node dist/cli.js show 1
node dist/cli.js verify 2 2 3 4 5 7 -- 0 2 4 7
```

## HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/problems` | 创建题目，body `{"distances":[2,2,3,4,5,7]}` |
| GET | `/problems` / `/problems/:id` | 列出 / 查看题目（含关联运行） |
| POST | `/problems/:id/validate` | 校验题目距离数量与取值 |
| POST | `/problems/:id/solve` | 求解，body `{"budget":100000}`（可省略） |
| GET | `/runs/:id` | 查看规范解、节点数、停止原因、分支摘要 |
| GET | `/runs/:id/export` | 以附件形式导出运行结果 JSON |
| POST | `/verify` | 独立验证外部坐标，body `{"distances":[...],"coordinates":[...]}` |

错误统一返回 `{"error": 错误码, "message": 中文说明}`，错误码：
`INVALID_INPUT`、`INVALID_COUNT`、`INVALID_DISTANCE`、`OUT_OF_RANGE`、`NOT_FOUND`。

## 数据存储

SQLite 数据库位于项目内 `data/turnpike.db`（可用 `TURNPIKE_DATA_DIR` / `TURNPIKE_DB` 覆盖）。
表 `problems` 保存原始距离与计数；表 `runs` 保存预算、算法口径（`turnpike-backtracking-multiset-v1`）、
是否穷尽、节点数、停止原因、已验证解与分支摘要。重启后可直接读取历史报告。
调整预算请对同一题目再次调用 solve，会从头新建一次求解（不实现断点续搜）。

## 演示结论

- 距离 `[2,2,3,4,5,7]` → 唯一规范解 `[0,2,4,7]`（镜像 `[0,3,5,7]` 同一解）。
- 距离 `[1,2,3,4,5,100]` → 搜索穷尽，无解。
- 同一可解题预算设为 2 → `exhaustive=false`，`stopReason=budget_exceeded`，
  仅报告已验证解，不能下无解/唯一结论。

## 测试覆盖

`test/turnpike.test.mjs`：两个点、等距点、重复距离（多重集语义）、候选碰撞与 `y==D-y` 去重、
分支回滚计数恢复、无解、小预算未完成、输入校验（零/负/非整数/非法数量/越界/重复点）、
n=4 且 D≤8 的抽样独立枚举核对、输入重排不变性、非镜像多解情形
（距离集 `1,1,2,2,3,4,5,5,6,6,7,8,9,10,11` 对应 `[0,1,2,6,8,11]` 与 `[0,1,6,7,9,11]`）。

## 限制

- n 限定 2..8，坐标与距离须为 JavaScript 安全整数。
- 分支摘要最多保留 200 条（超出时 `traceTruncated=true`）。
- 节点预算上限 10,000,000；预算耗尽后需从头重新求解。
- `node:sqlite` 在 Node 25 仍为实验特性，启动时会有 ExperimentalWarning，不影响功能。
