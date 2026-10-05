#!/bin/sh
set -eu

REPO="ritajhq/ensemble"
INSTALL_DIR="${ENSEMBLE_INSTALL_DIR:-$HOME/.ensemble/bin}"
BIN_NAME="ens"

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux) ;;
  *)
    echo "error: unsupported OS '$os' — only Linux is currently supported." >&2
    exit 1
    ;;
esac

case "$arch" in
  x86_64 | amd64) asset="ensemble-linux-x64" ;;
  *)
    echo "error: unsupported architecture '$arch' — only x86_64 is currently supported." >&2
    exit 1
    ;;
esac

fetch() {
  # fetch <url> <dest-or--for-stdout>
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$2" "$1"
  else
    echo "error: neither curl nor wget is available." >&2
    exit 1
  fi
}

requested_version="${1:-latest}"
if [ "$requested_version" = "latest" ]; then
  version="$(fetch "https://api.github.com/repos/${REPO}/releases/latest" - | grep '"tag_name"' | head -1 | cut -d '"' -f4)"
  if [ -z "$version" ]; then
    echo "error: could not resolve the latest release tag." >&2
    exit 1
  fi
else
  version="$requested_version"
fi

url="https://github.com/${REPO}/releases/download/${version}/${asset}"

mkdir -p "$INSTALL_DIR"
tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file" "$tmp_file.gz"' EXIT

# Releases from 0.45.0 on also carry a gzipped asset (~3x smaller); prefer it
# when gunzip is available, falling back to the raw binary for older releases.
echo "Downloading $asset ($version)..."
if command -v gunzip >/dev/null 2>&1 && fetch "$url.gz" "$tmp_file.gz" 2>/dev/null; then
  gunzip -c "$tmp_file.gz" > "$tmp_file"
  rm -f "$tmp_file.gz"
else
  rm -f "$tmp_file.gz"
  fetch "$url" "$tmp_file"
fi

chmod +x "$tmp_file"
mv "$tmp_file" "$INSTALL_DIR/$BIN_NAME"
echo "$version" > "$INSTALL_DIR/.version"
trap - EXIT

echo "Installed ens $version to $INSTALL_DIR/$BIN_NAME"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo ""
    echo "Add $INSTALL_DIR to your PATH:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac
