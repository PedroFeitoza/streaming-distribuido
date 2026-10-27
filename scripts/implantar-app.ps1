# Implanta a aplicacao nos nos, um de cada vez: enquanto um reinicia, o Nginx
# manda o trafego para o outro e o site nao sai do ar.
# Rodar no Windows, de uma maquina que alcance a rede 192.168.56.0/24:
#   powershell -ExecutionPolicy Bypass -File scripts\implantar-app.ps1
# So um no:
#   powershell -ExecutionPolicy Bypass -File scripts\implantar-app.ps1 -Nos 192.168.56.11
# Pede a senha do sdadmin no ssh/scp (se nao houver chave) e a do sudo em cada no.
param([string[]]$Nos = @('192.168.56.11', '192.168.56.12'))

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$arquivos = @('app/server.js', 'app/package.json', 'app/package-lock.json',
              'app/views', 'scripts/implantar-app.sh')

foreach ($no in $Nos) {
    Write-Host "=== $no ===" -ForegroundColor Cyan

    ssh "sdadmin@$no" 'rm -rf streaming-novo && mkdir streaming-novo'
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel preparar a pasta em $no" }

    scp -r $arquivos "sdadmin@${no}:streaming-novo/"
    if ($LASTEXITCODE -ne 0) { throw "Falha ao copiar os arquivos para $no" }

    ssh -t "sdadmin@$no" 'sudo bash streaming-novo/implantar-app.sh'
    if ($LASTEXITCODE -ne 0) { throw "A implantacao falhou em $no. Os nos seguintes nao foram alterados." }
}

Write-Host "Pronto. Teste pelo balanceador: http://192.168.56.10/" -ForegroundColor Green
