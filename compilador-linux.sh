#!/usr/bin/env bash
# VERKZ Office: gera os instaladores do Linux (.deb, .rpm e .AppImage).
# Uso: bash compilador-linux.sh            (num PC com Linux)
#      compilador.bat, opção 3              (no Windows: compila dentro do WSL com Ubuntu 22.04)
# Compilado no Ubuntu 22.04 (GLIBC 2.35), o app abre no Ubuntu 22.04 ou mais novo.
# Lê compilador.env (VITE_OFFICE_SERVER e chaves VERKZ_*), igual ao compilador.bat.
set -e
# pelo compilador.bat (--wsl) o script roda de /tmp, mas a pasta atual já é a do projeto
if [ "${1:-}" != "--wsl" ]; then cd "$(dirname "$0")"; fi

# Dentro do WSL a pasta do Windows (/mnt/c/...) é lenta e não guarda permissões:
# copia o projeto para o Linux, compila lá e devolve os instaladores para a pasta do Windows.
ORIGEM="$(pwd)"
if [ "${1:-}" = "--wsl" ] || [[ "$ORIGEM" == /mnt/* ]]; then
  BUILD_DIR="$HOME/verkz-office-build"
  echo "[..] Copiando o projeto para o Linux ($BUILD_DIR)..."
  mkdir -p "$BUILD_DIR"
  # código velho sai (arquivo apagado no Windows não pode ficar aqui); target e node_modules ficam (build mais rápido)
  rm -rf "$BUILD_DIR/app/src" "$BUILD_DIR/app/public" "$BUILD_DIR/app/src-tauri/src" "$BUILD_DIR/instaladores"
  tar --exclude='./app/node_modules' --exclude='./app/src-tauri/target' --exclude='./app/dist' --exclude='./instaladores' --exclude='./.git' --exclude='./server/target' -cf - . | tar -xf - -C "$BUILD_DIR"
  # scripts e configuração vindos do Windows chegam com fim de linha \r\n
  find "$BUILD_DIR" -maxdepth 1 -name '*.sh' -exec sed -i 's/\r$//' {} +
  [ -f "$BUILD_DIR/compilador.env" ] && sed -i 's/\r$//' "$BUILD_DIR/compilador.env"
  cd "$BUILD_DIR"
  NO_WSL_COPY=1
fi

echo "==============================================="
echo "  VERKZ Office - instaladores do Linux"
echo "==============================================="

echo "[ok] GLIBC deste build: $(ldd --version | head -n 1)"
if [ -f /etc/os-release ]; then . /etc/os-release; echo "    Sistema: $PRETTY_NAME"; fi
if [ "${VERSION_ID:-}" != "22.04" ] && [ -n "${VERSION_ID:-}" ]; then
  echo "[!] Aviso: o ideal é compilar no Ubuntu 22.04 (o app só abre em sistemas com GLIBC igual ou mais nova)."
fi

# 1) Bibliotecas do sistema (Ubuntu/Debian; em outras distros instale os equivalentes)
if command -v apt-get >/dev/null 2>&1; then
  need=(libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev libgtk-3-dev patchelf build-essential pkg-config curl wget file xdg-utils ca-certificates python3 rpm)
  missing=()
  for pkg in "${need[@]}"; do dpkg -s "$pkg" >/dev/null 2>&1 || missing+=("$pkg"); done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "[..] Instalando o que falta (pede a senha do sudo): ${missing[*]}"
    sudo apt-get update
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"
  fi
fi

# 2) Node 20+ e Rust
NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/')"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  if command -v apt-get >/dev/null 2>&1; then
    echo "[..] Instalando o Node.js 22 (pede a senha do sudo)..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  else
    echo "[ERRO] Instale o Node.js 20 ou mais novo (https://nodejs.org) e rode de novo."
    exit 1
  fi
fi
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
if ! command -v cargo >/dev/null 2>&1; then
  echo "[..] Instalando o Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  . "$HOME/.cargo/env"
fi
echo "[ok] Node $(node -v) e $(cargo --version)"

# 3) Configuração
if [ -f compilador.env ]; then
  set -a; . ./compilador.env; set +a
  echo "[ok] Configuração lida de compilador.env"
fi
export VITE_OFFICE_SERVER="${VITE_OFFICE_SERVER:-wss://office.verkzsystem.tech/ws}"
echo "    Servidor: $VITE_OFFICE_SERVER"

# 4) Chave que assina as atualizações (a mesma do Windows/Mac)
if [ ! -f .chaves/verkz-office.key ]; then
  echo "[ERRO] Falta .chaves/verkz-office.key (a mesma chave do Windows/Mac). Sem ela não há atualização automática."
  exit 1
fi
PUB_APP="$(python3 -c "import json;print(json.load(open('app/src-tauri/tauri.conf.json'))['plugins']['updater']['pubkey'])")"
if [ "$(tr -d '[:space:]' < .chaves/verkz-office.key.pub)" != "$PUB_APP" ]; then
  echo "[ERRO] A chave de .chaves não é a mesma do \"pubkey\" do tauri.conf.json."
  exit 1
fi
export TAURI_SIGNING_PRIVATE_KEY="$(cat .chaves/verkz-office.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
echo "[ok] Chave de assinatura conferida."

# 5) Compilar
rm -rf app/src-tauri/target/release/bundle
cd app
npm ci || npm install
echo "[..] Compilando (a primeira vez leva de 5 a 15 minutos)..."
# AppImage sem FUSE (o WSL não tem) e sem o "strip" do linuxdeploy (quebra com binários novos)
export APPIMAGE_EXTRACT_AND_RUN=1
export NO_STRIP=1
npx tauri build --ci --bundles deb,rpm,appimage
cd ..

mkdir -p instaladores
B=app/src-tauri/target/release/bundle
cp -f "$B"/deb/*.deb "$B"/rpm/*.rpm "$B"/appimage/*.AppImage instaladores/ 2>/dev/null || true
if ! ls "$B"/appimage/*.AppImage.sig >/dev/null 2>&1; then
  echo "[ERRO] O AppImage saiu SEM assinatura (.AppImage.sig)."
  exit 1
fi
rm -f instaladores/*.AppImage.sig instaladores/*.deb.sig instaladores/*.rpm.sig
cp -f "$B"/appimage/*.AppImage.sig "$B"/deb/*.deb.sig "$B"/rpm/*.rpm.sig instaladores/ 2>/dev/null || true
echo "[ok] Assinaturas copiadas."
# WSL: devolve os instaladores para a pasta do Windows
if [ -n "${NO_WSL_COPY:-}" ]; then
  mkdir -p "$ORIGEM/instaladores"
  rm -f "$ORIGEM"/instaladores/*.deb "$ORIGEM"/instaladores/*.rpm "$ORIGEM"/instaladores/*.AppImage "$ORIGEM"/instaladores/*.deb.sig "$ORIGEM"/instaladores/*.rpm.sig "$ORIGEM"/instaladores/*.AppImage.sig
  cp -f instaladores/*.deb instaladores/*.rpm instaladores/*.AppImage instaladores/*.sig "$ORIGEM/instaladores/" 2>/dev/null || true
  echo "[ok] Instaladores copiados para a pasta do Windows: $ORIGEM/instaladores"
fi
echo
echo "==============================================="
echo "  Pronto! Instaladores em: $(pwd)/instaladores"
echo "  Ubuntu/Debian: sudo apt install ./instaladores/*.deb"
echo "  Fedora: sudo dnf install ./instaladores/*.rpm"
echo "  Qualquer distro: chmod +x *.AppImage e abra"
echo "==============================================="
