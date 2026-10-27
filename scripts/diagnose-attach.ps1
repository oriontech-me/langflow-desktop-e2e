<#
.SYNOPSIS
  Checks two things msedgedriver's own launch can't tell apart:
   1. Does the app's WebView2 drop WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS as a whole when given msedgedriver's
      full switch list, but honour a minimal --remote-debugging-port?
   2. Can msedgedriver attach (ms:edgeOptions.debuggerAddress) to an app we launched ourselves and find the
      first-boot "Agree" button?
#>
param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [int]$DebugPort = 9222
)

$ErrorActionPreference = 'Continue'

function Stop-App {
  Get-Process | Where-Object { $_.ProcessName -match 'Langflow|python|uv|msedgedriver' } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
}

function Show-BrowserArgs {
  Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" |
    Where-Object { $_.CommandLine -match '--embedded-browser-webview=1' -and $_.CommandLine -notmatch '--type=' } |
    ForEach-Object { $_.CommandLine -replace '--mojo-named-platform-channel-pipe=\S+', '' }
}

function Start-AppWithArgs([string]$browserArgs) {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $browserArgs
  $p = Start-Process -FilePath $ExePath -PassThru
  Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
  Start-Sleep -Seconds 15
  return $p
}

$driverArgs = '--allow-pre-commit-input --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-client-side-phishing-detection --disable-default-apps --disable-features=IgnoreDuplicateNavs,Prewarm --disable-hang-monitor --disable-popup-blocking --disable-prompt-on-repost --disable-sync --enable-automation --enable-logging --log-level=0 --no-first-run --no-service-autorun --password-store=basic --remote-debugging-port=0 --test-type=webdriver --use-mock-keychain'

Write-Output '=== A. msedgedriver full switch list'
Stop-App
$null = Start-AppWithArgs $driverArgs
Show-BrowserArgs

Write-Output "=== B. only --remote-debugging-port=$DebugPort"
Stop-App
$null = Start-AppWithArgs "--remote-debugging-port=$DebugPort"
Show-BrowserArgs
try {
  $ver = Invoke-RestMethod "http://127.0.0.1:$DebugPort/json/version" -TimeoutSec 5
  Write-Output "CDP up: $($ver.Browser)"
} catch {
  Write-Output "CDP not reachable on ${DebugPort}: $($_.Exception.Message)"
}

Write-Output '=== C. msedgedriver attach via debuggerAddress'
$driver = Get-ChildItem (Join-Path $env:TEMP 'msedgedriver') -Recurse -Filter msedgedriver.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$drv = Start-Process $driver.FullName -ArgumentList '--port=9515' -PassThru
Start-Sleep -Seconds 2
$caps = @{ capabilities = @{ alwaysMatch = @{ browserName = 'webview2'; 'ms:edgeOptions' = @{ debuggerAddress = "127.0.0.1:$DebugPort" } } } } |
  ConvertTo-Json -Depth 6
try {
  $s = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:9515/session' -Body $caps -ContentType 'application/json' -TimeoutSec 60
  $sid = $s.value.sessionId
  Write-Output "Session: $sid"
  Write-Output "Title: $((Invoke-RestMethod "http://127.0.0.1:9515/session/$sid/title").value)"
  Write-Output "URL: $((Invoke-RestMethod "http://127.0.0.1:9515/session/$sid/url").value)"
  $find = @{ using = 'css selector'; value = '[data-testid="terms-agree-button"]' } | ConvertTo-Json
  Start-Sleep -Seconds 5
  $el = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:9515/session/$sid/element" -Body $find -ContentType 'application/json'
  $elId = $el.value.PSObject.Properties.Value | Select-Object -First 1
  Write-Output "Agree button text: $((Invoke-RestMethod "http://127.0.0.1:9515/session/$sid/element/$elId/text").value)"
} catch {
  Write-Output "ATTACH ERROR: $($_.Exception.Message) $($_.ErrorDetails.Message)"
}

Stop-Process -Id $drv.Id -Force -ErrorAction SilentlyContinue
Stop-App
