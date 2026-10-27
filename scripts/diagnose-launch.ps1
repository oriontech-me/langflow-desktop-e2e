<#
.SYNOPSIS
  Launches Langflow Desktop directly (no WebDriver) and reports whether the app and its WebView2 come up.
  Separates "the app cannot start here" from "the driver cannot attach to it".
#>
param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [int]$WaitSeconds = 45
)

$ErrorActionPreference = 'Continue'

Write-Output "Exe path: [$ExePath]"
Write-Output "Exists (literal): $(Test-Path -LiteralPath $ExePath)"
try {
  $short = (New-Object -ComObject Scripting.FileSystemObject).GetFile($ExePath).ShortPath
  Write-Output "8.3 short path: [$short]"
} catch {
  Write-Output "8.3 short path: unavailable ($($_.Exception.Message))"
}

$proc = Start-Process -FilePath $ExePath -PassThru
Write-Output "Started PID $($proc.Id)"
Start-Sleep -Seconds $WaitSeconds

$proc.Refresh()
Write-Output "Exited: $($proc.HasExited)$(if ($proc.HasExited) { " (code $($proc.ExitCode))" })"
Get-Process | Where-Object { $_.ProcessName -match 'Langflow|msedgewebview2|python|uv' } |
  Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize | Out-String | Write-Output
Write-Output "Port 7860 listening: $([bool](Get-NetTCPConnection -LocalPort 7860 -State Listen -ErrorAction SilentlyContinue))"

$appLog = Join-Path $env:LOCALAPPDATA 'com.LangflowDesktop\logs\langflow.log'
if (Test-Path -LiteralPath $appLog) {
  Write-Output "--- tail $appLog"
  Get-Content -LiteralPath $appLog -Tail 60
} else {
  Write-Output "No app log at $appLog"
}

Get-Process | Where-Object { $_.ProcessName -match 'Langflow|python|uv' } | Stop-Process -Force -ErrorAction SilentlyContinue
# Let the backend release port 7860 and the sentinel files settle before the real run.
Start-Sleep -Seconds 5
