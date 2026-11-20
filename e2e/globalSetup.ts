/**
 * Playwright globalSetup：runner 预检（工单 A0 核 runner 格）。
 * ATLASWEB_TGZ 缺失/相对路径/错 scope → requireCandidateTgz 内
 * process.exit(1) → 整次测试运行非零退出（fail-closed）。
 */
import { requireCandidateTgz } from './fixtures/installedApp'

export default function globalSetup(): void {
  requireCandidateTgz()
}
