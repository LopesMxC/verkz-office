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
- **Agenda e apps:** botão do calendário: reuniões do dia com "Entrar no Meet", e-mails não lidos, Spotify
  (tocando agora e controles) e atalhos (YouTube Music, Gmail, Drive, Verkz System, ou qualquer link/programa).
  O status "Em reunião" e "Ouvindo: ..." aparece sozinho acima do personagem.

## 1. Subir o servidor na VPS Hostinger (KVM2)
1. No painel DNS do domínio, crie dois registros **A** apontando para o IP da VPS:
   `office.verkzcompany.com.br` e `rtc.verkzcompany.com.br` (ou outros nomes que preferir).
2. Na VPS (Ubuntu), copie a pasta do projeto e rode:
   ```bash
   cd verkz-office/deploy
   sudo ./setup.sh        # 1ª vez: cria .env e livekit.yaml com chaves novas e mostra a chave do escritório
   nano .env              # confira os dois domínios
   sudo ./setup.sh        # 2ª vez: sobe tudo (LiveKit + servidor + HTTPS automático)
   ```
3. Teste no navegador: `https://office.verkzcompany.com.br/health` deve responder `ok`.
4. No painel da Hostinger, se houver firewall próprio, libere: TCP 80, 443, 7881 e UDP 50000-50200.

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

**No seu PC Windows (mais simples):** dê dois cliques em `compilador.bat`.
- Na 1ª vez ele instala o que faltar (Node, Rust e as ferramentas de C++ da Microsoft) e pede para abrir de novo.
- Pergunta o domínio do escritório uma vez e guarda em `compilador.env`.
- As chaves do Google/Spotify são opcionais: copie `compilador.env.exemplo` para `compilador.env` e preencha.
- O instalador `.exe` sai na pasta `instaladores`.

**Instalador do Mac:** só dá para gerar num Mac (dois cliques em `compilador-mac.command`) ou pelo GitHub (abaixo).

### Pelo GitHub (Mac e Windows de uma vez)
1. Suba o projeto num repositório no GitHub.
2. Em *Settings → Secrets and variables → Actions*:
   - **Variables:** `OFFICE_SERVER` = `wss://office.verkzcompany.com.br/ws`
   - **Secrets:** `VERKZ_GOOGLE_CLIENT_ID`, `VERKZ_GOOGLE_CLIENT_SECRET`, `VERKZ_SPOTIFY_CLIENT_ID`
3. Aba *Actions* → "Build do app (Mac e Windows)" → *Run workflow*.
4. Em ~15 min os instaladores aparecem em *Releases* (rascunho).

Assim o time instala e só digita nome + chave do escritório.

> Mac sem assinatura Apple: na 1ª vez, clique com o botão direito no app → Abrir.
> Para tirar esse aviso é preciso conta Apple Developer (US$ 99/ano) e configurar a assinatura no workflow.
> Windows pode mostrar o aviso do SmartScreen pelo mesmo motivo ("Mais informações" → "Executar assim mesmo").

## Desenvolvimento
Veja `CLAUDE.md` (visão técnica) e `.claude/HANDOFF.md` (estado atual e próximos passos).

## Créditos dos modelos 3D (CC0, domínio público)
- KayKit Furniture Bits — Kay Lousberg (kaylousberg.com)
- Kenney Nature Kit — Kenney (kenney.nl), via cópias otimizadas do pacote npm `@netforge/asset-library-files`
