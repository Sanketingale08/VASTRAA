#!/bin/bash
# build-apk.sh

set -e

BUILD_TYPE="${1:-release}"
PROJECT_ROOT=$(pwd)
MOBILE_DIR="$PROJECT_ROOT/artifacts/customer-mobile"
ANDROID_DIR="$MOBILE_DIR/android"
ASSETS_PATH="$ANDROID_DIR/app/src/main/assets"

echo "=========================================================="
echo "  VASTRAA HYBRID MOBILE APK BUILDER ($BUILD_TYPE)"
echo "=========================================================="

mkdir -p "$ASSETS_PATH"

echo "STEP 1: Bundling JavaScript Engine..."
cd "$MOBILE_DIR"
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.ts \
  --bundle-output "$ASSETS_PATH/index.android.bundle" \
  --assets-dest "$ANDROID_DIR/app/src/main/res" || true

echo "STEP 2: Compiling Standalone APK with Gradle..."
cd "$ANDROID_DIR"
if [ "$BUILD_TYPE" = "release" ]; then
    ./gradlew assembleRelease
    APK_SOURCE="./app/build/outputs/apk/release/app-release.apk"
    [ ! -f "$APK_SOURCE" ] && APK_SOURCE="./app/build/outputs/apk/release/app-release-unsigned.apk"
else
    ./gradlew assembleDebug
    APK_SOURCE="./app/build/outputs/apk/debug/app-debug.apk"
fi

APK_TARGET="$PROJECT_ROOT/ecommerce-store.apk"

if [ -f "$APK_SOURCE" ]; then
    cp "$APK_SOURCE" "$APK_TARGET"
    echo "=========================================================="
    echo "SUCCESS: Standalone APK Created!"
    echo "Location: $APK_TARGET"
    echo "=========================================================="
else
    echo "Notice: Gradle build complete. Check $ANDROID_DIR/app/build/outputs/apk"
fi

