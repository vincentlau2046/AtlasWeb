/**
 * SSE follow pump (格 D+H 慢消费者有界形)。
 *
 * 抽出为纯函数以支持假 res 注入单测（bun fetch 客户端急切缓冲 body，
 * socket 级背压在测试进程内不可造，drain/writableLength 兼容面不可信；
 * 生产 Node 语义正确）。策略：
 * 1. 逐事件拉取（零预读积压）；
 * 2. write()=false → 暂停拉取直至 drain / close / error（Node 真背压承载，
 *    HTTP 缓冲不得绕过上游有界订阅队列）；
 * 3. 单次暂停超 slowConsumerMs → fail-closed 终流（慢消费者拒绝形），
 *    调用方负责订阅释放（槽位归零）。
 */
export class SlowConsumerError extends Error {
  override readonly name = 'SlowConsumerError'
  constructor(ms: number) {
    super(`slow consumer: no drain within ${ms}ms`)
  }
}

export interface FollowEvent {
  kind: string
  [k: string]: unknown
}

export interface FollowSub {
  [Symbol.asyncIterator](): AsyncIterator<FollowEvent>
  close(): Promise<void>
}

export interface PumpRes {
  write(chunk: string): boolean
  once(event: string, cb: () => void): unknown
  off(event: string, cb: () => void): unknown
  readonly writableEnded: boolean
  end(): unknown
}

export interface PumpOptions {
  slowConsumerMs?: number
}

export async function pumpFollowEvents(
  sub: FollowSub,
  res: PumpRes,
  opts: PumpOptions = {},
  isClosed = (): boolean => false,
): Promise<void> {
  const slowConsumerMs = opts.slowConsumerMs ?? 30_000
  for await (const event of sub) {
    if (isClosed() || res.writableEnded) break
    if (!res.write(`data: ${JSON.stringify(event)}\n\n`)) {
      // 背压：停止拉取直至 drain（或断开/超时 fail-closed）
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          cleanup()
          reject(new SlowConsumerError(slowConsumerMs))
        }, slowConsumerMs)
        const done = (): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          cleanup()
          resolve()
        }
        const cleanup = (): void => {
          res.off('drain', done)
          res.off('close', done)
          res.off('error', done)
        }
        res.once('drain', done)
        res.once('close', done)
        res.once('error', done)
        if (isClosed() || res.writableEnded) done()
      })
    }
    // closed 恒唯一 terminal（error → closed 成对送达，终态后零数据事件）
    if (event.kind === 'closed') break
  }
}
