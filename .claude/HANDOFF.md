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

## Ajustes de 21/11 (Ouvidoria e permissões de edição)
- **Portas falsas na Ouvidoria:** `buildDoors` (world.ts) testava as linhas de borda de fora E de dentro de cada sala.
  Na Ouvidoria (3 m de largura) a linha de dentro via as paredes laterais como um "vão de 3 m" e criava 2 portas
  extras (com colisão invisível atravessando a sala). Agora, em cada lado, vale só a linha com mais parede.
  Conferido no layout padrão: Ouvidoria 3 → 1 porta; as outras salas continuam com 1.
- **Nova regra de edição (pedido do Alifer):** qualquer pessoa personaliza o escritório (móveis em qualquer lugar).
  Só a gestão (chave de gestão) mexe no prédio, cria/apaga/muda salas, paredes e elevador.
  - App: `editor.limit` virou boolean (`!isAdmin`); fora da gestão só aparece a aba Móveis, sem parede/elevador.
  - Servidor: `check_room_edit` → `check_furniture_edit` (não depende mais do cargo; bloqueia size/zones/spawn/env/
    levels/floorColor e qualquer item wall/window_wall/glass_wall/elevator).

## v0.5.1 — áudio/vídeo caindo (21/11/2026, só app)
- Sintoma: "Ainda conectando o áudio/vídeo. Tente o(a) microfone em alguns segundos."
- Logs do LiveKit (stack 4): a sala conecta por UDP direto (porta 7882, par local 172.18.0.14 = docker_gwbridge)
  e cai sozinha em 20 s a 10 min com `short ice connection` → `PEER_CONNECTION_DISCONNECTED`; a porta pública do
  cliente muda no meio (srflx 54830 → prflx 65242). A retomada falha e o app faz reconexão completa; quem clica no
  microfone nesse intervalo via o erro. O relay TURN/TLS (turn.verkzsystem.tech:443 via Traefik) funciona (aparece
  como "udp relay ... related 10.0.1.14").
- media.ts: (1) se a conexão cai sem o usuário sair, ou falha 2x, reconecta com `rtcConfig.iceTransportPolicy:
  "relay"` (só TURN 443) até fechar o app; (2) reconexão começa em 300 ms; (3) clicar no microfone/câmera
  enquanto reconecta guarda o pedido e liga sozinho quando voltar (antes o clique se perdia); desligar funciona
  mesmo desconectado.
- Servidor/stack sem mudança. Se continuar caindo até no relay, próximo passo: LiveKit em rede host no Swarm.

## v0.6.0 — pedidos de 21/11/2026 14:44 (app + web; servidor Rust sem mudança)
- **Áudio (media.ts):** Room sem `webAudioMix`; cada voz é um `Voice` com o `<audio>` sempre tocando. Modo 3D
  (padrão): elemento mudo + cadeia própria MediaStreamSource → lowpass → pan → ganho; modo normal (Configurações >
  Áudio e vídeo > "Áudio 3D" desligado): o próprio elemento toca com volume pela distância (melhor para eco com
  caixa de som). `media.setSpatial(on)` troca na hora. Corrigido o "entra e sai da conversa" ao andar:
  (1) volume em rampa (sobe 0,45/tick, desce 0,18/tick a 20 Hz), nunca pula; (2) curva `falloff()` contínua até
  o limite; (3) posição usada é a mesma do boneco na tela (antes misturava alvo da rede e posição suavizada);
  (4) assinatura de áudio com histerese larga (assina a silent+2, larga a silent+6) e 6 s de espera antes de soltar;
  (5) som de aproximação só se a pessoa ficou 8 s inaudível; (6) antes `track.setVolume` agendava
  `setTargetAtTime(v, 0, …)` 20x/s (tempo 0 no passado), agora o ganho é nosso.
- **Fim de fala suave:** `TALK_HANG_MS = 900` (a fala continua 0,9 s depois do último sinal), `Avatar.talkAmt`
  faz os gestos diminuírem e desacelerarem até parar; borda verde do nome com transição de 0,45 s.
