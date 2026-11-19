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

（空行兜底：无其他豁免。新增豁免须过审计——本表为审计抽验对象。）

## 4. 判据

负腿 = 扫描域内词表词命中数为 0（豁免表处置列「不入词表」的形不在
扫描词表内，不构成命中）。命中任何一词 = RED，修复面 = 改写源码或
（数据面误伤）扩排除面——后者须在本文 §2/§3 留痕。
