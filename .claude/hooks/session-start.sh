#!/bin/bash
# クラウドセッション開始時に、脆弱性修正済みの Node.js を使えるようにし依存を入れる。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# package.json の engines と同じ条件: 22.23.4+ / 24.22.1+ / 26.12.1+
is_patched() {
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    const [a, b, c] = process.versions.node.split(".").map(Number);
    const ge = (x, y, z) => b > y || (b === y && c >= z);
    const ok = (a === 22 && ge(22, 23, 4)) || (a === 24 && ge(24, 22, 1)) || (a === 26 && ge(26, 12, 1)) || a > 26;
    process.exit(ok ? 0 : 1);
  '
}

if ! is_patched; then
  version="$(tr -d '[:space:]v' < .nvmrc)"
  dir="$HOME/.cache/node/node-v$version-linux-x64"
  if [ ! -x "$dir/bin/node" ]; then
    tmp="$(mktemp -d)"
    base="https://nodejs.org/dist/v$version"
    curl -fsSL -o "$tmp/node.tar.xz" "$base/node-v$version-linux-x64.tar.xz"
    curl -fsSL -o "$tmp/SHASUMS256.txt" "$base/SHASUMS256.txt"
    expected="$(grep " node-v$version-linux-x64.tar.xz\$" "$tmp/SHASUMS256.txt" | cut -d' ' -f1)"
    echo "$expected  $tmp/node.tar.xz" | sha256sum -c - >/dev/null
    mkdir -p "$HOME/.cache/node"
    tar -xJf "$tmp/node.tar.xz" -C "$HOME/.cache/node"
    rm -rf "$tmp"
  fi
  export PATH="$dir/bin:$PATH"
  echo "export PATH=\"$dir/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

PUPPETEER_SKIP_DOWNLOAD=1 npm install --no-save --no-audit --no-fund
