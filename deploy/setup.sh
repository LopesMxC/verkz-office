#!/usr/bin/env bash
# Instala tudo numa VPS Ubuntu limpa (Hostinger KVM2). Rodar como root dentro da pasta deploy/.
set -euo pipefail

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# Firewall: web, sinalização e mídia do LiveKit
if command -v ufw >/dev/null; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 7881/tcp
  ufw allow 50000:50200/udp
  ufw --force enable
fi

if [ ! -f .env ]; then
  KEY="API$(openssl rand -hex 6)"
  SECRET="$(openssl rand -hex 32)"
  OFFICE="$(openssl rand -hex 5)"
  sed -e "s/TROQUE_API_KEY/$KEY/" -e "s/TROQUE_API_SECRET_COM_32_CARACTERES_OU_MAIS/$SECRET/" -e "s/troque-esta-chave/$OFFICE/" .env.example > .env
  sed -e "s/TROQUE_API_KEY/$KEY/" -e "s/TROQUE_API_SECRET_COM_32_CARACTERES_OU_MAIS/$SECRET/" livekit.yaml.example > livekit.yaml
  echo "Criei .env e livekit.yaml com chaves novas."
  echo "Confira os domínios em .env e rode este script de novo."
  echo "Chave do escritório para o time: $OFFICE"
  exit 0
fi

docker compose up -d --build
echo "Pronto. Teste: https://$(grep OFFICE_DOMAIN .env | cut -d= -f2)/health"
