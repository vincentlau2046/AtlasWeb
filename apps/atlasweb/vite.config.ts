// T6-A Task 9: AtlasWeb shell 构建入口配置（vite 6 + plugin-react）。
// 单页只读 shell：entry src/main.tsx；产物 dist/（构建产物烟测 + 生产 lane
// 静态面）。CSS modules 走 vite 内建（web-layout AppFrame.module.css）。
// @deepseek-ai/* 为 tsconfig.base.json paths 的 vendor 别名（源码内联进仓），
// vite 不读 tsconfig paths——此处逐一镜像（与 tsconfig.base.json 同源，勿漂移）。
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const vendorAlias = Object.fromEntries([
  'cosmokit',
  'cordis',
  'cordis-plugin-loader',
  'cordis-plugin-group',
  'cordis-plugin-hmr',
  'cordis-plugin-include',
  'cordis-plugin-timer',
  'cordis-plugin-logger-console',
  'schemastery',
].map(name => [`@deepseek-ai/${name}`, `${repoRoot}vendor/${name}/src/index.ts`]))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: vendorAlias,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
  },
})
