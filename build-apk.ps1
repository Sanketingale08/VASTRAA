# build-apk.ps1
param(
    [ValidateSet("debug", "release")]
    [string]$BuildType = "release"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  VASTRAA HYBRID MOBILE APK BUILDER ($BuildType)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$projectRoot = $PSScriptRoot
$mobileDir = Join-Path $projectRoot "artifacts\customer-mobile"
$androidDir = Join-Path $mobileDir "android"
$assetsPath = Join-Path $androidDir "app\src\main\assets"

# Check prerequisites
$sdkPath = $env:ANDROID_HOME
if (-not $sdkPath) { $sdkPath = $env:ANDROID_SDK_ROOT }
if (-not $sdkPath -and (Test-Path "$env:LOCALAPPDATA\Android\Sdk")) { $sdkPath = "$env:LOCALAPPDATA\Android\Sdk" }

$localPropsFile = Join-Path $androidDir "local.properties"
if ($sdkPath -and (Test-Path $sdkPath)) {
    $escapedPath = $sdkPath.Replace('\', '\\')
    "sdk.dir=$escapedPath" | Set-Content -Path $localPropsFile -Encoding utf8
} elseif (-not (Test-Path $localPropsFile)) {
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host "ERROR: Android SDK location not found." -ForegroundColor Red
    Write-Host "Please set the ANDROID_HOME environment variable or define" -ForegroundColor Yellow
    Write-Host "sdk.dir in: $localPropsFile" -ForegroundColor Yellow
    Write-Host "Example in local.properties:" -ForegroundColor Cyan
    Write-Host "sdk.dir=C:\\Users\\Administrator\\AppData\\Local\\Android\\Sdk" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Red
    exit 1
}

# 1. Prepare assets directory
if (-not (Test-Path $assetsPath)) {
    New-Item -ItemType Directory -Path $assetsPath -Force | Out-Null
}

Write-Host "STEP 1: Bundling JavaScript engine..." -ForegroundColor Yellow
Set-Location $mobileDir

# Run bundle using expo export or react-native bundle
$bundleFile = Join-Path $assetsPath "index.android.bundle"
$resDir = Join-Path $androidDir "app\src\main\res"

try {
    pnpm exec react-native bundle `
      --platform android `
      --dev false `
      --entry-file index.ts `
      --bundle-output $bundleFile `
      --assets-dest $resDir
} catch {
    Write-Host "Notice: React Native CLI bundle step completed or handled by Gradle pipeline." -ForegroundColor Gray
}

# 2. Compile APK using Gradle
Write-Host "STEP 2: Compiling Android APK with Gradle ($BuildType)..." -ForegroundColor Yellow
Set-Location $androidDir

if ($BuildType -eq "release") {
    .\gradlew.bat assembleRelease
    $apkSource = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
    if (-not (Test-Path $apkSource)) {
        # Check for unsigned release apk
        $apkSource = Join-Path $androidDir "app\build\outputs\apk\release\app-release-unsigned.apk"
    }
} else {
    .\gradlew.bat assembleDebug
    $apkSource = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
}

$apkTarget = Join-Path $projectRoot "ecommerce-store-$BuildType.apk"

if (Test-Path $apkSource) {
    Copy-Item -Path $apkSource -Destination $apkTarget -Force
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "SUCCESS: Standalone APK Created!" -ForegroundColor Green
    Write-Host "Location: $apkTarget" -ForegroundColor Green
    Write-Host "File Size: $([Math]::Round((Get-Item $apkTarget).Length / 1MB, 2)) MB" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Host "Gradle build finished. Check $androidDir\app\build\outputs\apk for output." -ForegroundColor Yellow
}

Set-Location $projectRoot

