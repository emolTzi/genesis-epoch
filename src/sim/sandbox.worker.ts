// 后台线程：同参数的微观平行宇宙抽样，不阻塞画面。

import { Sandbox, type SandboxParams, type SbFate } from './sandbox';

interface Job {
  id: number;
  params: SandboxParams;
  n: number;
  baseTemp: number;
  seed0: number;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, params, n, baseTemp, seed0 } = e.data;
  const fates: Record<SbFate, number> = { 延续: 0, 生态崩溃: 0, 自我毁灭: 0, 未能开始: 0 };
  for (let i = 0; i < n; i++) {
    const sb = new Sandbox(seed0 + i * 7919, params, baseTemp, false);
    fates[sb.runToEnd()]++;
    self.postMessage({ id, done: i + 1, n, fates });
  }
};
