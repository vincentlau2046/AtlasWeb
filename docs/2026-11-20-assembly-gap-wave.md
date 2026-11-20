# 同源组装缺口收口波 + 浏览器 boot 两缺陷修复（0.1.1，2026-11-20）

## 波因

用户接线问询（"已安装 atlascode 的环境怎么安装配置 atlasweb"）暴露安装面缺口：UI 与
session API 分属两面，需手工反向代理拼装同源。用户裁定「有缺口就解决阿」——本波即
收口。波中实机 Playwright 冒烟现形两处浏览器 boot 预存潜伏缺陷，随版同修。

## 变更面（三件 + 一债）

| 项 | 内容 | 判据 |
|---|---|---|
| web-host 静态面（9d8aef2） | `--static <dir>`：auth 前机会层（GET 命中即服，未命中穿透原链零漂移）；fail-closed 校验链（绝对路径+目录 throw / 段级 traversal 拒含 `%2f` 编码形 / lstat regular（目录 403 零列举、symlink 403 逃逸面清零）/ realpath containment / 64MiB cap / 显式 content-type + nosniff / `/assets/` immutable · `/` no-cache） | `staticFace.test.ts` 7 腿 |
| web-connection 浏览器 redeem 面（209bfd6） | set-cookie 为浏览器 forbidden response header（getSetCookie 恒空）→ 空串哨兵 = ambient cookie 面（同源 fetch 默认随发；readCredential cookie 优先序兜住；headers() 零 Bearer）；Node/E2E Bearer 面零漂移；raw 非空解析未命中（cookie 名漂移形）→ fail-closed throw（审计 hardening 随版收口） | `browserRedeem.test.ts` 三腿 |
| web-code session scope 适配器（本波收口提交） | ui-session 等价件（dsh ui-session 刻意未移植但其 renderer 契约仍在：renderRoot 全树包 `ScopeProvider('session-maybe')`，缺适配器即整树 SlotAssemblyError——浏览器首启现形）：`createSessionScopeAdapter`（current blank/selected + bindingSource + renderArea + adoption 恒稳 cordis Context）+ `controller.sessionId` 源 + apply() `installScope('session')` 接线（effect 挂订阅生命周期） | `sessionScope.test.ts` 6 腿 |
| favicon 404（小债登记） | dist 无 favicon；修复须动 index.html 字节 → 随下一版，勿在锚版本内混入 | — |

## 实机验证（真浏览器，Playwright）

launchCli `--port 8947 --static apps/atlasweb/dist --scope main=<seeded-dir>`：

1. `?token=` boot：零 console error；侧栏列 seeded 会话，主区 "No session open."
   （blank 分支正确渲染——修复前此步即整树 SlotAssemblyError 白屏）。
2. 点开会话（adoption 路径）：按钮 `[active]`，主区 blank→selected，ConversationView
   重放 seeded 消息 `smoke-hello`（`2026-11-20 09:00:00`），零 console error。

curl 面（9d8aef2 收口时）：index 200 no-cache、asset byte 恒等 + immutable、redeem
cookie、traversal 403、fence 403 全绿。

## 发布面

- 版本契约默认 lane 0.1.0 → 0.1.1（root package.json 单源）。
- staging 版本内重跑四次换锚：`3a7b3d9c…` → `7fa811e3…`（②修复随版）→ `f8345727…`
  （README serving 段随版进 tarball）→ `1cace542…`（审计 hardening 随版）；锚腿
  `npmPackage.test.ts` 第 4 条 = `docs/sri/v0.1.1.md` 终值；连续两次 staging 哈希
  恒等证 pack 确定性（无 mtime/gzip 时戳漂移面）。
- tag v0.1.1 + GitHub push（commit+tag，hardening 后终态重推）；**npm publish
  （双组织）待用户 OK，未执行**。
- @atlaswork 镜像面：同 tgz 同源仅 name 字段差（atlaswork-mirror-publishing 纪律）。

## 审计（Atlas-reveiw，2026-11-20）

**通过**——三焦点全裁毕：① 静态面机会层插入点正确（fence 先于静态面 = 无跨源静态
泄漏；穿透零漂移有专腿）；② ambient cookie 哨兵双面契约成立、无新增暴露面 + 1
hardening 注记（Node 面 raw 非空解析未命中静默落 ambient → 已随版收口为 fail-closed
throw，第四换锚即此）；③ session 适配器 adoption 三语义与 dsh scoped-slots 原文
逐条对齐。

## 波前审视与裁定

- §0 活码重核：httpHost 路由链（fence → redeem → auth gate → routes）与 UI 首启
  boot 形（无 cookie、URL token 客户端兑换）确认在案，机会层插入点定于 redeem 后
  auth 前——UI 首启合法无凭据，auth 前置即拒之；穿透保零漂移。
- README 消费形态裁定：`@atlasharness/atlascode` bin = CLI 本体（dist/cli.js），
  web-host launcher 在本仓未发布为独立二进制——README 如实陈述（in-repo launchCli
  形），不虚构 `bunx` 消费命令。
