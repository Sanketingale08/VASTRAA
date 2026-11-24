/**
 * VASTRAA Admin Panel - Cryptographic Browser ID Authorization & Identity Management
 * 
 * Provides:
 * - Persistent, cryptographically secure Browser ID per browser profile
 * - Hardware/browser-backed Web Crypto ECDSA P-256 key pair stored in IndexedDB
 * - Digital signatures for API request authenticity (ECDSA SHA-256)
 * - Automatic browser registration and proof verification against VASTRAA Admin API
 * - Isolated per browser profile and Incognito mode
 */

const DB_NAME = "vastraa_admin_device_keystore";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const KEY_NAME = "admin_device_keypair";
const BROWSER_ID_KEY = "vastraa_admin_browser_id";
const LEGACY_DEVICE_ID_KEY = "vastraa_admin_device_id";
const BROWSER_NAME_KEY = "vastraa_admin_browser_name";
const DEVICE_NAME_KEY = "vastraa_admin_device_name";

export interface BrowserInfo {
  browserId: string;
  browserName: string;
  deviceName: string;
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet";
  publicKey?: string;
  status?: "authorized" | "pending" | "blocked" | "revoked";
}

export type DeviceInfo = BrowserInfo;

/** Open or create the IndexedDB store for secure key storage */
function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Convert an ArrayBuffer to standard Base64 string */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/** Detect user device environment specs (Browser, OS, Type) */
export function detectEnvironment(): { browser: string; os: string; deviceType: "desktop" | "mobile" | "tablet" } {
  if (typeof window === "undefined" || !navigator) {
    return { browser: "Web Browser", os: "Desktop OS", deviceType: "desktop" };
  }

  const ua = navigator.userAgent;
  let browser = "Web Browser";
  let os = "Desktop OS";
  let deviceType: "desktop" | "mobile" | "tablet" = "desktop";

  // Browser detection
  if (ua.includes("Firefox/")) {
    const match = ua.match(/Firefox\/(\d+)/);
    browser = `Firefox ${match ? match[1] : ""}`.trim();
  } else if (ua.includes("Edg/")) {
    const match = ua.match(/Edg\/(\d+)/);
    browser = `Microsoft Edge ${match ? match[1] : ""}`.trim();
  } else if (ua.includes("Chrome/")) {
    const match = ua.match(/Chrome\/(\d+)/);
    browser = `Google Chrome ${match ? match[1] : ""}`.trim();
  } else if (ua.includes("Safari/") && !ua.includes("Chrome/")) {
    browser = "Apple Safari";
  }

  // OS detection
  if (ua.includes("Windows NT 10.0")) os = "Windows 10/11";
  else if (ua.includes("Windows NT 6.3")) os = "Windows 8.1";
  else if (ua.includes("Windows NT 6.1")) os = "Windows 7";
  else if (ua.includes("Mac OS X")) {
    os = "macOS";
    if (ua.includes("iPad")) { os = "iPadOS"; deviceType = "tablet"; }
    else if (ua.includes("iPhone")) { os = "iOS"; deviceType = "mobile"; }
  } else if (ua.includes("Android")) {
    os = "Android";
    deviceType = /tablet|ipad/i.test(ua) ? "tablet" : "mobile";
  } else if (ua.includes("Linux")) {
    os = "Linux";
  }

  // Device type
  if (/mobile/i.test(ua) && deviceType !== "tablet") {
    deviceType = "mobile";
  }

  return { browser, os, deviceType };
}

/** Set cookie helper for browser id persistence across sub-requests */
function setBrowserCookie(browserId: string) {
  if (typeof document === "undefined") return;
  document.cookie = `vastraa_browser_id=${encodeURIComponent(browserId)}; path=/; max-age=315360000; SameSite=Lax`;
  document.cookie = `vastraa_device_id=${encodeURIComponent(browserId)}; path=/; max-age=315360000; SameSite=Lax`;
}

