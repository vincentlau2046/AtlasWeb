# T6-A「AtlasWeb shell 基座移植 + Code 只读 bundle」波前方案稿 v2（工单草稿）

- 日期：2026-11-19。起草：Atlasweb-F4。
- **v2 刷新（同日第二遍审视）**：新增 §0 F9 依赖闭包双面分析；S2/S5 移植形改判（verbatim → verbatim+适配边，见自决 9/10）；vendor 双面 pin 落法（自决 11，对齐 f4 审计焦点④）；zod 冲突排除（自决 12）。坐标：正式工单 = AtlasCode `docs/2026-11-19-t6-shell-port-ticket.md` @83706220；可执行计划 = `docs/superpowers/plans/2026-11-19-t6a-shell-port-plan.md`。
- 状态：**v2.1（2026-11-19）**：Atlas-reveiw 审计**有修改通过**（采记 = AtlasCode 工单 §C @dccdc798）；必改①bump 三分域+白名单 / 必改②冻结清单时序 已落计划 @04093e0 后续 fixup commit；四注记（F6 40→39 / 自决 12 zod 勘误 / Task 9 词表预注册 / 扫描器全路径）已并入。**双信号放行，开工条件满足。**
- 上位依据：`AtlasCode:docs/superpowers/plans/2026-11-13-atlas-family-platform-plan.md` Task 6（2026-11-15 §8 修订后 G1/G2 分阶段语义）；`docs/2026-11-15-s0-agreement.md` §3 里程碑 3（read-only foundation 含壳）。
- 用户授权：2026-11-19「T6 shell 移植波启动……这个你分解好计划和方案随时可以启动了」。

## §0 活码重核 @ 2026-11-19（非照抄 2026-11-13 计划假设）

| # | 核对面 | 实测 | 判 |
|---|---|---|---|
| F1 | 移植源在位性 | 本地 `~/projects/deepseek-harness` 存在，HEAD 已前进（09d38feb），基线 tag `dsh-v0.2.2-rc.2` = `ddac96760b` 本地可取 | 从 **tag** 移植，禁用 HEAD |
| F2 | AtlasWeb 包骨架 | 15 包在位，除 web-host（8 src/14 test）外均 `export {}` 空壳；包谱系与 dsh client 子包一一对应 | 骨架即移植落位图，无需新建包 |
| F3 | THIRD_PARTY_NOTICES 与实态差 | NOTICES 称 vendored copies live under vendor/——实测 **vendor/ 为空** | 本波补齐 vendor 使 NOTICES 属实 |
| F4 | UI 技术栈 | dsh@tag = React ^18.2.0 + cordis（vendor 全量 81 件）+ zod 4.6.6 + @tanstack/react-virtual；构建 vite ^6.4.3 + @vitejs/plugin-react ^4.7.0；`client/web` = boot kernel（静态模块表+Cordis loader+framework-free boot page+renderer handoff） | AtlasWeb 引入同版 toolchain；bun test 保留为测试运行器 |
| F5 | 消费面就绪性 | web-host 四面 + /auth/redeem + follow SSE 全 live（G2 admitted @0.1.124） | UI 消费面就绪，无需上游动作 |
| F6 | 体量盘点 @tag | vendor 81 / connection 35 / modules 15 / store 4 / web 20 / ui-primitives **203** / ui-renderer 24 / ui-slots 7 / ui-layout 18 / ui-theme **39**（审计 §C 注记①勘误：40→39） | ui-primitives 全量移植不成立（自决 3）；体量须叠加 F9 闭包维度 |
| F7 | 工程接线 | 根 = npm workspaces + bun test；无根 tsconfig；web-host 直跑 src | 包级 tsconfig 按需建；bun 直跑 TS 沿用 |
| F8 | roadmap Current phase | atlas-mainline-f4 已修正 @AtlasCode f54377e7 | 已销 |
| **F9** | **依赖闭包双面** | **npm 运行时闭包近零**（connection→credentials+schemastery+zod；ui-theme→schemastery；其余 6 包运行时 deps=空——交叉包引用全落 devDeps/vite 打包）**vs 源码级 import 闭包实量**：store=0 / ui-slots→store(3) / ui-renderer→ui-slots(8) / modules→store+package-manifest+host-webserver(各1) / ui-primitives→util-code-language(4)+store 等 / **耦合集**：connection→typert-protocol(6)+credentials(3)+llm(2)+session+scope；ui-theme→ui-slots(6)+**ui-settings(5)**+primitives(5)+shortcuts+webserver；ui-layout→slots(5)+theme(2)+**ui-session(1)**+shortcuts+locale+brand；web→slots/primitives/store/modules(各3)+**ui-dockkit(3)** | **干净 verbatim 集 = vendor+store+ui-slots+ui-renderer(+modules 微边)；耦合集（connection/ui-theme/ui-layout/web boot）= 适配改写形**——闭包无传递爆炸（不牵入 ui-chat/ui-approval），范围可控 |

