# T6-A AtlasWeb Shell Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the dsh web shell foundation onto AtlasWeb's 15-package skeleton and ship a read-only Code bundle consuming the four S0 faces, completing S0 §3 milestone 3 (read-only foundation).

**Architecture:** Clean-closure dsh packages port verbatim (vendor cordis framework, store, ui-slots, ui-renderer); coupled packages (connection, ui-theme, ui-layout, boot kernel) are adapted with dsh as reference, replacing dsh product-service edges (ui-settings/shortcuts/locale/ui-dockkit/ui-session) with Atlas seams (brand slots, layout host, slot registration); web-code bundle is new Atlas-domain code consuming web-host's HTTP/SSE faces only.

**Tech Stack:** React ^18.2.0, cordis (vendored, 81 files), vite ^6.4.3 + @vitejs/plugin-react ^4.7.0 (build only), bun test (test runner), zod 4.6.x (present), @tanstack/react-virtual.

**Spec:** `AtlasWeb/docs/2026-11-19-t6-shell-port-ticket-draft.md` (v2 判据面) + `AtlasCode:docs/2026-11-19-t6-shell-port-ticket.md` @83706220 (正式工单) + `AtlasWeb/docs/2026-11-15-s0-agreement.md` §3.

## Global Constraints

- 载体 pin 不动：`@atlasharness/atlascode = 0.1.124`——**bump 触发面三分域（审计 §C 必改①）**：
  - (a) 载体 `@atlasharness/atlascode` 依赖行任何变更 → 完整重验 + 升级呈批；
  - (b) web-host 运行时依赖行变更 → 同 (a)；
  - (c) 波内 UI 链/toolchain 新增依赖 → **白名单预注册**：`react ^18.2.0` / `react-dom ^18.2.0` / `vite ^6.4.3` / `@vitejs/plugin-react ^4.7.0` / `@tanstack/react-virtual` / `zod 4.6.x`——白名单内不触发；白名单外按 (a)。
- 只读红线：无 prompt/queue/cancel/approval/写面；bundle 内禁 composer/approval 词汇（grep 负腿）。
- 边界红线：`@atlasharness/*` 仅 web-host 可 import；UI 包 import 一律 fail-closed 测试腿。
- dsh 产品服务子包禁入：ui-settings / shortcuts / locale / ui-dockkit / ui-session 词汇 import 断言 = 0（R5 负腿）。
- 移植源恒为 tag `dsh-v0.2.2-rc.2`（ddac96760b）；禁 HEAD（09d38feb 已前进）。
- MIT 头注保留，适配处在源文件头标注 `Adapted from dsh@dsh-v0.2.2-rc.2: <change>`。
- npm 一律 `--registry https://registry.npmjs.org`；commit 属性行 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- 测试运行器 = bun test（canon：全仓 `bun test` 绿再 commit）；构建 = vite 6 仅 apps 层。
- 每片收口：新腿 + 全仓回归绿 → commit → 下片；平台版本候选 `0.1.0`，tag 不自发。

## Review Focus

1. **follow SSE 中断重连（resetRequired）**：UI 消费面必须收敛到重采样基线，不得冻结在旧流——S4 判据腿直证。
2. **首次启动空仓态**（零会话）：boot 页与 SessionList 不得白屏/崩溃——S6 空态腿。
3. **replay 流中畸形 carrier 事件**：fail-closed 渲染（跳过+标注），禁整视图崩溃——S6 投影适配器负腿。
4. **follow 中快速切换会话**：在途流必须 abort，禁跨会话串染——S4/S6 竞态腿。
5. **大体量 transcript replay**：DOM 必须有界（react-virtual 虚拟化），禁全量挂载——S6 虚拟化腿。

---

### Task 1: vendor 基座 + cordis/bun 兼容实证（R2 首腿）

**Files:**
- Create: `vendor/`（dsh@tag vendor/ 全量 81 件 verbatim，含 README manifest 表）
- Create: `vendor/README.md`（双面 pin：dsh tag ddac96760b + 上游 commit 表 verbatim 随迁）
- Test: `vendor/smoke.test.ts`（或 `tests/vendor-smoke.test.ts`）

**Interfaces:**
- Produces: `@atlasweb/vendor/*` 可解析的 cordis/cosmokit/schemastery 源；后续所有任务的框架层。

- [ ] **Step 1: RED——vendor 冒烟腿**

