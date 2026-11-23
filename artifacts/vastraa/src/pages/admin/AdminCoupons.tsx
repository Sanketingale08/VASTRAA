import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Plus,
  X,
  Pencil,
  Ban,
  Check,
  Loader2,
  BadgePercent,
  Search,
  RefreshCw,
  LayoutGrid,
  List,
  BarChart3,
  Trash2,
  Users,
  Calendar,
  ShoppingCart,
  IndianRupee,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  Tag,
  Megaphone,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import {
  AdminErrorBoundary,
  AdminErrorState,
  AdminEmptyState,
  getFriendlyErrorMessage,
} from "@/components/admin/AdminErrorHandling";
import { VastraaCouponCard } from "@/components/VastraaCouponCard";
import { adminHeaders } from "@/lib/adminApi";

const NAVY = "#0B2044";
const GOLD = "#D4AF5A";

export const VASTRAA_CATEGORIES = [
  "All Categories",
  "Sarees",
  "Kurtis",
  "Kurta Sets",
  "Ethnic Dresses",
  "Western Dresses",
  "Winter Wear",
  "Tops",
];

interface Coupon {
  id: string;
  code: string;
  type: "percent" | "flat";
  value: number;
  description: string | null;
  offerDisplayText: string | null;
  minimumOrderValue?: number;
  maxDiscountAmount?: number | null;
  eligibleCategories?: string[] | null;
  applicableProducts?: string[] | null;
  firstOrderOnly?: boolean;
  perCustomerLimit?: number | null;
  startDate?: string | null;
  active: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  createdAt: string;
}

interface CouponFormState {
  code: string;
  type: "percent" | "flat";
  value: string;
  description: string;
  offerDisplayText: string;
  minimumOrderValue: string;
  maxDiscountAmount: string;
  eligibleCategories: string[];
  applicableProducts: string;
  firstOrderOnly: boolean;
  perCustomerLimit: string;
  startDate: string;
  active: boolean;
  expiresAt: string;
  maxUses: string;
}

