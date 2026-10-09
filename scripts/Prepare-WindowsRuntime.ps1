[CmdletBinding()]
param(
    [string]$Target = $(if ($env:COOLIFY_WINDOWS_RUNTIME_ROOT) { $env:COOLIFY_WINDOWS_RUNTIME_ROOT } else { 'D:\Data\runtime\coolify-mcp-server\windows' }),
    [string]$Node = $(if ($env:COOLIFY_NODE_BIN) { $env:COOLIFY_NODE_BIN } else { 'node.exe' })
)

$ErrorActionPreference = 'Stop'
$SourceRoot = Split-Path -Parent $PSScriptRoot
$ResolvedTarget = [System.IO.Path]::GetFullPath($Target)

if (Test-Path -LiteralPath $ResolvedTarget) {
    $Existing = Get-ChildItem -LiteralPath $ResolvedTarget -Force
    if ($Existing.Count -gt 0) {
        throw "Runtime target is not empty: $ResolvedTarget. Choose a new target or remove it explicitly after preserving its manifest."
    }
}

$NodeVersion = & $Node -p 'Number(process.versions.node.split(".")[0])'
if ([int]$NodeVersion -lt 20) {
    throw "Node.js 20+ is required; selected $Node reports major $NodeVersion."
}

& $Node (Join-Path $SourceRoot 'scripts\stage-runtime.mjs') $ResolvedTarget
Push-Location $ResolvedTarget
try {
    $env:npm_config_cache = Join-Path $ResolvedTarget '.npm-cache'
    & npm.cmd ci
    & npm.cmd run build
    & npm.cmd run check
}
finally {
    Pop-Location
}

Write-Host "Windows runtime ready: $ResolvedTarget"
