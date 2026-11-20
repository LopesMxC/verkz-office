#!/usr/bin/env bash
# Instala tudo numa VPS Ubuntu limpa (Hostinger KVM2). Rodar como root dentro da pasta deploy/.
set -euo pipefail
cd "$(dirname "$0")"

# As portas 80/443 precisam estar livres (ou já serem do Caddy deste escritório).
# Se outro sistema já usa (n8n, Traefik, Nginx...), para aqui sem mexer em nada.
if ss -Hltn '( sport = :80 or sport = :443 )' 2>/dev/null | grep -q . \
  && ! { command -v docker >/dev/null && docker compose ps --services --status running 2>/dev/null | grep -qx caddy; }; then
  echo "As portas 80/443 desta VPS já estão em uso por outro programa:"
  ss -Hltnp '( sport = :80 or sport = :443 )' 2>/dev/null | awk '{print "  " $4 "  " $6}' || true
  echo "Nada foi alterado. Veja a parte \"VPS que já tem outro sistema\" no tutorial."
  exit 1
fi

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
