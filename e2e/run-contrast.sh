#!/usr/bin/env bash
# [对照] 3 腿专跑分调用——viewport 根修波工单 §4（A-gate 先例跑形固化）。
#
# 撤销「喂候选制品给对照腿」的跑形错配源：对照 3 腿（e2e/first-wave-readonly.pw.ts
# 的 [对照] 0.1.3 三腿）只跑 registry 旧制品 0.1.3——
#   1. `npm view @atlaswork/atlasweb@0.1.3 dist.integrity` 交叉核（显式
#      registry.npmjs.org 纪律）；
#   2. D1 冻结副本纪律：判前 sha 取证 + 判后复查（禁 build/ 产物作判定源）。
# candidate / execution 两调用排除 [对照]（--grep-invert '\[对照\]'，grep 形沿用
# b12 协议注记）——对照腿文件全腿为 [对照] 命名，grep-invert 即整文件排除。
#
# 用法：ATLASWEB_TGZ_013=<registry 0.1.3 tgz 冻结副本路径> bash e2e/run-contrast.sh
set -euo pipefail
: "${ATLASWEB_TGZ_013:?must set ATLASWEB_TGZ_013 to the frozen registry 0.1.3 tgz}"
cd "$(dirname "$0")/.."

# D1：判前 sha 取证。
sha_before=$(sha256sum "$ATLASWEB_TGZ_013" | awk '{print $1}')
echo "[contrast] frozen copy sha256 = $sha_before"

# registry integrity 交叉核。
expected=$(npm view @atlaswork/atlasweb@0.1.3 dist.integrity --registry https://registry.npmjs.org)
actual=$(openssl dgst -sha512 -binary "$ATLASWEB_TGZ_013" | openssl base64 -A)
if [ "sha512-$actual" != "$expected" ]; then
  echo "[contrast] FAIL: integrity mismatch (frozen=sha512-$actual registry=$expected)" >&2
  exit 1
fi
echo "[contrast] registry integrity cross-check MATCH"

ATLASWEB_TGZ="$ATLASWEB_TGZ_013" bunx playwright test --config e2e/playwright.config.ts e2e/first-wave-readonly.pw.ts

# D1：判后复查（冻结副本不得被判定轮变动）。
sha_after=$(sha256sum "$ATLASWEB_TGZ_013" | awk '{print $1}')
if [ "$sha_before" != "$sha_after" ]; then
  echo "[contrast] FAIL: frozen copy mutated during run" >&2
  exit 1
fi
echo "[contrast] post-run sha MATCH"
