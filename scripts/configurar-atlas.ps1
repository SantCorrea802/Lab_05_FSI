$ErrorActionPreference = 'Stop'

$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'server/.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'No se encontro server/.env. Copialo desde server/.env.example.'
}

function Read-PrivateText([string]$prompt) {
    $secure = Read-Host $prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secure.Dispose()
    }
}

$atlasString = Read-PrivateText 'Pega la cadena de Atlas; la entrada no se mostrara'
$connectionMatch = [regex]::Match($atlasString.Trim(), '(?i)^(?<scheme>mongodb(?:\+srv)?)://(?:[^/\s]*@)?(?<hosts>[a-z0-9.,:-]+)(?:/[^?\s]*)?(?<query>\?[^\s]*)?$')
$atlasString = $null
if (-not $connectionMatch.Success) {
    throw 'No se reconocio la cadena de Atlas. Debe empezar por mongodb:// o mongodb+srv://.'
}
$scheme = $connectionMatch.Groups['scheme'].Value.ToLowerInvariant()
$clusterHosts = $connectionMatch.Groups['hosts'].Value
foreach ($node in $clusterHosts.Split(',')) {
    if ($node -notmatch '^[a-z0-9.-]+\.mongodb\.net(?::[0-9]+)?$') {
        throw 'La cadena debe apuntar a servidores de Atlas bajo mongodb.net.'
    }
}
$options = $connectionMatch.Groups['query'].Value.TrimStart('?')
$connectionMatch = $null
if ($options -notmatch '(^|&)authSource=') {
    $options = if ($options) { "$options&authSource=admin" } else { 'authSource=admin' }
}
if ($scheme -eq 'mongodb' -and $options -notmatch '(^|&)(tls|ssl)=') {
    $options += '&tls=true'
}

$plainPassword = Read-PrivateText 'Contrasena del usuario libroya_app; la entrada no se mostrara'
$encodedPassword = [Uri]::EscapeDataString($plainPassword)
$plainPassword = $null
$uri = "${scheme}://libroya_app:$encodedPassword@$clusterHosts/libroya?$options"

$content = [IO.File]::ReadAllText($envPath)
$line = "MONGODB_URI=$uri"
if ($content -match '(?m)^MONGODB_URI=') {
    $content = [regex]::Replace($content, '(?m)^MONGODB_URI=.*$', [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $line })
}
else {
    $content = $content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
}
[IO.File]::WriteAllText($envPath, $content, [Text.UTF8Encoding]::new($false))
$uri = $null
$encodedPassword = $null
Write-Host 'Conexion de Atlas guardada en server/.env. No compartas ese archivo.'
