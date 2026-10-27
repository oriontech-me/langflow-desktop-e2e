<#
.SYNOPSIS
  Silently installs a Langflow Desktop MSI and prints the path of the installed executable.

.EXAMPLE
  $exe = ./scripts/install-langflow-desktop.ps1 -MsiPath ./artifacts/Langflow_1.13.0_x64_en-US.msi
#>
param(
  [Parameter(Mandatory = $true)][string]$MsiPath,
  [string]$LogPath = "test-results/msi-install.log"
)

$ErrorActionPreference = 'Stop'

$msi = Resolve-Path $MsiPath
New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null

$proc = Start-Process msiexec.exe -Wait -PassThru -ArgumentList @('/i', "`"$msi`"", '/qn', '/norestart', '/l*v', "`"$LogPath`"")
# 3010 = success, reboot required
if ($proc.ExitCode -notin 0, 3010) {
  throw "msiexec failed with exit code $($proc.ExitCode); see $LogPath"
}

# productName/mainBinaryName are "Langflow " (trailing space), so locate the exe instead of hardcoding it.
$roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, (Join-Path $env:LOCALAPPDATA 'Programs')) | Where-Object { $_ }
$exe = Get-ChildItem -Path $roots -Directory -Filter 'Langflow*' -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Filter 'Langflow*.exe' -File } |
  Where-Object { $_.Name -notmatch 'uninstall' } |
  Select-Object -First 1

if (-not $exe) {
  throw "Langflow Desktop executable not found under: $($roots -join ', ')"
}

Write-Output $exe.FullName
