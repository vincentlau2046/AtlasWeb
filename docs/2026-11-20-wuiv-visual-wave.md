# W-UI-V 视觉闭环波工单（2026-11-20）

波因：用户实机验收裁定「web 界面不是一个正常的界面」——0.1.1 功能链收口口径错误
（结构链通 ≠ 界面闭环）。用户拍板深度：**一次到位，对齐 CC 级**。

## §0 活码重核（实机探针逐层定谳，2026-11-20 @ 已发布 0.1.1 产物）

| 层 | 实测 | 结论 |
|---|---|---|
| theme 平台层 | 8 个 `<style data-plugin>` 全挂载（base 1270B / design-platform 27331B…）；`--dsw-alias-bg-base` 在 **body** 上解析为 `rgb(255,255,255)`；html 有 `data-ds-theme-source` | **活着**（初判"tokens 未定义"为探针误差：查了 html，定义域是 body） |
| web-shell base.css | `html,body,#root{height:100%;margin:0}` + 字体/颜色/背景/button font-inherit——**仅 `packages/web-shell/src/boot.ts:22` import，AtlasWeb main.tsx 装配链（renderer→theme→brand→layout→code）零引用** → 实测 bodyMargin 8px、rootHeight 8px | **G-A：reset/height 链/字体从未进 AtlasWeb boot** |
| web-code views | `web-code-*` 类在 bundle CSS 中 0 命中（repo grep 同 0）→ 会话条目/对话区 = 原生裸 HTML | **G-B：views 零样式表** |
| boot 幂等 | 实机 @639s `AtlasConnectionError: connect requires a launchToken` ×2 → 整树崩空（rootChildCount 0）；reload 无 token 同形（token 兑换后即剥） | **G-C：boot 不幂等 + reload 白屏** |
| 资产盘点 | primitives 全套 CSS-module（Button/Input/Pill/MarkdownText/CodeBlock/DiffBlock…）+ AppFrame 三列壳（grid/drag/drawer 全实现）+ theme tokens/shiki/字体 **均已 bundle** | 设计系统在包里，界面没穿 = 组装缺口而非资产缺口 |

## 变更面与判据

| # | 项 | 内容 | 判据 |
|---|---|---|---|
| 1 | G-A | AtlasWeb boot 接入 shell base.css（web-shell exports `./base.css`；main.tsx import）——margin/height 链/字体/颜色全套点亮 | 实机 bodyMargin 0、rootHeight=viewport；截图中字体/底色正常 |
| 2 | G-B | web-code views 样式表（`web-code-*` 全类）：侧栏列（搜索框/会话条目卡/选中态 data-selected/空态/错误态）+ 对话区（header/transcript 内边距/消息分级 data-role=user 助手全文·用户 bubble/meta 弱化行）；MarkdownText/CodeBlock 等 primitives 自带样式随 tokens 点亮 | 实机截图逐面（≤8 张/批验收）；views 测试增 selectedId 腿 |
| 3 | G-C | boot 无 token → `credential: ''` ambient 面（cookie jar 同源随发；首访无 cookie → 401 报错面非白屏）；web-connection 契约腿（credential:'' 无 launchToken 不 throw） | `web-connection` 测试 + 实机 F5 存活 |
| 4 | favicon 债随版 | `apps/atlasweb/public/favicon.svg` + index.html link（index.html 本版随变，合规） | 实机 favicon 200 |
| 5 | HEAD 静态 401 | httpHost 静态面条件 GET→GET\|HEAD | `staticFace.test.ts` 增腿 |
| 6 | G-D（波中新增，2026-11-20 实机 + 用户裁定「载体根修 0.1.125」） | 上游载体 @atlasharness/atlascode 0.1.124 `toSummary` 硬编码 `title:null`/`messageCount:null`（list 面零提取）→ 侧栏 49 行全 "(untitled)"。载体根修：`readTranscriptHead` 有界头读（64KiB）+ 提取 custom-title→summary→首 user；0.1.125 发布后本仓依赖随升 + rebuild | AtlasCode `tests/func/web-session-list-title.test.ts` 六格；实机侧栏标题成形 |

## 版本与发布

- AtlasCode **0.1.125**（G-D 载体根修）→ AtlasWeb 依赖升 0.1.125。
- AtlasWeb 0.1.1 → **0.1.2**（版本契约默认 lane；bundle 字节变 → 全换锚）。
- 0.1.2 → **0.1.3**（终验 live 探针补丁）：dsh token 误用定谳——shell 真词汇表
  `--dsw-alias-brand-primary` = neutral-bluish-1000（近黑墨色），views.css
  search focus / 选中行 inset 边误用致近黑渲染；换真 accent
  `--dsw-alias-brand-primary-new-colorprimary-new-color`（light deepseek-500 /
  dark deepseek-450）。纯视觉零逻辑，SRI docs/sri/v0.1.3.md。
  **方法论**：token 词汇表必须对 shell 注入面实测声明（styleSheets 逐表扫），
  不得凭 CSS fallback 值臆断。
- 收口：全套件 clean tree → tag/push → 双组织 publish（镜像纪律）→ registry 对表 →
  `~/atlasweb-live` 重装 → 起服务交用户终验。
- Atlas-reveiw 送审（跨 session 矩阵）。

## §5 审视记录（自决项）

1. base.css 注入点选 web-shell exports + main.tsx import（单一事实源不复制；darwin 专属
   规则在 web 面 data-platform 不匹配 = 恒惰性，无害）。
2. token 作用域在 body 非 :root —— web-code 样式表全部挂在 #root 子树内，继承链成立，
   无需动 theme 包。
3. ambient 无凭据首访 = 401 报错面（fail-closed 保持），仅作 UI 呈现不 crash。
4. 选中态高亮需 NavigationColumn 增 `selectedId` prop（controller.sessionId 已有，纯接线）。
