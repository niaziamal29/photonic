#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "run this script as root (for example with sudo)" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "this bootstrap script is for Ubuntu or another apt-based Linux host" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git gnupg lsb-release

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
arch="$(dpkg --print-architecture)"
echo \
  "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

target_user="${SUDO_USER:-}"
if [ -n "${target_user}" ] && id "${target_user}" >/dev/null 2>&1; then
  usermod -aG docker "${target_user}"
  echo "added ${target_user} to the docker group; sign out and back in before running docker without sudo"
fi

cat <<'EOF'
Docker Engine and the Compose plugin are installed.

Next:
1. Open inbound TCP ports 80 and 443 in your cloud firewall.
2. Clone the repo on the server.
3. Copy deploy/.env.production.example to deploy/.env.production and replace the example IP.
4. Place surrogate.onnx and cvae.pt in the models/ directory if you want ML inference enabled.
5. Run ./deploy/launch-production.sh
EOF
