$ErrorActionPreference = 'Stop'

$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'server/.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'No se encontro server/.env.'
}

function Read-PrivateText([string]$prompt) {
    Write-Host $prompt
    Write-Host 'Cuando hayas pulsado el icono de copiar en PayPal, vuelve aqui y presiona Enter. No escribas ni pegues el valor.'
    do {
        $key = [Console]::ReadKey($true)
    } while ($key.Key -ne [ConsoleKey]::Enter)
    try {
        $clipboardText = Get-Clipboard -Raw
        if ([string]::IsNullOrWhiteSpace($clipboardText)) {
            throw 'El portapapeles esta vacio. Vuelve a copiar el valor desde PayPal.'
        }
        $value = $clipboardText.Trim()
        return $value
    }
    finally {
        try {
            Set-Clipboard -Value ' '
        }
        catch {
            Write-Warning 'No se pudo limpiar el portapapeles. Copia cualquier texto no sensible para reemplazar su contenido.'
        }
    }
}

$clientId = Read-PrivateText 'Copia el Client ID de LibroYa-Sandbox con el icono de copiar.'
$clientSecret = Read-PrivateText 'Copia Secret key 1 de la misma app con su icono de copiar; no uses la contrasena de la cuenta Sandbox.'
if ($clientId.Length -lt 20 -or $clientSecret.Length -lt 20 -or $clientId -notmatch '^\S+$' -or $clientSecret -notmatch '^\S+$') {
    throw 'Client ID o Secret incompleto. Deben tener al menos 20 caracteres y no incluir espacios. No se guardo nada.'
}

$content = [IO.File]::ReadAllText($envPath)
$values = @{
    PAYPAL_CLIENT_ID = $clientId
    PAYPAL_CLIENT_SECRET = $clientSecret
    PAYPAL_API_BASE = 'https://api-m.sandbox.paypal.com'
    PAYPAL_CURRENCY = 'USD'
}
foreach ($key in $values.Keys) {
    $line = "$key=$($values[$key])"
    if ($content -match "(?m)^$key=") {
        $content = [regex]::Replace($content, "(?m)^$key=.*$", [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $line })
    }
    else {
        $content = $content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
    }
}
[IO.File]::WriteAllText($envPath, $content, [Text.UTF8Encoding]::new($false))
$clientId = $null
$clientSecret = $null
Write-Host 'Credenciales Sandbox guardadas en server/.env. Reinicia la API para aplicarlas.'
