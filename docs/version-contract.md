# AtlasWeb 版本契约（2026-11-20 用户裁定）

**升级默认轨：只在 0.1.x 内递进**（0.1.0 → 0.1.1 → 0.1.2 …）。

- 版本 = 收口契约：version 单一事实源 = root `package.json`，`apps/atlasweb` 同值断言（漂移 fail-closed，见 `scripts/build-npm-package.ts`）。
- `0.2.0+` / `1.x` 跳轨 = 非默认，须用户逐件明裁，不得自发。
- 发布链不变：staging script → SRI（`docs/sri/vX.Y.Z.md`，换版换锚）→ tag `vX.Y.Z` → `npm publish ./<tarball>`（`./` 前缀形）→ registry/安装品验证。
- npm 双组织发布（2026-11-20 起）：`@atlasharness/atlasweb` + `@atlaswork/atlasweb` 同版本同内容，两 scope 各自 tarball 独立 SRI 记录。
