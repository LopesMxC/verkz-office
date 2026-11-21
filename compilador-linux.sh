#!/usr/bin/env bash
# VERKZ Office: gera os instaladores do Linux (.deb, .rpm e .AppImage) num PC com Linux.
# Uso: bash compilador-linux.sh
# Lê compilador.env (VITE_OFFICE_SERVER e chaves VERKZ_*), igual ao compilador.bat.
set -e
cd "$(dirname "$0")"

echo "==============================================="
echo "  VERKZ Office - instaladores do Linux"
echo "==============================================="

# 1) Bibliotecas do sistema (Ubuntu/Debian; em outras distros instale os equivalentes)
if command -v apt-get >/dev/null 2>&1; then
  if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
    echo "[..] Instalando as bibliotecas do WebView (pede a senha do sudo)..."
    sudo apt-get update
    sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev patchelf build-essential curl file
  fi
fi

# 2) Node e Rust
if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Instale o Node.js 20 ou mais novo (https://nodejs.org) e rode de novo."
  exit 1
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "[..] Instalando o Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
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
if [ -f .chaves/verkz-office.key ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat .chaves/verkz-office.key)"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
else
  echo "    Aviso: sem .chaves/verkz-office.key, o AppImage sai sem assinatura (sem atualização automática)."
fi

# 5) Compilar
cd app
npm ci || npm install
echo "[..] Compilando (a primeira vez leva de 5 a 15 minutos)..."
npx tauri build --bundles deb,rpm,appimage
cd ..

mkdir -p instaladores
B=app/src-tauri/target/release/bundle
cp -f "$B"/deb/*.deb "$B"/rpm/*.rpm "$B"/appimage/*.AppImage instaladores/ 2>/dev/null || true
cp -f "$B"/appimage/*.AppImage.sig instaladores/ 2>/dev/null || true
echo
echo "==============================================="
echo "  Pronto! Instaladores em: $(pwd)/instaladores"
echo "  Ubuntu/Debian: sudo apt install ./instaladores/*.deb"
echo "  Fedora: sudo dnf install ./instaladores/*.rpm"
echo "  Qualquer distro: chmod +x *.AppImage e abra"
echo "==============================================="
