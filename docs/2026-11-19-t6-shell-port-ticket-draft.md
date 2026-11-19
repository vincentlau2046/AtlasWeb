# T6-A「AtlasWeb shell 基座移植 + Code 只读 bundle」波前方案稿（工单草稿）

- 日期：2026-11-19。起草：Atlasweb-F4。
- 状态：**方案稿候审计**——按 2026-11-15 链路：本稿 → atlas-mainline-f4 转正工单 → Atlas-reveiw 审计 → 双信号开工。本稿不是开工授权。
- 上位依据：`AtlasCode:docs/superpowers/plans/2026-11-13-atlas-family-platform-plan.md` Task 6（2026-11-15 §8 修订后 G1/G2 分阶段语义）；`docs/2026-11-15-s0-agreement.md` §3 里程碑 3（read-only foundation 含壳）。
- 用户授权：2026-11-19「T6 shell 移植波启动……这个你分解好计划和方案随时可以启动了」。

## §0 活码重核 @ 2026-11-19（非照抄 2026-11-13 计划假设）

| # | 核对面 | 实测 | 判 |
|---|---|---|---|
| F1 | 移植源在位性 | 本地 `~/projects/deepseek-harness` 存在，HEAD 已前进（09d38feb），基线 tag `dsh-v0.2.2-rc.2` 本地可取 | 从 **tag** 移植，禁用 HEAD |
| F2 | AtlasWeb 包骨架 | 15 包在位，除 web-host（8 src/14 test）外均 `export {}` 空壳；包谱系与 dsh client 子包一一对应（connection/modules/store/ui-layout/ui-primitives/ui-renderer/ui-slots/ui-theme/web） | 骨架即移植落位图，无需新建包 |
| F3 | THIRD_PARTY_NOTICES 与实态差 | NOTICES 称「vendored copies live under vendor/ with upstream commit pinned」——实测 **vendor/ 为空**（NOTICES 先行写就，移植未启动） | 本波补齐 vendor 使 NOTICES 属实 |
| F4 | UI 技术栈 | dsh@tag = React ^18.2.0 + cordis 插件框架（vendor/cordis 等 7 件）+ zod 4.6.6 + @tanstack/react-virtual；`client/web` = boot kernel（静态模块表+Cordis loader+framework-free boot page+renderer handoff） | AtlasWeb 现零 UI 依赖，本波引入 |
| F5 | 消费面就绪性 | web-host 四面 + /auth/redeem + follow SSE 全 live（G2 admitted @0.1.124） | UI 消费面就绪，无需上游动作 |
| F6 | 体量盘点 @tag | vendor 81 件 / connection 35 / modules 15 / store 4 / web 20 / ui-primitives **203** / ui-renderer 24 / ui-slots 7 / ui-layout 18 / ui-theme 40 | ui-primitives 全量移植不成立（见 §5 自决 3） |
| F7 | 工程接线 | 根 = npm workspaces(apps/*,packages/*) + bun test；无根 tsconfig；web-host 零 build 产物直跑 src | 包级 tsconfig 按需建；bun 直跑 TS 沿用 |
| F8 | roadmap Current phase | atlas-mainline-f4 已修正 @AtlasCode f54377e7（本稿起草中收到的回执） | 已销，不再是本波事项 |

## 范围界定

**In（里程碑 3 = read-only foundation 的壳切片）**：
dsh shell 基座移植（boot graph / modules / connection / store / slots / renderer / layout / primitives / theme）+ Atlas 适配（brand 槽 / mode 选择 Code 默认 / connection 适配 web-host 传输）+ web-code 只读 bundle（四面消费：list / search / replay / follow-live 只读渲染）+ apps/atlasweb 构建入口。

**Out（红线，S0 §3 里程碑 4 域）**：
prompt/queue/cancel 输入面（F2）、审批/权限交互面（F3）、会话写操作、任何 `@atlasharness/atlascode` 内部 API 直连。ui-chat composer / ui-approval / ui-permission-presets 等 dsh 交互子包**不移植**。

## 任务分解（6 切片，每片 TDD：RED 腿先行 → 移植 → 绿 → commit）

| 切片 | 内容 | 移植形 | 体量@tag |
|---|---|---|---|
| S1 | `vendor/`（cordis/cosmokit/schemastery/hmr/loader/logger-console/timer 等全量 verbatim + 上游 commit pin）+ `web-store` + `web-modules` | verbatim 拷贝（vendor）/ verbatim+头注（store/modules） | ~100 文件 |
| S2 | `web-theme` + `web-slots` + `web-renderer` | verbatim+头注，品牌字面值替换为 web-brand 槽位 | ~71 文件 |
| S3 | `web-primitives` **选择性移植** | 清单驱动：以 S5/S6 只读视图实际 import 闭包为准，开工时冻结原子清单入档 | 估 30–60 / 全量 203 |
| S4 | `web-connection` | **重适配**（非 verbatim）：dsh host 传输 → AtlasWeb /auth/redeem + HTTP 四面 + follow SSE（fetch 流）；断线重连语义对齐 followPump fail-closed | 35 文件基型 |
| S5 | `web-shell` boot kernel + `web-layout` | verbatim+头注，模块表改 Atlas 包注册 | ~38 文件 |
| S6 | `web-brand` + `web-mode`（Code 默认）+ `web-code` 只读 bundle + `apps/atlasweb` vite 构建 + 全部门格 | 新写（Atlas 域） | 新码 |

每片收口纪律：bun test 全仓绿 → commit → 下片。波内依赖载体零变更（pin 不动 0.1.124）。

## 判据与门

1. **每片**：bun test 绿（新腿 + 全仓回归），只读红线负腿随片入位（grep 级断言：bundle 无 composer/approval/写面词汇）。
2. **边界自守**：新测试腿——UI 包 import `@atlasharness/*` 一律 fail-closed（仅 web-host 豁免）；上游 `atlasweb-kernel-boundary-scan.ts` 作交叉参照（AtlasCode 仓执行）。
3. **端到端**：构建产物 serve → /auth/redeem → 四面全通烟测（fetch 级；浏览器级 e2e 登记债不进本波）。
4. **不动面**：web-host 套件 43/0 保持；G1/G2 真值表 admitted 保持；格 I 背书不需重发（载体/产物锚零变更——若波内被迫 bump 依赖则触发完整重验并升级呈批）。
5. **收口**：e2e lane 复跑回执 → 版本记平台候选 `0.1.0`（S0 §3 里程碑 3 口径）→ **tag 不自发**，发布链候用户 + G2 终格。

## 风险登记

| # | 风险 | 缓解 |
|---|---|---|
| R1 | ui-primitives 选择闭包牵出面失控 | slice 3 开工冻结清单；超估即回审 |
| R2 | cordis 在 bun test 下兼容性未知 | S1 首腿 RED 实证；不行则 node:test 双轨（升级呈批） |
| R3 | dsh TS^6 语法/bun 版本差 | 包级 tsconfig + 逐片编译面实测 |
| R4 | SSE 在 React 侧的取消/背压语义 | 对齐 web-host followPump fail-closed 契约，S4 判据腿直证 |

## §5 审视记录（逐点自决，无硬报裁项）

- **自决 1**：移植源 = 本地 tag `dsh-v0.2.2-rc.2`（F1）；禁 HEAD。
- **自决 2**：vendor 81 件 verbatim + commit pin，补齐 F3 缺口使 NOTICES 属实。
- **自决 3**：ui-primitives 选择性移植（F6 体量裁定）；全量移植否决理由：读-only bundle 无需 203 原子全集，选择性闭包可审计。
- **自决 4**：React ^18.2.0 / zod 对齐 dsh tag 版本号，不追新。
- **自决 5**：connection 重适配形（S4）——dsh 传输面与 AtlasWeb 面不同构，verbatim 无意义；适配判据 = 四面契约腿。
- **自决 6**：UI 边界自守测试腿（判据 2）——上游 scanner 不在我仓执行域，本地负腿自足 + 上游交叉。
- **自决 7**：本波验证深度 = bun test + 构建产物 fetch 级烟测；playwright 浏览器级登记债（候后续波）。
- **自决 8**：版本候选 0.1.0 不自发 tag（判据 5）；发布链 = 候用户。
- **报裁候选（软）**：仅 R2 若 cordis/bun 不兼容触发双轨制时升级呈批；其余波内自决闭环，审计可查。
