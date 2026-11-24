import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Mail,
  Smartphone,
  ShoppingBag,
  UserPlus,
  FileCheck,
  AlertTriangle,
  RotateCcw,
  MessageSquare,
  CreditCard,
  Truck,
  ServerCrash,
  ShieldAlert,
  CheckCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adminHeaders } from "@/lib/adminApi";
import { cn } from "@/lib/utils";

const NAVY = "#0A1F44";

export interface NotifChannelPref {
  email: boolean;
  inApp: boolean;
  sms: boolean;
}

export type NotifPrefs = Record<string, NotifChannelPref>;

export interface NotifCategoryConfig {
  key: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export const NOTIF_CATEGORIES: NotifCategoryConfig[] = [
  {
    key: "new_order",
    label: "New Order",
    desc: "When a customer successfully places an order",
    icon: ShoppingBag,
  },
  {
    key: "new_vendor_registration",
    label: "New Seller Registration",
    desc: "When a seller submits a new registration or claims a shop",
    icon: UserPlus,
  },
  {
    key: "vendor_approval_required",
    label: "Seller Approval Required",
    desc: "When KYC documents (PAN, GST, Bank) are submitted for review",
    icon: FileCheck,
  },
  {
    key: "vendor_dispute",
    label: "Seller Dispute",
    desc: "When a seller raises an escalation or formal dispute",
    icon: AlertTriangle,
  },
  {
    key: "refund_request",
    label: "Refund Request",
    desc: "When a customer submits a return or refund claim",
    icon: RotateCcw,
  },
  {
    key: "support_ticket",
    label: "Support Ticket",
    desc: "When a new customer or seller support ticket is opened",
    icon: MessageSquare,
  },
  {
    key: "payment_failure",
    label: "Payment Failure",
    desc: "When a customer checkout payment or seller payout fails",
    icon: CreditCard,
  },
  {
    key: "shipping_issue",
    label: "Shipping Issue",
    desc: "When shipment delivery issues, RTO, or carrier delays occur",
    icon: Truck,
  },
  {
    key: "system_error",
    label: "System Error",
    desc: "Critical backend, integration, or email outbox alerts",
    icon: ServerCrash,
  },
  {
    key: "security_login_alert",
    label: "Security / Login Alert",
    desc: "Admin logins, access key updates, and device authorization alerts",
    icon: ShieldAlert,
  },
];

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  isSaving?: boolean;
  ariaLabel: string;
}

function ToggleSwitch({ checked, onChange, disabled, isSaving, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => {
        if (!disabled && !isSaving) {
          onChange(!checked);
        }
      }}
      disabled={disabled || isSaving}
      className={cn(
        "w-10 h-6 rounded-full relative transition-colors duration-200 focus:outline-none shrink-0 inline-flex items-center",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
        checked ? "bg-[#0A1F44]" : "bg-gray-300"
      )}
    >
      <span
        className={cn(
          "w-4 h-4 rounded-full bg-white shadow-sm flex items-center justify-center transition-transform duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-1"
        )}
      >
        {isSaving && (
          <Loader2 size={10} className="animate-spin text-gray-500" />
        )}
      </span>
    </button>
  );
}

