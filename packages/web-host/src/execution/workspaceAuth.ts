/**
 * B 附表 §1 共享地基 —— workspaceAuth（合同 §1 授权行，f4 批复附条「先行
 * 落码同意」@2026-11-21）。
 *
 * 逐工作区显式授权，host 服务端落档：
 *  - 不从读授权推导、不从 --scope 自动获得（合同 §1）——本件构造零入参，
 *    授权面与 scope 表零耦合；scope 交叉校验归 executionRoutes（host 侧先
 *    校验再入 upstream，E2）。
 *  - 吊销即时生效于新命令（isGranted 立即 false）；运行中回合按合同 §4 取
 *    消规则收口，归 upstream/kernel，本件只记录授权态。
 *  - fail-closed：dir 须绝对路径（对表 launchCli storageDir 纪律）；
 *    workspaceId 须非空字符串；同 id 换 dir 绑定 = 硬错（重绑须先 revoke，
 *    防静默改写授权目标）；同 id 同 dir 幂等。
 *
 * 零外部依赖；零副作用 at import。
 */
import { isAbsolute } from 'node:path'

export interface WorkspaceAuthorizer {
  /** 显式授权工作区到目录绑定。同 id 同 dir 幂等；同 id 换 dir = 硬错。 */
  grantWorkspace(workspaceId: string, dir: string): void
  /** 吊销（即时生效于新命令）。未授权 id → false（零副作用）。 */
  revoke(workspaceId: string): boolean
  isGranted(workspaceId: string): boolean
  /** 授权目录绑定（runTurn cwd 消费面）；未授权 → undefined。 */
  workspaceDir(workspaceId: string): string | undefined
}

export function createWorkspaceAuthorizer(): WorkspaceAuthorizer {
  const grants = new Map<string, string>()

  return {
    grantWorkspace(workspaceId, dir) {
      if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
        throw new Error('workspaceId must be a non-empty string')
      }
      if (typeof dir !== 'string' || dir.length === 0 || !isAbsolute(dir)) {
        throw new Error(`workspace dir must be an absolute path, got: ${String(dir)}`)
      }
      const existing = grants.get(workspaceId)
      if (existing !== undefined) {
        if (existing === dir) return // 幂等
        throw new Error(
          `workspace "${workspaceId}" already granted to ${existing}; revoke before rebinding to ${dir}`,
        )
      }
      grants.set(workspaceId, dir)
    },
    revoke(workspaceId) {
      return grants.delete(workspaceId)
    },
    isGranted(workspaceId) {
      return grants.has(workspaceId)
    },
    workspaceDir(workspaceId) {
      return grants.get(workspaceId)
    },
  }
}
