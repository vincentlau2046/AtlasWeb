// B3 收尾波工单增量①——web-connection 只读 workspace 列表方法（若经 HTTP
// 传输面）。/execution 路由族为裸 JSON（非 envelope）——本方法裸解析 +
// fail-closed 形校验（响应仅 workspaceId 字符串；表外形状 → invalidRequest）。
import { describe, expect, test } from 'bun:test'
import { connect, AtlasConnectionError } from '../src/index'

function fetchStub(routes: Array<{ match: (url: string) => boolean; respond: () => Response }>): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input instanceof Request ? input.url : input)
    const hit = routes.find(r => r.match(url))
    if (hit === undefined) throw new Error(`unexpected fetch: ${url}`)
    return hit.respond()
  }) as typeof fetch
}

describe('AtlasConnection.listWorkspaces（B3 增量①）', () => {
  test('裸 JSON 解析：{workspaces:[{workspaceId}]} 原样交付', async () => {
    const conn = await connect({
      baseUrl: 'http://stub',
      credential: 'pre-shared',
      fetch: fetchStub([
        {
          match: u => u.includes('/execution/workspaces'),
          respond: () => Response.json({ workspaces: [{ workspaceId: 'ws-a' }, { workspaceId: 'ws-b' }] }),
        },
      ]),
    })
    const list = await conn.listWorkspaces()
    expect(list.workspaces).toEqual([{ workspaceId: 'ws-a' }, { workspaceId: 'ws-b' }])
  })

  test('fail-closed：表外形状（目录内容/缺字段/非串）→ invalidRequest', async () => {
    const bad = (body: unknown): typeof fetch => fetchStub([
      { match: u => u.includes('/execution/workspaces'), respond: () => Response.json(body as Record<string, unknown>) },
    ])
    for (const body of [
      { workspaces: [{ workspaceId: 'ws-a', dir: '/tmp/ws-a' }] }, // 越界字段（目录内容）
      { workspaces: [{}] }, // 缺 workspaceId
      { workspaces: [{ workspaceId: 7 }] }, // 非串
      { nope: true }, // 缺 workspaces
      { workspaces: 'ws-a' }, // 非数组
    ]) {
      const conn = await connect({ baseUrl: 'http://stub', credential: 'x', fetch: bad(body) })
      let code = ''
      try {
        await conn.listWorkspaces()
      } catch (error) {
        code = error instanceof AtlasConnectionError ? error.code : ''
      }
      expect(code).toBe('invalidRequest')
    }
  })

  test('HTTP 404（执行面未启用）→ AtlasConnectionError 透传 status', async () => {
    const conn = await connect({
      baseUrl: 'http://stub',
      credential: 'x',
      fetch: fetchStub([
        { match: u => u.includes('/execution/workspaces'), respond: () => new Response('not found', { status: 404 }) },
      ]),
    })
    try {
      await conn.listWorkspaces()
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(AtlasConnectionError)
      expect((error as AtlasConnectionError).status).toBe(404)
    }
  })
})
