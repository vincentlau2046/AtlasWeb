# T6-A 只读红线词表（预注册——Atlas-reveiw Task 8 审计 §C 注记③ / Task 9 Step 1）

> 本文为**唯一事实源**：smoke 测试（`apps/atlasweb/test/smoke.test.ts`）从本文的
> `lexicon` 代码块逐词读取并执行负腿扫描——禁测试侧另立词表（防双源漂移）。
> 词表冻结 = 审计 §C 注记③ 要求的「逐词列明标识符形」；增删词须走本文改
> + 测试随动，禁裸 grep。

## 1. 词表（identifier 形，逐词）

写面对标识符（composer 输入面 / 审批面 / 会话写操作）——只读 bundle 内零出现：

```lexicon
composer
approval
prompt(
sendUserMessage
queueMessage
cancelSession
approveToolCall
rejectToolCall
submitInput
inputDraft
checkpointRollback
```

形态说明：`prompt(` 为调用形（会话 prompt API）；其余为标识符原形。
扫描含注释（注释命中同样违例——表述性提法应改写，参照本文件自身措辞
「对话输入面/审批面」回避字面）。

## 2. 扫描域与排除面

- **扫描**：`packages/web-code/src`、`packages/web-brand/src`、
  `packages/web-mode/src`、`apps/atlasweb/src` + 构建产物
  `apps/atlasweb/dist`（index.html + 全部 assets）。
- **排除**：`**/test/**`、`**/dist` 之外的 fixtures——seeded transcript
  属投影数据面，内容可合法含对话词汇；测试文件本身按此排除面豁免
  （词表测试只对 src/dist 域负责）。
- **构建产物注记**：bundler 压缩改名局部标识符，但字符串字面量与
  API 调用形保留——dist 域扫描对字面量形有效。

## 3. 豁免表（逐行，候选面显性化）

| # | 形 | 位置 | 处置 | 理由 |
|---|---|---|---|---|
| 1 | `onSubmit` | `packages/web-code/src/views/NavigationColumnView.tsx` | **不入词表，登记即可**（Task 8 审计 verdict ⑥ 豁免行） | React 表单提交事件名——搜索框 form 的 handler，非对话输入面标识符；与词表词 `submitInput` 无标识符碰撞 |
| 2 | 对话词汇于 transcript 数据 | `**/test/**`（seeded fixtures、e2e helpers） | 扫描域排除（§2） | 投影数据面：会话内容可合法含 prompt/消息字样，属回放显示对象非 bundle 行为面 |
| 3 | `approval`（标识符） | `packages/web-code/src/execution/executionController.ts`、`packages/web-code/src/index.tsx`、`packages/web-code/src/views/ApprovalCard.tsx`、`packages/web-code/src/views/Composer.tsx`（**逐文件点名，禁目录级扩用**） | **命中按 (词， 文件) 行豁免**（B 附表 §3 B2 执行通道；Atlas-reveiw 审计裁定 2026-11-22） | kernel wire 词汇（`approval.decide`/`approval.requested`/`approval.settled`、payload 键 `approvalId`、归属 turn 锚 `data-exec-approval`）+ 错误明示文案。**理由绑定门控条件**：执行面仅 `config.execution` 注入时挂载，probe=off / 未注入 → 零渲染（纯只读回归腿保持）——下方 `gate-shapes` 块码形在场是豁免生效前提，码形消失即豁免失效回 RED |
| 4 | `composer`（标识符） | `packages/web-code/src/views/Composer.tsx`（**逐文件点名**） | 同上 | B2 执行面输入组件类名/锚点（`webcode-exec-composer`、`data-exec-composer`）；同受 `config.execution` 门控 |

**dist 豁免面（字面量形点名，非 whole-bundle 宽豁免）**：B2 在 dist 的字面量残留仅为
下述 wire 词汇 / payload 键 / DOM 锚点 / 类名 / 错误文案片段——dist 负腿先剥除
这些字面量再扫描，剥后零命中即 GREEN；出现表外词表命中仍 RED：

```dist-exemptions
approval.decide
approval.requested
approval.settled
approvalId
approval "
data-exec-approval
webcode-exec-approval
webcode-exec-composer
data-exec-composer
```

**src 豁免（机器可读，与上表行 3/4 一一对应——测试从本块解析，禁测试侧另立清单）**：

```exemptions
approval|packages/web-code/src/execution/executionController.ts
approval|packages/web-code/src/index.tsx
approval|packages/web-code/src/views/ApprovalCard.tsx
approval|packages/web-code/src/views/Composer.tsx
composer|packages/web-code/src/views/Composer.tsx
```

**门控码形（配对正腿——测试断言下列码形在场，消失即 RED，豁免随之失效）**：

```gate-shapes
packages/web-code/src/views/Composer.tsx|if (phase !== 'ready') return null
packages/web-code/src/index.tsx|config.execution !== undefined
packages/web-code/src/execution/executionController.ts|if (binding === null) {
```

（空行兜底：无其他豁免。新增豁免须过审计——本表为审计抽验对象。B3 新命中面
落码时按同程序另行走审，禁预扩豁免。）

## 4. 判据

负腿 = 扫描域内词表词命中数为 0，其中：

- **src 腿**：命中按 §3 `exemptions` 块的 (词, 文件) 行精确过滤后为 0
  （逐文件点名——目录级/文件级宽匹配不消费豁免行，表外命中仍 RED）。
- **dist 腿**：构建产物先按 §3 `dist-exemptions` 块逐字面量剥除再扫描，
  剥后命中数为 0（表外命中仍 RED——minified 单行长行禁行级过滤）。
- **配对正腿**：§3 `gate-shapes` 块码形须逐条在场——门控码形消失即 RED
  （豁免与门控配对生效，防「豁免留下、门控拆走」漂移）。

命中任何一词（豁免过滤/剥除后）= RED，修复面 = 改写源码或（数据面误伤）
扩排除面——后者须在本文 §2/§3 留痕。
