import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Shield,
  ShieldAlert,
  ShieldX,
  Eye,
  EyeOff,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Lock,
  Laptop,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";
import { storeAdminSession } from "@/lib/adminApi";
import {
  verifyBrowserAuthorization,
  getDeviceAuthHeaders,
  getOrCreateBrowserId,
  getBrowserName,
  getDeviceName,
} from "@/lib/deviceAuth";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAVY = "#0A1F44";
const ROYAL = "#2C3E6B";
const GOLD = "#C7CCD1";

export default function AdminLogin() {
  const [adminKey, setAdminKeyState] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  // Browser ID Access Control states
  const [verifyingBrowser, setVerifyingBrowser] = useState(true);
  const [browserAuthorized, setBrowserAuthorized] = useState(false);
  const [browserInfo, setBrowserInfo] = useState<{
    browserId: string;
    browserName: string;
    deviceName: string;
    status: string;
    message?: string;
  }>({
    browserId: "",
    browserName: "",
    deviceName: "",
    status: "unauthorized",
  });
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Verify browser identity and cryptographic authorization before displaying login
  const checkBrowser = async () => {
    setRefreshing(true);
    try {
      const res = await verifyBrowserAuthorization();
      setBrowserInfo({
        browserId: res.browserId || getOrCreateBrowserId(),
        browserName: res.browserName || getBrowserName(),
        deviceName: res.deviceName || getDeviceName(),
        status: res.status || "unauthorized",
        message: res.message,
      });
      setBrowserAuthorized(res.authorized === true);
    } catch {
      setBrowserAuthorized(false);
      setBrowserInfo((prev) => ({
        ...prev,
        browserId: getOrCreateBrowserId(),
        browserName: getBrowserName(),
        deviceName: getDeviceName(),
        status: "unauthorized",
      }));
    } finally {
      setVerifyingBrowser(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    document.title = "Admin Sign In – VASTRAA";
    checkBrowser();
  }, []);

  const copyBrowserId = () => {
    if (!browserInfo.browserId) return;
    navigator.clipboard.writeText(browserInfo.browserId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    const key = adminKey.trim();
    if (!key) {
      setAdminError("Please enter your admin key");
      return;
    }
    setLoading(true);
    setAdminError("");
    try {
      // Get browser cryptographic authentication headers
      const devHeaders = await getDeviceAuthHeaders();

      // Validate the key against DB via API endpoint, including browser identity proof
      const statusRes = await fetch(`/api/admin/2fa/status`, {
        headers: {
          "x-admin-key": key,
          ...devHeaders,
        },
        credentials: "include",
      });

      if (!statusRes.ok) {
        const body = await statusRes.json().catch(() => ({}));
        if (
          body.code === "DEVICE_UNAUTHORIZED" ||
          body.code === "DEVICE_BLOCKED" ||
          body.code === "DEVICE_REVOKED" ||
          body.code === "DEVICE_CREDENTIAL_INVALID"
        ) {
          setBrowserAuthorized(false);
          setBrowserInfo((prev) => ({
            ...prev,
            status: body.code === "DEVICE_BLOCKED" ? "blocked" : "unauthorized",
            message: body.error,
          }));
          return;
        }

        if (statusRes.status === 403 || statusRes.status === 401) {
          setAdminError("Invalid access key");
        } else {
          setAdminError("Server error, please try again.");
        }
        return;
      }

      const { enabled } = await statusRes.json().catch(() => ({ enabled: false }));

      // Clear any stale session items from prior logins before setting new key
      sessionStorage.removeItem("td_admin_session_token");
      sessionStorage.removeItem("td_admin_session_id");
      sessionStorage.removeItem("td_admin_2fa_pending");

      // Key is valid — store it now and open Admin Dashboard
      sessionStorage.setItem("td_admin_key", key);
      localStorage.setItem("td_admin_key", key);
      localStorage.setItem("admin_key", key);

      if (enabled) {
        sessionStorage.setItem("td_admin_2fa_pending", "true");
        setLocation("/admin/2fa-verify");
      } else {
        setLocation("/admin/dashboard");
      }
    } catch {
      setAdminError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── 1. Loading State while checking browser authorization ─────────────────
  if (verifyingBrowser) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0B0C10 50%, ${ROYAL} 100%)` }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-3 border-white/20 border-t-cyan-400 animate-spin" />
          <div className="text-center">
            <p className="text-sm font-semibold text-white tracking-wide">Verifying Browser Authorization</p>
            <p className="text-xs text-slate-400 mt-1">Inspecting cryptographic hardware credential...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── 2. Scenario B / C / D: Unauthorized Browser Screen ────────────────────
  // DO NOT DISPLAY THE ADMIN LOGIN FORM WHEN BROWSER IS UNAUTHORIZED!
  if (!browserAuthorized) {
    const isBlocked = browserInfo.status === "blocked";
    const isRevoked = browserInfo.status === "revoked";

    return (
      <div
        className="min-h-screen flex flex-col justify-between p-4 sm:p-6 lg:p-8"
        style={{ background: `radial-gradient(ellipse at top, ${NAVY} 0%, #071329 100%)` }}
      >
        {/* Top Brand Bar */}
        <div className="w-full max-w-xl mx-auto flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <img
              src={`${basePath}/logo.svg`}
              alt="VASTRAA"
              className="h-8 w-auto object-contain bg-white/90 p-1.5 rounded-lg shadow-xs"
            />
            <span className="font-serif tracking-wider text-white text-xs font-bold uppercase">
              Admin Access Perimeter
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-red-300 bg-red-950/60 border border-red-500/30 px-2.5 py-1 rounded-lg">
            <Lock size={12} className="text-red-400" />
            <span>Browser Gated</span>
          </div>
        </div>

        {/* Unauthorized Browser Card */}
        <div className="w-full max-w-xl mx-auto my-auto py-6">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
            {/* Header Alert Banner */}
            <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 p-6 text-white text-center relative">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center mx-auto mb-3 shadow-inner">
                {isBlocked ? (
                  <ShieldX size={30} className="text-white animate-bounce" />
                ) : (
                  <ShieldAlert size={30} className="text-white" />
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Unauthorized Browser</h1>
              <p className="text-xs sm:text-sm text-white/95 mt-1.5 max-w-md mx-auto leading-relaxed">
                Unauthorized Browser – This browser is not authorized to access the VASTRAA Admin Panel. Please contact the Super Admin for access.
              </p>
            </div>

            {/* Content Body */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Alert explanation */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50/90 border border-amber-200/90 text-amber-950 text-xs sm:text-sm">
                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    {isBlocked
                      ? "This browser instance has been explicitly blocked by the Super Admin."
                      : isRevoked
                      ? "Authorization for this browser has been revoked."
                      : "Access to /admin/login is strictly restricted to pre-approved browser profiles."}
                  </p>
                  <p className="text-amber-800 text-xs mt-1">
                    Each browser (Chrome, Edge, Firefox, Incognito) has a separate cryptographic identity. Provide the Browser ID below to the Super Admin to request authorization.
                  </p>
                </div>
              </div>

              {/* Browser Identity Box */}
              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Browser ID</span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      isBlocked
                        ? "bg-red-100 text-red-800 border border-red-200"
                        : isRevoked
                        ? "bg-orange-100 text-orange-800 border border-orange-200"
                        : "bg-amber-100 text-amber-800 border border-amber-200"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {isBlocked ? "Blocked" : isRevoked ? "Revoked" : "Pending Authorization"}
                  </span>
                </div>

                {/* Monospace Browser ID & Copy Button */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-sm sm:text-base font-bold text-gray-900 bg-white px-4 py-3 rounded-xl border border-gray-300 shadow-2xs tracking-wide select-all overflow-x-auto">
                    {browserInfo.browserId || "Generating identity..."}
                  </div>
                  <button
                    onClick={copyBrowserId}
                    className="px-4 py-3 bg-[#0A1F44] hover:bg-[#071329] text-white rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
                    title="Copy Browser ID"
                  >
                    {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    <span>{copied ? "Copied!" : "Copy Browser ID"}</span>
                  </button>
                </div>

                {/* Browser & Hardware Details */}
                <div className="pt-2 border-t border-gray-200/60 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-400 block text-[11px]">Browser Name</span>
                    <span className="font-semibold text-gray-800 block mt-0.5 truncate">
                      {browserInfo.browserName || "Web Browser"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[11px]">Device / OS</span>
                    <span className="font-semibold text-gray-800 block mt-0.5 truncate">
                      {browserInfo.deviceName || "Desktop"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="border border-gray-100 rounded-2xl p-4 sm:p-5 bg-white space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                  <HelpCircle size={14} className="text-[#0A1F44]" />
                  How to Authorize This Browser
                </h3>
                <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside pl-1 leading-relaxed">
                  <li>Click <strong className="text-gray-900">Copy Browser ID</strong> above.</li>
                  <li>Send this Browser ID to the Super Administrator.</li>
                  <li>
                    The Super Admin navigates to:
                    <div className="mt-1 px-3 py-1.5 bg-gray-100 rounded-lg font-mono text-[11px] text-gray-800">
                      Admin Panel → Settings → Security Settings → Allow Devices
                    </div>
                  </li>
                  <li>
                    Once allowed, click <strong className="text-gray-900">Refresh Status</strong> below.
                  </li>
                </ol>
              </div>

              {/* Action Buttons */}
              <div className="pt-2">
                <button
                  onClick={checkBrowser}
                  disabled={refreshing}
                  className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-[#0A1F44] hover:bg-[#071329] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
                >
                  <RefreshCw size={16} className={refreshing ? "animate-spin text-emerald-400" : ""} />
                  <span>{refreshing ? "Checking Authorization..." : "Refresh Status"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="w-full max-w-xl mx-auto text-center text-xs text-gray-400 pb-2">
          VASTRAA Admin Security &bull; Browser-Bound Cryptographic Keystore
        </div>
      </div>
    );
  }

  // ── 3. Scenario A: Authorized Browser -> Display Normal Admin Login Form ───
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0B0C10 50%, ${ROYAL} 100%)` }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 text-center"
      >
        <img
          src={`${basePath}/logo.svg`}
          alt="VASTRAA"
          className="h-16 w-auto object-contain mx-auto mb-3 bg-white/90 p-2.5 rounded-lg shadow-sm"
        />
        <div className="flex items-center justify-center gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.35em]" style={{ color: GOLD }}>
            Super Admin Portal
          </p>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-400/30">
            Browser Verified
          </span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="w-full max-w-sm"
      >
        <div
          className="rounded-2xl p-8 shadow-2xl border backdrop-blur-md transition-all"
          style={{ background: "rgba(10, 31, 68, 0.75)", borderColor: "rgba(199, 204, 209, 0.3)" }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
              style={{ background: GOLD }}
            >
              <Shield size={18} style={{ color: NAVY }} />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-white tracking-wide">Admin Sign In</h2>
              <p className="text-xs" style={{ color: "rgba(199,204,209,0.7)" }}>
                VASTRAA Operations Team
              </p>
            </div>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-5">
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider mb-2"
                style={{ color: "rgba(199,204,209,0.9)" }}
              >
                Admin API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={adminKey}
                  onChange={(e) => {
                    setAdminKeyState(e.target.value);
                    setAdminError("");
                  }}
                  placeholder="Enter your admin key"
                  className="w-full px-4 py-3 pr-10 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-[#C7CCD1]"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: adminError ? "#ef4444" : "rgba(199,204,209,0.3)",
                    color: "white",
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:text-white"
                  style={{ color: "rgba(199,204,209,0.6)" }}
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {adminError && (
                <div className="flex items-center gap-1.5 mt-1.5 text-red-400 text-xs font-semibold">
                  <AlertCircle size={13} /> {adminError}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 font-bold text-sm uppercase tracking-widest rounded-xl transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer shadow-md"
              style={{ background: GOLD, color: NAVY }}
            >
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>

          {/* Browser badge footer */}
          <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
            <span className="truncate max-w-[170px]" title={browserInfo.browserName}>
              {browserInfo.browserName}
            </span>
            <span className="font-mono text-[10px] text-cyan-300">
              {browserInfo.browserId?.slice(0, 12)}...
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