const emptyForm: CouponFormState = {
  code: "",
  type: "percent",
  value: "",
  description: "",
  offerDisplayText: "",
  minimumOrderValue: "",
  maxDiscountAmount: "",
  eligibleCategories: ["All Categories"],
  applicableProducts: "",
  firstOrderOnly: false,
  perCustomerLimit: "",
  startDate: "",
  active: true,
  expiresAt: "",
  maxUses: "",
};

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "No expiry";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No expiry";
  return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isExpired(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

function isScheduled(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

// ─── COUPON FORM MODAL ──────────────────────────────────────────────────────────
function CouponFormModal({
  initial,
  title,
  submitLabel,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  initial: CouponFormState;
  title: string;
  submitLabel: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (form: CouponFormState) => void;
}) {
  const [form, setForm] = useState<CouponFormState>(initial);

  function update<K extends keyof CouponFormState>(key: K, value: CouponFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCategory(cat: string) {
    setForm((prev) => {
      let current = [...prev.eligibleCategories];
      if (cat === "All Categories") {
        return { ...prev, eligibleCategories: ["All Categories"] };
      }
      current = current.filter((c) => c !== "All Categories");
      if (current.includes(cat)) {
        current = current.filter((c) => c !== cat);
        if (current.length === 0) current = ["All Categories"];
      } else {
        current.push(cat);
      }
      return { ...prev, eligibleCategories: current };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0 bg-white">
          <div className="flex items-center gap-2">
            <Tag size={18} style={{ color: NAVY }} />
            <h2 className="text-base font-serif font-bold text-[#0B2044]">{title}</h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
          className="px-5 py-4 space-y-4 overflow-y-auto"
        >
          {/* Coupon Code */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              1. Coupon Code <span className="text-red-500">*</span>
            </label>
            <input
              value={form.code}
              onChange={(e) => update("code", e.target.value.toUpperCase().replace(/\s+/g, ""))}
              placeholder="e.g. SAVE200"
              required
              className="w-full px-3 py-2 text-sm font-mono font-bold rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1] uppercase tracking-wider"
            />
            <p className="text-[11px] text-gray-400 mt-1">Unique alphanumeric promo code entered by shoppers.</p>
          </div>

          {/* Discount Type and Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                4. Discount Type <span className="text-red-500">*</span>
              </label>
              <select
                value={form.type}
                onChange={(e) => update("type", e.target.value as "percent" | "flat")}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1] font-medium"
              >
                <option value="flat">Fixed Amount (₹)</option>
                <option value="percent">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                5. Discount Value <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                step={form.type === "percent" ? "1" : "1"}
                value={form.value}
                onChange={(e) => update("value", e.target.value)}
                placeholder={form.type === "percent" ? "e.g. 15 for 15%" : "e.g. 200 for ₹200"}
                required
                className="w-full px-3 py-2 text-sm font-semibold rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
            </div>
          </div>

          {/* Offer Title & Customer Display Text */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                2. Coupon Title / Promotional Display Text
              </label>
              <span
                className={`text-[11px] font-mono ${
                  form.offerDisplayText.length > 120 ? "text-red-500 font-bold" : "text-gray-400"
                }`}
              >
                {form.offerDisplayText.length}/120
              </span>
            </div>
            <input
              type="text"
              maxLength={120}
              value={form.offerDisplayText}
              onChange={(e) => update("offerDisplayText", e.target.value)}
              placeholder="e.g. Get ₹200 OFF on shopping of ₹2,000 or more!"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Customer-facing marketing message shown on the checkout banner and coupon cards.
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              3. Description (Terms & Details)
            </label>
            <input
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="e.g. Valid on all handcrafted sarees and kurtas for a limited period"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
            />
          </div>

          {/* Min Order Value and Max Discount Cap */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                6. Min Order Value (₹)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.minimumOrderValue}
                onChange={(e) => update("minimumOrderValue", e.target.value)}
                placeholder="e.g. 2000 (0 = No min)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Coupon requires cart total ≥ this threshold.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                7. Max Discount Cap (₹)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.maxDiscountAmount}
                onChange={(e) => update("maxDiscountAmount", e.target.value)}
                placeholder="e.g. 500 (For % discounts)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Ceiling cap for percentage-based offers.</p>
            </div>
          </div>

          {/* Applicable Categories */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              12. Applicable Categories
            </label>
            <div className="flex flex-wrap gap-1.5">
              {VASTRAA_CATEGORIES.map((cat) => {
                const isSelected = form.eligibleCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                      isSelected
                        ? "bg-[#0B2044] text-white border-[#0B2044] shadow-xs"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Select specific clothing categories or choose "All Categories" for universal applicability.
            </p>
          </div>

          {/* Applicable Products (optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              13. Applicable Products (Optional)
            </label>
            <input
              type="text"
              value={form.applicableProducts}
              onChange={(e) => update("applicableProducts", e.target.value)}
              placeholder="e.g. prod-123, prod-456 (Leave empty to apply to all products in category)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Comma-separated product IDs. If left blank, all products in the selected categories qualify.
            </p>
          </div>

          {/* Start and Expiry Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                10. Start Date
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => update("startDate", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                11. Expiry Date
              </label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => update("expiresAt", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
            </div>
          </div>

          {/* Usage Limits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                8. Maximum Total Usage Limit
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={form.maxUses}
                onChange={(e) => update("maxUses", e.target.value)}
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Total times this coupon can be redeemed platform-wide.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                9. Usage Limit Per Customer
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={form.perCustomerLimit}
                onChange={(e) => update("perCustomerLimit", e.target.value)}
                placeholder="e.g. 1 (Default: 1 per user)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Max redemptions allowed per registered shopper.</p>
            </div>
          </div>

          {/* Status and First-Time Toggle */}
          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.firstOrderOnly}
                onChange={(e) => update("firstOrderOnly", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#0B2044] focus:ring-[#0B2044]"
              />
              <span className="text-sm font-semibold text-gray-700">15. First-Time Customer Only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => update("active", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#0B2044] focus:ring-[#0B2044]"
              />
              <span className="text-sm font-semibold text-gray-700">14. Coupon Active</span>
            </label>
          </div>

          {/* Live Card Preview (Shopper View) */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Live Card Preview (Shopper View)
              </label>
              <span className="text-[10px] text-gray-400">Updates live as you type</span>
            </div>
            <div className="bg-[#F8F9FA] p-3 rounded-xl border border-gray-100">
              <VastraaCouponCard
                coupon={{
                  code: form.code.trim() || "SAVE200",
                  type: form.type,
                  value: Number(form.value) || (form.type === "percent" ? 10 : 200),
                  description: form.description.trim() || "Get ₹200 OFF on shopping of ₹2,000 or more!",
                  offerDisplayText: form.offerDisplayText.trim() || undefined,
                  minimumOrderValue: Number(form.minimumOrderValue) || 2000,
                  maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
                  eligibleCategories: form.eligibleCategories.includes("All Categories")
                    ? null
                    : form.eligibleCategories,
                  firstOrderOnly: form.firstOrderOnly,
                  expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
                  maxUses: form.maxUses ? Number(form.maxUses) : null,
                  usedCount: 0,
                  active: form.active,
                }}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg px-3.5 py-2.5 text-xs bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm rounded-lg font-semibold flex items-center gap-2 text-[#FBF9F5] shadow-sm disabled:opacity-60 transition-all"
              style={{ background: NAVY }}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── COUPON ANALYTICS & REDEMPTIONS MODAL ──────────────────────────────────────
function CouponAnalyticsModal({
  coupon,
  onClose,
}: {
  coupon: Coupon;
  onClose: () => void;
}) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/admin/coupons/${coupon.id}/analytics`, {
      headers: adminHeaders(),
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((d) => setData(d))
      .catch((err) => setError(err.message || "Failed to load coupon analytics"))
      .finally(() => setLoading(false));
  }, [coupon.id]);

  function exportCsv() {
    if (!data?.customers || data.customers.length === 0) return;
    const headers = ["Order ID", "Customer Name", "Customer Email", "Discount (₹)", "Order Total (₹)", "Payment Method", "Payment Status", "Order Status", "Redeemed At"];
    const rows = data.customers.map((c: any) => [
      c.displayOrderId || c.orderId,
      `"${(c.customerName || "").replace(/"/g, '""')}"`,
      `"${(c.customerEmail || "").replace(/"/g, '""')}"`,
      c.discountAmount,
      c.orderTotal,
      c.paymentMethod,
      c.paymentStatus,
      c.status,
      new Date(c.redeemedAt).toLocaleString("en-IN"),
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e: any[]) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Coupon-Redemptions-${coupon.code}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const a = data?.analytics;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#0B2044] text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-[#D4AF5A]">
              <BarChart3 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-serif font-bold tracking-wide">{coupon.code}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 text-[#FBF9F5]">
                  {coupon.type === "percent" ? `${coupon.value}% OFF` : `₹${coupon.value} OFF`}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    coupon.active ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30" : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {coupon.active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-0.5">
                {coupon.offerDisplayText || coupon.description || "Comprehensive redemption metrics and customer usage history"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data?.customers && data.customers.length > 0 && (
              <button
                type="button"
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-[#FBF9F5] transition-colors"
                title="Export Redemptions CSV"
              >
                <Download size={13} /> Export CSV
              </button>
            )}
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading && (
            <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-2">
              <Loader2 size={24} className="animate-spin text-[#0B2044]" />
              <span className="text-sm">Loading coupon performance analytics…</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && a && (
            <>
              {/* KPI Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-3.5 rounded-xl bg-[#F8F9FA] border border-gray-100 flex flex-col">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Redemptions</span>
                  <span className="text-xl font-bold font-mono text-[#0B2044] mt-1">{a.totalRedemptions}</span>
                  <span className="text-[10px] text-gray-400 mt-auto">times applied</span>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 flex flex-col">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Total Savings</span>
                  <span className="text-xl font-bold font-mono text-emerald-800 mt-1">₹{a.totalDiscountAmount.toLocaleString("en-IN")}</span>
                  <span className="text-[10px] text-emerald-600 mt-auto">discount given</span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8F9FA] border border-gray-100 flex flex-col">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Orders Created</span>
                  <span className="text-xl font-bold font-mono text-gray-800 mt-1">{a.totalOrdersGenerated}</span>
                  <span className="text-[10px] text-gray-400 mt-auto">associated orders</span>
                </div>

                <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 flex flex-col">
                  <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Paid / Confirmed</span>
                  <span className="text-xl font-bold font-mono text-blue-800 mt-1">{a.successfulPayments}</span>
                  <span className="text-[10px] text-blue-600 mt-auto">successful orders</span>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-100 flex flex-col">
                  <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Remaining Uses</span>
                  <span className="text-xl font-bold font-mono text-amber-800 mt-1">
                    {a.remainingUses != null ? a.remainingUses : "∞"}
                  </span>
                  <span className="text-[10px] text-amber-600 mt-auto">
                    {coupon.maxUses != null ? `of ${coupon.maxUses} max` : "unlimited"}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-purple-50/60 border border-purple-100 flex flex-col">
                  <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Conversion</span>
                  <span className="text-xl font-bold font-mono text-purple-800 mt-1">{a.conversionRate}</span>
                  <span className="text-[10px] text-purple-600 mt-auto">success rate</span>
                </div>
              </div>

              {/* Customers Who Redeemed Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-[#0B2044]" />
                    <h3 className="font-serif font-bold text-sm text-[#0B2044]">
                      Customers Who Redeemed ({data?.customers?.length || 0})
                    </h3>
                  </div>
                  <span className="text-xs text-gray-400">Order & discount history</span>
                </div>

                {(!data?.customers || data.customers.length === 0) ? (
                  <div className="py-12 text-center rounded-xl bg-gray-50 border border-gray-100 text-gray-400 text-sm">
                    No customer redemptions recorded for this coupon yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#F8F9FA] border-b border-gray-200 text-gray-500 uppercase font-semibold">
                        <tr>
                          <th className="px-4 py-2.5">Customer</th>
                          <th className="px-3 py-2.5">Order ID</th>
                          <th className="px-3 py-2.5">Redeemed At</th>
                          <th className="px-3 py-2.5 text-right">Order Total</th>
                          <th className="px-3 py-2.5 text-right text-emerald-700">Discount</th>
                          <th className="px-3 py-2.5">Payment</th>
                          <th className="px-3 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.customers.map((c: any) => (
                          <tr key={c.id || c.orderId} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-gray-900">{c.customerName || "Customer"}</div>
                              {c.customerEmail && <div className="text-[11px] text-gray-400 truncate max-w-[180px]">{c.customerEmail}</div>}
                            </td>
                            <td className="px-3 py-2.5 font-mono font-semibold text-[#0B2044]">
                              {c.displayOrderId || c.orderId}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500">
                              {formatDateTime(c.redeemedAt)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-medium text-gray-800">
                              ₹{Number(c.orderTotal || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-700">
                              −₹{Number(c.discountAmount || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  c.paymentStatus === "paid"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : c.paymentStatus === "failed"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {c.paymentStatus || "unpaid"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="capitalize px-2 py-0.5 rounded-md text-[10px] bg-gray-100 text-gray-700 font-medium">
                                {c.status || "confirmed"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SAFEGUARDED DELETE CONFIRMATION MODAL ─────────────────────────────────────
function DeleteCouponModal({
  coupon,
  onClose,
  onDeactivate,
  onPermanentDelete,
  loading,
}: {
  coupon: Coupon;
  onClose: () => void;
  onDeactivate: () => void;
  onPermanentDelete: (force: boolean) => void;
  loading: boolean;
}) {
  const hasUsage = (coupon.usedCount || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-50 text-red-600">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3 className="font-serif font-bold text-base text-gray-900">Delete Coupon "{coupon.code}"</h3>
            <p className="text-xs text-gray-400 mt-0.5">Please review safeguards before removing</p>
          </div>
        </div>

        {hasUsage ? (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-2">
            <p className="flex items-center gap-1.5 font-semibold text-amber-800">
              <AlertTriangle size={14} className="text-amber-600 shrink-0" />
              <span>Warning: This coupon has been redeemed by <strong>{coupon.usedCount} customer(s)</strong>.</span>
            </p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Deleting it permanently will purge coupon metadata associated with previous customer orders and analytics.
              We recommend <strong>Deactivating</strong> the coupon instead so historical order references remain intact.
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-600 leading-relaxed">
            Are you sure you want to delete coupon <strong>{coupon.code}</strong>? This action cannot be undone.
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-2 text-xs rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          {coupon.active && (
            <button
              type="button"
              disabled={loading}
              onClick={onDeactivate}
              className="px-3.5 py-2 text-xs rounded-lg font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
            >
              Deactivate Instead
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => onPermanentDelete(hasUsage)}
            className="px-3.5 py-2 text-xs rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COUPONS CONTENT ──────────────────────────────────────────────────────
function CouponsContent() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "scheduled" | "expired" | "inactive">("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<Coupon | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  function loadCoupons() {
    setLoading(true);
    setError("");
    fetch(`/api/admin/coupons`, {
      headers: adminHeaders(),
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const err: any = new Error(body.error || `HTTP ${r.status}`);
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .then((d) => setCoupons(d.coupons ?? []))
      .catch((err) => setError(getFriendlyErrorMessage(err, "Coupons")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadCoupons();
  }, []);

  const counts = useMemo(() => {
    const now = Date.now();
    return {
      all: coupons.length,
      active: coupons.filter(
        (c) => c.active && (!c.expiresAt || new Date(c.expiresAt).getTime() > now) && (!c.startDate || new Date(c.startDate).getTime() <= now)
      ).length,
      scheduled: coupons.filter((c) => c.active && c.startDate && new Date(c.startDate).getTime() > now).length,
      expired: coupons.filter((c) => c.expiresAt && new Date(c.expiresAt).getTime() <= now).length,
      inactive: coupons.filter((c) => !c.active).length,
    };
  }, [coupons]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let list = coupons;

    if (activeTab === "active") {
      list = list.filter(
        (c) => c.active && (!c.expiresAt || new Date(c.expiresAt).getTime() > now) && (!c.startDate || new Date(c.startDate).getTime() <= now)
      );
    } else if (activeTab === "scheduled") {
      list = list.filter((c) => c.active && c.startDate && new Date(c.startDate).getTime() > now);
    } else if (activeTab === "expired") {
      list = list.filter((c) => c.expiresAt && new Date(c.expiresAt).getTime() <= now);
    } else if (activeTab === "inactive") {
      list = list.filter((c) => !c.active);
    }

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        (c.offerDisplayText ?? "").toLowerCase().includes(q)
    );
  }, [coupons, activeTab, search]);

  function buildPayload(form: CouponFormState) {
    const value = parseFloat(form.value);
    const maxUses = form.maxUses.trim() ? parseInt(form.maxUses, 10) : null;
    const trimmedOffer = form.offerDisplayText.trim();
    const minimumOrderValue = form.minimumOrderValue.trim() ? Math.max(0, parseFloat(form.minimumOrderValue)) : 0;
    const maxDiscountAmount = form.maxDiscountAmount.trim() ? Math.max(0, parseFloat(form.maxDiscountAmount)) : null;
    const perCustomerLimit = form.perCustomerLimit.trim() ? Math.max(1, parseInt(form.perCustomerLimit, 10)) : null;

    const eligibleCategories = form.eligibleCategories.includes("All Categories")
      ? null
      : form.eligibleCategories.length > 0
      ? form.eligibleCategories
      : null;

    const applicableProducts = form.applicableProducts.trim()
      ? form.applicableProducts.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    return {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value,
      description: form.description.trim(),
      offerDisplayText: trimmedOffer.length > 0 ? trimmedOffer : null,
      minimumOrderValue,
      maxDiscountAmount,
      eligibleCategories,
      applicableProducts,
      firstOrderOnly: Boolean(form.firstOrderOnly),
      perCustomerLimit,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      active: form.active,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      maxUses,
    };
  }

  async function handleCreate(form: CouponFormState) {
    if (inFlight.current.has("createCoupon")) return;
    inFlight.current.add("createCoupon");
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/admin/coupons`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error ?? "Failed to create coupon");
        return;
      }
      setCoupons((prev) => [data.coupon, ...prev]);
      setShowCreate(false);
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      inFlight.current.delete("createCoupon");
      setSaving(false);
    }
  }

  async function handleEdit(form: CouponFormState) {
    if (!editing) return;
    const key = "editCoupon:" + editing.id;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/admin/coupons/${editing.id}`, {
        method: "PUT",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error ?? "Failed to update coupon");
        return;
      }
      setCoupons((prev) => prev.map((c) => (c.id === editing.id ? data.coupon : c)));
      setEditing(null);
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      inFlight.current.delete(key);
      setSaving(false);
    }
  }

  async function handleToggleActive(coupon: Coupon) {
    const key = coupon.id;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setActionLoading(key);
    try {
      const newStatus = !coupon.active;
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: newStatus ? "PUT" : "DELETE",
        headers: adminHeaders(),
        credentials: "include",
        body: newStatus ? JSON.stringify({ active: true }) : undefined,
      });
      if (res.ok) {
        setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, active: newStatus } : c)));
      }
    } finally {
      inFlight.current.delete(key);
      setActionLoading(null);
    }
  }

  async function handlePermanentDelete(coupon: Coupon, force: boolean) {
    const key = "delete:" + coupon.id;
    setActionLoading(key);
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}/permanent${force ? "?force=true" : ""}`, {
        method: "DELETE",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
        setDeleteTarget(null);
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.error || "Failed to delete coupon");
      }
    } catch {
      alert("Network error. Could not delete coupon.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Banner & Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-serif font-bold text-[#0B2044]">Coupon & Discount Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure promotional discount codes, minimum purchase requirements, and inspect customer redemptions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadCoupons()}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Refresh Coupons"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => {
              setFormError("");
              setShowCreate(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shadow-xs"
            style={{ background: NAVY, color: "#FBF9F5" }}
          >
            <Plus size={16} /> New Coupon
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Status Filter Tabs */}
        <div className="px-5 pt-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 overflow-x-auto pb-3">
            {[
              { id: "all", label: "All Coupons", count: counts.all },
              { id: "active", label: "Active", count: counts.active },
              { id: "scheduled", label: "Scheduled", count: counts.scheduled },
              { id: "expired", label: "Expired", count: counts.expired },
              { id: "inactive", label: "Inactive", count: counts.inactive },
            ].map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    isSelected
                      ? "bg-[#0B2044] text-[#FBF9F5] shadow-xs"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      isSelected ? "bg-white/20 text-[#FBF9F5]" : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pb-3">
            <div className="relative w-48 sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code or offer…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
            </div>
            <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  viewMode === "table" ? "bg-white text-[#0B2044] shadow-xs" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <List size={13} /> Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  viewMode === "cards" ? "bg-white text-[#0B2044] shadow-xs" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <LayoutGrid size={13} /> Cards
              </button>
            </div>
          </div>
        </div>

        {/* State displays */}
        {loading && <div className="py-20 text-center text-gray-400 text-sm">Loading coupons…</div>}
        {error && (
          <div className="p-5">
            <AdminErrorState title="Unable to load coupons" message={error} onRetry={loadCoupons} compact />
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <AdminEmptyState
            title="No coupons found"
            message={search ? "No coupons match your search criteria." : `There are no coupons under "${activeTab}".`}
          />
        )}

        {/* Cards View */}
        {!loading && !error && filtered.length > 0 && viewMode === "cards" && (
          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5 bg-[#F8F9FA]">
            {filtered.map((c) => {
              const expired = isExpired(c.expiresAt);
              const scheduled = isScheduled(c.startDate);
              return (
                <div key={c.id} className="space-y-2">
                  <VastraaCouponCard
                    coupon={{
                      id: c.id,
                      code: c.code,
                      type: c.type,
                      value: c.value,
                      description: c.description,
                      offerDisplayText: c.offerDisplayText,
                      minimumOrderValue: c.minimumOrderValue,
                      maxDiscountAmount: c.maxDiscountAmount,
                      eligibleCategories: c.eligibleCategories,
                      firstOrderOnly: c.firstOrderOnly,
                      perCustomerLimit: c.perCustomerLimit,
                      startDate: c.startDate,
                      expiresAt: c.expiresAt,
                      maxUses: c.maxUses,
                      usedCount: c.usedCount,
                      active: c.active,
                    }}
                    isExpired={expired || !c.active}
                  />

                  {/* Actions bar underneath card */}
                  <div className="flex items-center justify-between px-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        !c.active
                          ? "bg-gray-200 text-gray-600"
                          : scheduled
                          ? "bg-blue-100 text-blue-800"
                          : expired
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {!c.active ? "Inactive" : scheduled ? "Scheduled" : expired ? "Expired" : "Active"}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setAnalyticsTarget(c)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                        title="View Usage Statistics"
                      >
                        <BarChart3 size={11} /> Analytics
                      </button>
                      <button
                        onClick={() => {
                          setFormError("");
                          setEditing(c);
                        }}
                        className="text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        <Pencil size={11} /> Edit
                      </button>
                      <button
                        disabled={actionLoading === c.id}
                        onClick={() => handleToggleActive(c)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors disabled:opacity-50 ${
                          c.active
                            ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        }`}
                      >
                        {c.active ? <Ban size={11} /> : <Check size={11} />}
                        {c.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1 text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete Coupon"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Table View */}
        {!loading && !error && filtered.length > 0 && viewMode === "table" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Coupon Code & Details
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Discount</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    Redemptions
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    Validity Period
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => {
                  const expired = isExpired(c.expiresAt);
                  const scheduled = isScheduled(c.startDate);
                  const maxedOut = c.maxUses !== null && c.usedCount >= c.maxUses;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-mono font-bold text-sm tracking-wide text-[#0B2044]">{c.code}</div>
                        {c.offerDisplayText ? (
                          <div className="text-xs text-emerald-800 font-medium mt-0.5 max-w-[280px] truncate inline-flex items-center gap-1" title={c.offerDisplayText}>
                            <Megaphone size={12} className="shrink-0 text-emerald-700" />
                            <span>{c.offerDisplayText}</span>
                          </div>
                        ) : c.description ? (
                          <div className="text-xs text-gray-500 mt-0.5 max-w-[280px] truncate">{c.description}</div>
                        ) : null}

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {c.minimumOrderValue && c.minimumOrderValue > 0 ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                              Min ₹{c.minimumOrderValue.toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                              No Min Order
                            </span>
                          )}
                          {c.maxDiscountAmount && c.maxDiscountAmount > 0 ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                              Cap ₹{c.maxDiscountAmount.toLocaleString("en-IN")}
                            </span>
                          ) : null}
                          {c.firstOrderOnly && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-medium">
                              1st Order Only
                            </span>
                          )}
                          {c.eligibleCategories && c.eligibleCategories.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium truncate max-w-[150px]">
                              {c.eligibleCategories.join(", ")}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-gray-600 capitalize">
                        {c.type === "percent" ? "Percentage" : "Fixed (Flat)"}
                      </td>

                      <td className="px-4 py-3.5 text-right font-mono font-bold text-sm text-[#0B2044]">
                        {c.type === "percent" ? `${c.value}% OFF` : `₹${c.value} OFF`}
                      </td>

                      <td className="px-4 py-3.5 text-right text-xs text-gray-700 hidden md:table-cell font-mono">
                        <span className="font-bold text-gray-900">{c.usedCount}</span>
                        {c.maxUses !== null ? ` / ${c.maxUses}` : " (unlimited)"}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-gray-500 hidden lg:table-cell">
                        {c.startDate ? `${formatDate(c.startDate)} → ` : ""}
                        {formatDate(c.expiresAt)}
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                            !c.active
                              ? "bg-gray-100 text-gray-600"
                              : scheduled
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : expired || maxedOut
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {!c.active
                            ? "Inactive"
                            : scheduled
                            ? "Scheduled"
                            : expired
                            ? "Expired"
                            : maxedOut
                            ? "Limit reached"
                            : "Active"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setAnalyticsTarget(c)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                            title="View Redemptions & Analytics"
                          >
                            <BarChart3 size={11} /> Analytics
                          </button>
                          <button
                            onClick={() => {
                              setFormError("");
                              setEditing(c);
                            }}
                            className="text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            <Pencil size={11} /> Edit
                          </button>
                          <button
                            disabled={actionLoading === c.id}
                            onClick={() => handleToggleActive(c)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors disabled:opacity-50 ${
                              c.active
                                ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            }`}
                          >
                            {c.active ? <Ban size={11} /> : <Check size={11} />}
                            {c.active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className="text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1 text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete Coupon"
                          >
                            <Trash2 size={12} />
                          </button>
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

      {/* Modal Dialogs */}
      {showCreate && (
        <CouponFormModal
          initial={emptyForm}
          title="Create New Coupon Offer"
          submitLabel="Create Offer"
          saving={saving}
          error={formError}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}

      {editing && (
        <CouponFormModal
          initial={{
            code: editing.code,
            type: editing.type,
            value: String(editing.value),
            description: editing.description ?? "",
            offerDisplayText: editing.offerDisplayText ?? "",
            minimumOrderValue: editing.minimumOrderValue ? String(editing.minimumOrderValue) : "",
            maxDiscountAmount: editing.maxDiscountAmount ? String(editing.maxDiscountAmount) : "",
            eligibleCategories:
              editing.eligibleCategories && editing.eligibleCategories.length > 0
                ? editing.eligibleCategories
                : ["All Categories"],
            applicableProducts: Array.isArray(editing.applicableProducts)
              ? editing.applicableProducts.join(", ")
              : "",
            firstOrderOnly: Boolean(editing.firstOrderOnly),
            perCustomerLimit: editing.perCustomerLimit ? String(editing.perCustomerLimit) : "",
            startDate: toDateInputValue(editing.startDate ?? null),
            active: editing.active,
            expiresAt: toDateInputValue(editing.expiresAt),
            maxUses: editing.maxUses !== null ? String(editing.maxUses) : "",
          }}
          title={`Edit Coupon: ${editing.code}`}
          submitLabel="Save Changes"
          saving={saving}
          error={formError}
          onClose={() => setEditing(null)}
          onSubmit={handleEdit}
        />
      )}

      {analyticsTarget && (
        <CouponAnalyticsModal coupon={analyticsTarget} onClose={() => setAnalyticsTarget(null)} />
      )}

      {deleteTarget && (
        <DeleteCouponModal
          coupon={deleteTarget}
          loading={actionLoading === "delete:" + deleteTarget.id}
          onClose={() => setDeleteTarget(null)}
          onDeactivate={() => {
            handleToggleActive(deleteTarget);
            setDeleteTarget(null);
          }}
          onPermanentDelete={(force) => handlePermanentDelete(deleteTarget, force)}
        />
      )}
    </div>
  );
}

export default function AdminCoupons() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AdminErrorBoundary sectionName="Coupons">
          <CouponsContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
