/**
 * B 附表 §1 共享地基 —— workspaceAuth 服务端落档（RED 先行）。
 *
 * 合同 §1 授权行：逐工作区显式授权，由 host 服务端记录；**不从读授权推导，
 * 不从 --scope 自动获得**。吊销即时生效于新命令（运行中回合按 §4 收口归
 * upstream/kernel，本件只记录授权态）。
 *
 * fail-closed：dir 须绝对路径（对表 launchCli storageDir 非绝对路径 → 非零
 * 退出同款纪律）；workspaceId 须非空；同 id 换 dir 绑定 = 硬错（重绑须先
 * revoke——防止静默改写授权目标）。
 */
import { describe, test, expect } from 'bun:test'
import { createWorkspaceAuthorizer } from '../src/execution/workspaceAuth'

describe('workspaceAuth · 服务端落档（合同 §1 授权行）', () => {
  test('grant → isGranted；revoke 即时生效', () => {
    const wa = createWorkspaceAuthorizer()
    expect(wa.isGranted('ws1')).toBe(false)
    wa.grantWorkspace('ws1', '/tmp/some-workspace')
    expect(wa.isGranted('ws1')).toBe(true)
    expect(wa.workspaceDir('ws1')).toBe('/tmp/some-workspace')
    expect(wa.revoke('ws1')).toBe(true)
    expect(wa.isGranted('ws1')).toBe(false)
    expect(wa.workspaceDir('ws1')).toBeUndefined()
  })

  test('未授权一律 false：授权态不从 --scope / 读授权推导（零自动获得）', () => {
    const wa = createWorkspaceAuthorizer()
    // 构造时无任何入参——授权面与 scope 表零耦合；任何 id 未显式 grant 即 false
    expect(wa.isGranted('main')).toBe(false)
    expect(wa.isGranted('')).toBe(false)
  })

  test('fail-closed：相对路径 dir / 空 workspaceId / 非字符串 → 拒', () => {
    const wa = createWorkspaceAuthorizer()
    expect(() => wa.grantWorkspace('ws1', 'relative/dir')).toThrow()
    expect(() => wa.grantWorkspace('', '/abs')).toThrow()
    expect(() => wa.grantWorkspace('ws1', '')).toThrow()
    // @ts-expect-error 越型面也须 fail-closed
    expect(() => wa.grantWorkspace(undefined, '/abs')).toThrow()
  })

  test('同 id 同 dir 幂等；同 id 换 dir = 硬错（重绑须先 revoke）', () => {
    const wa = createWorkspaceAuthorizer()
    wa.grantWorkspace('ws1', '/abs/a')
    expect(() => wa.grantWorkspace('ws1', '/abs/a')).not.toThrow()
    expect(() => wa.grantWorkspace('ws1', '/abs/b')).toThrow()
    // revoke 后可重绑新 dir
    wa.revoke('ws1')
    expect(() => wa.grantWorkspace('ws1', '/abs/b')).not.toThrow()
    expect(wa.workspaceDir('ws1')).toBe('/abs/b')
  })

  test('revoke 未授权 id → false（零副作用）', () => {
    const wa = createWorkspaceAuthorizer()
    expect(wa.revoke('nope')).toBe(false)
  })
})