- **Tela compartilhada (main.ts openScreen):** a tela cheia entra no HUD antes do dock (dock por cima, z 46),
  chip "N no escritório", coluna de blocos (eu + todos; câmera se ligada, senão iniciais; "longe" se não ouço),
  borda verde brilhando enquanto fala (`media.isTalking` + `media.canHear`, com a mesma folga de 0,9 s).
  Esc fecha. Com a tela cheia aberta a cena 3D roda a 12 fps.
- **Caixas de som/rádio:** só controla de até `RADIO_REACH` (2,6 m); de longe o personagem anda até lá e aí faz.
  Quem é dono do rádio ignora `radio_stop` de quem não está perto da caixa.
- **Configurações:** modal de 880 px com abas na lateral (`.settings-wrap`), grade dos apps com minmax(0,1fr).
- **Sinuca (games.ts, refeita):** bola 8 com 15 bolas, lisas/listradas, faltas (branca na caçapa, não acertou,
  bola errada primeiro), bola na mão (arrastar a branca; na saída só na cozinha), 8 na saída volta para a mesa,
  vitória/derrota pela 8. `PoolSim` determinístico (passo 1/240, só + − × ÷ √): os dois lados e quem assiste
  rodam a mesma tacada a partir do mesmo estado (msg `go` com estado + velocidade); o anfitrião é o juiz e manda
  `st` no fim. Mira com linha-guia, bola fantasma e direção da bola acertada; força puxando para trás (ou espaço),
  ← → ajustam. Canvas nítido (devicePixelRatio). Painel fica à direita sem escurecer a cena.
- **Sinuca na cena 3D:** convite leva o id da mesa (`game_inv.item`). `startPoolScene` (main.ts) anda até a mesa,
  na sua vez vai para trás da branca do lado da mira e se vira para ela, na vez do outro espera na ponta.
  `extra.pool {aim,pow,shotAt}` = pose (debruçado, mão de apoio, taco puxa com a força e bate na tacada; esperando,
  taco em pé). `extra.poolTable {item,balls,shot}` (do anfitrião) = bolas 3D de verdade rolando na mesa para todos
  (World.updatePool, mesma física). As bolas de enfeite do modelo (grupo "pool-deco") somem durante o jogo.
- **Antivírus:** ver deploy/ANTIVIRUS.md. Tirado `msSmartScreenProtection` dos argumentos do WebView, WebView2
  embutido no instalador (embedBootstrapper), publisher/copyright/site no bundle, NSIS currentUser.
  Solução definitiva = assinatura de código (Azure Trusted Signing ou certificado OV) + envio à Microsoft.
- **Otimizações:** cena a 20 fps sem foco e 12 fps com tela cheia (`world.backgroundFps`); lista de pessoas só
  refaz o DOM quando muda e não roda com o painel fechado.
- Testado no Chrome headless com 2 usuários: configurações (sem rolagem lateral), tela falsa com dock clicável e
  borda verde apagando depois da folga, sinuca convidado/anfitrião (saída, troca de vez, bolas 3D iguais nos dois).
  Sem LiveKit no sandbox: áudio 3D/normal não testado com voz real.
- **Produção (21/11/2026 ~15:20):** imagem verkz-office-server:0.12.0 = 0.11.0 + /web v0.6.0, rodando na stack
  verkz-office (stack 4). Build no próprio servidor: contexto de 33 KB (Dockerfile + web.patch + media.ts) enviado
  pelo navegador; estágio web = FROM verkz-office-web:0.10.0 (fonte = v0.5.1 exceto media.ts), aplica o patch,
  confere md5 e roda vite build. Conferido: /health ok, bundle index-Bp4_GPfh.js com "Áudio 3D", fontes servidas.
  Instaladores Windows/Mac/Linux 0.6.0 ainda não gerados: rodar compilador.bat e deploy/gerar-update.ps1.

## v0.6.1 — pedidos de 21/11/2026 18:32 (só web/app)
- **Visões:** `world.view` = "iso" (câmera em alvo + (24,24,24)) ou "aerea" (alvo + (0,40,0), camera.up = (0,0,-1),
  norte para cima). `world.setView`, `world.screenRight` (o pan do áudio 3D usa), WASD e fitZoom por visão.
  Botão flutuante `.view-switch` (canto inferior direito) + tecla V; fica salvo em `prefs.view`.
