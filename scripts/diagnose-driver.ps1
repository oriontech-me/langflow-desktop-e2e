<#
.SYNOPSIS
  Reproduces the session tauri-driver asks msedgedriver for, with msedgedriver in verbose mode, and
  captures the WebView2 command lines while it waits. Shows whether --remote-debugging-port reaches
  the app's WebView2 and which user-data dir msedgedriver watches for DevToolsActivePort.
#>
param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [string]$OutDir = 'test-results/driver-diagnostics'
)

$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$driver = Get-ChildItem (Join-Path $env:TEMP 'msedgedriver') -Recurse -Filter msedgedriver.exe -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $driver) { Write-Output 'msedgedriver.exe not found under %TEMP%\msedgedriver'; return }
Write-Output "msedgedriver: $($driver.FullName)"

$driverLog = Join-Path $OutDir 'msedgedriver-verbose.log'
$drv = Start-Process $driver.FullName -ArgumentList '--port=9515', '--verbose', "--log-path=$driverLog" -PassThru
Start-Sleep -Seconds 2

# Same shape tauri-driver sends on Windows.
$body = @{
  capabilities = @{
    alwaysMatch = @{
      browserName      = 'webview2'
      'ms:edgeOptions' = @{ binary = $ExePath; args = @(); webviewOptions = @{} }
    }
  }
} | ConvertTo-Json -Depth 6

$session = Start-Job -ScriptBlock {
  param($b)
  try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:9515/session' -Body $b -ContentType 'application/json' -TimeoutSec 90 | ConvertTo-Json -Depth 6 }
  catch { "SESSION ERROR: $($_.Exception.Message) $($_.ErrorDetails.Message)" }
} -ArgumentList $body

Start-Sleep -Seconds 20
Write-Output '--- process command lines while msedgedriver waits'
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match 'Langflow|msedgewebview2' } |
  ForEach-Object { "[$($_.ProcessId) <- $($_.ParentProcessId)] $($_.CommandLine)" } |
  Tee-Object -FilePath (Join-Path $OutDir 'process-cmdlines.txt')

Write-Output '--- DevToolsActivePort files on disk'
Get-ChildItem @($env:TEMP, $env:LOCALAPPDATA) -Recurse -Filter DevToolsActivePort -ErrorAction SilentlyContinue |
  ForEach-Object { "$($_.FullName): $(Get-Content -LiteralPath $_.FullName -TotalCount 1)" }

Write-Output '--- session result'
Receive-Job $session -Wait -AutoRemoveJob

Write-Output '--- msedgedriver verbose log (filtered)'
Get-Content $driverLog -ErrorAction SilentlyContinue |
  Select-String -Pattern 'Launching|binary|user-data-dir|remote-debugging|DevToolsActivePort|WEBVIEW2|webview|ERROR|SEVERE|exited|Starting' |
  Select-Object -First 80 | ForEach-Object { $_.Line }

Stop-Process -Id $drv.Id -Force -ErrorAction SilentlyContinue
Get-Process | Where-Object { $_.ProcessName -match 'Langflow|python|uv' } | Stop-Process -Force -ErrorAction SilentlyContinue
