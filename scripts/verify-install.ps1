[CmdletBinding()]
param([string]$GameRoot)
$ErrorActionPreference = 'Stop'
# Read-only file verification. Configuration and runtime checks are deliberately separate.
function FileHash([string]$FilePath) {
    $stream = [IO.File]::OpenRead($FilePath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
}
try {
    if ([string]::IsNullOrWhiteSpace($GameRoot)) { throw 'GameRoot is required; this command never prompts.' }
    $game = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $GameRoot.Trim('"')).ProviderPath).TrimEnd('\')
    if (!(Test-Path -LiteralPath (Join-Path $game 'platform\steam\PBZ.exe') -PathType Leaf) -or
        !(Test-Path -LiteralPath (Join-Path $game 'ProjectPBZ') -PathType Container)) {
        throw 'Choose the Steam PBZ root containing ProjectPBZ and platform\steam\PBZ.exe.'
    }
    $ready = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\ready-to-install'))
    $manifest = Get-Content -LiteralPath (Join-Path $ready 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if (!$manifest.version -or !($manifest.files -is [pscustomobject]) -or
        !($manifest.files.PSObject.Properties.Name -contains 'pbz-attack-alerts/main.js')) {
        throw 'Manifest must contain a version and a main.js hash.'
    }
    $entries = @($manifest.files.PSObject.Properties)
    foreach ($entry in $entries) {
        if ($entry.Name -notmatch '^pbz-attack-alerts/[^/\\:]+$' -or $entry.Name.Contains('..') -or
            $entry.Value -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid manifest path or SHA-256.' }
    }
    $issues = @()
    $files = @()
    foreach ($entry in $entries) {
        $source = Join-Path $ready $entry.Name
        $target = Join-Path $game ('ProjectPBZ/PBZModLoader/mods/' + $entry.Name)
        $sourceHash = $null
        $targetHash = $null
        if (Test-Path -LiteralPath $source -PathType Leaf) { $sourceHash = FileHash $source }
        if (Test-Path -LiteralPath $target -PathType Leaf) { $targetHash = FileHash $target }
        $sourceMatches = $sourceHash -eq $entry.Value
        $installedMatches = $targetHash -eq $entry.Value
        if (!$sourceMatches) { $issues += ('Package file missing or changed: ' + $entry.Name) }
        if (!$installedMatches) { $issues += ('Installed file missing or changed: ' + $entry.Name) }
        $files += [pscustomobject]@{
            path=$entry.Name; expectedSha256=$entry.Value; packageMatches=$sourceMatches
            installedMatches=$installedMatches; installedSha256=$targetHash
        }
    }
    $mod = Join-Path $game 'ProjectPBZ/PBZModLoader/mods/pbz-attack-alerts'
    if (Test-Path -LiteralPath (Join-Path $mod 'main.ts')) { $issues += 'main.ts overrides the installed main.js.' }
    $loader = Join-Path $game 'ProjectPBZ/Content/JavaScript/PBZModLoader'
    $proxies = @(@('version.dll','hid.dll','winmm.dll','dsound.dll','dxgi.dll') | Where-Object {
        Test-Path -LiteralPath (Join-Path $game ('platform/steam/' + $_)) -PathType Leaf
    })
    $loaderFilesPresent = (Test-Path -LiteralPath (Join-Path $loader 'bootstrap.js') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $loader 'manager.js') -PathType Leaf) -and $proxies.Count -gt 0
    if (!$loaderFilesPresent) { $issues += 'Expected loader entry files or DLL proxy are missing.' }
    $passed = $issues.Count -eq 0
    [pscustomobject]@{
        schemaVersion=1; status=$(if ($passed) { 'files_verified' } else { 'verification_failed' })
        packageVersion=$manifest.version; gameRoot=$game; loaderFilesPresent=$loaderFilesPresent
        configurationChecked=$false; runtimeVerified=$false; files=@($files); issues=@($issues)
    } | ConvertTo-Json -Depth 6
    if ($passed) { exit 0 } else { exit 1 }
}
catch {
    [pscustomobject]@{
        schemaVersion=1; status='error'; error=$_.Exception.Message
        configurationChecked=$false; runtimeVerified=$false
    } | ConvertTo-Json -Depth 3
    exit 2
}
