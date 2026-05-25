#!/usr/bin/env bash
# tunnel.sh — expose the local dev server through a Cloudflare quick tunnel.
#
# Wraps `cloudflared tunnel --url http://localhost:<port>` for the common
# case of sharing your in-progress DDX build with a teammate or testing on
# a real device. The output is an ephemeral `https://<random>.trycloudflare.com`
# URL that's torn down when you Ctrl+C this script — no Cloudflare account,
# DNS, or login required.
#
# Defaults to port 5173 (the Vite dev server). Vite's own proxy forwards
# `/api`, `/wisp/`, and `/auth` to the Fastify backend on 8080, so tunneling
# 5173 alone is enough for end-to-end browser testing.
#
# Usage:
#   ./tunnel.sh                 # tunnel localhost:5173
#   ./tunnel.sh 8080            # tunnel a different port
#   PORT=3000 ./tunnel.sh       # same, via env var
#
# Requires `cloudflared` on $PATH. Install:
#   - macOS:        brew install cloudflared
#   - Debian:       see https://pkg.cloudflare.com/index.html
#   - Other:        https://github.com/cloudflare/cloudflared/releases

set -euo pipefail

# Resolve port. Positional arg wins, then $PORT, then default 5173.
PORT="${1:-${PORT:-5173}}"

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    echo "tunnel.sh: invalid port '$PORT' (expected 1-65535)" >&2
    exit 2
fi

if ! command -v cloudflared >/dev/null 2>&1; then
    cat >&2 <<'EOF'
tunnel.sh: `cloudflared` not found on PATH.

Install it before running this script:
  macOS:   brew install cloudflared
  Debian:  https://pkg.cloudflare.com/index.html
  Other:   https://github.com/cloudflare/cloudflared/releases
EOF
    exit 127
fi

# Sanity check: warn (don't fail) if nothing is actually listening on the
# port. We still launch cloudflared so the user can start their dev server
# afterwards; the tunnel will pick up traffic once it's up.
if command -v ss >/dev/null 2>&1; then
    if ! ss -ltn "sport = :$PORT" 2>/dev/null | tail -n +2 | grep -q .; then
        echo "tunnel.sh: warning — nothing appears to be listening on :$PORT yet." >&2
        echo "           Start your dev server (e.g. \`npm run dev\`) in another shell." >&2
    fi
fi

echo "tunnel.sh: opening Cloudflare quick tunnel to http://localhost:$PORT"
echo "tunnel.sh: press Ctrl+C to close the tunnel"
echo

# Hand control off to cloudflared. `exec` so signals (Ctrl+C, SIGTERM)
# go directly to it and the tunnel exits cleanly.
exec cloudflared tunnel --url "http://localhost:$PORT"