- **Itens só no mesmo cômodo:** `ROOM_ITEMS` + `sameRoomAs(it)` (main.ts). Mesma sala; na área aberta até
  `OPEN_REACH` = 6 m. De outro cômodo o menu só oferece "Ir até <sala>" (`goToItem`), e ao chegar o menu abre.
  Vale para rádio/caixa de som, cozinha, máquina de lanches, jogos, elevador, quadros com foto e painéis.
- **Seu Zé:** porta aberta só por ele toca a 15% do volume e sem a batida de fechar (`onDoorOpen(dist, npc)`).
- **+49 móveis feitos em código** (prefixo `p_`, NEW_DEFS no fim de furniture.ts, sem arquivo de modelo, então o
  deploy por patch funciona): escritório (mesa de pé, mesa em L, impressora, lockers, arquivo, cofre, lixeiras,
  mural, quadro de tarefas, tela de projeção, cabine de ligação), assentos (cadeira gamer e banco, sentáveis via
  SEATS; sofá em L, rede, espreguiçadeira), mesas (bistrô, canto), lazer (pebolim, dardos, videogame, violão,
  teclado, basquete), decoração (aquário, globo, troféus, neon, relógio, espelho, luminária de arco, vaso, livros,
  estante cheia, cabideiro, lareira), plantas (costela-de-adão, suculentas, samambaia, floreira, oliveira),
  cozinha (máquina de lanches clicável, expresso, fruteira, garrafão), banheiro (toalheiro, cesto).
  Categorias do editor atualizadas; itens de parede entram em WALL_MOUNT.
- **Produção (21/11/2026 ~18:55):** imagem verkz-office-server:0.13.0 (stack 4) = FROM estágio web da 0.12.0
  (sha256:a32acb86f9bb..., fonte v0.6.0) + patch da v0.6.1 (contexto de 13 KB, md5 conferidos). Bundle index-Cs-aIr6R.js.
  Para a próxima: o estágio web desta build tem a fonte v0.6.1 (procure o ID no log "Step 4/9" da 0.13.0).

## v0.6.2 — gráficos e visual (21/11/2026 19:08)
- **Visão 2D:** `ViewMode` = "iso" | "aerea" | "2d". O 2D usa câmera quase de cima (alvo + (0,40,9), dá para ver
  o rosto), troca os materiais por MeshBasicMaterial (cor chapada, sem luz) via `flatMats`, desliga sombras e
  reforça o contorno. `world.topDown` vale para aérea e 2D (WASD, enquadramento, lado do som).
  Botão flutuante tem Isométrica, Aérea e 2D; V alterna entre as três; também em Configurações > Aparência > Visão.
- **Opções gráficas finas** (`GfxOptions`, `world.setGfx`, `prefs.gfx`): sombras, contorno, limite de quadros
  (sem limite, 60, 30) e resolução (automática, 100%, 75%, 50%). Somam com a Qualidade (leve continua 30 fps).
- Botão de visão só com ícones abaixo de 1560 px de largura (não encosta no dock).
- **Produção (21/11/2026 ~19:16):** verkz-office-server:0.14.0 rodando na stack 4 (estágio web com a
  fonte v0.6.2 = c5971df87bd0, md5 conferidos; use como base do próximo patch). Bundle index-6Cx4TUIg.js.

## v0.6.3 — pedidos de 23/11/2026 (Lopes; app + web; servidor Rust sem mudança)
- **Modo de call** (`prefs.callMode` = "escritorio" | "reuniao"; tecla G; seletor junto do botão de visão; também em
  Configurações > Aparência). Reunião = `.meet-full` com blocos 16:9 em mosaico (maior tamanho que cabe, última linha
  centralizada), só quem está na minha call (`media.levels > 0` + `canHear`, segura 3 s ao sair), eu primeiro.
  Câmera presa com `track.attach` no bloco (o adaptiveStream pede qualidade do bloco grande). Sem imagem → iniciais.
  WASD/setas bloqueados (listener em captura); mapa e etiquetas escondidos e cena a 2 fps. Figma: tela "06 — Modo reunião".
