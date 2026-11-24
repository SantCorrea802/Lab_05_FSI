$ErrorActionPreference = 'Stop'

try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/health' -TimeoutSec 5
    if ($health.status -ne 'ok') { throw 'La API no responde con status ok.' }
} catch {
    throw 'Primero inicia la API con npm.cmd run dev:server y comprueba http://localhost:4000/health.'
}

$env:LIBROYA_LOCAL_TEST_PROXY = '1'
$env:LIBROYA_TEST_DIST_DIR = '.next-testsprite'
$env:NEXT_PUBLIC_API_URL = '/backend'

npm.cmd run build -w web
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar la web para TestSprite.' }

Write-Host 'Web de prueba lista en http://localhost:3100. Deja esta terminal abierta durante TestSprite.'
npm.cmd run start -w web -- -p 3100
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar la web de prueba en el puerto 3100.' }
