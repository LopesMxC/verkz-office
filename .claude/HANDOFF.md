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

## v0.2 (nov/2026)
- Protocolo novo: `{t:"state",patch}` (mescla em peer.extra; null apaga) → `state{id,patch}`;
  `{t:"to",to,msg}` → `from{from,name,msg}` (call, call_reply, agenda_req, agenda); `{t:"fx",data}` → `fx{from,data}` (emotes).
  `join` aceita `admin_key`; `welcome.admin`. ADMIN_KEY (env) = gestão: recebe activity completa; os outros só
  `{app,share,since}` quando share=true.
- extra: `activity{app,title,share,since}`, `hold` (cafe/agua/lanche/refri/marmita), `cam`.
- Módulos: sound.ts (WebAudio, soundpad publicado como trilha "soundpad"), env.ts (clima/estações/datas),
  widgets.ts (painéis com textura de canvas), extras.rs (active_app, http_get, YouTube Music em janela oculta).
- layout.env (EnvConfig) e item.cfg (painéis) ficam no layout salvo no servidor.
- Updater: tauri-plugin-updater, endpoint https://verkzsystem.tech/apps/verkz-office/latest.json,
  chave em .chaves/ (pubkey no tauri.conf.json), deploy/gerar-update.ps1 monta instaladores/update.
- Regra de UI: todo painel/modal novo com padding interno de 20px+, blocos a 16px e campos a 12px.
- Produção (20/11/2026): imagem verkz-office-server:0.3.0 (build via Portainer API, contexto tar.xz enviado pelo
  navegador com POST /api/endpoints/1/docker/build + header X-CSRF-Token). LiveKit com TURN (turn.verkzsystem.tech,
  TLS terminado no Traefik por router TCP HostSNI -> 5349, udp 3478 host). ADMIN_KEY no stack (inline, como as outras).
  Dockerfile agora usa rust:1-slim-bookworm (o rust:1-slim novo gerava aviso de GLIBC_2.39 no runtime bookworm).

## v0.4 — celular pelo navegador + selo novo (20/11/2026)
- Produção: imagem verkz-office-server:0.7.0 = 0.6.0 + /web novo. Gerada aplicando um patch sobre a camada em cache
  do estágio web (imagem 660a69347528 = fonte v0.3 + node_modules + modelos), porque o contexto completo é grande
  demais para mandar pelo navegador. Se a fonte base mudar, gerar uma imagem nova completa (Dockerfile.web).
- src/mobile.ts: isTouch/isPhone, Joystick (world.stick, borda = correr), áudio liberado no 1º toque
  (room.startAudio + AudioContext.resume), wake lock, registro do service worker.
- world.ts: pinça = zoom, toque longo numa pessoa = menu (o contextmenu nativo é ignorado em tela de toque),
  pixelRatio até 2 em tela de toque.
- main.ts: no celular o dock tem mic/câmera/emotes/chat/mapa/"Mais" (popover "more" com o resto);
  painéis viram folhas acima do dock; atividade "No celular"; sem compartilhar tela em toque.
- PWA: public/manifest.webmanifest, sw.js (sem cache), icons/ (icon.svg + PNGs). "Adicionar à tela inicial".
- Logo: selo (opção C) em src/logo.ts `sealEl()` — V oficial numa moldura neon, "OFFICE" em curvas (Montserrat
  Bold) a partir de 72px. Ícones do desktop regenerados com `npx tauri icon` a partir do selo de 1024px.

## v0.4.2 — pedidos de 21/11/2026 (só app; servidor sem mudança, não precisa refazer a imagem do server)
- Portas: sons gravados reais (public/sounds, Kenney RPG Audio, CC0; abrir e fechar, volume pela distância).
  Pixabay é bloqueado no sandbox e a licença dele não é CC0; para trocar, substitua os .mp3 mantendo os nomes.
