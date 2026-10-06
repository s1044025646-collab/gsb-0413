# 一维距离多重集重建（Turnpike）教学后端

从零实现的小规模一维点集重建服务：输入 `n` 个不同点之间**全部**两两正整数距离
（无点对标签、允许重复），恢复所有可能的坐标集合。仅含 API 与 CLI，无前端。

- 技术栈：TypeScript + Node.js（内置 `node:http` 与 `node:sqlite`，零运行时依赖）
- 平台：Windows 本地运行，不需要 Docker / WSL / 外部服务
- 范围：教学用 Turnpike 重建。不处理二维定位、带噪测量、GPS、缺失距离或连续优化

## 快速开始

```powershell
npm install        # 仅需开发依赖（typescript、@types/node）
npm run build      # 编译到 dist/
npm test           # 构建并运行全部测试
npm start          # 启动 API（默认自动选择空闲端口）
npm run demo       # 内置演示：可解 / 无解 / 预算不足 三种情形
```

指定端口与数据目录：

```powershell
node dist/src/cli.js serve --port 8080
$env:TURNPIKE_DATA_DIR="D:\mydata"; npm start
```

数据保存在项目内 `data/turnpike.db`（可用 `TURNPIKE_DATA_DIR` 覆盖），重启后报告仍可读取。

## 问题定义与假设

- 输入为 `n*(n-1)/2` 个两两距离，`n` 限定在 2..8。
- 距离与坐标均为正整数，且全部中间值在 JavaScript 安全整数范围内。
- 点互不相同，坐标归一化为最小点 `0`、最大点 `D`（最大距离），按升序输出。
- 平移不产生新解；每个解与其关于 `D/2` 的镜像比较，取**字典序较小**的坐标序列作为
  规范代表，按代表去重。例如 `{0,2,4,7}` 与镜像 `{0,3,5,7}` 只算一个解。
- 拒绝：零/负/非整数距离、非法数量、越界坐标、重复坐标、非法预算。
- **唯一性结论的适用条件**：只有搜索**穷尽**（`exhaustive=true`）时，
  "无解"或"唯一解"的结论才成立；预算耗尽时仅报告已验证的解并明确搜索未完成。

## 算法口径（`turnpike-backtrack-v1`）

核心为带距离计数的回溯（`src/turnpike.ts`）：

1. 先放置端点 `0` 与 `D`，并从多重集中扣除距离 `D`。
2. 每步读取剩余多重集中**最大**的距离 `y`，尝试将新点放在 `y` 或 `D-y`。
3. 试放时计算候选点到所有已放点的距离，逐项检查剩余计数是否足够；
   全部可扣才进入下一层，分支失败后**精确恢复**计数。
4. 距离以多重集（计数表）维护，不去重；`y == D-y` 或候选已放置时跳过重复分支。
5. 终止条件：恰有 `n` 个点且所有距离计数耗尽，才接受为一个解。
6. 节点预算可配置（默认 100000，上限 1e7）；耗尽时停止并标记 `budget_exceeded`。

分支摘要（`branchTrace`）记录每层的候选坐标、需要扣除的距离、计数不足原因与回滚，
最多保留前 200 条事件（`traceTruncated` 标记是否截断），不输出指数级完整搜索树。

独立验证器（`src/verify.ts`）直接从候选坐标枚举全部点对距离，逐项比较计数，
不依赖求解器内部缓存或成功标志。

## HTTP API

统一错误格式：`{ "error": { "code": "...", "message": "..." } }`

| 错误码 | 含义 |
|---|---|
| `E_INVALID_COUNT` | 距离数量不等于 n*(n-1)/2（n 在 2..8） |
| `E_INVALID_DISTANCE` | 距离非正整数 |
| `E_RANGE` | 超出安全整数范围 |
| `E_INVALID_POINTS` | 坐标非法（非整数/重复/数量越界） |
| `E_INVALID_BUDGET` | 预算非法 |
| `E_NOT_FOUND` | 题目或路由不存在 |
| `E_BAD_REQUEST` | 请求体非法 |

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/problems` | 创建重建题，body：`{"distances":[2,2,3,4,5,7], "budget":100000}` |
| POST | `/problems/:id/validate` | 校验已保存的输入 |
| POST | `/problems/:id/solve` | 从头求解（每次新建一次运行），body 可带 `budget` |
| GET  | `/problems/:id` | 查看题目与最近一次求解报告（解、分支摘要、统计） |
| GET  | `/problems/:id/export` | 导出完整 JSON（含原始距离、计数、预算、算法口径、结果） |
| POST | `/verify` | 独立验证外部坐标，body：`{"distances":[...], "points":[0,2,4,7]}` |

示例：

```powershell
curl -X POST http://127.0.0.1:8080/problems -H "Content-Type: application/json" -d "{\"distances\":[2,2,3,4,5,7]}"
curl -X POST http://127.0.0.1:8080/problems/1/solve -H "Content-Type: application/json" -d "{}"
curl http://127.0.0.1:8080/problems/1
```

求解响应中 `result.stats` 字段：

- `nodesVisited`：访问的搜索节点数
- `exhaustive`：是否穷尽搜索空间
- `stopReason`：`exhausted`（穷尽）或 `budget_exceeded`（预算耗尽，搜索未完成）

## CLI

```
node dist/src/cli.js create --distances "2,2,3,4,5,7"
node dist/src/cli.js solve --id 1 --budget 100000
node dist/src/cli.js report --id 1
node dist/src/cli.js verify --distances "2,2,3,4,5,7" --points "0,3,5,7"
node dist/src/cli.js export --id 1 --out problem-1.json
node dist/src/cli.js demo
node dist/src/cli.js serve --port 0     # 0 表示自动选择空闲端口
```

调整预算后再次 `solve` 会从头新建一次求解运行（不实现断点续搜），
历史运行保存在 SQLite 中，报告读取最近一次。

## 测试

`npm test` 覆盖：两个点、等距点、重复距离、候选碰撞与分支回滚、无解输入、
小预算未完成、独立验证器正误例、参数校验，以及：

- **穷举核对**：对小整数范围枚举全部坐标组合，用独立验证器生成基准解集，
  与回溯求解结果逐一比对。
- **重排不变性**：随机打乱输入距离顺序 10 次，解集完全一致。

## 目录结构

```
src/turnpike.ts   回溯求解核心（多重集计数、镜像规范、分支摘要）
src/validate.ts   参数校验与错误码
src/verify.ts     独立验证器
src/db.ts         SQLite 持久化（problems / runs 两表）
src/server.ts     HTTP API（node:http）
src/cli.ts        命令行入口
test/             node:test 测试
data/             SQLite 数据目录（运行时生成）
```

## 已知限制

- 仅支持 n ≤ 8 的小规模精确重建；大实例搜索量指数增长，只能靠预算截断。
- 预算耗尽时已发现的解仍然有效，但"无解/唯一解"结论不成立。
- 分支摘要最多保留 200 条事件，完整搜索树不导出。
- 调整预算需从头重新求解，不支持断点续搜。
