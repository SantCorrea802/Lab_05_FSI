$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    Write-Host 'Desplegando correccion de captura en libroya-api...'
    & railway.cmd up --service libroya-api --environment production --yes --ci
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo desplegar libroya-api. No se intento desplegar la web.' }

    Write-Host 'Desplegando opcion de verificar pago en libroya-web...'
    & railway.cmd up --service libroya-web --environment production --yes --ci
    if ($LASTEXITCODE -ne 0) { throw 'La API se desplego, pero la web no. Vuelve a ejecutar este script.' }

    Write-Host 'Se enviaron ambos despliegues. Comprueba el estado antes de reintentar el pago.'
    & railway.cmd status
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el estado de Railway.' }
}
finally {
    Pop-Location
}
