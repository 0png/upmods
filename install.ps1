#requires -Version 5.1

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $node) {
        throw 'Node.js 20 or newer is required. Install it from https://nodejs.org/ and run this command again.'
    }

    $nodeVersion = (& $node.Source --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(?<major>\d+)\.') {
        throw "Could not determine the installed Node.js version: $nodeVersion"
    }

    if ([int]$Matches.major -lt 20) {
        throw "upmods requires Node.js 20 or newer; found $nodeVersion. Update Node.js at https://nodejs.org/."
    }

    $npmName = if ($env:OS -eq 'Windows_NT') { 'npm.cmd' } else { 'npm' }
    $npm = Get-Command $npmName -ErrorAction SilentlyContinue
    if ($null -eq $npm) {
        throw 'npm was not found. Reinstall Node.js from https://nodejs.org/ and run this command again.'
    }

    Write-Host "Installing upmods with $nodeVersion..." -ForegroundColor Cyan
    & $npm.Source install --global upmods@latest
    if ($LASTEXITCODE -ne 0) {
        throw 'npm could not install upmods. Review the npm error above, then run the installer again.'
    }

    $upmodsName = if ($env:OS -eq 'Windows_NT') { 'upmods.cmd' } else { 'upmods' }
    $upmods = Get-Command $upmodsName -ErrorAction SilentlyContinue
    if ($null -eq $upmods) {
        throw 'upmods was installed, but its executable is not on PATH. Restart your terminal and run upmods --version.'
    }

    $installedVersion = (& $upmods.Source --version).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'upmods was installed, but its version check failed. Restart your terminal and run upmods --version.'
    }

    Write-Host "upmods $installedVersion is ready." -ForegroundColor Green
    Write-Host 'Enter a Minecraft instance or mods directory, then run: upmods'
}
catch {
    throw "upmods installation failed: $($_.Exception.Message)"
}
