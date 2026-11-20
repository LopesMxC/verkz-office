@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title VERKZ Office - Compilador
cd /d "%~dp0"

echo.
echo  ===============================================
echo    VERKZ Office - gerar instaladores
echo  ===============================================
echo.
echo    [1] Windows   ^(compila aqui neste PC^)
echo    [2] Mac       ^(compila no GitHub, nao precisa de Mac^)
echo    [3] Os dois   ^(o Mac vai para o GitHub enquanto o Windows compila aqui^)
echo.
choice /c 123 /n /m "  Escolha 1, 2 ou 3: "
set "OPCAO=%errorlevel%"
set "FAZ_WIN="
set "FAZ_MAC="
if "%OPCAO%"=="1" set "FAZ_WIN=1"
if "%OPCAO%"=="2" set "FAZ_MAC=1"
if "%OPCAO%"=="3" set "FAZ_WIN=1"
if "%OPCAO%"=="3" set "FAZ_MAC=1"
if not defined FAZ_WIN if not defined FAZ_MAC exit /b 0
echo.

rem ---------------------------------------------------------------
rem 1) Ferramentas necessarias (instala com winget se faltar)
rem ---------------------------------------------------------------
set "FALTOU="
if defined FAZ_WIN call :ferramentas_windows
if defined FAZ_MAC call :ferramentas_github

if defined FALTOU (
  echo.
  echo  Instalei o que faltava. FECHE esta janela e rode o compilador.bat de novo.
  echo.
  pause
  exit /b 0
)
if defined FAZ_WIN echo [ok] Node, Rust e ferramentas de C++ prontos.
if defined FAZ_MAC echo [ok] Git e GitHub CLI prontos.

rem ---------------------------------------------------------------
rem 2) Configuracao (endereco do servidor e chaves opcionais)
rem ---------------------------------------------------------------
if exist "compilador.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("compilador.env") do set "%%a=%%b"
  echo [ok] Configuracao lida de compilador.env
)

if not defined VITE_OFFICE_SERVER (
  echo.
  set /p "DOMINIO=Dominio do escritorio (ex.: office.verkzcompany.com.br): "
  if "!DOMINIO!"=="" (
    echo Sem dominio, o app vai abrir apontando para ws://localhost:8080/ws
  ) else (
    set "VITE_OFFICE_SERVER=wss://!DOMINIO!/ws"
    >>"compilador.env" echo VITE_OFFICE_SERVER=wss://!DOMINIO!/ws
    echo [ok] Salvo em compilador.env para as proximas vezes.
  )
)
echo     Servidor: %VITE_OFFICE_SERVER%
if defined VERKZ_GOOGLE_CLIENT_ID (echo     Google: chave embutida) else (echo     Google: sem chave ^(pode configurar dentro do app^))
if defined VERKZ_SPOTIFY_CLIENT_ID (echo     Spotify: chave embutida) else (echo     Spotify: sem chave ^(pode configurar dentro do app^))

rem ---------------------------------------------------------------
rem 3) Compilar (o Mac sai primeiro para o GitHub trabalhar em paralelo)
rem ---------------------------------------------------------------
set "MAC_FALHOU="
if defined FAZ_MAC (
  call :mac_pedir
  if errorlevel 1 set "MAC_FALHOU=1"
)
if defined FAZ_WIN (
  call :windows_compilar
  if errorlevel 1 goto :erro
)
if defined MAC_FALHOU goto :erro_mac
if defined FAZ_MAC (
  call :mac_baixar
  if errorlevel 1 goto :erro_mac
)

echo.
echo  ===============================================
echo    Pronto! Instaladores em: %CD%\instaladores
echo  ===============================================
explorer "instaladores"
pause
exit /b 0

:erro
echo.
echo  [ERRO] A compilacao falhou. Role a janela para cima para ver o motivo.
echo  Dica: rode de novo; se persistir, mande o texto do erro para o Claude.
pause
exit /b 1

:erro_mac
echo.
echo  [ERRO] O instalador do Mac nao ficou pronto. Role a janela para cima para ver o motivo.
if defined RUN_URL echo  Detalhes do build no GitHub: %RUN_URL%
if exist "instaladores\*.exe" echo  O instalador do Windows esta em: %CD%\instaladores
echo  Dica: rode de novo; se persistir, mande o texto do erro para o Claude.
pause
exit /b 1


rem ===============================================================
rem Sub-rotinas
rem ===============================================================

