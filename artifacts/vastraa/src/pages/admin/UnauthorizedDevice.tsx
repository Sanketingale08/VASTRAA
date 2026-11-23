import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ShieldAlert,
  ShieldX,
  Lock,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  HelpCircle,
  Laptop,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import {
  getOrCreateDeviceId,
  getDeviceName,
  checkCurrentDeviceStatus,
  registerCurrentDevice,
  detectEnvironment,
} from "@/lib/deviceAuth";
import { clearAdminSession } from "@/lib/adminApi";

const NAVY = "#0A1F44";
const NAVY_DARK = "#071329";
const GOLD = "#C7CCD1";

export default function UnauthorizedDevice() {
  const [, setLocation] = useLocation();
  const [deviceId, setDeviceId] = useState<string>("");
  const [deviceName, setDeviceNameState] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string>("unauthorized");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [envInfo, setEnvInfo] = useState<{ browser: string; os: string; deviceType: "mobile" | "desktop" | "tablet" }>({ browser: "", os: "", deviceType: "desktop" });

  useEffect(() => {
    // Update title
    document.title = "Unauthorized Browser – VASTRAA Admin Panel";

    const id = getOrCreateDeviceId();
    setDeviceId(id);
    const dName = getDeviceName();
    setDeviceNameState(dName);
    setEnvInfo(detectEnvironment());

    // Parse URL params for code
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code === "DEVICE_BLOCKED" || code === "BROWSER_BLOCKED") {
      setStatus("blocked");
      setStatusMessage("This browser has been explicitly blocked by the Super Admin.");
    } else if (code === "DEVICE_REVOKED" || code === "BROWSER_REVOKED") {
      setStatus("revoked");
      setStatusMessage("Authorization for this browser was previously granted and has now been revoked.");
    } else if (code === "DEVICE_CREDENTIAL_INVALID" || code === "BROWSER_CREDENTIAL_INVALID") {
      setStatus("invalid_credential");
      setStatusMessage("Browser cryptographic credentials could not be verified.");
    } else {
      setStatus("unauthorized");
      setStatusMessage("Unauthorized Browser – This browser is not authorized to access the VASTRAA Admin Panel. Please contact the Super Admin for access.");
    }

    // Auto-register device to ensure backend knows about it as pending
    registerCurrentDevice()
      .then((res) => {
        if (res.status === "authorized") {
          // If auto-authorized (e.g. bootstrap), redirect immediately
          setLocation("/admin/dashboard");
        } else if (res.status) {
          setStatus(res.status);
        }
      })
      .catch(() => {});
  }, [setLocation]);

  const copyDeviceId = () => {
    if (!deviceId) return;
    navigator.clipboard.writeText(deviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const res = await checkCurrentDeviceStatus();
      if (res.authorized) {
        setLocation("/admin/dashboard");
        return;
      }
      setStatus(res.status || "unauthorized");
      if (res.status === "blocked") {
        setStatusMessage("This browser has been blocked by the Super Administrator.");
      } else if (res.status === "revoked") {
        setStatusMessage("Access for this browser has been revoked.");
      } else {
        setStatusMessage("Unauthorized Browser – This browser is not authorized to access the VASTRAA Admin Panel. Please contact the Super Admin for access.");
      }
    } catch {
      setStatusMessage("Unable to verify browser status. Please check your network connection.");
    } finally {
      setChecking(false);
    }
  };

  const handleReturnToLogin = () => {
    clearAdminSession();
    setLocation("/admin/login");
  };

  // Status badge styling
  const getStatusBadge = () => {
    switch (status) {
      case "blocked":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
            Access Blocked
          </span>
        );
      case "revoked":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
            <span className="w-2 h-2 rounded-full bg-orange-600" />
            Access Revoked
          </span>
        );
      case "pending":
      case "unauthorized":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-600" />
            Unauthorized / Pending Approval
          </span>
        );
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-between p-4 sm:p-6 lg:p-8"
      style={{
        background: `radial-gradient(ellipse at top, ${NAVY} 0%, ${NAVY_DARK} 100%)`,
      }}
    >
      {/* Top Brand Bar */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-9 px-3 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center">
            <span className="font-serif tracking-widest text-white text-sm font-bold">VASTRAA</span>
          </div>
          <span className="text-xs uppercase tracking-wider text-gray-300 font-semibold border-l border-white/20 pl-3">
            Security Gateway
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-red-300 bg-red-950/60 border border-red-500/30 px-3 py-1.5 rounded-lg">
          <Lock size={13} className="text-red-400" />
          <span>Restricted Admin Perimeter</span>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="w-full max-w-xl mx-auto my-8">
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
          {/* Card Header Alert */}
          <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 p-6 text-white text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center mb-3 shadow-inner">
                {status === "blocked" ? (
                  <ShieldX size={34} className="text-white animate-bounce" />
                ) : (
                  <ShieldAlert size={34} className="text-white" />
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Unauthorized Browser</h1>
              <p className="text-xs sm:text-sm text-white/90 mt-1 max-w-md">
                Unauthorized Browser – This browser is not authorized to access the VASTRAA Admin Panel. Please contact the Super Admin for access.
              </p>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-6 sm:p-8 space-y-6">
            {/* Status explanation */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs sm:text-sm">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-950">
                  {statusMessage || "Unauthorized Browser – This browser is not authorized to access the VASTRAA Admin Panel. Please contact the Super Admin for access."}
                </p>
                <p className="text-amber-800/90 text-xs mt-1">
                  Each browser profile and Incognito mode possesses its own cryptographic keypair. An administrator must whitelist this Browser ID before access is permitted.
                </p>
              </div>
            </div>

            {/* Device Identity Details */}
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Browser ID</span>
                {getStatusBadge()}
              </div>

              {/* Monospace Device ID & Copy Button */}
              <div className="flex items-center gap-2">
                <div className="flex-1 font-mono text-sm sm:text-base font-bold text-gray-900 bg-white px-4 py-3 rounded-xl border border-gray-300 shadow-2xs tracking-wide select-all overflow-x-auto">
                  {deviceId || "Generating browser identity..."}
                </div>
                <button
                  onClick={copyDeviceId}
                  className="px-4 py-3 bg-[#0A1F44] hover:bg-[#071329] text-white rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
                  title="Copy Browser ID"
                >
                  {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  <span>{copied ? "Copied!" : "Copy Browser ID"}</span>
                </button>
              </div>

              {/* Hardware / Environment Metadata */}
              <div className="pt-2 border-t border-gray-200/60 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-400 block text-[11px]">Browser Name</span>
                  <span className="font-medium text-gray-800 truncate block mt-0.5" title={envInfo.browser}>
                    {envInfo.browser || "Web Browser"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">Device / OS</span>
                  <span className="font-medium text-gray-800 truncate block mt-0.5">
                    {envInfo.os} ({envInfo.deviceType})
                  </span>
                </div>
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="border border-gray-100 rounded-2xl p-5 bg-white space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <HelpCircle size={14} className="text-[#0A1F44]" />
                How to Request Authorization
              </h3>
              <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside pl-1">
                <li>
                  Click <strong className="text-gray-900">Copy ID</strong> to copy your unique Device ID.
                </li>
                <li>
                  Send your Device ID to the <strong className="text-gray-900">VASTRAA Super Administrator</strong>.
                </li>
                <li>
                  The Super Admin will navigate to:
                  <div className="mt-1 px-3 py-1.5 bg-gray-100 rounded-lg font-mono text-[11px] text-gray-800">
                    Admin Panel → Settings → Security Settings → Allow Devices
                  </div>
                </li>
                <li>
                  Once allowed, click <strong className="text-gray-900">Refresh Status</strong> below to continue to the portal.
                </li>
              </ol>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleCheckStatus}
                disabled={checking}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-[#0A1F44] hover:bg-[#071329] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
              >
                <RefreshCw size={16} className={checking ? "animate-spin text-emerald-400" : ""} />
                <span>{checking ? "Checking Authorization..." : "Refresh Status"}</span>
              </button>

              <button
                onClick={handleReturnToLogin}
                className="py-3 px-5 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
              >
                <LogOut size={16} className="text-gray-500" />
                <span>Return to Login</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Notice */}
      <div className="w-full max-w-4xl mx-auto text-center text-xs text-gray-400 py-2">
        <p>
          VASTRAA Enterprise Security &bull; Cryptographic Hardware Device Bound &bull; Unapproved requests are logged and audited.
        </p>
      </div>
    </div>
  );
}