- Portas duplas com vão fixo de 1,3 m (DOOR_W em world.ts); o resto do vão vira parede (wallSegment) com colisão
  própria (doorBlockers). buildDoors agora acha o vão tanto na borda de fora quanto na de dentro da sala
  (salas criadas no editor não ganhavam porta) e não duplica porta entre duas salas.
- Mouse: arrastar com o botão esquerdo move o mapa (world.panOffset/panBy, vale no editor quando não está
  desenhando); dois cliques levam o personagem (no toque continua um toque). Teclado ou andar zera o deslocamento.
- Editor: aba Salas com "Adicionar sala pronta" (acha espaço livre; sem espaço, amplia o prédio para a direita);
  aba Prédio com "Ampliar só um lado" (growSide desloca tudo meio passo) e cor do piso do salão/áreas abertas
  (layout.floorColor). Salas: mais pisos (madeira escura, porcelanato, concreto) e zone.floorColor.
  Móveis: item.color (tintObject; modelos com textura usam cópia em cinza da textura), categorias na paleta,
  ~50 móveis novos (KayKit Furniture Bits + Restaurant Bits, CC0, em public/models/kaykit e kaykit-restaurant).
  Ao abrir o editor o personagem levanta (world.standUp); se a cadeira some/muda, levanta sozinho; unstick() tira o
  personagem de dentro de parede/móvel quando o layout muda.
- Quadros com foto (photo_wall/photo_big/photo_easel/photo_desk): imagem do computador reduzida para JPEG
  (até ~70 KB) em item.cfg.img; WALL_MOUNT encosta sozinho nas paredes inteiras do fundo e, longe delas, ganha
  pedestal. Limite: o layout inteiro precisa ficar abaixo de 2 MB (ws.max_message_size do servidor).
- Rádio (item "radio" e a caixa de som): link do YouTube (vídeo ou playlist) em extra.radio {item,url,vid,list,at}
  de quem ligou; radio.ts usa a IFrame API escondida; ouve quem está na mesma sala (corredor: pela distância).
  Volume do rádio em Configurações > Sons. Não testado com áudio real (YouTube bloqueado no sandbox).
- Jogos (games.ts): mesa de sinuca e de pingue-pongue clicáveis; convite por {t:"to"} (game_inv/game_reply/game);
  quem convida roda a física e manda o estado a ~20/s. Treino sozinho (pingue-pongue contra o computador).
- Bebidas/lanches acabam: HOLD_MINUTES por item, holdEnd/holdDur no extra (o nível do copo desce para todos),
  verificação a cada 5 s e ao reconectar.
- Configurações: aba "Apps" (Google, Spotify, YouTube Music + atalhos de Outlook, Teams, WhatsApp, Slack, Notion,
  Trello, ClickUp, Monday, Pipedrive, Kommo, Canva, Figma, Planilhas, Meta Business, Instagram e app próprio);
  qualidade gráfica Leve/Equilibrada/Bonita (world.setQuality); atualização automática (ao abrir, a cada 30 min,
  ao voltar o foco/internet; "Depois" volta em 2 h). Gestão: botões "Aumentar o prédio" e "Adicionar salas".
- Tela verde ao entrar: era o fundo do cenário enquanto modelos e layout carregavam. Agora fundo escuro + tela de
  entrada com progresso (models.ts modelProgress), espera de modelos limitada a 15 s, botão de recarregar após 25 s.
- Testado no Chrome headless com 2 usuários (entrada, arrastar, dois cliques, editor, sala pronta, cores, quadro,
  sinuca entre dois, pingue-pongue treino, rádio salvando o estado). Em dev, window.__verkz expõe world/editor.

## v0.5.0 — andares, elevador e estilos visuais (21/11/2026)
- Layout ganhou `levels: [{id, name, items, zones, floorColor}]` (o térreo continua em `items`/`zones`). Mesmo tamanho
  de prédio em todos os andares. furniture.ts: levelView, mergeLevel, levelIds, levelName, findItemAnyLevel,
  perimeterWalls. world.layout = o andar que estou vendo; world.fullLayout = tudo (é o que vai para o servidor).