- **Câmera que não voltava ao chegar perto:** `media.syncCam(p)` a cada passo (200 ms) confere a bolha sem depender
  da ordem dos eventos do LiveKit: faixa assinada sem `<video>` dela → põe o vídeo; vídeo sem quadros 5 s → religa
  (detach/attach); 2,5 s sem quadros → `.nofeed` mostra iniciais + "Sem imagem" (antes ficava bloco preto).
  `dropVideos` faz `detach` antes de trocar (antes o `innerHTML` deixava o elemento preso à faixa e o adaptiveStream
  pausava o vídeo). Minha câmera sem quadros 6 s → aviso "pode estar em uso por outro programa".
- **Mesma sala = mesma call:** câmera sempre assinada para quem está na mesma sala (`media.sameRoom`), mesmo no canto
  (antes era por distância: ~9 m numa sala de 8x7 derrubava a câmera). Sala aberta pequena (`isRoomSized`: lados
  ≤ 12 m, ex. cozinha) também dá voz cheia para todos dentro; o salão (Área dos SDRs, 49 m) continua por distância.
- **Volume individual:** botão direito na pessoa (mapa, lista, bloco do modo reunião) → controle 0–200%, guardado
  por nome em `prefs.volumes`; `media.userVolume` multiplica o ganho.
- **Fundo da câmera:** `src/cambg.ts` (@livekit/track-processors 0.8.3, carregado só quando usado; MediaPipe e
  modelo vêm do CDN jsdelivr/googleapis). Nenhum, desfocar, 6 fundos desenhados em canvas, imagem do computador
  (1280x720 JPEG em `prefs.camBg`). Configurações > Áudio e vídeo; aplica na hora. Não testado com câmera real.
- **Rádio:** playlists do YouTube via `loadPlaylist` no onReady (pelos playerVars não abriam), pula músicas
  bloqueadas, aceita music.youtube.com/browse/VL..., ignora Mix (RD...). Spotify (`radio.sp`, Embed IFrame API):
  sem controle de volume no embed, então toca/pausa pela distância; quem não está logado no Spotify ouve 30 s.
- **Configurações > Funções:** lista de todas as funções com atalho e botão "Usar" (`FUNCS` em main.ts).
- Soundpad: abria vazio quando o IndexedDB demorava; agora espera no máximo 1,5 s pelos sons do usuário.
- Painel financeiro saiu de `ROOM_ITEMS`: único item que abre de qualquer lugar.
- RAM: `powerPreference: "default"` (não força a placa dedicada), modo reunião a 2 fps e sem desenhar o mapa.
  JS heap medido ~42 MB; o resto dos ~600 MB são os processos do WebView2 (GPU/renderização).
- Habbo: pedido de visual "idêntico ao Habbo Hotel" recusado (marca/arte da Sulake); dá para fazer um estilo
  retrô isométrico próprio se pedirem.
- Deploy: imagem `verkz-office-server:0.15.0` = FROM estágio web c5971df87bd0 (fonte v0.6.2) com `npm i`
  (dependência nova) + src novo inteiro + vite build; final FROM 0.14.0 trocando /web/index.html e /web/assets.
  Chave de gestão (ADMIN_KEY) trocada no stack a pedido do Lopes (valor só no stack, não no código).
- **Produção (23/11/2026 ~09:30):** verkz-office-server:0.15.0 (2057d8abdfe1) rodando na stack 4. A base antiga
  (c5971df87bd0) tinha sido limpa do servidor: build com a fonte web inteira (node:22-slim + npm ci + vite build,
  sem modelos) e final FROM 0.14.0 trocando index.html e assets. Contexto enviado pelo upload da tela
  Images > Build image do Portainer (verkz-office-0.15.0-build.tar.gz). Estágio web desta build = d5c8a2899c2c
  (fonte v0.6.3; base do próximo patch, se ainda existir). Bundle index-yDusGADs.js. ADMIN_KEY do stack trocada.
  Instaladores 0.6.3 (Windows/Mac/Linux) ainda não gerados: rodar compilador.bat e deploy/gerar-update.ps1.