:ferramentas_windows
where node >nul 2>nul
if errorlevel 1 (
  echo [..] Node.js nao encontrado. Instalando...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  set "FALTOU=1"
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [..] Rust nao encontrado. Instalando...
  winget install -e --id Rustlang.Rustup --accept-source-agreements --accept-package-agreements
  set "FALTOU=1"
)

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "TEMVC="
if exist "%VSWHERE%" (
  for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "TEMVC=%%i"
)
if not defined TEMVC (
  echo [..] Ferramentas de C++ da Microsoft nao encontradas. Instalando ^(demora alguns minutos^)...
  winget install -e --id Microsoft.VisualStudio.2022.BuildTools --accept-source-agreements --accept-package-agreements --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  set "FALTOU=1"
)
exit /b 0

:ferramentas_github
where git >nul 2>nul
if errorlevel 1 (
  echo [..] Git nao encontrado. Instalando...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
  set "FALTOU=1"
)

where gh >nul 2>nul
if errorlevel 1 (
  echo [..] GitHub CLI nao encontrado. Instalando...
  winget install -e --id GitHub.cli --accept-source-agreements --accept-package-agreements
  set "FALTOU=1"
)
exit /b 0

:windows_compilar
echo.
echo [..] Instalando dependencias do app...
pushd app
call npm ci
if errorlevel 1 call npm install
if errorlevel 1 (popd & exit /b 1)

echo.
echo [..] Compilando o Windows ^(a primeira vez leva de 5 a 15 minutos^)...
call npx tauri build --bundles nsis
if errorlevel 1 (popd & exit /b 1)
popd

if not exist "instaladores" mkdir "instaladores"
copy /y "app\src-tauri\target\release\bundle\nsis\*.exe" "instaladores\" >nul
echo [ok] Instalador do Windows pronto.
exit /b 0

rem ---------------------------------------------------------------
rem Mac pelo GitHub: envia o codigo, pede o build e depois baixa o .dmg
rem ---------------------------------------------------------------
:mac_pedir
echo.
echo [..] Conectando no GitHub...
gh auth status >nul 2>nul
if errorlevel 1 (
  echo     Vai abrir o navegador para voce entrar na sua conta do GitHub.
  echo     Copie o codigo que aparecer aqui e cole na pagina.
  gh auth login --hostname github.com --git-protocol https --web --scopes workflow
  if errorlevel 1 exit /b 1
)
gh auth setup-git >nul 2>nul
set "GHUSER="
for /f "usebackq delims=" %%u in (`gh api user --jq .login`) do set "GHUSER=%%u"
if not defined GHUSER (
  echo [ERRO] Nao consegui ler seu usuario do GitHub.
  exit /b 1
)
echo [ok] Conta do GitHub: %GHUSER%

rem Repositorio local e identidade dos commits
if not exist ".git" git init -q -b main
git config user.name >nul 2>nul
if errorlevel 1 git config user.name "%GHUSER%"
git config user.email >nul 2>nul
if errorlevel 1 git config user.email "%GHUSER%@users.noreply.github.com"

rem Repositorio privado no GitHub (cria na primeira vez)
set "REMOTO="
for /f "usebackq delims=" %%r in (`git remote get-url origin 2^>nul`) do set "REMOTO=%%r"
if not defined REMOTO (
  gh repo view "%GHUSER%/verkz-office" >nul 2>nul
  if errorlevel 1 (
    echo [..] Criando o repositorio privado %GHUSER%/verkz-office no GitHub...
    gh repo create verkz-office --private --description "VERKZ Office" >nul
    if errorlevel 1 exit /b 1
  )
  git remote add origin "https://github.com/%GHUSER%/verkz-office.git"
)

rem Envia o codigo atual
git add -A
git diff --cached --quiet
if errorlevel 1 git commit -q -m "Atualizacao para gerar os instaladores"
set "RAMO="
for /f "usebackq delims=" %%b in (`git branch --show-current`) do set "RAMO=%%b"
if not defined RAMO set "RAMO=main"
rem Se o GitHub tem commits que esta pasta nao tem, junta os dois (vale o que esta nesta pasta)
git ls-remote --exit-code --heads origin %RAMO% >nul 2>nul
if not errorlevel 1 (
  git pull -q --rebase -X theirs origin %RAMO%
  if errorlevel 1 (
    git rebase --abort >nul 2>nul
    echo [ERRO] Nao consegui juntar esta pasta com o que ja esta no GitHub.
    exit /b 1
  )
)
echo [..] Enviando o codigo para o GitHub...
git push -q -u origin %RAMO%
if errorlevel 1 (
  echo [ERRO] Nao consegui enviar o codigo para o GitHub. Veja a mensagem acima.
  exit /b 1
)