- Só o meu andar é desenhado; quem está em outro andar fica invisível e mudo (media.gainFor). Andar de cada pessoa
  em extra.level. Andar de cima: sem gramado (céu), sem faxineiro.
- Elevador (item "elevator", interativo): portas de correr abrem com alguém perto; clique = menu de andares;
  viagem com portas fechando, tela do visor contando andares, musiquinha própria (sound.ts elevatorMusic) e "plim".
- Editor > Prédio > Andares (só gestão = ADMIN_KEY, a chave do CEO): adicionar andar (paredes + elevadores no mesmo
  lugar do térreo; cria um elevador perto da entrada se não houver), apagar o último andar. Elevador colocado num andar
  aparece em todos. Tamanho do prédio só muda no térreo (os andares de cima acompanham).
- Servidor: check_room_edit recusa mudança em `levels`/`floorColor` de quem não é gestão (precisa da imagem nova).
- Estilo visual (Configurações > Aparência): Padrão, Realista (MeshStandardMaterial + ACES + RoomEnvironment, sem
  contorno), Desenho (contorno forte), Retrô (pixelSize 3). world.setStyle / applyStyle (converte materiais toon).
- Produção (21/11/2026): imagem verkz-office-server:0.9.0 (servidor + web 0.5.0) rodando na stack verkz-office
  (stack 4 no Portainer portainer.clientesalifer.online; arquivo da stack atualizado de 0.8.0 para 0.9.0).
  Build feito com deploy/Dockerfile.build-leve: contexto pequeno (~165 KB, só código) e os modelos KayKit são
  clonados do GitHub no build, Kenney do npm, ícones copiados da versão publicada e sons de porta baixados e
  convertidos com ffmpeg. Contexto: Dockerfile + Cargo.toml/lock + src/ (server) + web/ (app sem public/models,
  icons e sounds) + kaykit-files.txt (grep dos .gltf de models.ts). Enviado pelo navegador (POST
  /api/endpoints/1/docker/build com X-CSRF-Token; o Portainer só devolve o log no fim).
- Instaladores do app (Windows/Mac) da 0.5.0 ainda não gerados: rodar compilador.bat (opção 3) e
  deploy/gerar-update.ps1, depois subir em verkzsystem.tech/apps/verkz-office/.
- Linux (21/11): compilador.bat ganhou [3] Linux e [4] Todos (Mac e Linux saem num build só do GitHub:
  plataforma=mac-linux; artifact verkz-office-linux com .deb/.rpm/.AppImage(.sig)). build.yml tem as opções linux e
  mac-linux (ubuntu-22.04 + libwebkit2gtk-4.1-dev). compilador-linux.sh compila direto num PC Linux.
  gerar-update.ps1 inclui linux-x86_64 (AppImage) no latest.json. Instaladores Linux 0.5.0 gerados no sandbox
  (Ubuntu 24.04) e entregues; AppImage assinado com a chave de .chaves.
- Assinaturas do updater (21/11): todo build agora exige .sig e PARA com erro se faltar (antes saía sem e ninguém via).
  compilador.bat: `tauri build --ci` (o cmd não guarda variável vazia, então a senha "" sumia e o Tauri tentava
  perguntar); confere se .chaves/verkz-office.key.pub = pubkey do tauri.conf.json; se o .sig não sair, assina com
  `tauri signer sign`; copia só o setup.exe da versão atual; exige .app.tar.gz.sig (Mac) e .AppImage.sig (Linux)
  no download do GitHub; para se gerar-update.ps1 achar instalador sem .sig (agora sai com exit 1).
  compilador-mac.command: carrega a chave e usa `--bundles app,dmg` (só "dmg" não gerava o .app.tar.gz).
  compilador-linux.sh: exige a chave. build.yml: confere o segredo antes e os .sig depois de cada build.
