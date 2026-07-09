[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$InstallPlugin,
  [string]$SourceRepository = (Split-Path -Parent $PSScriptRoot),
  [string]$CheckoutPath = (Join-Path $env:USERPROFILE ".agents\plugins\plugins\codex-image-editor"),
  [string]$MarketplacePath = (Join-Path $env:USERPROFILE ".agents\plugins\marketplace.json"),
  [string]$ReportPath = (Join-Path $env:USERPROFILE ".agents\plugins\reports\codex-image-editor.json")
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
  param([string]$RepositoryPath, [string[]]$Arguments)
  & git -c "safe.directory=$RepositoryPath" -C $RepositoryPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed for $RepositoryPath."
  }
}

function Get-GitOutput {
  param([string]$RepositoryPath, [string[]]$Arguments)
  $output = & git -c "safe.directory=$RepositoryPath" -C $RepositoryPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed for $RepositoryPath."
  }
  return ($output -join "`n").Trim()
}

function Test-CachebusterOnly {
  param([string]$RepositoryPath)
  $rawChanges = Get-GitOutput $RepositoryPath @("status", "--porcelain")
  $changes = @($rawChanges -split "`r?`n" | Where-Object { $_ })
  if ($changes.Count -ne 1 -or $changes[0] -notmatch "\.codex-plugin/plugin\.json$") {
    return $false
  }
  try {
    $current = Get-Content -LiteralPath (Join-Path $RepositoryPath ".codex-plugin\plugin.json") -Raw | ConvertFrom-Json
    $baseline = Get-GitOutput $RepositoryPath @("show", "HEAD:.codex-plugin/plugin.json") | ConvertFrom-Json
    if ([string]$current.version -notmatch "\+codex\.") { return $false }
    $current.version = $baseline.version
    return (($current | ConvertTo-Json -Depth 100 -Compress) -eq ($baseline | ConvertTo-Json -Depth 100 -Compress))
  } catch {
    return $false
  }
}

function Invoke-Native {
  param([string]$Command, [string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command $($Arguments -join ' ') failed."
  }
}

$sourceRoot = (Resolve-Path -LiteralPath $SourceRepository).Path
$preflightScript = Join-Path $sourceRoot "scripts\local-deploy-preflight.mjs"
$validator = Join-Path $env:USERPROFILE ".codex\skills\.system\plugin-creator\scripts\validate_plugin.py"
$cachebuster = Join-Path $env:USERPROFILE ".codex\skills\.system\plugin-creator\scripts\update_plugin_cachebuster.py"

if (-not (Test-Path -LiteralPath $preflightScript)) { throw "Missing local deployment preflight script." }
if (-not (Test-Path -LiteralPath $validator)) { throw "Missing plugin validator: $validator" }
if (-not (Test-Path -LiteralPath $cachebuster)) { throw "Missing cachebuster helper: $cachebuster" }

if (-not $Apply) {
  Invoke-Native "node" @($preflightScript, "--source", $sourceRoot, "--checkout", $CheckoutPath, "--marketplace", $MarketplacePath, "--source-only", "--report", $ReportPath)
  exit 0
}

$sourceChanges = Get-GitOutput $sourceRoot @("status", "--porcelain")
if ($sourceChanges) { throw "Source checkout is dirty. Commit or stash it before local deployment." }
$sourceRemote = Get-GitOutput $sourceRoot @("remote", "get-url", "origin")
if (-not $sourceRemote) { throw "Source checkout has no origin remote." }

if (-not (Test-Path -LiteralPath $CheckoutPath)) {
  $checkoutParent = Split-Path -Parent $CheckoutPath
  New-Item -ItemType Directory -Force -Path $checkoutParent | Out-Null
  & git clone --origin origin --branch main --single-branch $sourceRemote $CheckoutPath
  if ($LASTEXITCODE -ne 0) { throw "Initial deployment checkout clone failed." }
} else {
  $checkoutRoot = (Resolve-Path -LiteralPath $CheckoutPath).Path
  $checkoutRemote = Get-GitOutput $checkoutRoot @("remote", "get-url", "origin")
  if ($checkoutRemote -ne $sourceRemote) { throw "Deployment checkout origin does not match the source repository." }
  $checkoutChanges = Get-GitOutput $checkoutRoot @("status", "--porcelain")
  if ($checkoutChanges) {
    if (Test-CachebusterOnly $checkoutRoot) {
      Invoke-Git $checkoutRoot @("restore", "--source=HEAD", "--", ".codex-plugin/plugin.json")
    } else {
      throw "Deployment checkout has user changes and will not be overwritten."
    }
  }
  Invoke-Git $checkoutRoot @("fetch", "--prune", "origin", "main")
  Invoke-Git $checkoutRoot @("pull", "--ff-only", "origin", "main")
}

$checkoutRoot = (Resolve-Path -LiteralPath $CheckoutPath).Path
Push-Location $checkoutRoot
try {
  Invoke-Native "npm" @("run", "test")
  Invoke-Native "npm" @("run", "check")
  Invoke-Native "python" @($validator, $checkoutRoot)
  Invoke-Native "python" @($cachebuster, $checkoutRoot)
  Invoke-Native "python" @($validator, $checkoutRoot)
} finally {
  Pop-Location
}

Invoke-Native "node" @($preflightScript, "--source", $sourceRoot, "--checkout", $checkoutRoot, "--marketplace", $MarketplacePath, "--write-marketplace", "--allow-local-cachebuster", "--report", $ReportPath)

$report = Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
$marketplaceUri = [System.Uri]::EscapeDataString((Resolve-Path -LiteralPath $MarketplacePath).Path)
$pluginLink = "codex://plugins/codex-image-editor?marketplacePath=$marketplaceUri"
Write-Output "Local marketplace deployment prepared."
Write-Output "Preflight report: $ReportPath"
Write-Output "Open in Codex: $pluginLink"

if ($InstallPlugin -and $report.host.pluginCommandAvailable) {
  Invoke-Native "codex" @("plugin", "add", "codex-image-editor@personal")
} elseif ($InstallPlugin) {
  Write-Warning "The current CLI has no codex plugin command. Use the desktop plugin page shown above."
}

if ($report.host.manualGates.Count -gt 0) {
  Write-Warning "Desktop validation remains required: $($report.host.manualGates -join ' ' )"
}