```ts
// tests/vendor-smoke.test.ts
import { describe, expect, test } from 'bun:test'
test('cordis Context boots under bun', async () => {
  const { Context } = await import('../vendor/cordis/src/index')
  const ctx = new Context()
  expect(ctx.scope(null as never)).toBeTruthy()
  ctx.dispose()
})
test('vendor manifest dual-face pin recorded', () => {
  /* 读 vendor/README.md 断言含 dsh tag ddac96760b 与上游 commit 表 9 行 */
})
```

Run: `bun test tests/vendor-smoke.test.ts`
Expected: FAIL（vendor/ 不存在）

- [ ] **Step 2: verbatim 拷贝** `git -C ~/projects/deepseek-harness archive dsh-v0.2.2-rc.2 vendor | tar -x`（在工作树根）+ 双面 pin README。
- [ ] **Step 3: GREEN** 同命令 Expected: PASS。**若 cordis/bun 不兼容 → R2 升级呈批，停片。**
- [ ] **Step 4: Commit** `feat(vendor): dsh-v0.2.2-rc.2 vendor foundation verbatim + dual-face pin`

### Task 2: web-store + web-modules（干净集 verbatim）

**Files:**
- Modify: `packages/web-store/src/`、`packages/web-modules/src/`
- Modify: 两包 `package.json`（name 改 `@atlasweb/web-store` 等；deps 对齐）
- Test: `packages/web-store/test/`、`packages/web-modules/test/`（自 dsh@tag 对应 tests 移植代表腿）

- [ ] **Step 1: RED——移植 dsh store 代表测试腿**（改 import 至 `@atlasweb/web-store`），Run: FAIL（空壳）。
- [ ] **Step 2: 拷贝源码**（store 4 件 verbatim；modules 15 件，package-manifest/host-webserver 引用边局部类型化处理，头注标注）。
- [ ] **Step 3: GREEN** + 全仓 `bun test`。
- [ ] **Step 4: Commit** `feat(web-store,web-modules): port dsh store/modules verbatim (+edge notes)`

### Task 3: web-slots + web-renderer（干净集 verbatim）

**Files:**
- Modify: `packages/web-slots/src/`（7 件）、`packages/web-renderer/src/`（24 件）
- Add deps: react ^18.2.0（peer）
- Test: 各包 test/（dsh 代表腿移植）

- [ ] **Step 1: RED**（slots→store、renderer→slots 链代表腿）。
- [ ] **Step 2: 拷贝 + 头注。**
- [ ] **Step 3: GREEN** + 全仓。
- [ ] **Step 4: Commit** `feat(web-slots,web-renderer): port clean-closure set`

### Task 4: web-theme（适配形：剥离产品服务边）

**Files:**
- Modify: `packages/web-theme/src/`（40 件基型，剥离 ui-settings×5/shortcuts/webserver 边）
- Create: 主题 token 源接口消费 `@atlasweb/web-brand` 槽位形
- Test: token 解析腿 + **R5 负腿**（禁入词汇 import 断言=0）

- [ ] **Step 1: RED——token 腿 + R5 负腿**（负腿先行 FAIL 因空壳无断言对象→先建断言骨架）。
- [ ] **Step 2: 适配移植**（边替换点逐文件头注 `Adapted: settings edge → brand slot`）。
- [ ] **Step 3: GREEN** + 全仓。
- [ ] **Step 4: Commit** `feat(web-theme): adapted port — settings/shortcuts edges stripped to brand slot`

### Task 5: web-primitives 选择闭包（清单驱动）

**Files:**
- Modify: `packages/web-primitives/src/`
- Create: `docs/t6a-primitives-freeze-list.md`（原子清单+依据，S3 开工首步冻结——审计焦点①时点）
- Test: 每入选原子 ≥1 腿

- [ ] **Step 1: 冻结清单**——扫描基准（审计 §C 必改②a）：**dsh@tag `client/web` + `client/ui-layout` 对 ui-primitives 实引闭包 + S6 计划视图设计稿**（非 Task 7/8 视图源——彼时未存在，时序悖论），落档。**清单超 60 原子即回审。**
- [ ] **Step 2: RED**（入选原子代表腿）。
- [ ] **Step 3: 选择拷贝**（util-code-language 边局部化）。
- [ ] **Step 4: GREEN** + 全仓 → **Commit**（清单档随片）。

### Task 6: web-connection 重适配（AtlasWeb 传输面）

**Files:**
- Modify: `packages/web-connection/src/`（重写；dsh connection 35 件为参照）
- Test: `packages/web-connection/test/`（fixture host：四面 + SSE + redeem）

