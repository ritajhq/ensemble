#!/bin/sh
# Trust the local proxy's TLS certificates in this machine's cert store.
#
# `ens develop` puts a proxy (`ens-local-proxy`, Caddy) in front of the stack,
# which mints its certs from Caddy's *own* local CA. They're valid TLS, but
# signed by a CA the browser has never seen — so https://<host> shows
# "not secure" until that CA is trusted. This extracts Caddy's root CA from the
# running proxy and installs it into the OS trust store (the Caddy-native
# equivalent of `mkcert -install`). Idempotent: re-running just refreshes the
# anchor.
#
# Re-run after the proxy's volume is wiped (`docker volume rm
# ens-local-proxy-data`) — Caddy mints a NEW root CA then, and the old anchor no
# longer matches.
#
# Chrome/Chromium/Edge use the OS store (restart the browser after). Firefox
# keeps its own: import the printed .crt via Settings > Privacy & Security >
# Certificates > View Certificates > Authorities > Import (trust for websites).
#
# Declared as the `trust-local-ca` task in ci/platform/delivery.yml, so run it with:
#
#   ens delivery task platform trust-local-ca
set -eu

PROXY=ens-local-proxy

CA_SRC="/data/caddy/pki/authorities/local/root.crt"

if [ "$(docker inspect -f '{{.State.Running}}' "$PROXY" 2>/dev/null)" != "true" ]; then
  echo "The local proxy isn't running — is the stack up (ens develop platform)?" >&2
  exit 1
fi

TMP_CA="$(mktemp)"
trap 'rm -f "$TMP_CA"' EXIT
docker exec "$PROXY" cat "$CA_SRC" > "$TMP_CA"

# Pick the OS trust mechanism. Anchors dir + refresh command differ per distro.
if command -v update-ca-trust >/dev/null 2>&1; then
  # Arch / Fedora / RHEL family.
  ANCHOR=/etc/ca-certificates/trust-source/anchors/ens-local-proxy-ca.crt
  sudo cp "$TMP_CA" "$ANCHOR"
  # Caddy writes root.crt as 0600; the trust rebuild only reads world-readable
  # anchors, so a copied-through 0600 file is silently ignored. Make it 0644.
  sudo chmod 644 "$ANCHOR"
  sudo update-ca-trust
elif command -v update-ca-certificates >/dev/null 2>&1; then
  # Debian / Ubuntu family (anchors must end in .crt under this dir).
  ANCHOR=/usr/local/share/ca-certificates/ens-local-proxy-ca.crt
  sudo cp "$TMP_CA" "$ANCHOR"
  sudo chmod 644 "$ANCHOR"
  sudo update-ca-certificates
else
  echo "No known trust tool (update-ca-trust / update-ca-certificates)." >&2
  echo "The CA has been written to: $TMP_CA — install it into your store manually." >&2
  # Don't delete it in this branch: the user needs the file.
  trap - EXIT
  exit 1
fi

echo "Installed Caddy's local CA as $ANCHOR." >&2
echo "Restart Chromium/Chrome to pick it up. Firefox: import it via its own cert manager." >&2
