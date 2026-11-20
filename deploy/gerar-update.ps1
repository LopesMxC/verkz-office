# Monta a pasta "update" com o latest.json que o app consulta em
# https://verkzsystem.tech/apps/verkz-office/latest.json
# Uso: powershell -File deploy\gerar-update.ps1 -Pasta instaladores
param([string]$Pasta = "instaladores", [string]$Base = "https://verkzsystem.tech/apps/verkz-office")

$ErrorActionPreference = "Stop"
$conf = Get-Content (Join-Path $PSScriptRoot "..\app\src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$versao = $conf.version
$saida = Join-Path $Pasta "update"
if (Test-Path $saida) { Remove-Item $saida -Recurse -Force }
New-Item -ItemType Directory $saida | Out-Null

$plataformas = @{}
function Adicionar($arquivo, $chaves) {
  $sig = "$($arquivo.FullName).sig"
  if (-not (Test-Path $sig)) { Write-Host "   sem assinatura para $($arquivo.Name), pulei"; return }
  $nome = $arquivo.Name -replace ' ', '_'
  Copy-Item $arquivo.FullName (Join-Path $saida $nome)
  $assinatura = (Get-Content $sig -Raw).Trim()
  foreach ($k in $chaves) { $script:plataformas[$k] = @{ signature = $assinatura; url = "$Base/$nome" } }
}

$exe = Get-ChildItem $Pasta -Filter "*_$versao*setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($exe) { Adicionar $exe @("windows-x86_64") }
$mac = Get-ChildItem $Pasta -Filter "*.app.tar.gz" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($mac) { Adicionar $mac @("darwin-aarch64", "darwin-x86_64") }

if ($plataformas.Count -eq 0) { Write-Host "[!] Nenhum instalador assinado encontrado; latest.json nao foi gerado."; exit 0 }

$json = [ordered]@{
  version  = $versao
  notes    = "VERKZ Office $versao"
  pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = $plataformas
}
$json | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $saida "latest.json") -Encoding UTF8
Write-Host "[ok] Atualizacao $versao pronta em $saida (suba tudo para $Base/)"
