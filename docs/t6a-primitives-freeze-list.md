# T6-A · web-primitives 冻结清单（Task 5 Step 1 = 审计焦点①时点）

**状态：已回审通过（Atlas-reveiw 2026-11-20）——采 B 案 + 16 dep 行升格采认 + (a) 面零原子定性认可 + 4 文件适配形采认，附 3 绑定条件（见 §8）。Task 5 步 2–4 开工。**
基准：dsh@tag `dsh-v0.2.2-rc.2`（ddac96760b）；HEAD 09d38feb 禁用。
落档：2026-11-20，Atlasweb-F4（plan `docs/superpowers/plans/2026-11-19-t6a-shell-port-plan.md` Task 5）。

## 1. 扫描基准与结果（审计 §C 必改②a）

### (a) 面：dsh@tag `client/web` + `client/ui-layout` 对 ui-primitives 实引闭包

- `client/web/src/seed.ts`：`import * as UiPrimitives from '@deepseek-ai/dsh-client-ui-primitives'` —— boot 模块表**命名空间注册制**，零原子枚举。
- `client/ui-layout`：**对 ui-primitives 零引用**（全 grep 零命中——回审独立直证订正，本档原"同形命名空间注册"表述系勘误级；(a)=0 结论 a fortiori 不变）。
- 交叉验证：6 个视图侧 analog 包（ui-conversation / ui-workspace / ui-schedule / ui-trajectory / ui-tool / ui-chat）全部为**具名直接 import**，零 `UiPrimitives.*` 句柄消费。

**结论：(a) 面产出 = 0 原子；原子集由 (c) 面驱动** —— 与工单 S3 行注记、plan Task 5 Step 1 前置扫描一致。审计若预期 (a) 面枚举原子，该前提被证伪（本条为焦点①的实质性发现之一）。

### (c) 面：S6 计划视图设计（工单 v2 §任务分解 S6 行 + plan Task 8）

