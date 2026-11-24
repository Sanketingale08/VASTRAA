/**
 * Shared admin API utility.
 * Always sends both x-admin-key and x-admin-session-token (when present)
 * so all admin pages work correctly when 2FA is enabled.
 */

import { getOrCreateDeviceId, getDeviceName, getDeviceAuthHeaders } from "./deviceAuth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Install a one-time global fetch interceptor that redirects to:
 * - /admin/2fa-verify when response is 403 and code is "2FA_REQUIRED"
 * - /admin/unauthorized-device when response is 403 and code is "DEVICE_UNAUTHORIZED", "DEVICE_BLOCKED", or "DEVICE_REVOKED"
 *
 * Safe to call multiple times — patches window.fetch at most once.
 */
let _interceptorInstalled = false;
export function initAdmin2FAInterceptor(): void {
  if (typeof window === "undefined" || _interceptorInstalled) return;
  _interceptorInstalled = true;

  const _origFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const res = await _origFetch(input, init);

    // Only inspect admin API responses
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (res.status === 403 && url.includes("/api/admin/") && !url.includes("/api/admin/devices/check") && !url.includes("/api/admin/devices/register")) {
      // Clone so the caller can still read the body if needed
      const clone = res.clone();
      try {
        const body = await clone.json();
        if (body?.code === "2FA_REQUIRED") {
          const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `${BASE}/admin/2fa-verify?returnTo=${returnTo}`;
          return new Promise<Response>(() => {});
        } else if (
          body?.code === "DEVICE_UNAUTHORIZED" ||
          body?.code === "DEVICE_BLOCKED" ||
          body?.code === "DEVICE_REVOKED" ||
          body?.code === "DEVICE_CREDENTIAL_INVALID"
        ) {
          const deviceId = body?.deviceId || getOrCreateDeviceId();
          window.location.href = `${BASE}/admin/unauthorized-device?code=${encodeURIComponent(body?.code)}&deviceId=${encodeURIComponent(deviceId)}`;
          return new Promise<Response>(() => {});
        }
      } catch {
        // Not JSON — fall through and return the original response
      }
    }

    return res;
  };
}

export function adminKey(): string {
  if (typeof window === "undefined") return "";
  const key = sessionStorage.getItem("td_admin_key") || localStorage.getItem("td_admin_key") || localStorage.getItem("admin_key");
  return key && key.trim() ? key.trim() : "";
}

export function adminSessionToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("td_admin_session_token") || localStorage.getItem("td_admin_session_token") || "";
}

export function adminAuthToken(): string {
  if (typeof window === "undefined") return "";
  const token = sessionStorage.getItem("admin_token") || localStorage.getItem("admin_token") || localStorage.getItem("td_admin_token") || "";
  return token && token.trim() ? token.trim() : "";
}

/**
 * Returns authentication headers only (x-admin-key, Authorization bearer token and session token),
 * without setting Content-Type so browsers can correctly set multipart boundaries on FormData.
 */
export function adminAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    "x-admin-key": adminKey(),
    "x-device-id": getOrCreateDeviceId(),
    "x-device-name": getDeviceName(),
    ...(extra ?? {}),
  };
  const token = adminSessionToken();
  if (token) h["x-admin-session-token"] = token;
  const authToken = adminAuthToken();
  if (authToken && !h["Authorization"] && !h["authorization"]) {
    h["Authorization"] = `Bearer ${authToken}`;
  }
  return h;
}

/** Returns the headers object to pass to fetch() for admin requests. */
export function adminHeaders(extra?: Record<string, string | undefined>): Record<string, string> {
  const h: Record<string, string> = {
    "x-admin-key": adminKey(),
    "x-device-id": getOrCreateDeviceId(),
    "x-device-name": getDeviceName(),
    "Content-Type": "application/json",
  };
  const token = adminSessionToken();
  if (token) h["x-admin-session-token"] = token;
  const authToken = adminAuthToken();
  if (authToken && !h["Authorization"] && !h["authorization"]) {
    h["Authorization"] = `Bearer ${authToken}`;
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === null) {
        delete h[k];
      } else {
        h[k] = v;
      }
    }
  }
  return h;
}

/** Fetch wrapper that always includes admin credentials. Throws on non-OK.
 *  Automatically redirects to /admin/2fa-verify when the server returns 2FA_REQUIRED.
 *  Automatically redirects to /admin/unauthorized-device when device access is unauthorized/blocked.
 */
export async function adminFetch(path: string, opts: RequestInit = {}): Promise<any> {
  let devHeaders: Record<string, string> = {};
  try {
    devHeaders = await getDeviceAuthHeaders();
  } catch {
    devHeaders = { "x-device-id": getOrCreateDeviceId(), "x-device-name": getDeviceName() };
  }

  const baseHeaders = adminHeaders(opts.headers as Record<string, string> | undefined ?? undefined);
  const headers = { ...baseHeaders, ...devHeaders };

  const r = await fetch(path, { ...opts, credentials: "include", headers });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    if (r.status === 403 && typeof window !== "undefined") {
      // Intercept 2FA_REQUIRED globally — redirect to verify screen with returnTo
      if (body.code === "2FA_REQUIRED") {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `${BASE}/admin/2fa-verify?returnTo=${returnTo}`;
        return new Promise(() => {});
      }
      // Intercept Device Authorization errors globally
      if (
        body.code === "DEVICE_UNAUTHORIZED" ||
        body.code === "DEVICE_BLOCKED" ||
        body.code === "DEVICE_REVOKED" ||
        body.code === "DEVICE_CREDENTIAL_INVALID"
      ) {
        const deviceId = body.deviceId || getOrCreateDeviceId();
        window.location.href = `${BASE}/admin/unauthorized-device?code=${encodeURIComponent(body.code)}&deviceId=${encodeURIComponent(deviceId)}`;
        return new Promise(() => {});
      }
    }
    const err: any = new Error(body.error ?? `HTTP ${r.status}`);
    err.code = body.code;
    err.status = r.status;
    throw err;
  }
  return r.json();
}

/** Store a verified session token + id returned by the 2FA login endpoint. */
export function storeAdminSession(tokenHash: string, sessionId: string): void {
  sessionStorage.setItem("td_admin_session_token", tokenHash);
  sessionStorage.setItem("td_admin_session_id", sessionId);
}

/** Clear all admin auth state from sessionStorage. */
export function clearAdminSession(): void {
  sessionStorage.removeItem("td_admin_key");
  sessionStorage.removeItem("td_admin_session_token");
  sessionStorage.removeItem("td_admin_session_id");
  sessionStorage.removeItem("td_admin_2fa_pending");
  localStorage.removeItem("td_admin_key");
  localStorage.removeItem("admin_key");
}