/**
 * Retrieve or generate a cryptographically unique Browser ID.
 * Follows format: BID-XXXX-XXXX-XXXX
 */
export function getOrCreateBrowserId(): string {
  if (typeof window === "undefined") return "";

  let id = localStorage.getItem(BROWSER_ID_KEY) || localStorage.getItem(LEGACY_DEVICE_ID_KEY);
  if (!id) {
    // Generate 12-char secure random hex
    const randomBytes = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(randomBytes);
    } else {
      for (let i = 0; i < 8; i++) randomBytes[i] = Math.floor(Math.random() * 256);
    }
    const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    id = `BID-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
    try {
      localStorage.setItem(BROWSER_ID_KEY, id);
      localStorage.setItem(LEGACY_DEVICE_ID_KEY, id);
    } catch {}
  }

  setBrowserCookie(id);
  return id;
}

export const getOrCreateDeviceId = getOrCreateBrowserId;

/** Get or set custom browser name */
export function getBrowserName(): string {
  if (typeof window === "undefined") return "Web Browser";
  const stored = localStorage.getItem(BROWSER_NAME_KEY);
  if (stored) return stored;
  const env = detectEnvironment();
  return env.browser;
}

export function setBrowserName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BROWSER_NAME_KEY, name.trim());
}

/** Get or set custom device name */
export function getDeviceName(): string {
  if (typeof window === "undefined") return "Admin Terminal";
  const stored = localStorage.getItem(DEVICE_NAME_KEY);
  if (stored) return stored;
  const env = detectEnvironment();
  return `${env.os} (${env.deviceType})`;
}

export function setDeviceName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEVICE_NAME_KEY, name.trim());
}

/**
 * Get or create ECDSA P-256 key pair in IndexedDB.
 * Returns public key in base64 SPKI format and the CryptoKeyPair.
 */
export async function getOrCreateDeviceKeyPair(): Promise<{
  keyPair: CryptoKeyPair;
  publicKeyBase64: string;
}> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Web Cryptography API is not available");
  }

  const db = await openKeyDatabase();

  // Try retrieving existing keypair
  const existingPair: CryptoKeyPair | undefined = await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });

  if (existingPair && existingPair.privateKey && existingPair.publicKey) {
    const spki = await window.crypto.subtle.exportKey("spki", existingPair.publicKey);
    return {
      keyPair: existingPair,
      publicKeyBase64: bufferToBase64(spki),
    };
  }

  // Generate new ECDSA P-256 key pair
  const newPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false, // Private key is non-extractable for security
    ["sign", "verify"]
  );

  // Store in IndexedDB
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).put(newPair, KEY_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(tx.error);
  });

  const spki = await window.crypto.subtle.exportKey("spki", newPair.publicKey);
  return {
    keyPair: newPair,
    publicKeyBase64: bufferToBase64(spki),
  };
}

/**
 * Digitally sign a browser authorization challenge payload using ECDSA SHA-256.
 */
export async function signBrowserPayload(payload: string): Promise<string> {
  const { keyPair } = await getOrCreateDeviceKeyPair();
  const enc = new TextEncoder();
  const data = enc.encode(payload);
  const signature = await window.crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    keyPair.privateKey,
    data
  );
  return bufferToBase64(signature);
}

export const signDevicePayload = signBrowserPayload;

/**
 * Returns complete HTTP headers for admin requests requiring browser authorization.
 */
export async function getDeviceAuthHeaders(): Promise<Record<string, string>> {
  const browserId = getOrCreateBrowserId();
  const timestamp = Date.now().toString();
  const browserName = getBrowserName();
  const deviceName = getDeviceName();

  const headers: Record<string, string> = {
    "x-device-id": browserId,
    "x-browser-id": browserId,
    "x-browser-name": browserName,
    "x-device-name": deviceName,
    "x-device-timestamp": timestamp,
  };

  try {
    const keys = await getOrCreateDeviceKeyPair();
    headers["x-device-public-key"] = keys.publicKeyBase64;
    headers["x-browser-public-key"] = keys.publicKeyBase64;
    const signature = await signBrowserPayload(`${browserId}:${timestamp}`);
    headers["x-device-signature"] = signature;
    headers["x-browser-signature"] = signature;
  } catch {
    // If Web Crypto fails (e.g. insecure origin in testing), omit signature
  }

  return headers;
}

export const getBrowserAuthHeaders = getDeviceAuthHeaders;

/**
 * Register or announce this browser to the backend.
 * Public endpoint (/api/admin/devices/register).
 */
export async function registerCurrentDevice(): Promise<{
  success: boolean;
  status: "authorized" | "pending" | "blocked" | "revoked";
  device?: any;
  message?: string;
}> {
  const browserId = getOrCreateBrowserId();
  const browserName = getBrowserName();
  const deviceName = getDeviceName();
  const env = detectEnvironment();

  let publicKeyBase64: string | undefined;
  try {
    const keys = await getOrCreateDeviceKeyPair();
    publicKeyBase64 = keys.publicKeyBase64;
  } catch {}

  const res = await fetch("/api/admin/devices/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: browserId,
      browserId,
      deviceName,
      browserName,
      deviceType: env.deviceType,
      browser: browserName,
      os: env.os,
      publicKey: publicKeyBase64,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return {
    success: res.ok,
    status: data.status || "pending",
    device: data.device,
    message: data.message,
  };
}

export const registerCurrentBrowser = registerCurrentDevice;

/**
 * Cryptographically verify this browser's authorization with the backend.
 * Sends Browser ID, timestamp, and ECDSA signature.
 * Endpoint: /api/admin/devices/verify-browser
 */
export async function verifyBrowserAuthorization(): Promise<{
  authorized: boolean;
  status: "authorized" | "pending" | "blocked" | "revoked" | "unregistered" | "invalid_credential";
  browserId: string;
  browserName: string;
  deviceName: string;
  message?: string;
  device?: any;
}> {
  const browserId = getOrCreateBrowserId();
  const browserName = getBrowserName();
  const deviceName = getDeviceName();
  const timestamp = Date.now().toString();

  let signature: string | undefined;
  let publicKey: string | undefined;

  try {
    const keys = await getOrCreateDeviceKeyPair();
    publicKey = keys.publicKeyBase64;
    signature = await signBrowserPayload(`${browserId}:${timestamp}`);
  } catch {}

  const res = await fetch("/api/admin/devices/verify-browser", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-browser-id": browserId,
      "x-device-id": browserId,
    },
    credentials: "include",
    body: JSON.stringify({
      browserId,
      browserName,
      deviceName,
      timestamp,
      signature,
      publicKey,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return {
    authorized: data.authorized === true,
    status: data.status || (data.authorized ? "authorized" : "unregistered"),
    browserId,
    browserName,
    deviceName,
    message: data.message || data.error,
    device: data.device,
  };
}

/**
 * Check authorization status of this browser.
 * Endpoint (/api/admin/devices/check).
 */
export async function checkCurrentDeviceStatus(): Promise<{
  authorized: boolean;
  status: "authorized" | "pending" | "blocked" | "revoked" | "unregistered";
  device?: any;
}> {
  const browserId = getOrCreateBrowserId();
  const res = await fetch(`/api/admin/devices/check?deviceId=${encodeURIComponent(browserId)}`, {
    headers: {
      "x-device-id": browserId,
      "x-browser-id": browserId,
    },
    credentials: "include",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return {
      authorized: false,
      status: (data.status as any) || "unregistered",
      device: data.device,
    };
  }

  const data = await res.json();
  return {
    authorized: data.authorized === true,
    status: data.status || "unregistered",
    device: data.device,
  };
}

export const checkCurrentBrowserStatus = checkCurrentDeviceStatus;