export function AdminNotificationPrefs({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [localPrefs, setLocalPrefs] = useState<NotifPrefs | null>(null);
  const [activeToggleKey, setActiveToggleKey] = useState<string | null>(null);
  const previousPrefsRef = useRef<NotifPrefs | null>(null);

  // Fetch admin notification preferences
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ prefs: NotifPrefs }>({
    queryKey: ["admin-notif-prefs"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings/notification-prefs", {
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load notification preferences");
      }
      return res.json();
    },
    staleTime: 30000,
  });

  // Sync server data to local optimistic state
  useEffect(() => {
    if (data?.prefs) {
      setLocalPrefs(data.prefs);
      previousPrefsRef.current = data.prefs;
    }
  }, [data]);

  // Mutation to persist preferences immediately
  const saveMutation = useMutation({
    mutationFn: async (updatedPrefs: NotifPrefs) => {
      const res = await fetch("/api/admin/settings/notification-prefs", {
        method: "PATCH",
        headers: {
          ...adminHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ prefs: updatedPrefs }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update notification preferences");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      previousPrefsRef.current = variables;
      qc.invalidateQueries({ queryKey: ["admin-notif-prefs"] });
      setActiveToggleKey(null);
    },
    onError: (err: any) => {
      // Rollback on failure
      if (previousPrefsRef.current) {
        setLocalPrefs(previousPrefsRef.current);
      }
      setActiveToggleKey(null);
      toast({
        title: "Update Failed",
        description: err.message || "Could not save notification preferences. Reverted changes.",
        variant: "destructive",
      });
    },
  });

  const handleToggle = useCallback(
    (catKey: string, channel: "email" | "inApp" | "sms", newValue: boolean) => {
      if (!localPrefs) return;

      const toggleKey = `${catKey}:${channel}`;
      setActiveToggleKey(toggleKey);

      const updatedCategory = {
        ...(localPrefs[catKey] || { email: true, inApp: true, sms: false }),
        [channel]: newValue,
      };

      const nextPrefs: NotifPrefs = {
        ...localPrefs,
        [catKey]: updatedCategory,
      };

      // Optimistic update
      setLocalPrefs(nextPrefs);

      const categoryConfig = NOTIF_CATEGORIES.find((c) => c.key === catKey);
      const channelLabel = channel === "inApp" ? "In-App" : channel.toUpperCase();

      saveMutation.mutate(nextPrefs, {
        onSuccess: () => {
          toast({
            title: "Preference Updated",
            description: `${categoryConfig?.label || catKey} (${channelLabel}) notifications turned ${
              newValue ? "ON" : "OFF"
            }.`,
          });
        },
      });
    },
    [localPrefs, saveMutation, toast]
  );

  return (
    <div className={cn("space-y-4", !embedded && "p-6")}>
      {/* Real-time Status Card */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0A1F44] text-white flex items-center justify-center shrink-0 shadow-xs">
            <Bell size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              Multi-Channel Alert Delivery
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Live &amp; Synchronized
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Notifications are triggered and dispatched across enabled <strong>Email</strong>, <strong>In-App</strong>, and <strong>SMS</strong> channels in real time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveMutation.isPending && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-medium">
              <Loader2 size={12} className="animate-spin" /> Saving changes…
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Refresh preferences"
          >
            <RefreshCw size={12} className={isLoading || isFetching ? "animate-spin" : ""} />
            Sync
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="p-8 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 size={24} className="animate-spin text-[#0A1F44]" />
            <p className="text-xs font-medium">Loading admin notification preferences…</p>
          </div>
        ) : isError ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-red-600 font-semibold">
              {(error as any)?.message || "Unable to load notification preferences."}
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 text-xs font-bold text-white bg-[#0A1F44] rounded-lg hover:bg-[#2C3E6B] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5 min-w-[260px]">Event Category</th>
                  <th className="px-4 py-3.5 text-center w-28">
                    <span className="inline-flex items-center gap-1 text-gray-700">
                      <Mail size={13} className="text-blue-600" />
                      Email
                    </span>
                  </th>
                  <th className="px-4 py-3.5 text-center w-28">
                    <span className="inline-flex items-center gap-1 text-gray-700">
                      <Bell size={13} className="text-amber-600" />
                      In-App
                    </span>
                  </th>
                  <th className="px-4 py-3.5 text-center w-28">
                    <span className="inline-flex items-center gap-1 text-gray-700">
                      <Smartphone size={13} className="text-emerald-600" />
                      SMS
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {NOTIF_CATEGORIES.map(({ key, label, desc, icon: Icon }) => {
                  const pref = localPrefs?.[key] ?? { email: true, inApp: true, sms: false };
                  const isEmailSaving = activeToggleKey === `${key}:email` && saveMutation.isPending;
                  const isInAppSaving = activeToggleKey === `${key}:inApp` && saveMutation.isPending;
                  const isSmsSaving = activeToggleKey === `${key}:sms` && saveMutation.isPending;

                  return (
                    <tr
                      key={key}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[#0A1F44] shrink-0 mt-0.5">
                            <Icon size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{label}</p>
                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                          </div>
                        </div>
                      </td>

                      {/* Email Channel */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <ToggleSwitch
                            checked={pref.email}
                            onChange={(v) => handleToggle(key, "email", v)}
                            isSaving={isEmailSaving}
                            ariaLabel={`Toggle Email notification for ${label}`}
                          />
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase",
                              pref.email ? "text-blue-700" : "text-gray-400"
                            )}
                          >
                            {pref.email ? "ON" : "OFF"}
                          </span>
                        </div>
                      </td>

                      {/* In-App Channel */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <ToggleSwitch
                            checked={pref.inApp}
                            onChange={(v) => handleToggle(key, "inApp", v)}
                            isSaving={isInAppSaving}
                            ariaLabel={`Toggle In-App notification for ${label}`}
                          />
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase",
                              pref.inApp ? "text-amber-700" : "text-gray-400"
                            )}
                          >
                            {pref.inApp ? "ON" : "OFF"}
                          </span>
                        </div>
                      </td>

                      {/* SMS Channel */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <ToggleSwitch
                            checked={pref.sms}
                            onChange={(v) => handleToggle(key, "sms", v)}
                            isSaving={isSmsSaving}
                            ariaLabel={`Toggle SMS notification for ${label}`}
                          />
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase",
                              pref.sms ? "text-emerald-700" : "text-gray-400"
                            )}
                          >
                            {pref.sms ? "ON" : "OFF"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Informational Guidance Footer */}
      <div className="p-4 rounded-xl bg-white border border-gray-200/80 text-xs text-gray-500 space-y-1.5 shadow-2xs">
        <p className="font-semibold text-gray-700 flex items-center gap-1.5">
          <CheckCircle size={14} className="text-emerald-600" />
          Delivery Rules &amp; Channel Destination
        </p>
        <p className="text-[11px] leading-relaxed">
          • <strong>Email Alerts:</strong> Sent to the primary administrative email address configured under Email Settings.
        </p>
        <p className="text-[11px] leading-relaxed">
          • <strong>In-App Alerts:</strong> Render in the Admin Notification Center and update the Navbar bell icon in real time via live sockets.
        </p>
        <p className="text-[11px] leading-relaxed">
          • <strong>SMS Alerts:</strong> Sent to the verified admin mobile number configured in Admin Profile.
        </p>
      </div>
    </div>
  );
}

