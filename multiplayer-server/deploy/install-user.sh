#!/usr/bin/env bash
set -euo pipefail
onefish_root=$(cd "$(dirname "$0")/../.." && pwd)
onefish_node=$(command -v node)
node -e 'if(Number(process.versions.node.split(".")[0])<22)throw new Error("需要 Node.js 22 或更新版本")'
cd "$onefish_root/multiplayer-server"
test -f "$onefish_root/multiplayer-server/server.bundle.cjs"
: "${ONEFISH_PUBLIC_ORIGIN:?请设置 ONEFISH_PUBLIC_ORIGIN 为自己的 HTTPS 域名来源}"
node -e 'const v=process.env.ONEFISH_PUBLIC_ORIGIN,u=new URL(v);if(u.protocol!=="https:"||u.origin!==v)throw new Error("需要完整 HTTPS 来源，不含路径")'
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/onefish-poker.service" <<UNIT
[Unit]
Description=OneFish private poker rooms
After=network.target

[Service]
Type=simple
WorkingDirectory=$onefish_root/multiplayer-server
ExecStart=$onefish_node $onefish_root/multiplayer-server/server.bundle.cjs
Environment=HOST=127.0.0.1
Environment=PORT=3078
Environment=BASE_PATH=/onefish-poker
Environment=PUBLIC_ORIGIN=$ONEFISH_PUBLIC_ORIGIN
Environment=TURN_MS=20000
Environment=BOT_DELAY_MS=500
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
UMask=0077

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now onefish-poker.service
systemctl --user restart onefish-poker.service
for onefish_retry in {1..15}; do
 if curl --fail --silent http://127.0.0.1:3078/onefish-poker/health; then exit 0; fi
 sleep 1
done
systemctl --user status onefish-poker.service --no-pager
exit 1