- **Cadeiras (23/11, 0.15.1):** hitbox de assento (`World.SIT_HIT` = 0,32 m): andando pelo teclado/joystick até em
  cima da cadeira senta sozinho (`sitOn`); a tecla que ainda está apertada não levanta (`seatHold`), só uma nova;
  depois de levantar não senta de novo na mesma até sair de perto (`leftSeat`). Um clique na cadeira já vai e senta
  (no chão continuam dois cliques). Animação: `Avatar.sitT` 0→1 dobra pernas/braços e desce o corpo com leve
  inclinação; o personagem desliza até o centro do assento. Vale para os outros também (vem de extra.sit).
  Produção: verkz-office-server:0.15.1 (83938dae5687) na stack 4, feita de FROM d5c8a2899c2c + diff do world.ts
  aplicado por `apply.mjs` (a imagem node:slim não tem git/patch). Estágio web = bc594c5d6d54 (fonte com cadeiras).
- **23/11 ~09:50 — 0.15.2 e 0.15.3 (stack 4 em 0.15.3):**
  - Personagem "andando sozinho": cada reconexão do WebSocket (oscilação, notebook acordando, servidor reiniciando)
    refazia o `welcome` → nascia na entrada e ia para a cadeira da sala do cargo. Agora `world.restoreMe` mantém
    posição/andar/sentado e manda a posição de novo.
  - Clique no mapa pede confirmação ("Ir até lá?" / "Sentar nesta cadeira?") via `world.onWalkRequest` + `walkPlan`;
    vários cliques só trocam o destino; dois cliques não andam mais direto.
  - net.ts: "Sair" com reconexão pendente entrava de novo (connect() zerava closedByUser) → `open()` interno e timer
    cancelado no close; conexão muda 50 s sem nada do servidor é refeita.
  - Dock: refeito só quando muda e com um clique delegado (antes o clique se perdia enquanto o LiveKit reconectava).
  - nearItem cancela se o personagem parou de andar (a ação não dispara depois sozinha). G não age no editor.
  - Chave: campo sem maiúscula automática/autocorreção e com trim (o servidor aceita só `verkz1` exato).
  - Setinha ao lado do microfone e da câmera no dock (`dev-mic`/`dev-cam`): aparelho, saída de som, redução de ruído,
    áudio 3D; câmera, qualidade, fundo rápido, espelhar.
  - NÃO publicado (pedido do Lopes): server/src/main.rs com a mensagem "Chave do escritório inválida" garantida
    (esperar o writer antes de fechar) e chave com trim. Entra no próximo build do servidor (Rust).
  - Estágio web da 0.15.3: fonte = base bc594c5d6d54 + diffs (procure no log); base usada: bc594c5d6d54.
- **23/11 ~10:50 — 0.16.0 NO AR (stack 4; build pelo upload verkz-office-0.16.0-build.tar.gz):**
  - Seletor de modo/visão acima do dock (bottom 96 px; rótulos só a partir de 2100 px de largura).
  - Caixas de som: `radio.vol` (volume da caixa para todos; quem não é dono pede com `{kind:"radio_vol"}` e o
    dono aplica se a pessoa está perto) + "só para mim" (soundPrefs.radio) no menu da caixa e na pílula.
    Pílula com capa (miniatura do YouTube / oEmbed do Spotify) e barrinhas animadas (paradas quando mudo).
  - Novos modelos (código, sem arquivo): p_radio_small, p_boombox, p_speaker_tower, p_speaker_portable,
    p_speaker_stage (categoria Lazer; todos abrem o menu do rádio).
  - Configurações > Aparência: "Mostrar o nome das salas no mapa" (`prefs.zoneTags`, body.hide-zone-tags).
  - Spotify: servidor manda `welcome.integrations.spotify_client_id` (env SPOTIFY_CLIENT_ID); o app grava sozinho
    com setCreds e cada pessoa só clica em "Conectar". "Chaves das integrações" só para a gestão.
    BLOQUEIO: no developer.spotify.com a opção Web API veio desabilitada na conta do Lucas. Desde fev/2026 o modo
    de desenvolvimento exige Premium, 1 Client ID por pessoa e no máximo 5 usuários autorizados por Client ID,
    então a integração não atende o time todo. App do Spotify NÃO foi criado.
  - Servidor da 0.16.0 também leva a mensagem de chave inválida garantida e a chave com trim.
