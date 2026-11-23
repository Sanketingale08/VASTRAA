# configure_local_ip.ps1
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  VASTRAA E-COMMERCE LOCAL IP CONFIGURATOR" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# 1. Detect active Wi-Fi / Ethernet IPv4 address
$activeIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' -and $_.IPAddress -notmatch '127\.|169\.254'
} | Select-Object -First 1).IPAddress

if (-not $activeIp) {
    Write-Host "ERROR: Unable to detect active Wi-Fi or LAN IP address." -ForegroundColor Red
    exit 1
}

Write-Host "Detected Host Machine IP: $activeIp" -ForegroundColor Green

# 2. Update React Native Mobile Shell (App.tsx)
$appFile = Join-Path $PSScriptRoot "artifacts\customer-mobile\App.tsx"
if (Test-Path $appFile) {
    $content = Get-Content $appFile -Raw
    $content = [System.Text.RegularExpressions.Regex]::Replace($content, "const LOCAL_HOST_IP = '[^']+';", "const LOCAL_HOST_IP = '$activeIp';")
    $content = [System.Text.RegularExpressions.Regex]::Replace($content, "const USE_LOCAL_SERVER = false;", "const USE_LOCAL_SERVER = true;")
    Set-Content -Path $appFile -Value $content -Encoding utf8
    Write-Host "[SUCCESS] Updated $appFile with LOCAL_HOST_IP = '$activeIp'" -ForegroundColor Green
}

# 3. Update Web Client .env if present
$envFile = Join-Path $PSScriptRoot "artifacts\vastraa\.env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "VITE_API_URL=") {
        $envContent = [System.Text.RegularExpressions.Regex]::Replace($envContent, "VITE_API_URL=http://[^\r\n]+", "VITE_API_URL=http://${activeIp}:5000")
        Set-Content -Path $envFile -Value $envContent -Encoding utf8
        Write-Host "[SUCCESS] Updated $envFile with VITE_API_URL = http://${activeIp}:5000" -ForegroundColor Green
    }
}

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Configuration complete! Mobile shell pointed to http://${activeIp}:3000" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

