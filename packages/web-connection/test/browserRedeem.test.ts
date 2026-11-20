import { describe, expect, test } from 'bun:test'

// 浏览器 redeem 面（实机 Playwright 冒烟现形，2026-11-20）：浏览器 fetch 的
// set-cookie 为 forbidden response header——getSetCookie() 恒 []/get('set-cookie')
// 恒 null，原实现恒 throw 'redeem response carried no session cookie' →
// ?token= boot 路径真浏览器不可达。双面契约：
//   浏览器面（getSetCookie 不可读）：redeem 不 throw——cookie jar 已由浏览器
//     存（同源 fetch 默认随发），credential 走 ambient cookie（headers 零
//     Bearer；web-host readCredential cookie 优先序兜住）；
//   Node/E2E 面（getSetCookie 可读）：Bearer 原样（零行为漂移）。
import { connect, AtlasConnectionError } from '../src/index'

interface CapturedCall { url: string; headers: Record<string, string> }

function browserLikeFetch(payload: unknown): { fetchFn: (url: string, init?: RequestInit) => Promise<unknown>; calls: CapturedCall[] } {
  const calls: CapturedCall[] = []
  const fetchFn = async (url: string, init?: RequestInit): Promise<unknown> => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    return {
      ok: true,
      status: 200,
      // 浏览器 Response 形：getSetCookie 不可用、set-cookie 不可读
      headers: { getSetCookie: undefined, get: () => null },
      json: async () => payload,
    }
  }
  return { fetchFn: fetchFn as unknown as (url: string, init?: RequestInit) => Promise<unknown>, calls }
}

function nodeLikeFetch(payload: unknown, setCookie: string): { fetchFn: (url: string, init?: RequestInit) => Promise<unknown>; calls: CapturedCall[] } {
  const calls: CapturedCall[] = []
  const fetchFn = async (url: string, init?: RequestInit): Promise<unknown> => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    return {
      ok: true,
      status: 200,
      headers: { getSetCookie: () => [setCookie], get: () => setCookie },
      json: async () => payload,
    }
  }
  return { fetchFn: fetchFn as unknown as (url: string, init?: RequestInit) => Promise<unknown>, calls }
}

const LIST_PAYLOAD = { kind: 'response', sessions: [], schemaVersion: 0 }

describe('web-connection 浏览器 redeem 面（ambient cookie 双面契约）', () => {
  test('浏览器形（set-cookie 不可读）：redeem 不 throw，后续请求零 Bearer（ambient cookie 面）', async () => {
    const { fetchFn, calls } = browserLikeFetch(LIST_PAYLOAD)
    const conn = await connect({ baseUrl: 'http://127.0.0.1:1', launchToken: 'tok-browser', fetch: fetchFn })
    await conn.listSessions({ scopeId: 'main' })
    const redeemCall = calls.find(c => c.url.includes('/auth/redeem'))
    expect(redeemCall).toBeDefined()
    const listCall = calls.find(c => c.url.includes('/sessions') && !c.url.includes('search'))
    expect(listCall).toBeDefined()
    expect(listCall!.headers.authorization).toBeUndefined()
  })

  test('Node 形（getSetCookie 可读）：Bearer 面零漂移', async () => {
    const { fetchFn, calls } = nodeLikeFetch(LIST_PAYLOAD, 'atlas_session=nodecookie.sig; HttpOnly; SameSite=Strict; Path=/')
    const conn = await connect({ baseUrl: 'http://127.0.0.1:1', launchToken: 'tok-node', fetch: fetchFn })
    expect(conn.credential).toBe('nodecookie.sig')
    await conn.listSessions({ scopeId: 'main' })
    const listCall = calls.find(c => c.url.includes('/sessions') && !c.url.includes('search'))
    expect(listCall!.headers.authorization).toBe('Bearer nodecookie.sig')
  })

  test('Node 形（getSetCookie 可读但 cookie 名解析未命中）：redeem throw（fail-closed，不静默落 ambient）', async () => {
    // 审计 hardening（Atlas-reveiw 2026-11-20）：raw 非空但无 atlas_session
    // （版本间 cookie 名漂移形）——旧形 fall-through return '' → Node 无
    // cookie jar，静默切 ambient 全部请求延迟 401（redeem 零报错）。
    // fail-closed：此形必须即时报错；仅「浏览器形不可读」（raw 空）走哨兵。
    const { fetchFn } = nodeLikeFetch(LIST_PAYLOAD, 'other_session=xyz; HttpOnly; Path=/')
    let thrown: unknown
    try {
      await connect({ baseUrl: 'http://127.0.0.1:1', launchToken: 'tok-drift', fetch: fetchFn })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(AtlasConnectionError)
    expect((thrown as AtlasConnectionError).code).toBe('invalidRequest')
  })
})
