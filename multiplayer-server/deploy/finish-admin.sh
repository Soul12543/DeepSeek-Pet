#!/usr/bin/env bash
set -euo pipefail
onefish_here=$(cd "$(dirname "$0")" && pwd)
: "${ONEFISH_PUBLIC_ORIGIN:?请设置自己的 HTTPS 来源}"
: "${1:?请传入需要修改的 Nginx 配置文件路径}"
onefish_user=$(id -un)
sudo python3 "$onefish_here/install-nginx.py" --config "$1" --public-origin "$ONEFISH_PUBLIC_ORIGIN" --user "$onefish_user"
curl --fail --silent "${ONEFISH_PUBLIC_ORIGIN%/}/onefish-poker/health"
