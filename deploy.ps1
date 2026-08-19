# deploy.ps1 — one-command release for Ding! Fitness
#
#   .\deploy.ps1              build + deploy hosting + push
#   .\deploy.ps1 -Functions   also deploy Cloud Functions
#   .\deploy.ps1 -SkipPush    deploy only, don't push to GitHub
#
# Why this exists: the release has three independent targets (web hosting,
# Cloud Functions, iOS via Codemagic) and forgetting one has repeatedly meant
# "I deployed it" and "users have it" disagreeing. This runs them in order,
# stops on the first failure, and — critically — verifies the LIVE site
# afterwards instead of trusting that the deploy said OK.

param(
    [switch]$Functions,
    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Bad($msg)  { Write-Host "  !!  $msg" -ForegroundColor Red }

# ---------------------------------------------------------------- build ----
Step "Building web bundle"
npm run build
if ($LASTEXITCODE -ne 0) { Bad "Build failed — nothing deployed."; exit 1 }

$local = (Get-Content dist/version.json | ConvertFrom-Json).shortCommit
Ok "Built commit $local"

# -------------------------------------------------------------- hosting ----
Step "Deploying hosting"
firebase deploy --only hosting
if ($LASTEXITCODE -ne 0) { Bad "Hosting deploy failed."; exit 1 }
Ok "Hosting deployed"

# ------------------------------------------------------------- functions ----
if ($Functions) {
    Step "Deploying Cloud Functions"
    firebase deploy --only functions
    if ($LASTEXITCODE -ne 0) { Bad "Functions deploy failed."; exit 1 }
    Ok "Functions deployed"
}

# ------------------------------------------------------------------ push ----
if (-not $SkipPush) {
    Step "Pushing to GitHub (triggers Codemagic -> iOS)"
    git push origin main
    if ($LASTEXITCODE -ne 0) { Bad "Push failed — iOS will not rebuild." }
    else { Ok "Pushed" }
}

# ---------------------------------------------------------------- verify ----
# Two layers: Firebase origin, then the public domain behind Cloudflare.
# A mismatch between them means the CDN cache needs purging — the deploy
# itself is fine. This is the check that has caught every silent failure.
Step "Verifying what is actually live"
Start-Sleep -Seconds 3
$bust = [DateTimeOffset]::Now.ToUnixTimeSeconds()

try {
    $origin = (Invoke-RestMethod "https://dings-fitness.web.app/version.json?b=$bust").shortCommit
} catch { $origin = "unreachable" }

try {
    $public = (Invoke-RestMethod "https://dings.fitness/version.json?b=$bust").shortCommit
} catch { $public = "unreachable" }

Write-Host ""
Write-Host "  local build   : $local"
Write-Host "  firebase origin: $origin"
Write-Host "  public (edge)  : $public"
Write-Host ""

if ($origin -eq $local -and $public -eq $local) {
    Ok "Fully live. Web users have $local."
}
elseif ($origin -eq $local -and $public -ne $local) {
    Bad "Cloudflare is serving stale content ($public)."
    Write-Host "      Deploy succeeded. Purge the CDN:" -ForegroundColor Yellow
    Write-Host "      Cloudflare -> dings.fitness -> Caching -> Configuration -> Purge Everything" -ForegroundColor Yellow
}
else {
    Bad "Origin is $origin but this build is $local — the deploy did not land."
    Write-Host "      Check firebase login / active project (firebase use dings-fitness)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "iOS: Codemagic builds on push. If the webhook still isn't wired," -ForegroundColor DarkGray
Write-Host "start the build manually at https://codemagic.io/apps" -ForegroundColor DarkGray