rem Endereco do servidor e chaves vao para o GitHub (os segredos ficam escondidos la)
if defined VITE_OFFICE_SERVER (
  gh variable set OFFICE_SERVER --body "%VITE_OFFICE_SERVER%" >nul
  if errorlevel 1 exit /b 1
) else (
  echo     Aviso: sem dominio, o app do Mac vai abrir apontando para localhost.
)
if defined VERKZ_GOOGLE_CLIENT_ID gh secret set VERKZ_GOOGLE_CLIENT_ID --body "%VERKZ_GOOGLE_CLIENT_ID%" >nul || exit /b 1
if defined VERKZ_GOOGLE_CLIENT_SECRET gh secret set VERKZ_GOOGLE_CLIENT_SECRET --body "%VERKZ_GOOGLE_CLIENT_SECRET%" >nul || exit /b 1
if defined VERKZ_SPOTIFY_CLIENT_ID gh secret set VERKZ_SPOTIFY_CLIENT_ID --body "%VERKZ_SPOTIFY_CLIENT_ID%" >nul || exit /b 1

rem Pede o build so do Mac (guarda o ultimo build antes, para achar o novo depois)
set "ANTES="
for /f "usebackq delims=" %%i in (`gh run list --workflow build.yml --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId" 2^>nul`) do set "ANTES=%%i"
echo [..] Pedindo o build do Mac no GitHub...
set /a TENTATIVA=0
:mac_disparar
set /a TENTATIVA+=1
gh workflow run build.yml --ref %RAMO% -f plataforma=mac >nul 2>nul
if not errorlevel 1 goto :mac_achar
if %TENTATIVA% GEQ 6 (
  echo [ERRO] O GitHub nao aceitou o pedido de build. Resposta do GitHub:
  gh workflow run build.yml --ref %RAMO% -f plataforma=mac
  exit /b 1
)
timeout /t 10 /nobreak >nul
goto :mac_disparar

:mac_achar
set "RUNID="
set /a TENTATIVA=0
:mac_achar_loop
set /a TENTATIVA+=1
timeout /t 5 /nobreak >nul
set "ULTIMO="
for /f "usebackq delims=" %%i in (`gh run list --workflow build.yml --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId" 2^>nul`) do set "ULTIMO=%%i"
if defined ULTIMO if not "%ULTIMO%"=="%ANTES%" if not "%ULTIMO%"=="null" set "RUNID=%ULTIMO%"
if defined RUNID goto :mac_achou
if %TENTATIVA% GEQ 24 (
  echo [ERRO] Pedi o build, mas nao encontrei ele no GitHub.
  exit /b 1
)
goto :mac_achar_loop

:mac_achou
set "RUN_URL="
for /f "usebackq delims=" %%u in (`gh run view %RUNID% --json url --jq .url`) do set "RUN_URL=%%u"
echo [ok] Build do Mac rodando no GitHub. Acompanhe em:
echo     %RUN_URL%
exit /b 0

:mac_baixar
echo.
echo [..] Esperando o GitHub terminar o Mac ^(a primeira vez leva uns 15 a 20 minutos^)...
gh run watch %RUNID% --exit-status --interval 30
if errorlevel 1 (
  echo [ERRO] O build do Mac falhou no GitHub.
  exit /b 1
)
if not exist "instaladores" mkdir "instaladores"
set "PASTA_MAC=%CD%\instaladores\_download_mac"
if exist "%PASTA_MAC%" rmdir /s /q "%PASTA_MAC%"
gh run download %RUNID% -n verkz-office-mac -D "%PASTA_MAC%"
if errorlevel 1 exit /b 1
del /q "instaladores\*.dmg" 2>nul
for /r "%PASTA_MAC%" %%f in (*.dmg) do copy /y "%%f" "instaladores\" >nul
rmdir /s /q "%PASTA_MAC%"
if not exist "instaladores\*.dmg" (
  echo [ERRO] O GitHub terminou, mas o .dmg nao veio no download.
  exit /b 1
)
echo [ok] Instalador do Mac pronto.
exit /b 0