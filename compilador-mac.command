#!/bin/bash
# VERKZ Office - gerar instalador do Mac (.dmg). Dê dois cliques no Finder (rodar num Mac).
cd "$(dirname "$0")"
set -e
command -v brew >/dev/null || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
command -v node >/dev/null || brew install node
command -v cargo >/dev/null || { curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y; source "$HOME/.cargo/env"; }
xcode-select -p >/dev/null 2>&1 || { xcode-select --install; echo "Instale as ferramentas do Xcode e rode de novo."; exit 0; }
[ -f compilador.env ] && set -a && . ./compilador.env && set +a
rustup target add aarch64-apple-darwin x86_64-apple-darwin
# Chave que assina as atualizações (a mesma do Windows/Linux)
[ -f .chaves/verkz-office.key ] || { echo "[ERRO] Falta .chaves/verkz-office.key. Copie a pasta .chaves do PC do Windows."; exit 1; }
export TAURI_SIGNING_PRIVATE_KEY="$(cat .chaves/verkz-office.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
cd app && (npm ci || npm install)
# "app" gera o .app.tar.gz da atualização automática (com só "dmg" ele não sai)
npx tauri build --ci --target universal-apple-darwin --bundles app,dmg
cd .. && mkdir -p instaladores
B=app/src-tauri/target/universal-apple-darwin/release/bundle
ls "$B"/macos/*.app.tar.gz.sig >/dev/null 2>&1 || { echo "[ERRO] O Mac saiu SEM assinatura (.app.tar.gz.sig)."; exit 1; }
rm -f instaladores/*.dmg instaladores/*.app.tar.gz instaladores/*.app.tar.gz.sig
cp "$B"/dmg/*.dmg "$B"/macos/*.app.tar.gz "$B"/macos/*.app.tar.gz.sig instaladores/
echo "[ok] Instalador do Mac pronto e assinado."
open instaladores