四面（S0-agreement §3 语义）：list（摘要行/稳定排序/有界分页/**显式 I/O 错误**）· search（输入/定位/取消/限额）· replay（持久化投影只读渲染）· follow-live（续播 + 连接态）。
Review Focus 腿：空态（RF2）· 畸形事件（RF3）· 虚拟化有界（RF5，`@tanstack/react-virtual` 已在白名单，Task 8 直接消费，非 primitives 原子）。

### 主题面（Task 4 前置预注册，随清单冻结）

ui-theme 实引 ui-primitives 仅 2 原子：`ICON_SYMBOLS`、`type IconSymbolId`（`src/client/icon-sprite.ts:7`、`src/client/index.ts:27`）。
`Input` 仅被将剥离的 settings 行（FontFamilyRow.tsx:9）引用 → **不入清单**。

## 2. 入选闭包（文件粒度，按证据分组）

移植形 = 选择拷贝（verbatim + 边局部化 + 图标导出裁剪）；每文件头注 `Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 5)`。

| 组 | 内容 | 文件数 | 证据（dsh@tag 实引包） |
|---|---|---|---|
| G1 chrome 控件 | Button、StateDot、Pill、PathLabel、Tag、Toast、Input、Tooltip、TextShimmer、ConnectionIndicator、DisclosureRow、FoldToggle、CodeToolbar（13 组件 + 12 css）+ relative-time.ts | 26 | ui-workspace 11、ui-schedule 19、ui-trajectory 6、ui-conversation 25 处 import |
| G1 图标模块 | icons/index.tsx、artwork.ts、props.ts、shared-artwork.tsx；**导出裁剪**：仅保留视图用 glyph（Search/ChevronDown/ChevronUp/Clock/Warning/Check/Copy/WrapLines/Ellipsis + tool 家族 Browse/Checklist/Edit/Globe/Inspect/Question/Think/Database/Api/Gauge/ContextInjection）+ `ICON_SYMBOLS`/`IconSymbolId`/`ICON_*_STROKE`（主题面） | 4（约 25 导出） | 同上 + ui-theme（ICON_SYMBOLS/IconSymbolId）+ ui-tool/ui-chat 工具卡图标 |
| G2 支撑 | head-tail-cap.ts、clipboard.ts、use-clipboard-copy.ts、file-size.ts、code-file-types.ts、css-modules.d.ts | 6 | DiffBlock/SearchBlock/FileTypeIcon 闭包 |
| G3 投影块 | UserMessageBubble、user-text（UserTextRun/ReferenceChip）、ReferenceIcon、JsonTree、DiffBlock、ReadBlock、SearchBlock、WebBlock、TerminalBlock、CommandText、FileTypeIcon、CodeFileIcon、code-file-icon-artwork(+manifest.json)、LinkIcon、SiteGlyph（16 + 13 css）+ ansi.ts + code-highlighting.ts | 31 | ui-tool 20、ui-chat 26、ui-conversation 25 处 import |
| G3 menu 家族 | JsonTree 复制菜单闭包：Menu、MenuGroup、MenuRow、MenuSurface、SubmenuPanel、menu-submenu-position、useAnchoredMaxHeight、useDismissOnOutsidePointer + 3 css | 11 | JsonTree.tsx 实引 |
| G4 markdown 管线 | MarkdownText、parse、render、incremental、highlight、katex、copy-tex、file-link、plain-text、cjkFriendlyStrong、mathCompatibility、windows-path-destinations、local-image-syntax、CodeBlock、JsonBlock、FenceBlocks、MarkdownDelegate、useViewportHighlighting（+4 css）+ ImagePreview、ImageLightbox、HoverCard、HoverCardGroup、pointer-grace、DraggableImage、useRowDragPreview、image-drag | 34 | ui-chat（MarkdownText/CodeBlock/FenceBlocks/UserMessageBubble）、ui-conversation（formatQuoteText 除外） |

**全闭包合计 ≈ 112 src 文件。**

排除面（不入清单，列出以防 Task 8 误用 → 停腿）：settings-form 家族（ui-settings 面）、PermissionIcon/RiskConfirmation（approval 词汇，禁入）、FishLogo/BrandWordmark（Task 8 web-brand 新码域）、Modal/HoverCardGroup 之外的 overlay 面、Menu 全家仅入 JsonTree 闭包（视图不得新增菜单交互）、plugin-artwork/guide-artwork/ZoomControls/InlineEditor/Switch/Checkbox/SegmentedControl/SegmentedTabs/ShortcutKeys/ConfigField/DraggableImage 之外的拖拽面、ImageLightbox 仅作 MarkdownText verbatim 闭包随入。

## 3. 依赖行暴露（白名单外 → Global Constraints 域 (a) 升格面）

dsh 侧这些行落在 devDependencies（tsdown 打包吞入）；AtlasWeb 无 bundler、bun 直跑 TS → 均为**运行时实引**，必须落 `packages/web-primitives` 依赖行：

| dep | dsh@tag 版本 | 实引点 | 用途 |
|---|---|---|---|
| clsx | ^2.0.0 | 30+ 文件（几乎全组件） | className 组合 |
| diff | ^9.0.0 | DiffBlock.tsx（structuredPatch） | diff 块计算 |
| anser | ^2.3.5 | ansi.ts（TerminalBlock） | ANSI 解析 |
| micromark-core-commonmark | ^2.0.3 | markdown/parse.ts | GFM 解析 |
| micromark-extension-gfm | ^3.0.0 | markdown/parse.ts | 同上 |
| micromark-extension-math | ^3.1.0 | markdown/parse.ts | 数学 |
| micromark-util-character / -classify-character / -decode-string / -sanitize-uri / -symbol / -types / micromark-factory-space | ^2.x | markdown/parse.ts、render.tsx | 同上 |
| mdast-util-from-markdown / -gfm / -math | ^2/^3/^3 | markdown/parse.ts | AST |
| @types/mdast | ^4.0.4 | markdown/render.tsx 等 | 类型 |
| katex | ^0.18.7 | markdown/katex.tsx | 数学渲染 |
| shiki | ^4.4.3 | markdown/highlight.ts（code-highlighting→ReadBlock/CodeBlock 链） | 代码高亮 |
| @shikijs/langs | ^4.4.3 | markdown/highlight.ts（bash/json/ts 三语法） | 同上 |
| simple-icons | 16.31.0 | SiteGlyph/code-file-icon-artwork 面 | 站点字形 |

**全闭包 = 21 条白名单外依赖行**（React/react-dom/@tanstack/react-virtual 已在白名单不计）。

## 4. 边局部化（type/value edge → 本地 verbatim 副本 + Adapted 头注）

| dsh 边 | 消费点 | 处置 |
|---|---|---|
| `@deepseek-ai/dsh-util-code-language`（CODE_HIGHLIGHT_EXTENSIONS、languageForPath） | code-highlighting.ts | plan Task 5 **已预声明**局部化 |
| `@deepseek-ai/dsh-util-workspace-path`（pathPartsOf） | PathLabel.tsx | **新增**，须一并局部化 |
| `@deepseek-ai/dsh-util-file-drag`（DraggableImage/useRowDragPreview/image-drag 面） | G4 图片族 | **新增**，随 G4 局部化 |

`@deepseek-ai/dsh-client-store`（primitives 内 type 面）→ 已有 `@atlasweb/web-store` 对位；cordis peer → vendor/ 路径解析（Task 1 实证）。

## 5. 计数与停腿发现

- **文件粒度：≈ 112 > 60**；符号粒度（工单"全量 203"口径）≈ 115–140 > 60。
- **两种口径均触发 plan Task 5 Step 1 预注册停腿"清单超 60 原子即回审"。**
- 定因：replay 面 = coding session 投影渲染，其诚实闭包必含 markdown 管线 + 工具卡块族（G4+G3 ≈ 65 文件）——工单"估 30–60"在 (c) 面闭包算出前作出，被闭包证伪。
- 次发现：(a) 面零原子（§1），原子集全由 (c) 面驱动——清单性质从"扫描产物"变为"Task 8 预注册契约"，Task 8 停腿（审计 §C 必改②b）成为唯一防外溢机制。

## 6. 处置选项（供回审裁定）

| 选项 | 内容 | 文件 | 白名单外 dep 行 | 代价 |
|---|---|---|---|---|
| **A 全保真** | §2 全闭包 verbatim，math+shiki 全保 | ≈112 | 21 | dep 面最大；node_modules 显著增重；清单超 60 最多 |
| **B 去数学/去高亮（f4 推荐）** | A 减 katex.tsx/copy-tex.ts/mathCompatibility.ts；markdown/highlight.ts 置 plain-text 桩；FenceBlocks 数学 fence→code fence；ReadBlock 去 useViewportHighlighting；markdown/CodeBlock 纯文本渲染 | ≈109（4 文件适配，非 verbatim） | 16（-katex、-micromark-extension-math、-mdast-util-math、-shiki、-@shikijs/langs） | 数学块渲染为代码块；代码无语法高亮（plain 回退）；登记债面 +2（math、shiki 高亮） |
| C 无 markdown（下限案，不推荐） | G1+G2+G3−WebBlock，replay 消息体纯文本 | ≈58 | 4（clsx/diff/anser/simple-icons） | assistant 消息纯文本——coding session replay 面不可用 |

推荐理由（B）：GFM（列表/链接/代码 fence/表格）= coding session 投影的主体内容，保留；数学在 session 投影中罕见；shiki 高亮为观感优化且 plain 回退是 dsh 既有路径（`useCodeHighlighter` 未知/加载中语法即返 undefined 纯文本）；dep 面最小化与白名单制度初衷同源。

## 7. 回审请求项

1. **清单规模**：>60 停腿已触发 —— 采 A/B/C 哪个选项（f4 推荐 B）。
2. **依赖行升格**：对应选项的白名单外行按 zustand/immer 先例呈批（dsh@tag 直证 = §3 表 + `packages/client/ui-primitives/package.json`）。
3. **(a) 面零原子**定性认可（§1 结论），清单性质 = Task 8 预注册契约，Task 8 停腿机制维持。
4. B 选项的 4 文件非 verbatim 适配形采认（各文件 Adapted 头注逐条列明）。

回审通过前 Task 5 Step 2–4（RED/移植/GREEN）不开工。

## 8. 回审 verdict（Atlas-reveiw 2026-11-20）——采记

**四项全数裁定**：B 案采认 + 16 dep 行升格采认（版本逐条对齐 dsh@tag devDeps 实测，不追新）+ (a) 面零原子定性认可（Task 8 停腿升格为唯一防外溢机制，维持不得弱化）+ B 案适配形采认（逐文件 Adapted 头注 + 逐条列明改动）。回审独立直证五点（seed.ts:18 / package.json 21 行恰合 / PathLabel.tsx:4 + file-drag-actions.ts:2 / icon-sprite.ts:7 + index.ts:27 / ui-chat AssistantMarkdown.tsx:5-6 抽验）全部吻合。

**绑定条件 3 项**：
1. 登记债 +2（数学渲染、语法高亮）显式入波档/upstream-pairing，候后续波回补（可逆通道，须可追溯）。
2. FenceBlocks「数学 fence→code fence」转换逻辑须有判据腿（防数学内容被静默丢弃或错渲染）。
3. 保真后果向用户显性呈现（数学块降级为代码块渲染；代码无语法高亮、plain 回退为 dsh 既有路径）。

**勘误注记（已随本 fixup 落）**：ui-layout「同形命名空间注册」→「零引用」。
