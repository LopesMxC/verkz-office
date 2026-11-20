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

## Gravação e transcrição de reuniões (20/11)
- Pedido do Alifer: gravar no servidor, guardar no máximo 15 dias, transcrever + resumir com Google AI Studio (Gemini).
- App (`app/src/recorder.ts`): quem clica em "Gravar" mixa o áudio que OUVE (mesmos ganhos da proximidade/salas
  privadas, a própria voz e o áudio de tela) + vídeo de um canvas 1280x720 a 8 fps (tela compartilhada ou cartão com
  os participantes). MediaRecorder webm (mp4 no Mac) em partes de 10 s enviadas em ordem para o servidor.
  Fonte de silêncio sempre ligada (sem ela o Chrome não gera o arquivo quando ninguém fala).
  Aviso "Gravando" no personagem e no topo de todos (`{t:"rec",on}` no WebSocket). Painel "Reuniões gravadas".
- Servidor (`server/src/rec.rs`): /api/rec (lista), /start, /{id}/chunk, /{id}/finish, /{id}/retry, /{id}/file,
  /{id}/notes. Auth: header `x-office-key` ou `?key=`. Guarda em DATA_DIR/rec/<id>. Ao finalizar: ffmpeg `-c copy`
  (corrige duração), extrai áudio opus 16 kHz, envia ao Gemini (Files API), generateContent com JSON
  {resumo, decisoes, tarefas, transcricao}. `GEMINI_API_KEY` e `GEMINI_MODEL` (padrão `gemini-flash-latest`;
  modelos novos não aceitam `temperature`). Limpeza a cada hora apaga o que passou de 15 dias.
- Testado: build Rust sem avisos, endpoints com curl, fluxo de 2 usuários no Chrome (aviso, envio, lista, download),
  mixagem com microfone falso (-21 dB médio). Chamada real ao Gemini só testável na VPS (Google bloqueado no sandbox).

## Produção (VPS do Portainer, 20/11)
- Swarm com Traefik (rede InwNet, certresolver letsencryptresolver). Stack `verkz-office` separada (livekit + office),
  imagem `verkz-office-server` construída na própria VPS pela API do Portainer.
- Domínios: office.verkzsystem.tech e rtc.verkzsystem.tech (DNS na Hostinger). Portas 7881/tcp e 7882/udp (host).
- Repositório do build: github.com/LopesMxC/verkz-office (privado). Na 1ª vez o GitHub não registrou o workflow:
  foi preciso um 2º push mexendo no build.yml.

## Protocolo WebSocket (server <-> app)
Cliente → servidor: `{t:"join",key,name,color,look}`, `{t:"move",x,z,dir,moving,zone}`,
`{t:"chat",text,zone|null}`, `{t:"status",text}`, `{t:"look",look}`, `{t:"layout_save",layout}`,
`{t:"wave",to}`, `{t:"rec",on}`, `{t:"ping"}`.
Servidor → cliente: `welcome{id,me,peers,layout,history,livekit{url,token}}`, `peer_join`,
`peer_leave`, `peer_move`, `chat`, `status`, `look`, `layout`, `wave`, `rec`, `rec_update`, `error`, `pong`.
Identity no LiveKit = id do peer no servidor.

## Build local
- `compilador.bat` (Windows): menu 1 Windows local (.exe NSIS) / 2 Mac pelo GitHub / 3 os dois.
  Opção Mac: instala git + gh (winget), `gh auth login --web`, cria repo privado `<usuario>/verkz-office`,
  commit + push, grava `OFFICE_SERVER` (variable) e `VERKZ_*` (secrets), `gh workflow run build.yml
  -f plataforma=mac`, espera com `gh run watch` e baixa o artifact `verkz-office-mac` para instaladores/.
  Na opção 3 o Mac é disparado antes e o Windows compila enquanto o GitHub trabalha.
- `compilador-mac.command` (gera .dmg num Mac). Ambos lêem `compilador.env` (VITE_OFFICE_SERVER + VERKZ_*).
  Não testados num Windows/Mac real ainda (estrutura do .bat checada por script; Wine não roda no sandbox).
- Workflow: input `plataforma` (todas/mac/windows); rodada manual só gera Artifacts (`verkz-office-mac`,
  `verkz-office-windows`); tag `v*` gera os dois + Release rascunho. `.gitattributes` fixa CRLF no .bat.
- `deploy/setup.sh` para sem mexer em nada se 80/443 já estiverem ocupadas por outro sistema
  (ex.: n8n/Traefik na mesma VPS). Nesse caso falta adaptar o compose para o proxy existente.
- Hostinger VPS só tem Linux (não existe Windows Server lá): deploy segue com Ubuntu + deploy/setup.sh.

## Depois da v1
- Assinatura/notarização Apple (precisa de conta Apple Developer) e certificado Windows.
- Login com Google no lugar da chave única.
- Persistir chat em banco (hoje: últimas 100 mensagens em memória).
