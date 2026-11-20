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
cd app && (npm ci || npm install)
npx tauri build --target universal-apple-darwin --bundles dmg
cd .. && mkdir -p instaladores
cp app/src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg instaladores/
open instaladores