- **23/11 ~11:15 — versão 0.6.5 (app) e servidor 0.16.1 no ar (stack 4):**
  - Versão do app: 0.6.5 (package.json, tauri.conf.json, Cargo.toml). Instaladores ainda por gerar.
  - Rádio travando em alguns usuários: (1) não troca de caixa enquanto a atual for audível e não 0,2 mais baixa
    (antes recriava o player a cada troca); (2) silêncio só desliga o player depois de 8 s (passar na porta não
    recomeça a música); (3) watchdog a cada 2 s: buffering/tempo parado por 6 s → volta ao ponto (música) ou
    playVideo; 14 s → próxima da playlist; (4) setVolume só quando muda; (5) player 200x200 (qualidade baixa);
    (6) app instalado: tirado `--renderer-process-limit=1` (o iframe do YouTube dividia o processo com a cena 3D).
  - Estágio web da 0.16.1: base c313f78b8ef9 (fonte 0.16.0) + diff do radio.ts.

## 0.16.2 — atividade mostra a aba do navegador
- world.ts: `activityText`/`browserTab` limpam o título da aba (tira " - Google Chrome", perfil etc.) e mostram no painel da equipe e no cartão da pessoa.

## 0.16.3 — playlist do YouTube sem "Invalid video id"
- radio.ts: o player é criado com `playerVars.listType="playlist"` + `list` (videoId só se o link tiver `v=`). Se der erro 2 ou se em 4s não houver playlist carregada, faz `loadPlaylist` uma vez.
- Mensagem amigável: playlist precisa ser pública/não listada; "Mix" (lista RD…) não pode ser incorporada.
- Deploy: imagem verkz-office-server:0.16.3 (base web c313f78b8ef9 + diffs main/world/radio; final FROM 0.16.2). Stack 4 atualizada.

## App 0.6.6 / servidor 0.17.0
- Regra: TODA mudança sobe a versão (tauri.conf.json, package.json, Cargo.toml) — sem isso o atualizador não instala.
- Regra: nada de emoji como ícone. Só ícones de traço (Lucide, em icons.ts). Emotes, soundpad, itens e avisos foram trocados.
- Rádio: controles para todos na sala (voltar/recomeçar, pausar/tocar, próxima). Estado em RadioState: paused/pos/idx/ep.
  Quem pede manda msg "radio_ctl" para o dono do rádio; o dono aplica e republica (applyRadioCtl). Spotify: só pausar/tocar.
- Modelos de som: 4 do Kenney Furniture Kit (public/models/kenney-furniture, CC0) + 6 desenhados (jukebox, toca-discos,
  gramofone, vitrola de chão, soundbar, monitores de estúdio). Os modelos "sumiam" porque o app instalado era antigo (mesma versão).
- Gestão (servidor): Join leva `device` (id do aparelho). Kick {id, ban}, Admit {rid, ok}, Bans, Unban, Gate {approval}.
  data/gestao.json guarda bloqueados e "aprovar cada entrada". Sala de espera: o servidor segura o Join e manda "knock_office"
  para a gestão; sem gestão online entra direto. Expulsar fecha a conexão (CLOSE_SIGNAL no escritor).
- Porta trancada: extra.lock = id da sala (vale enquanto quem trancou está dentro). world.lockedZones/lockPass bloqueiam o vão
  da porta (blocked) e mostram o cadeado. Chip no topo: Trancar/Destrancar/Bater na porta; msgs knock/door_pass/door_no/door_unlock.
- Títulos das salas: botão "Títulos" no seletor de visão (tecla T).
- Telas: world.updateScreens liga a tela do PC com alguém sentado a até 1,35 m (ScreenFx: code/web/design/music/chat/sheet/game/video/work
  pelo app em uso); sem ninguém, tela apagada.
- Status e atividade: ícone animado por tipo (statusKind/appKind em world.ts; CSS .st-* e .ak-*).
- Linux: compilador.bat opção 3 compila no WSL Ubuntu-22.04 (GLIBC 2.35) via compilador-linux.sh --wsl (copia para ~/verkz-office-build
  e devolve os instaladores). O GitHub ficou só para o Mac.
- Deploy 0.17.0: web = etapa web da 0.16.3 (ab92c2a0ab30) + diffs; Rust = etapa build da 0.16.0 (08def30a335b) + main.rs com diff,
  cargo --offline; GLBs baixados no build do GitHub (Xiul109/SiSHoDit @49a5c6a).
