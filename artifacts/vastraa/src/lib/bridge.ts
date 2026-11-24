/**
 * VASTRAA & E-Commerce Web-to-Native Hybrid Bridge Utility
 * 
 * Enables the responsive web application to invoke native device hardware capabilities
 * (Biometric Auth, GPS Geolocation, Native Sharing, Offline PDF Downloads)
 * when running inside the React Native / Android APK WebView wrapper.
 * Gracefully falls back to browser APIs when running in standard desktop/mobile browsers.
 */

// Extend window interface for ReactNativeWebView
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

/** Check if currently running inside the native mobile container */
export const isNativeApp = (): boolean => {
  return typeof window !== "undefined" && Boolean(window.ReactNativeWebView);
};

/** Post message to native Android wrapper shell */
export const postToNative = (payload: Record<string, any>): void => {
  if (isNativeApp() && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }
};

/**
 * 1. Biometric Authentication (Fingerprint / Face ID for Login & Checkout)
 */
export const requestBiometricVerification = (
  promptMessage: string = "Authenticate to confirm your identity"
): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!isNativeApp()) {
      // In standard desktop browser, fallback to allowing normal checkout/login
      return resolve(true);
    }

    const onMessage = (event: MessageEvent) => {
      try {
        const raw = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
        const data = JSON.parse(raw);
        if (data.type === "biometrics_result") {
          window.removeEventListener("message", onMessage);
          document.removeEventListener("message", onMessage as any);
          resolve(Boolean(data.success));
        }
      } catch {}
    };

    window.addEventListener("message", onMessage);
    document.addEventListener("message", onMessage as any);

    postToNative({ type: "request_biometrics", promptMessage });
  });
};

/**
 * Check if biometrics hardware is available on the device
 */
export const checkBiometricsAvailable = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!isNativeApp()) return resolve(false);

    const onMessage = (event: MessageEvent) => {
      try {
        const raw = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
        const data = JSON.parse(raw);
        if (data.type === "biometrics_check_result") {
          window.removeEventListener("message", onMessage);
          document.removeEventListener("message", onMessage as any);
          resolve(Boolean(data.available));
        }
      } catch {}
    };

    window.addEventListener("message", onMessage);
    document.addEventListener("message", onMessage as any);

    postToNative({ type: "check_biometrics" });
  });
};

/**
 * 2. High-Accuracy Geolocation (For automatic delivery address autofill)
 */
export const getAccurateLocation = (): Promise<{ latitude: number; longitude: number }> => {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return reject(new Error("Geolocation is not supported by this environment"));
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  });
};

/**
 * 3. Native Share Sheet (Product, Deals, Order Link Sharing)
 */
export const shareProduct = (title: string, message: string, url: string): void => {
  if (isNativeApp()) {
    postToNative({ type: "share_content", title, message, url });
  } else if (typeof navigator !== "undefined" && navigator.share) {
    navigator.share({ title, text: message, url }).catch(() => {});
  } else if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(url);
    alert("Link copied to clipboard!");
  }
};

/**
 * 4. Download Order Invoice / PDF to device Downloads directory
 */
export const downloadOrderInvoice = (filename: string, base64Content: string): void => {
  if (isNativeApp()) {
    postToNative({
      type: "download_file",
      filename,
      base64: base64Content,
      mimeType: "application/pdf",
    });
  } else if (typeof document !== "undefined") {
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${base64Content}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

/**
 * 5. Deep Link / External Payment Gateway redirection
 */
export const openExternalUrl = (url: string): void => {
  if (isNativeApp()) {
    postToNative({ type: "open_external_url", url });
  } else if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

