$ErrorActionPreference = 'Stop'

& (Join-Path $PSScriptRoot 'configurar-paypal.ps1')
& node (Join-Path $PSScriptRoot 'verificar-paypal-sandbox.mjs')
if ($LASTEXITCODE -ne 0) {
    throw 'PayPal Sandbox no acepto las credenciales. No se enviaron los nuevos valores a Railway.'
}
& node (Join-Path $PSScriptRoot 'configurar-paypal-railway.mjs')
if ($LASTEXITCODE -ne 0) {
    throw 'La sincronización con Railway no terminó. Las credenciales locales permanecen en server/.env.'
}