## 范围界定

**In（里程碑 3 = read-only foundation 的壳切片）**：
shell 基座移植（boot graph / modules / connection / store / slots / renderer / layout / primitives / theme）+ Atlas 适配（brand 槽 / mode 选择 Code 默认 / connection 适配 web-host 传输）+ web-code 只读 bundle（四面消费：list / search / replay / follow-live 只读渲染）+ apps/atlasweb 构建入口。

**Out（红线，S0 §3 里程碑 4 域）**：
prompt/queue/cancel 输入面（F2）、审批/权限交互面（F3）、会话写操作、任何 `@atlasharness/atlascode` 内部 API 直连。ui-chat composer / ui-approval / ui-permission-presets / **ui-settings** 等 dsh 交互与产品服务子包**不移植**（耦合边以 Atlas seam 替代，见自决 10）。

## 任务分解（切片与移植形，TDD：RED 腿先行 → 移植 → 绿 → commit）

| 切片 | 内容 | 移植形 | 体量@tag |
|---|---|---|---|
| S1 | `vendor/` 全量 verbatim（含 dsh vendor/README 上游 commit 表随迁）+ `web-store` + `web-modules`（微边：package-manifest/host-webserver 引用以类型局部化处理） | vendor verbatim / store verbatim / modules verbatim+微边 | ~100 文件 |
| S2 | `web-slots` + `web-renderer` verbatim；`web-theme` **适配形**：剥离 ui-settings(5)/shortcuts/webserver 耦合边 → 主题 token 源改 web-brand 槽 | verbatim ×2 + 适配 ×1 | ~71 文件 |
| S3 | `web-primitives` **选择性移植** | 清单驱动：以 S6 只读视图实际 import 闭包为准，开工时冻结原子清单入档（f4 审计焦点①时点=S3 开工首步） | 估 30–60 / 全量 203 |
| S4 | `web-connection` **重适配**（非 verbatim）：dsh typert-protocol/llm/session 传输 → AtlasWeb /auth/redeem + HTTP 四面 + follow SSE（fetch 流）；断线重连语义对齐 followPump fail-closed | 重写（dsh 为参照） | 35 文件基型 |
| S5 | `web-shell` boot kernel **适配形**（静态模块表改 Atlas 包注册；ui-dockkit(3) 边以最小布局宿主替代）+ `web-layout` **适配形**（ui-session(1)/shortcuts/locale 边 → web-code 槽注册 + brand 槽） | 适配 ×2 | ~38 文件 |
| S6 | `web-brand` + `web-mode`（Code 默认）+ `web-code` 只读 bundle + `apps/atlasweb` vite 构建 + 全部门格 | 新写（Atlas 域） | 新码 |

每片收口纪律：bun test 全仓绿 → commit → 下片。波内依赖载体零变更（pin 不动 0.1.124）。

## 判据与门

