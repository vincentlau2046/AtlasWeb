# 第一波总验收终判（Atlasweb-F4，2026-11-27）

**终判：第一波产品总验收 PASS（条件满足形）。** 九格全数满足——六格绿 + 格 2/格 9 复验销项 + 格 1 条件满足（条件 = viewport 根修波，本判立项，显性权衡见 §2，零静默带过）。依据 = e2e 权威判定单两卷：`AtlasCode user-e2e/reports/r-20261127-closure-verdict.md`（原判定）+ `r-20261127-closure-reverify.md`（复验续卷，复验轮 GATE-PASS）；判据准绳 = 收尾工单 `docs/2026-11-27-first-wave-closure-ticket.md` @42c5251 修形链。本判 = 总验收链判定，**非发布授权**——发布动作归 Main 按授权另走（版本号面按版本契约）。

## §1 全局特性列表（九格终账）

| 格 | 特性 | 判定 | 实证/根因 |
|---|---|---|---|
| 1 | A 链 pw 全腿 ×3 稳定 | **条件满足** | 实跑 21 腿（candidate 13 + execution 8）×3：17 绿 ×3 稳定 + 4 viewport 红同签名 ×3 确定（`m180` toBeInViewport ratio 0 @ readToMidAndSettle:235，元素在 DOM data-index=179——测试视口断言敏感面，非内容缺失/功能失效）；红面 = B 系 UI chrome 落码窗口引入（A-gate 绿 @82945c7 → W1 base），既登记零波引入（三举审面核可）。条件载体 = viewport 根修波（本判立项，§2） |
| 2 | B 面 pw 全腿（执行 8 + B3 自腿） | **满足**（复验销项） | 9/9 ×3 全绿（PW_EXIT=0×3）；B3 自腿 @c80f671 = 隔离编码任务全程：buggy calc.js 预证 → UI 提交 → 审批循环真按钮批准（不预设次数）→ 队列排空 → **fs 终证 runner 亲跑 node test.js PASS + calcResult===4** → 双卡投影 + reload 回读。b12 基线 5/5 未冒充 |
| 3 | F1–F7 逐格对表 | **满足** | 全部映射既绿腿（prereg §3 映射表）：A1 安装/A2 滚动定位/A3 导航刷新/A4 断线续读/A5 装包交验/F4·F5 工作面 |
| 4 | F8/F9 对表 + F10 登记 | **满足** | F8 = b3Views 10/10 + 差异登记语义（无内核交付面显式登记不造假）+ walk10 卡面在场旁证；F9 = theme-only 有效值非空壳；F10 显式登记延后维持 |
| 5 | 双尺寸+凭据+隔离+A0 对照 | **满足** | 双尺寸绿；expired/无凭据 lane 绿；隔离腿 403+引擎零痕迹；**A0 对照 3/3 = registry 旧制品 145cec04 冻结副本专跑拆分调用**（A-gate 先例执行形）；首跑 fatal = 文件名 scope 校验拒非 canon 名（fail-closed 按设计工作，登记在案） |
| 6 | Node 20 最低边界腿 | **满足** | docker node:20 四判据全绿（离线安装 exit 0 / bin 启动 Search sessions visible / 无 redeem 401 alert / 非法 scope 非零退出零 listener）——**A5 登记债「未跑不给产品总通过」就此兑现已销** |
| 7 | 全仓回归 tests/ 纯面 | **满足** | 546 pass / 1 skip / 0 fail 逐字复现（worktree 零污染核后） |
| 8 | 审批正腿全形（形 A） | **满足** | ApprovalCard 七字段证据 + approve 经 kernel 回合继续 + deny 工作区零触碰 + expired（W1-c unit 腿③+kernel timer 预注册既裁形）+ decide-unknown 拒收；×3 零回退——**b12 R2 受阻登记就此销项** |
| 9 | 交接件 | **满足**（复验销项） | 修订 README 执行 lane 节（三 flag+UI 入口+引擎前置+R4 双映射显文）落文；只读形 walk11a（composer=0 只读 by design 直证）+ 执行形 walk11b（composer→提交→引擎回文→reload 回读，磁盘 jsonl 1→3 行直证）两形**凭文档独立走通**，零额外口头步骤 |

**锚面**：D1 冻结副本纪律两轮全程兑现（判前 cp + sha 取证 + 判后复查恒等）；复验锚 superseding 成立（新锚 vs df650ba7 **仅 package/README.md 一文件异**，dist/server/package.json 全等 = 产品行为零变更确定性桥——格 2/9 对新锚直证即对产品面直证，格 1/3–8 前锚判定经桥等同有效）。载体 0.1.129 三值全程不变（cli 62bbc6cf / runtime 85e9b293 / execution 921d0ab7）。

## §2 格 1 显性权衡（终判裁量点，不静默）

四 viewport 红不阻第一波放行，裁量依据三点：① 失效面 = 测试视口断言（元素在 DOM、断言 ratio=0），非内容缺失/产品功能失效——产品面全绿（walk10/11 端到端、提交/回读、搜索、A0、Node 20）与之互证；② 引入窗口 = B 系 UI chrome 落码（既登记），收尾波/W1 零引入（三举审面 + 两轮判定核可）；③ 同签名 ×3 确定 = 可稳定复现的测试基建面，非 flaky 漂红。**条件兑现义务：viewport 根修波由「立项候选」升格为「立项」**（判词侧裁定，候 Main 排程——测试基建+UI chrome 域，与 UI 消费波不同域可并行）；根修波未收口前，本条件在后续任何验收卷中逐卷显性重登。

## §3 登记面（非阻塞，显性维持）

1. **`--workspace` 目录缺失静默接受（观察项呈 Main 裁量）**：安装品对不存在 workspace 目录静默接受、回合失败仅 UI/引擎侧显现、server stdout 无错误——与 fail-closed 门禁基调张力面；加固候选（grant 期存在性校验，fail-closed 一行面），归 Main 裁量排期（根修波或下次 carrier/host 触碰折入）。
2. **R4 引擎 project 编码 `.`→`-` 双映射**：README 已显文；fixture 盲区已登记（含点路径 host `--scope` 推码须同形双映射）；引擎侧语义属 AtlasCode 域，登记候选不改面。
3. **F10 延后**：按主计划显式登记维持，不冒销。
4. **list 分页**：登记候选维持（UI 波工单 §5 自决 2）。

## §4 处置与后链

1. 本终判 + 两判定单 = 第一波收口证据卷；Main 侧收口单（atlas-mainline-f4）候接。
2. 收口事件达 → **#277 F6-PAGE UI 消费波 RED 轮触发**（预注册档 `r-20261127-f6page-ui-prereg.md` 已备）。
3. viewport 根修波立项（§2）；`--workspace` 加固候选呈 Main（§3-1）。
4. A5 登记债清点：Node 20 ✓（格 6）/ F6-PAGE ✓（0.1.128 已销）/ 新版本号 ✓（发布归 Main 按契约）——A5 三登记债全清。
