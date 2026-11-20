# VERKZ Office

Escritório virtual da VERKZ em pixel art: cada pessoa é um personagem, quem está perto conversa,
quem entra numa sala privada só é ouvido lá dentro.

## Como usar (time)
- **Andar:** WASD ou setas, ou clique no piso.
- **Falar:** chegue perto de alguém. O som aumenta conforme a distância e some a uns 6 passos.
- **Salas privadas** (contorno verde): quem está dentro se ouve com volume cheio; quem está fora não ouve nada.
- **Microfone:** tecla M. **Chat:** Enter (abas Geral e Sala).
- **Câmera** aparece numa bolha acima do personagem. **Tela compartilhada** aparece em miniatura; clique para ampliar.
- **Personagem:** botão do bonequinho no dock (pele, cabelo, roupa, calça, tênis, boné/gorro/fone, óculos, corrente).
- **Editar escritório:** botão do lápis.
  - *Móveis:* escolha um móvel e clique no piso. R gira, D duplica, Shift+clique coloca vários, Delete remove.
  - *Salas:* "Nova sala" e arraste no piso (já sai com paredes e porta). Em cada sala: nome, privada ou aberta,
    piso, largura, profundidade, mover, pôr/tirar paredes, apagar.
  - *Prédio:* aumentar ou diminuir o escritório, desenhar paredes arrastando, borracha para apagar itens.
  - "Salvar para todos" atualiza o escritório de todo mundo.
- **Gravar reunião:** botão vermelho no dock. Grava o que você ouve (e a tela compartilhada) e envia ao servidor.
  Todos veem o aviso "Gravando". Em "Reuniões gravadas" ficam o vídeo para baixar, o resumo, as decisões, as tarefas
  e a transcrição (feitos pelo Gemini). Cada gravação é apagada sozinha depois de 15 dias.
- **Agenda e apps:** botão do calendário: reuniões do dia com "Entrar no Meet", e-mails não lidos, Spotify
  (tocando agora e controles) e atalhos (YouTube Music, Gmail, Drive, Verkz System, ou qualquer link/programa).
  O status "Em reunião" e "Ouvindo: ..." aparece sozinho acima do personagem.
- **Correr:** segure Shift. Passos e corrida têm som (dá para desligar em Configurações).
- **Emotes:** tecla E ou botão da carinha; atalhos 1 a 0 (acenar, joinha, palmas, rir, dançar...).
- **Soundpad:** botão do alto-falante. Quem está perto ouve. Dá para subir seus próprios sons (até 3 MB).
- **Clique em alguém:** cartão com sala, atividade (app em uso) e o que está fazendo.
  **Botão direito:** chamar para cá, ir até a pessoa, ver agenda, acenar.
- **Cozinha:** clique no café, bebedouro, geladeira ou micro-ondas; o personagem vai até lá e pega o item.
- **Painéis:** financeiro (dólar, euro, bitcoin, Selic, IPCA), meta (clique para editar), clima, relógio e
  painel de API (qualquer URL https que devolva JSON). Ficam em "Editar escritório".
- **Clima e datas:** chuva, neve, sol e estações do lado de fora; Natal, Halloween, Páscoa, aniversário da VERKZ
  etc. com enfeites e skin do evento (desligável no personagem).
- **Configurações** (engrenagem): microfone, câmera, saída de som, alcance da voz, sons, privacidade e aparência.
- **Gestão:** quem entra com a *chave de gestão* (Configurações > Sobre) vê a "Atividade da equipe" com o app
  em uso de cada pessoa, e configura clima/datas do escritório.
- **YouTube Music:** em Agenda e apps > Música > Abrir.
- **Atualização automática:** o app procura versão nova em verkzsystem.tech/apps/verkz-office ao abrir e a cada 6 h.

## 1. Subir o servidor na VPS Hostinger (KVM2)
1. No painel DNS do domínio, crie dois registros **A** apontando para o IP da VPS:
   `office.verkzcompany.com.br` e `rtc.verkzcompany.com.br` (ou outros nomes que preferir).
2. Envie as pastas `deploy` e `server` para a VPS. No PowerShell, dentro da pasta `verkz-office`:
   ```powershell
   ssh root@IP_DA_VPS "mkdir -p /root/verkz-office"
   scp -r deploy server root@IP_DA_VPS:/root/verkz-office/
   ```
3. Na VPS (Ubuntu), pelo `ssh root@IP_DA_VPS` ou pelo terminal do navegador do hPanel:
   ```bash
   cd /root/verkz-office/deploy
   sudo bash setup.sh     # 1ª vez: cria .env e livekit.yaml com chaves novas e mostra a chave do escritório
   nano .env              # confira os dois domínios
   sudo bash setup.sh     # 2ª vez: sobe tudo (LiveKit + servidor + HTTPS automático)
   ```
   Se a VPS já tiver outro sistema nas portas 80/443 (n8n, Traefik, Nginx), o setup avisa e para sem mexer em nada.
