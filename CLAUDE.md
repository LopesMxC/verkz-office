# VERKZ Office — escritório virtual (estilo Gather) da VERKZ

App desktop leve (macOS + Windows) de "call espacial": cada pessoa é um personagem voxel num
escritório isométrico 3D renderizado em **pixel art**. Áudio por proximidade, vídeo em bolhas,
compartilhamento de tela, salas privadas, chat, editor do escritório, personalização de personagem
e integrações (Google Agenda/Meet/Gmail, Spotify, atalhos para YouTube Music e outros apps).

Dono: Alifer Chabowski (VERKZ — agência de marketing para lojas físicas de roupa, Campo Grande/MS).
Idioma de tudo (UI, comentários, docs): **português do Brasil**.

## Antes de qualquer coisa
Leia `.claude/HANDOFF.md`: ali estão o estado atual, o que falta e as decisões já tomadas.
Ao terminar uma etapa, ATUALIZE o HANDOFF.md (status + próximos passos) e faça commit.

## Estrutura
```
server/        Rust (axum): presença via WebSocket, chat, salas, layout do escritório, tokens LiveKit
app/           Tauri v2 (Rust) + Vite/TypeScript + Three.js + livekit-client
  src/world.ts       cena 3D isométrica, câmera ortográfica, RenderPixelatedPass, colisão, A*
  src/avatar.ts      personagem voxel + opções de personalização (Look)
  src/furniture.ts   móveis (tipos, tamanhos, colisão) e tipos Layout/Item/Zone
  src/media.ts       LiveKit: áudio por proximidade, salas privadas, bolhas de vídeo, tela
  src/net.ts         WebSocket com reconexão
  src/integrations.ts ponte JS -> comandos Rust (invoke)
  src/ui.ts / main.ts / editor.ts / style.css   interface
  src-tauri/src/integrations.rs  OAuth PKCE (loopback 127.0.0.1:43821), Google e Spotify
deploy/        docker-compose para VPS Hostinger KVM2 (LiveKit + server + Caddy/TLS)
.github/workflows/  build dos instaladores Mac (.dmg) e Windows (.exe/.msi)
```

## Como rodar (dev)
```bash
# servidor de presença (usa LiveKit em ws://localhost:7880, chave devkey/secret)
cd server && OFFICE_KEY=verkz cargo run
# LiveKit local (opcional, para áudio/vídeo): livekit-server --dev
# app no navegador (sem integrações nativas)
cd app && npm install && npm run dev
# app nativo
cd app && npm run tauri dev
```
Linux precisa de `libwebkit2gtk-4.1-dev` só para compilar/checar; o alvo real é Mac e Windows.

## Regras de marca e produto (obrigatórias)
- Cores: verde neon `#C8F501` sobre quase preto `#0D0D0D`.
- **Mundo em pixel art** (cena 3D pixelada, personagens voxel). **Interface moderna e limpa**
  (não pixel): Montserrat, cantos arredondados, painéis escuros, ícones de traço — seguir o Figma.
- Logo: usar SEMPRE o SVG oficial em `app/src/logo.ts` (`LOGO_PATH`). Nunca desenhar um "V" à mão
  nem escrever "VERKZ" em fonte comum como logo.
- Sem frases de efeito/slogans inventados na interface.
- Interface simples: poucos botões, fluxo direto.
- Leveza é requisito: nada de Electron; evitar dependências pesadas.
