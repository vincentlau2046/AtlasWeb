/**
 * npm 安装包 Node 入口（A1：已安装软件包的一条启动命令）。
 *
 * 由 build-npm-package.ts 以 `bun build --target=node --format=esm` 打成
 * 单文件 `server/atlasweb.js`（Node shebang，非 node: 内建依赖——含构建时
 * 精确锁定的 @atlasharness/atlascode/web-session-runtime——全部内联 bundle，
 * 安装目录零运行时依赖树）。bin.atlasweb → 本文件编译产物。
 *
 * 复用 launchCli `main(argv)`：loopback/cookie/Host/Origin、就绪协议、
 * 优雅关闭、fail-closed 全部同源；不回落源码、不安装第二份载体。
 *
 * 静态根固定为包内 dist/（bin 所在 server/ 的兄弟目录）：import.meta.url
 * 在 bundle 后指向产物文件自身 → 相对安装目录解析。用户显式 --static 被
 * 拒绝（fail-closed 非零退出）：静态层在 cookie 鉴权之前服文件——允许
 * 覆盖根即可让未鉴权 HTTP 面服出任意本地目录（reviewer Fix 7）。
 * dist 缺席 → createHttpHost fail-closed throw → 非零退出（不崩空）。
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { main } from './launchCli'

const packagedStaticDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const argv = process.argv.slice(2)
if (argv.includes('--static')) {
  process.stderr.write('atlasweb: --static is not supported on the installed package (the static root is fixed to the packaged dist/)\n')
  process.exit(2)
}
argv.push('--static', packagedStaticDir)

main(argv).catch((error: unknown) => {
  process.stderr.write(`fatal: ${(error as Error).message}\n`)
  process.exit(1)
})
