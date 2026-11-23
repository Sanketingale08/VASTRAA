#!/bin/bash
# configure_local_ip.sh

echo "=============================================="
echo "  VASTRAA E-COMMERCE LOCAL IP CONFIGURATOR"
echo "=============================================="

# Detect local IP
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    SELECTED_IP=$(ipconfig.exe | grep -i "IPv4 Address" | head -n 1 | awk -F': ' '{print $2}' | tr -d '\r')
else
    SELECTED_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}')
    [ -z "$SELECTED_IP" ] && SELECTED_IP=$(hostname -I | awk '{print $1}')
fi

if [ -z "$SELECTED_IP" ]; then
    echo "ERROR: Unable to detect active local IP. Ensure Wi-Fi/Hotspot is connected."
    exit 1
fi

echo "Detected Machine IP: $SELECTED_IP"

# 1. Update React Native App.tsx
APP_FILE="./artifacts/customer-mobile/App.tsx"
if [ -f "$APP_FILE" ]; then
    sed -i -E "s/export const LOCAL_HOST_IP = '[^']+';/export const LOCAL_HOST_IP = '$SELECTED_IP';/g" "$APP_FILE"
    sed -i -E "s/export const USE_LOCAL_SERVER = false;/export const USE_LOCAL_SERVER = true;/g" "$APP_FILE"
    echo "[SUCCESS] Updated $APP_FILE with IP: $SELECTED_IP"
fi

# 2. Update Web App .env if present
ENV_FILE="./artifacts/vastraa/.env"
if [ -f "$ENV_FILE" ]; then
    sed -i -E "s|VITE_API_URL=http://[a-zA-Z0-9\.:]+|VITE_API_URL=http://$SELECTED_IP:5000|g" "$ENV_FILE"
    echo "[SUCCESS] Updated $ENV_FILE with API URL: http://$SELECTED_IP:5000"
fi

echo "=============================================="
echo "Configuration complete. Mobile shell pointed to http://$SELECTED_IP:3000"
echo "=============================================="

