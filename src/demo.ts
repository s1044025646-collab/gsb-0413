import { solveTurnpike } from './turnpike.js';
import { verifyCoordinates } from './verify.js';

export function runDemo(): void {
  console.log('=== 演示 1: 距离 [2,2,3,4,5,7] 的重建 ===');
  const distances = [2, 2, 3, 4, 5, 7];
  const r1 = solveTurnpike(4, distances);
  console.log('规范解:', JSON.stringify(r1.solutions));
  console.log(`穷尽: ${r1.exhaustive}, 节点访问: ${r1.nodesVisited}, 停止原因: ${r1.stopReason}`);
  console.log('镜像 [0,3,5,7] 与 [0,2,4,7] 互为镜像，只算同一规范解。');
  console.log('独立验证 [0,2,4,7]:', JSON.stringify(verifyCoordinates(distances, [0, 2, 4, 7])));
  console.log('独立验证镜像 [0,3,5,7]:', JSON.stringify(verifyCoordinates(distances, [0, 3, 5, 7])));
  console.log('部分分支摘要:');
  for (const t of r1.traces.slice(0, 8)) {
    console.log(`  深度${t.depth} y=${t.y} 候选=${t.candidate} 需要=${JSON.stringify(t.needed)} -> ${t.reason}`);
  }

  console.log('\n=== 演示 2: 无解输入 [1,2,3,4,5,100] ===');
  const r2 = solveTurnpike(4, [1, 2, 3, 4, 5, 100]);
  console.log('解:', JSON.stringify(r2.solutions), `穷尽: ${r2.exhaustive}, 停止原因: ${r2.stopReason}`);
  console.log('=> 搜索穷尽且无规范解，可报告无解。');

  console.log('\n=== 演示 3: 小预算的未完成结果（同一可解题，预算=2） ===');
  const r3 = solveTurnpike(4, distances, { nodeBudget: 2 });
  console.log('已验证解:', JSON.stringify(r3.solutions));
  console.log(`穷尽: ${r3.exhaustive}, 节点访问: ${r3.nodesVisited}, 停止原因: ${r3.stopReason}`);
  console.log('=> 搜索未完成，不能据此报告无解或唯一解。');
}