4. Teste no navegador: `https://office.verkzcompany.com.br/health` deve responder `ok`.
5. No painel da Hostinger, se houver firewall próprio, libere: TCP 80, 443, 7881 e UDP 50000-50200.

No app, o endereço do servidor fica `wss://office.verkzcompany.com.br/ws`.

## 2. Chaves do Google e do Spotify (uma vez só)
**Google** (Agenda, Meet e Gmail):
1. console.cloud.google.com → novo projeto "VERKZ Office".
2. Ative **Google Calendar API** e **Gmail API**.
3. Tela de consentimento OAuth → tipo *Externo* (ou *Interno* se usar Google Workspace) → adicione o time como testadores.
4. Credenciais → Criar ID do cliente OAuth → tipo **App para computador**. Guarde o Client ID e o Client Secret.

**Spotify:**
1. developer.spotify.com/dashboard → Create app.
2. Redirect URI: `http://127.0.0.1:43821/callback` · API: Web API.
3. Em *User Management*, adicione o e-mail de cada pessoa do time (modo de desenvolvimento).
4. Guarde o Client ID. (Pausar/pular música exige Spotify Premium.)

YouTube Music não tem API pública: ele entra como atalho que abre o app/site.

## 3. Gerar os instaladores

**No seu PC Windows:** dê dois cliques em `compilador.bat` e escolha:
- **1 Windows:** compila aqui no PC (`.exe`).
- **2 Mac:** compila no GitHub (`.dmg`), sem precisar de Mac.
- **3 Os dois:** manda o Mac para o GitHub e compila o Windows enquanto isso.

Os instaladores saem na pasta `instaladores`.
- Na 1ª vez ele instala o que faltar (Node, Rust, ferramentas de C++, Git e GitHub CLI) e pede para abrir de novo.
- Pergunta o domínio do escritório uma vez e guarda em `compilador.env`.
- As chaves do Google/Spotify são opcionais: copie `compilador.env.exemplo` para `compilador.env` e preencha.
- Mac pelo GitHub: na 1ª vez abre o navegador para você entrar na sua conta do GitHub. Depois ele cria o
  repositório privado `verkz-office`, envia o código, grava o domínio e as chaves no GitHub (chaves como segredos),
  pede o build e baixa o `.dmg` sozinho (uns 15 a 20 minutos).
- Repositório privado usa os minutos grátis do GitHub, e minuto de Mac vale uns 10 de Linux:
  no plano grátis dá para uns 10 builds do Mac por mês.

**Num Mac:** dois cliques em `compilador-mac.command`.

### Pelo site do GitHub (sem o compilador)
1. O projeto precisa estar num repositório no GitHub (o `compilador.bat` opção 2 já faz isso).
2. Em *Settings → Secrets and variables → Actions*:
   - **Variables:** `OFFICE_SERVER` = `wss://office.verkzcompany.com.br/ws`
   - **Secrets:** `VERKZ_GOOGLE_CLIENT_ID`, `VERKZ_GOOGLE_CLIENT_SECRET`, `VERKZ_SPOTIFY_CLIENT_ID`
3. Aba *Actions* → "Build do app (Mac e Windows)" → *Run workflow* → escolha `mac`, `windows` ou `todas`.
4. No fim, os instaladores ficam em *Artifacts*, na página da rodada.
5. Versão oficial: crie uma tag `v0.1.0` (ou a versão do `tauri.conf.json`); aí os dois instaladores
   vão para um rascunho em *Releases*.

Assim o time instala e só digita nome + chave do escritório.

> Mac sem assinatura Apple: na 1ª vez, clique com o botão direito no app → Abrir.
> Para tirar esse aviso é preciso conta Apple Developer (US$ 99/ano) e configurar a assinatura no workflow.
> Windows pode mostrar o aviso do SmartScreen pelo mesmo motivo ("Mais informações" → "Executar assim mesmo").

## 4. Publicar uma atualização
1. Aumente `version` em `app/src-tauri/tauri.conf.json` (ex.: 0.2.0 → 0.2.1).
2. Rode o `compilador.bat`. No fim ele cria `instaladores\update\` com o instalador assinado e o `latest.json`.
3. Suba o conteúdo de `instaladores\update\` para `https://verkzsystem.tech/apps/verkz-office/`.
   Todos os apps abertos avisam "Nova versão" e atualizam com um clique.
- A chave que assina as atualizações fica em `.chaves\verkz-office.key`. **Guarde uma cópia** e nunca envie para o
  GitHub (já está no .gitignore). Sem ela, os apps instalados não aceitam atualizações novas.

## Desenvolvimento
Veja `CLAUDE.md` (visão técnica) e `.claude/HANDOFF.md` (estado atual e próximos passos).

## Créditos dos modelos 3D (CC0, domínio público)
- KayKit Furniture Bits — Kay Lousberg (kaylousberg.com)
- Kenney Nature Kit — Kenney (kenney.nl), via cópias otimizadas do pacote npm `@netforge/asset-library-files`