**Interfaces:**
- Consumes: web-host HTTP 面（POST /auth/redeem、GET list/search/replay、GET follow SSE）
- Produces: `connect(config): AtlasConnection`（faces 方法 + 事件流 + abort 语义）

- [ ] **Step 1: RED——契约腿**：fixture 起 web-host 进程 → redeem → list/search/replay/follow 全断言；**resetRequired 重连收敛腿**（Review Focus 1）+ **切换 abort 竞态腿**（Review Focus 4）。
- [ ] **Step 2: 重写实现**（fetch 流解析 SSE；取消经 AbortController 对齐 followPump fail-closed）。
- [ ] **Step 3: GREEN** + 全仓。
- [ ] **Step 4: Commit** `feat(web-connection): Atlas transport adapter — four faces + SSE + fail-closed reconnect`

### Task 7: web-shell boot kernel + web-layout（适配形）

**Files:**
- Modify: `packages/web-shell/src/`（20 件基型：静态模块表改 Atlas 包注册；ui-dockkit×3 边 → 最小布局宿主）
- Modify: `packages/web-layout/src/`（18 件基型：ui-session/shortcuts/locale 边 → web-code 槽注册 + brand 槽）
- Test: boot 序列腿（模块表→loader→renderer handoff）+ R5 负腿

- [ ] **Step 1: RED**（boot 序列腿 + R5 负腿）。
- [ ] **Step 2: 适配移植。**
- [ ] **Step 3: GREEN** + 全仓 → **Commit**。

### Task 8: web-brand + web-mode + web-code 只读 bundle

**Files:**
- Modify: `packages/web-brand/src/`（品牌 token/槽位实现——品牌系统 spec 为源）
- Modify: `packages/web-mode/src/`（mode 注册，Code 默认）
- Modify: `packages/web-code/src/`（新码：SessionList / SessionSearch / ReplayView / LiveFollow 四视图 + 投影适配器 carrier 事件→视图模型）
- Test: 视图腿（seeded fixtures）+ **Review Focus 2/3/5 腿**（空态/畸形事件/虚拟化有界）

- [ ] **Step 1: RED——四视图腿 + Review Focus 2/3/5 腿。**
- [ ] **Step 2: 实现视图 + 投影适配器。** **停腿（审计 §C 必改②b）**：实现中需引入冻结清单外原子 → 停片走 R1 回审，禁静默增补。
- [ ] **Step 3: GREEN** + 全仓。
- [ ] **Step 4: Commit** `feat(web-code): read-only Code bundle — four-face views over seeded fixtures`

### Task 9: apps/atlasweb 构建入口 + 端到端烟测

**Files:**
- Modify: `apps/atlasweb/`（vite 6 + plugin-react 配置、index.html、main.tsx）
- Modify: 根 `package.json`（build script 接 vite）
- Test: `apps/atlasweb/test/smoke.test.ts`（构建产物 fetch 级烟测）

- [ ] **Step 1: RED——烟测腿**：vite build → serve dist → fetch /auth/redeem → 四面全通断言 + **只读红线 grep 负腿——词表预注册化（审计 §C 注记③）**：逐词列明标识符形（`composer` / `approval` / `prompt(` / `queueMessage` / `cancelSession` 等实际词表于实现时冻结入 `docs/t6a-readonly-lexicon.md`）+ 豁免表（replay 投影内合法 prompt 字样排除面逐条入表，禁裸 grep）。
- [ ] **Step 2: 接 vite 构建 + 入口。**
- [ ] **Step 3: GREEN** + 全仓。
- [ ] **Step 4: Commit** `feat(app): atlasweb vite entry + four-face bundle smoke`

### Task 10: 门格收口

**Files:**
- Modify: `docs/upstream-pairing.md`（T6-A 波档）、`THIRD_PARTY_NOTICES.md` 核对
- Test: 全仓 bun test + web-host 套件核对

- [ ] **Step 1: 边界交叉**——AtlasCode 仓跑 `scripts/atlasweb-kernel-boundary-scan.ts` 对 AtlasWeb 源，violation=0。
- [ ] **Step 2: 不动面核对**——web-host 43/0；G1/G2 真值表 admitted；依赖行 bump 判定（变更行数=0 预期）。
- [ ] **Step 3: 全仓 bun test 绿 + 只读红线终核。**
- [ ] **Step 4: 波档落 docs + commit** `docs: T6-A wave closeout — gates, boundary, pairing record`；版本记候选 0.1.0，**tag 不自发**，e2e lane 回执 + 发布链候用户。
