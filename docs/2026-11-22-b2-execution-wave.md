# B2 执行切片（排队/取消/审批）呈批链归档 + 披露登记（2026-11-22）

B 附表 §3 B2 web-code/host 侧落码收口。本文件随呈批链归档，记录裁定链与披露项。

## 1. 裁定链

1. **Main 呈批**：B2 落码触发只读词表 lock-face 停点——`approval`（4 文件）+
   `composer`（1 文件）命中；其余 9 词零命中（kernel 词汇 turn.cancel /
   queue.remove / approval.decide 天然避开命令形词）。按预注册纪律停点呈批。
2. **f4 判词**：采认（有条件）——固定形 = 逐文件点名禁目录级 + 理由绑定门控
   条件 + dist 字面量入豁免面；改名回避否决。
3. **Atlas-reveiw 补环确认**：必改 1 = smoke 测试随动三项 (a)(b)(c)；
   执行序修正（词表+测试随动 → 提交 → 干净树复跑 → 单信号知会 e2e → 归档）。
4. **收口**：commit `3ade5f9`（16 文件，单原子）；干净树全仓
   **502 pass / 0 fail / 1 skip**（词表 src 腿、dist 腿、格 J G2 全翻绿）。

## 2. 豁免面（docs/t6a-readonly-lexicon.md §3）

- src：`approval`×4 文件 + `composer`×1 文件，`exemptions` 块机器可读
  （(词, 文件) 全等消费，禁目录级）。
- dist：`dist-exemptions` 块 9 字面量形（approval.decide / approval.requested /
  approval.settled / approvalId / `approval "` / data-exec-approval /
  webcode-exec-approval / webcode-exec-composer / data-exec-composer）——
  **完整枚举超出 f4 判词点名（decide/requested/settled + composer 类串）**，
  按「字面量形点名」意图补齐 payload 键与 DOM 锚点/类名面，测试用
  replaceAll 剥除后扫描（minified 单行长行禁行级过滤）。
- 配对正腿：`gate-shapes` 块 3 码形（Composer `if (phase !== 'ready') return null`、
  index `config.execution !== undefined`、controller `if (binding === null) {`）
  ——码形消失即豁免失效回 RED。
- **前瞻**：B3 新命中面落码时按同程序另行走审，禁预扩豁免。

## 3. 披露登记

- **①（呈批时已披露）**：B1 UI 面此前从未落码，本切片补车；e2e pw 腿
  （真 server 立判：排队/取消/审批全流转）仍未落 = e2e lane 职责，单测不冒领。
- **② workspace 发现面缺口**：`ExecutionBinding`（workspaceId+sessionId）由
  `config.execution.binding()` 闭包注入——web-code 不猜 workspaceAuth list 面，
  workspace 发现（列表/默认选择）在组合根解决。落点候 B3/web-host 接线工单。
- **③ queue.updated 不消费**：kernel 事件只含 `depth` 单值，无法重建 turnIds；
  客户端以 turn.accepted/started/终态事件投影队列（单测锁定不消费），host 侧
  `queue.ts` 投影为权威面。kernel 若扩 payload（turnIds）可后续接入。

## 4. 引用勘误

f4 判词引 `executionController.ts:13`（注释行）；gate 实体在
`Composer.tsx:23`。归档以本节 + 词表 gate-shapes 块为准。
