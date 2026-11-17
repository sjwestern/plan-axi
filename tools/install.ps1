# Install the tools listed in a manifest from their pinned refs.
# Usage: install.ps1 [-Manifest <file>] [-Src <dir>] [-Only <name>,...]
param(
    [string]$Manifest = (Join-Path $PSScriptRoot 'tools.manifest'),
    [string]$Src = $(if ($env:TOOLS_SRC) { $env:TOOLS_SRC } else { Join-Path $env:LOCALAPPDATA 'orch-tools' }),
    [string[]]$Only = @()
)
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Exe, [string[]]$Arguments)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') failed" }
}

# Clone (or update) a repo into $Src\<name> and check out <ref>. Returns the directory.
function Get-Checkout {
    param([string]$Name, [string]$Url, [string]$Ref)
    $dir = Join-Path $Src $Name
    if (Test-Path (Join-Path $dir '.git')) {
        Invoke-Checked git @('-C', $dir, 'fetch', '--tags', '--quiet', 'origin')
    } else {
        Invoke-Checked git @('clone', '--quiet', $Url, $dir)
    }
    Invoke-Checked git @('-C', $dir, 'checkout', '--quiet', $Ref)
    git -C $dir show-ref --verify --quiet "refs/remotes/origin/$Ref"
    if ($LASTEXITCODE -eq 0) {
        Invoke-Checked git @('-C', $dir, 'reset', '--quiet', '--hard', "origin/$Ref")
    }
    return $dir
}

if (-not (Test-Path $Manifest)) { throw "manifest not found: $Manifest" }
New-Item -ItemType Directory -Force -Path $Src | Out-Null

foreach ($line in Get-Content $Manifest) {
    $text = $line.Trim()
    if ($text -eq '' -or $text.StartsWith('#')) { continue }
    $f = $text -split '\s+'
    if ($f.Count -ne 4) { throw "bad manifest line: expected <name> <kind> <source> <ref>: $text" }
    $name, $kind, $source, $ref = $f
    if ($Only.Count -gt 0 -and $Only -notcontains $name) { continue }
    Write-Host "==> $name ($kind $ref)"
    switch ($kind) {
        'git-npm' {
            $dir = Get-Checkout $name $source $ref
            Push-Location $dir
            try {
                Invoke-Checked npm @('install', '--no-audit', '--no-fund')
                Invoke-Checked npm @('run', 'build')
                foreach ($pkg in Get-ChildItem packages -Directory) {
                    Push-Location $pkg.FullName
                    try { Invoke-Checked npm @('link') } finally { Pop-Location }
                }
                Invoke-Checked npm @('run', 'skills:install')
            } finally { Pop-Location }
        }
        'npm' { Invoke-Checked npm @('install', '-g', "$source@$ref") }
        'git-dotnet' {
            $dir = Get-Checkout $name $source $ref
            Invoke-Checked powershell @('-NoProfile', '-File', (Join-Path $dir 'scripts/install.ps1'))
        }
        default { throw "unknown kind '$kind' for '$name'" }
    }
}
Write-Host 'done'