1. **每片**：bun test 绿（新腿 + 全仓回归），只读红线负腿随片入位（grep 级断言：bundle 无 composer/approval/写面词汇）。
2. **边界自守**：新测试腿——UI 包 import `@atlasharness/*` 一律 fail-closed（仅 web-host 豁免）；上游 `atlasweb-kernel-boundary-scan.ts` 作交叉参照（AtlasCode 仓执行）。
3. **端到端**：vite 构建产物 serve → /auth/redeem → 四面全通烟测（fetch 级；浏览器级 e2e 登记债不进本波）。
4. **不动面**：web-host 套件 43/0 保持；G1/G2 真值表 admitted 保持；格 I 背书不需重发（载体/产物锚零变更）——**bump 判定形 = 任一依赖行变更即触发完整重验并升级呈批**（对齐 f4 审计焦点③）。
5. **收口**：e2e lane 复跑回执 → 版本记平台候选 `0.1.0`（S0 §3 里程碑 3 口径）→ **tag 不自发**，发布链候用户 + G2 终格。

## 风险登记

| # | 风险 | 缓解 |
|---|---|---|
| R1 | ui-primitives 选择闭包牵出面失控 | slice 3 开工首步冻结清单；超估即回审 |
| R2 | cordis 在 bun test 下兼容性未知 | S1 首腿 RED 实证（cordis Context 冒烟）；不行则 node:test 双轨（升级呈批） |
| R3 | dsh TS^6 语法/bun 版本差 | 包级 tsconfig + 逐片编译面实测 |
| R4 | SSE 在 React 侧的取消/背压语义 | 对齐 web-host followPump fail-closed 契约，S4 判据腿直证 |
| R5 | 适配形切片（theme/layout/boot）的边剥离残漏 | 每片负腿：禁入子包词汇（ui-settings/shortcuts/locale/dockkit/ui-session）import 断言 = 0 |

## §5 审视记录（逐点自决，无硬报裁项）

- **自决 1**：移植源 = 本地 tag `dsh-v0.2.2-rc.2`（=ddac96760b，F1 独立直证与 f4 转正核验吻合）；禁 HEAD。
- **自决 2**：vendor 81 件 verbatim，补齐 F3 缺口使 NOTICES 属实。
- **自决 3**：ui-primitives 选择性移植（F6 体量裁定）；清单冻结时点 = S3 开工首步（审计焦点①）。
- **自决 4**：React ^18.2.0 / vite ^6.4.3 / zod 4.6.x 对齐 dsh tag 版本号，不追新。
- **自决 5**：connection 重适配形（S4）——dsh 传输面与 AtlasWeb 面不同构，verbatim 无意义；适配判据 = 四面契约腿。
- **自决 6**：UI 边界自守测试腿（判据 2）——上游 scanner 不在我仓执行域，本地负腿自足 + 上游交叉。
- **自决 7**：本波验证深度 = bun test + 构建产物 fetch 级烟测；playwright 浏览器级登记债（候后续波）。
- **自决 8**：版本候选 0.1.0 不自发 tag（判据 5）；发布链 = 候用户。
- **自决 9（v2）**：**移植形三分法**——干净集 verbatim（vendor/store/ui-slots/ui-renderer/modules 微边）；耦合集适配改写（connection/ui-theme/ui-layout/web boot）；新写（brand/mode/code/app）。依据 = F9 源码闭包实量；每适配边入 R5 负腿。
- **自决 10（v2）**：dsh 产品服务边（ui-settings/shortcuts/locale/ui-dockkit/ui-session）不移植——read-only 里程碑无其消费语义，以 Atlas seam 替代（brand 槽/布局宿主/槽注册），禁其词汇 import（R5）。
- **自决 11（v2）**：vendor 双面 pin（审计焦点④）= ① dsh tag ddac96760b（移植源）② dsh vendor/README 上游 commit 表（cordis 0b96d9fd…/cosmokit 02e691c5…/schemastery cf0b7e54…/group·timer·logger-console 01b39624…/hmr ed8a7755…）verbatim 随 README 入我仓 vendor/README.md。
- **自决 12（v2.1 勘误，审计 §C 注记②）**：zod——AtlasWeb **现零直接依赖**（node_modules 4.6.7 = `@atlasharness` 传递面），本波随移植引入为直接依赖（pin 4.6.x，白名单内）；与 AtlasCode ^4.5.4、dsh 4.6.6 同 4.x 线相容，不新增第二 zod。
- **报裁候选（软）**：仅 R2 若 cordis/bun 不兼容触发双轨制时升级呈批；其余波内自决闭环，审计可查。
