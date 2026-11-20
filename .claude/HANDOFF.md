# HANDOFF — estado do VERKZ Office

> Atualize este arquivo ao final de cada etapa. Quem continuar: leia tudo antes de codar.

## Pedido original do Alifer (20/11/2026)
"App de call estilo GatherV2, visual da VERKZ, meio 3D, feito em Rust, leve, para macOS e Windows."
Depois: "os personagens devem poder ser personalizados, e a estética deve ser estilo pixel art".

## Decisões tomadas (não rediscutir sem o Alifer pedir)
- Stack: **Tauri v2 + Three.js** (escolhida pelo Alifer). Não usar Bevy nem Electron.
- Mídia: **LiveKit self-hosted na VPS Hostinger KVM2** (2 vCPU / 8 GB) via Docker.
- Escopo v1 (tudo pedido): escritório 3D + avatares; áudio por proximidade; vídeo + tela;
  salas privadas + chat; personalização do escritório (editor); personalização do personagem;
  integrações Google Agenda / Gmail / Meet, Spotify, YouTube Music e outros programas.
- Pixel art SÓ no mundo 3D, em resolução HD: estilo vem dos modelos (KayKit/Kenney + voxels), luz em
  degraus (toon) e texturas pintadas com filtro nearest. A INTERFACE é moderna, não pixel, seguindo o Figma.
- YouTube Music não tem API pública: entra como atalho (abre o site/app), sem "tocando agora".
- Gmail: escopo `gmail.labels` (não restrito), só para contar não lidos.
- Credenciais OAuth podem vir embutidas no build (env `VERKZ_GOOGLE_CLIENT_ID`,
  `VERKZ_GOOGLE_CLIENT_SECRET`, `VERKZ_SPOTIFY_CLIENT_ID`) ou ser configuradas no app.
- Autenticação do time: chave única do escritório (`OFFICE_KEY`). Simples de propósito.
- Redirect OAuth fixo: `http://127.0.0.1:43821/callback` (cadastrar no Google e no Spotify).

## Status
- [x] Servidor Rust (`server/`): compila. Protocolo: join/move/chat/status/look/layout_save/wave.
- [x] Lado nativo Tauri (`app/src-tauri`): `cargo check` OK. Integrações Google/Spotify prontas.
- [x] `world.ts` (cena, pixel art, colisão, A*), `avatar.ts` (voxel + opções), `furniture.ts`,
      `media.ts` (LiveKit/proximidade), `net.ts`, `integrations.ts`, `logo.ts`.
- [x] Interface v1 (main.ts, creator.ts, editor.ts, icons.ts, style.css): funcionando, testada com
      2 usuários no Chrome headless (login, criador, chat, editor, painel de apps).
- [x] `deploy/` (docker-compose LiveKit + server + Caddy, setup.sh) e README com guia da VPS.
- [x] `.github/workflows/build.yml` (tauri-action, Mac universal + Windows).
- [x] App nativo compila em release (~6 MB no Linux).
- [ ] **NOVO PEDIDO (20/11 11:46):** "qualidade dos pixels muito ruim, faça melhor a pixel art; a
      interface/UI deve ser normal, bem desenhada; desenhe a interface no Figma".
      - [x] UI desenhada no Figma: https://www.figma.com/design/DbdArYiMEBUYob4zaT3NXB
            (variáveis "VERKZ Office", estilos de texto Montserrat, componentes: Botão, Botão de ícone,
            Campo, Etiqueta, Pessoa, Mensagem, Interruptor, Plaquinha, 32 ícones; telas 01 Entrar,
            02 Escritório, 03 Personagem, 04 Agenda e apps, 05 Editar escritório).
            O render do cenário não subiu (upload bloqueado no sandbox): quadro "Cenário 3D" reservado.
      - [x] Interface reimplementada conforme o Figma (style.css, main.ts, creator.ts, editor.ts, ícones de traço).
      - [x] Melhorar o pixel art do mundo (toon.ts, texturas pintadas, piso por sala, sem tone mapping)
- [x] **Pedidos de 20/11 12:08–12:16:**
      - "Visual semelhante ao Gather, mas não igual" → SÓ o mundo (a UI fica como no Figma).
        Câmera de cima levemente inclinada (camera.position = alvo + (0, 26, 24)), WASD alinhado à tela,
        piso de tábuas claras, carpetes nas salas privadas, cerâmica xadrez nas áreas abertas, gramado
        com árvores em volta, personagens chibi (cabeça grande) com sombra redonda.
      - "Use assets 3D de kenney.nl / opengameart" → sites bloqueados no sandbox. Usados equivalentes CC0:
        KayKit Furniture Bits (GitHub KayKit-Game-Assets) em app/public/models/kaykit e Kenney Nature Kit
        (via npm @netforge/asset-library-files, cópias otimizadas com meshopt) em app/public/models/kenney.
        Carregados em src/models.ts (materiais convertidos para toon). Mesas/monitores continuam procedurais
        (KayKit não tem móveis de escritório). Se der para baixar o Kenney Furniture Kit, trocar em furniture.ts.
      - "Render em HD (~1080p), não 360p" → resolução cheia (pixelRatio até 2), RenderPixelatedPass com
        pixelSize 1 só para contorno fino. NÃO voltar a pixelar a imagem.
      - "Personalizar o escritório: mais salas, remover, tamanhos e mais" → editor com abas Móveis / Salas /
        Prédio: nova sala com paredes e porta automáticas, piso por sala (6 opções), largura/profundidade,
        mover, pôr/tirar paredes, apagar sala; tamanho do prédio (refaz paredes externas); desenhar parede
        arrastando; borracha; duplicar móvel (D).: mais resolução por personagem, tons em degrau (toon),
            texturas pintadas pixel a pixel (piso de madeira, tapetes, paredes), luz mais quente,
            contornos limpos, remover listras do logo no piso.
- [ ] Teste real de áudio/vídeo com LiveKit (no sandbox não foi possível rodar o binário do LiveKit).

## Protocolo WebSocket (server <-> app)
Cliente → servidor: `{t:"join",key,name,color,look}`, `{t:"move",x,z,dir,moving,zone}`,
`{t:"chat",text,zone|null}`, `{t:"status",text}`, `{t:"look",look}`, `{t:"layout_save",layout}`,
`{t:"wave",to}`, `{t:"ping"}`.
Servidor → cliente: `welcome{id,me,peers,layout,history,livekit{url,token}}`, `peer_join`,
`peer_leave`, `peer_move`, `chat`, `status`, `look`, `layout`, `wave`, `error`, `pong`.
Identity no LiveKit = id do peer no servidor.

## Depois da v1
- Assinatura/notarização Apple (precisa de conta Apple Developer) e certificado Windows.
- Login com Google no lugar da chave única.
- Persistir chat em banco (hoje: últimas 100 mensagens em memória).
