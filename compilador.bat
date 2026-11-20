@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title VERKZ Office - Compilador
cd /d "%~dp0"

echo.
echo  ===============================================
echo    VERKZ Office - gerar instalador do Windows
echo  ===============================================
echo.

rem ---------------------------------------------------------------
rem 1) Ferramentas necessarias (instala com winget se faltar)
rem ---------------------------------------------------------------
set "FALTOU="

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

if defined FALTOU (
  echo.
  echo  Instalei o que faltava. FECHE esta janela e rode o compilador.bat de novo.
  echo.
  pause
  exit /b 0
)
echo [ok] Node, Rust e ferramentas de C++ prontos.

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
rem 3) Compilar
rem ---------------------------------------------------------------
echo.
echo [..] Instalando dependencias do app...
pushd app
call npm ci
if errorlevel 1 call npm install
if errorlevel 1 goto :erro

echo.
echo [..] Compilando ^(a primeira vez leva de 5 a 15 minutos^)...
call npx tauri build --bundles nsis
if errorlevel 1 goto :erro
popd

rem ---------------------------------------------------------------
rem 4) Juntar os instaladores numa pasta so
rem ---------------------------------------------------------------
if not exist "instaladores" mkdir "instaladores"
copy /y "app\src-tauri\target\release\bundle\nsis\*.exe" "instaladores\" >nul

echo.
echo  ===============================================
echo    Pronto! Instalador em: %CD%\instaladores
echo  ===============================================
explorer "instaladores"
pause
exit /b 0

:erro
popd
echo.
echo  [ERRO] A compilacao falhou. Role a janela para cima para ver o motivo.
echo  Dica: rode de novo; se persistir, mande o texto do erro para o Claude.
pause
exit /b 1
