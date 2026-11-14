[CmdletBinding(SupportsShouldProcess)]
param([string]$GameRoot)
$ErrorActionPreference = 'Stop'
function FileHash([string]$FilePath) {
    $stream = [IO.File]::OpenRead($FilePath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
}
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$GameRoot) { $GameRoot = Read-Host 'Paste the PBZ game folder (Steam > Manage > Browse local files)' }
$game = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $GameRoot.Trim('"')).ProviderPath).TrimEnd('\')
if (!(Test-Path -LiteralPath (Join-Path $game 'platform\steam\PBZ.exe')) -or !(Test-Path -LiteralPath (Join-Path $game 'ProjectPBZ'))) {
    throw 'Choose the Steam PBZ root containing ProjectPBZ and platform\steam\PBZ.exe.'
}
if (Get-Process PBZ -ErrorAction SilentlyContinue) { throw 'Exit PBZ before installing.' }
$ready = Join-Path $root 'ready-to-install'
$manifest = Get-Content -LiteralPath (Join-Path $ready 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$plan = @()
foreach ($entry in $manifest.files.PSObject.Properties) {
    if ($entry.Name -notmatch '^pbz-attack-alerts/[^/\\]+$' -or $entry.Name.Contains('..')) { throw 'Invalid package path' }
    $source = Join-Path $ready $entry.Name
    if ((FileHash $source) -ne $entry.Value) { throw ('Package checksum mismatch: ' + $entry.Name) }
    $plan += [pscustomobject]@{ source=$source; path=('ProjectPBZ/PBZModLoader/mods/' + $entry.Name); hash=$entry.Value }
}
$mod = Join-Path $game 'ProjectPBZ\PBZModLoader\mods\pbz-attack-alerts'
if (Test-Path -LiteralPath (Join-Path $mod 'main.ts')) { throw 'Move the old main.ts out of the MOD folder first; it overrides main.js.' }
if (Test-Path -LiteralPath (Join-Path $mod 'main.js')) {
    if ((Get-Content -LiteralPath (Join-Path $mod 'main.js') -Raw) -notmatch 'pbz-attack-alerts') { throw 'MOD folder contains an unrelated main.js; refusing to overwrite.' }
}
$loader = Join-Path $game 'ProjectPBZ\Content\JavaScript\PBZModLoader'
$proxyNames = @('version.dll','hid.dll','winmm.dll','dsound.dll','dxgi.dll')
$hasProxy = @($proxyNames | Where-Object { Test-Path -LiteralPath (Join-Path $game ('platform\steam\' + $_)) }).Count -gt 0
$hasLoader = $hasProxy -and (Test-Path -LiteralPath (Join-Path $loader 'bootstrap.js')) -and (Test-Path -LiteralPath (Join-Path $loader 'manager.js'))
if (!$hasLoader) {
    if ($hasProxy) { throw 'An existing DLL proxy may belong to another tool. Install PBZModLoader manually first; no DLL was replaced.' }
    $dependency = (Get-Content -LiteralPath (Join-Path $root 'dependencies.json') -Raw | ConvertFrom-Json).loader
    if ($WhatIfPreference) { Write-Output ('Would download verified PBZModLoader ' + $dependency.version) }
    else {
        $cache = Join-Path $root '.cache'
        New-Item -ItemType Directory -Path $cache -Force | Out-Null
        $archive = Join-Path $cache ('PBZModLoader-' + $dependency.version + '.zip')
        if (!(Test-Path -LiteralPath $archive)) {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Write-Output ('Downloading official PBZModLoader ' + $dependency.version + '...')
            $client = New-Object Net.WebClient
            try { $client.DownloadFile($dependency.url,$archive) } finally { $client.Dispose() }
        }
        if ((FileHash $archive) -ne $dependency.sha256) { throw 'Loader download checksum mismatch' }
        $unpack = Join-Path $cache ([guid]::NewGuid().ToString())
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [IO.Compression.ZipFile]::ExtractToDirectory($archive,$unpack)
        foreach ($file in Get-ChildItem -LiteralPath $unpack -Recurse -File) {
            $relative = $file.FullName.Substring($unpack.Length + 1).Replace('\','/')
            if ($relative -notlike 'ProjectPBZ/*' -and $relative -ne 'platform/steam/version.dll') { continue }
            if ($relative -eq 'ProjectPBZ/PBZModLoader/mods.ini' -and (Test-Path -LiteralPath (Join-Path $game $relative))) { continue }
            $plan += [pscustomobject]@{ source=$file.FullName; path=$relative; hash=(FileHash $file.FullName) }
        }
    }
}
# Validate all destination paths before writing any file. Do not follow redirected folders.
foreach ($item in $plan) {
    $destination = [IO.Path]::GetFullPath((Join-Path $game $item.path))
    if (!$destination.StartsWith($game + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Destination escaped game folder' }
    $ancestor = $destination
    while ($ancestor.Length -gt $game.Length) {
        if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw ('Refusing redirected destination: ' + $ancestor) }
        $ancestor = Split-Path -Parent $ancestor
    }
}
$backup = Join-Path $game ('ProjectPBZ\PBZModLoader\attack-alerts-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
foreach ($item in $plan) {
    $destination = Join-Path $game $item.path
    if ((Test-Path -LiteralPath $destination) -and (FileHash $destination) -eq $item.hash) { continue }
    if (!$PSCmdlet.ShouldProcess($destination,'Back up existing file and install verified package file')) { continue }
    if (Test-Path -LiteralPath $destination) {
        $saved = Join-Path $backup $item.path
        New-Item -ItemType Directory -Path (Split-Path -Parent $saved) -Force | Out-Null
        Copy-Item -LiteralPath $destination -Destination $saved
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $item.source -Destination $destination
    if ((FileHash $destination) -ne $item.hash) { throw ('Installed checksum mismatch: ' + $item.path) }
}
if (!$WhatIfPreference) { Write-Output ('Installed PBZ Attack Alerts ' + $manifest.version + '. Launch the game from Steam. Existing settings changes are backed up if replaced.') }
