import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  StatusBar,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Location from 'expo-location';

// ==========================================
// 1. ENVIRONMENT CONFIGURATION
// ==========================================
// Toggle: true = Localhost / false = Hosted Production
export const USE_LOCAL_SERVER = true;

// Development Laptop IP (auto-updated by configure_local_ip scripts)
export const LOCAL_HOST_IP = '10.201.213.152';

export const WEB_APP_URL = USE_LOCAL_SERVER
  ? `http://${LOCAL_HOST_IP}:3000`
  : 'https://vastraa.com';

function AppContent(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [hasError, setHasError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(WEB_APP_URL);

  // Request runtime hardware permissions on mount
  useEffect(() => {
    (async () => {
      try {
        const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
        console.log('Location permission:', locStatus);
      } catch (e) {
        console.warn('Permission request error:', e);
      }
    })();
  }, []);

  const sendMessageToWeb = (message: object) => {
    webViewRef.current?.postMessage(JSON.stringify(message));
  };

  // Hardware bridge event dispatcher
  const handleMessage = async (event: any) => {
    try {
      const raw = event.nativeEvent?.data;
      if (!raw) return;
      const data = JSON.parse(raw);
      console.log('Native Bridge received event:', data.type);

      switch (data.type) {
        // --- 1. BIOMETRIC CHECK & AUTHENTICATION ---
        case 'check_biometrics': {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();
          sendMessageToWeb({
            type: 'biometrics_check_result',
            available: hasHardware && isEnrolled,
          });
          break;
        }

        case 'request_biometrics': {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();

          if (!hasHardware || !isEnrolled) {
            sendMessageToWeb({
              type: 'biometrics_result',
              success: false,
              error: 'unavailable',
            });
            return;
          }

          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: data.promptMessage || 'Authenticate for Quick Checkout',
            cancelLabel: 'Cancel',
            fallbackLabel: 'Use Passcode',
          });

          sendMessageToWeb({
            type: 'biometrics_result',
            success: result.success,
          });
          break;
        }

        // --- 2. SHARE PRODUCT / INVOICE VIA NATIVE TRAY ---
        case 'share_content': {
          if (data.url && (await Sharing.isAvailableAsync())) {
            await Share.share({
              title: data.title || 'Share Product',
              message: data.message ? `${data.message} ${data.url}` : data.url,
              url: data.url,
            });
          } else {
            await Share.share({
              title: data.title || 'Share Product',
              message: data.message || data.url || '',
            });
          }
          break;
        }

        // --- 3. DOWNLOAD INVOICE / ORDER PDF TO STORAGE ---
        case 'download_file': {
          const { filename = 'order-invoice.pdf', base64 } = data;
          if (!base64) break;

          const fileUri = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/pdf',
              dialogTitle: `Save or View ${filename}`,
            });
          } else {
            Alert.alert('Download Complete', `${filename} saved successfully.`);
          }
          break;
        }

        // --- 4. EXTERNAL PAYMENT / DEEP LINKING ---
        case 'open_external_url': {
          if (data.url) {
            await Linking.openURL(data.url);
          }
          break;
        }

        default:
          console.warn('Unknown bridge action:', data.type);
      }
    } catch (err) {
      console.error('Error handling bridge message:', err);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar backgroundColor="#0A1F44" barStyle="light-content" />

      {hasError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Unable to connect to VASTRAA Server</Text>
          <Text style={styles.errorMessage}>
            Target URL: {currentUrl}{'\n\n'}
            Please ensure your mobile device and laptop are on the same Wi-Fi network and that the web server is running.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setIsRetrying(true);
              setHasError(false);
              setTimeout(() => setIsRetrying(false), 1500);
            }}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.retryText}>Retry Connection</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: currentUrl }}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          originWhitelist={['*']}
          geolocationEnabled={true}
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          style={styles.webview}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0A1F44" />
            </View>
          )}
          onError={() => {
            setHasError(true);
            setIsRetrying(false);
          }}
          onNavigationStateChange={(navState) => {
            if (navState.url) {
              setCurrentUrl(navState.url);
            }
          }}
        />
      )}
    </View>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1F44' },
  webview: { flex: 1, backgroundColor: '#ffffff' },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  errorTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: '#0A1F44', textAlign: 'center' },
  errorMessage: { fontSize: 14, textAlign: 'center', color: '#666', marginBottom: 20, lineHeight: 20 },
  retryButton: {
    backgroundColor: '#0A1F44',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});


