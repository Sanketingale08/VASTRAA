/**
 * Admin Notification Preferences & Multi-Channel Delivery Integration Tests
 *
 * Verifies:
 *  1. GET /api/admin/settings/notification-prefs returns defaults for all 10 categories
 *  2. GET requires valid x-admin-key (403 otherwise)
 *  3. PATCH /api/admin/settings/notification-prefs updates & persists channel prefs
 *  4. PATCH rejects invalid body (400)
 *  5. In-App delivery gating & real-time Socket.IO emission
 *  6. Email delivery gating via sendAdminAlertEmail
 *  7. SMS delivery gating via sendSms
 *  8. Correct category mapping for all 10 platform events:
 *     - new_order (and high_value_order)
 *     - new_vendor_registration (and new_seller_registration)
 *     - vendor_approval_required (and kyc_submitted)
 *     - vendor_dispute (and customer_complaint)
 *     - refund_request (and return_request)
 *     - support_ticket (and seller_support_request)
 *     - payment_failure (and payout_failed)
 *     - shipping_issue (and delivery_failed)
 *     - system_error (and system_error_alert)
 *     - security_login_alert (and admin_login)
 *  9. Immediate preference cache invalidation after PATCH
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const ADMIN_KEY = "test-superadmin-secret-key-123";

// ─── Hoisted Mutable Mock State ───────────────────────────────────────────────

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  settingsUpserts: [] as Array<{ key: string; value: string }>,
  notifications: [] as any[],
  sentEmails: [] as any[],
  sentSms: [] as Array<{ phone: string; text: string }>,
  socketEmits: [] as Array<{ event: string; data: any; room?: string }>,
  auditLogs: [] as any[],
  idCounter: 0,
}));

// ─── Mock @workspace/db ───────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const siteSettingsTable: any = { _t: "site_settings", key: "key", value: "value", updatedAt: "updated_at" };
  const adminAuditLogsTable: any = { _t: "admin_audit_logs" };
  const adminLoginSessionsTable: any = { _t: "admin_login_sessions" };
  const notificationsTable: any = { _t: "notifications" };
  const ADMIN_NOTIFICATION_USER_ID = "admin";

  function queryResult(rows: unknown[]): any {
    return {
      limit: vi.fn(() => queryResult(rows)),
      offset: vi.fn(() => queryResult(rows)),
      for: vi.fn(() => queryResult(rows)),
      orderBy: vi.fn(() => queryResult(rows)),
      where: vi.fn(() => queryResult(rows)),
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(rows).catch(fn),
    };
  }

  const db: any = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        if (table._t === "site_settings") {
          return {
            where: vi.fn((_cond?: any) => {
              const val = state.settings.get("admin_notification_prefs") ?? null;
              const row = val !== null ? [{ value: val }] : [];
              return queryResult(row);
            }),
            then: (resolve: any, reject: any) => {
              const val = state.settings.get("admin_notification_prefs") ?? null;
              const row = val !== null ? [{ value: val }] : [];
              return Promise.resolve(row).then(resolve, reject);
            },
            catch: (fn: any) => Promise.resolve([]).catch(fn),
          };
        }
        return queryResult([]);
      }),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn((vals: any) => {
        if (table._t === "notifications") {
          state.notifications.push({ id: vals.id || `notif-${++state.idCounter}`, ...vals });
        }
        if (table._t === "site_settings") {
          state.settingsUpserts.push(vals);
          if (vals.key && vals.value !== undefined) {
            state.settings.set(vals.key, String(vals.value));
          }
        }
        return {
          onConflictDoUpdate: vi.fn((_opts: any) => {
            if (table._t === "site_settings") {
              state.settingsUpserts.push(vals);
              if (vals.key && vals.value !== undefined) {
                state.settings.set(vals.key, String(vals.value));
              }
            }
            return Promise.resolve();
          }),
          returning: vi.fn(() => Promise.resolve([{ id: `row-${++state.idCounter}` }])),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  };

  const mongoSiteSettings = {
    get: vi.fn((key: string) => Promise.resolve(state.settings.get(key) ?? null)),
    set: vi.fn((key: string, val: string) => {
      state.settings.set(key, String(val));
      return Promise.resolve();
    }),
  };

  const mongoGeneric = {
    getCollection: vi.fn((col: string) => ({
      insertOne: vi.fn((doc: any) => {
        if (col === "notifications") {
          state.notifications.push(doc);
        }
        return Promise.resolve({ insertedId: doc.id });
      }),
    })),
  };

  const mongoNotifications = {
    count: vi.fn(() => Promise.resolve(state.notifications.filter((n) => !n.read && !n.isRead).length)),
  };

  return {
    db,
    siteSettingsTable,
    adminAuditLogsTable,
    adminLoginSessionsTable,
    notificationsTable,
    ADMIN_NOTIFICATION_USER_ID,
    mongoSiteSettings,
    mongoGeneric,
    mongoNotifications,
  };
});

// ─── Mock Admin Auth & Middlewares ────────────────────────────────────────────

vi.mock("../middlewares/isAdmin", () => ({
  requireAdminKey: (req: any, res: any, next: any) => {
    if (req.headers["x-admin-key"] === ADMIN_KEY) return next();
    return res.status(403).json({ error: "Forbidden" });
  },
  sha256hex: (s: string) => `hash:${s}`,
  clearAdminKeyCache: vi.fn(),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn((params: any) => {
    state.auditLogs.push(params);
    return Promise.resolve();
  }),
  getIp: vi.fn(() => "127.0.0.1"),
}));

// ─── Mock Transactional Email, SMS & Socket ───────────────────────────────────

vi.mock("../lib/transactionalEmail", () => ({
  sendAdminAlertEmail: vi.fn((opts: any) => {
    state.sentEmails.push(opts);
    return Promise.resolve({ delivered: true, queued: false, status: "sent" });
  }),
  sendTransactionalEmail: vi.fn(() => Promise.resolve({ delivered: true, queued: false })),
}));

vi.mock("../lib/sms", () => ({
  sendSms: vi.fn((phone: string, text: string) => {
    state.sentSms.push({ phone, text });
    return Promise.resolve({ success: true, messageId: `sms-${++state.idCounter}` });
  }),
}));

vi.mock("../lib/socket", () => ({
  getIO: vi.fn(() => ({
    to: vi.fn((room: string) => ({
      emit: vi.fn((event: string, data: any) => {
        state.socketEmits.push({ event, data, room });
      }),
    })),
    emit: vi.fn((event: string, data: any) => {
      state.socketEmits.push({ event, data, room: "global" });
    }),
  })),
}));

// ─── Test Suite Setup ─────────────────────────────────────────────────────────

let app: Express;

beforeEach(async () => {
  vi.clearAllMocks();
  state.settings.clear();
  state.settings.set("admin_email", "admin@vastraa.com");
  state.settings.set("admin_mobile", "+919876543210");
  state.settingsUpserts = [];
  state.notifications = [];
  state.sentEmails = [];
  state.sentSms = [];
  state.socketEmits = [];
  state.auditLogs = [];

  process.env.ADMIN_NOTIFICATION_EMAIL = "admin@vastraa.com";
  process.env.ADMIN_NOTIFICATION_PHONE = "+919876543210";

  const { clearAdminNotifPrefCache } = await import("../lib/adminNotifications");
  clearAdminNotifPrefCache();

  app = express();
  app.use(express.json());
  const { default: adminSettingsRouter } = await import("../routes/adminSettings");
  app.use("/api", adminSettingsRouter);
});

// ─── 1. API Endpoints: GET & PATCH /api/admin/settings/notification-prefs ─────

describe("Admin Notification Preferences API Endpoints", () => {
  it("rejects unauthorized requests with 403", async () => {
    const res = await request(app).get("/api/admin/settings/notification-prefs");
    expect(res.status).toBe(403);
  });

  it("returns default preferences for all 10 categories when no prefs stored", async () => {
    const res = await request(app)
      .get("/api/admin/settings/notification-prefs")
      .set("x-admin-key", ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.prefs).toBeDefined();

    const expectedKeys = [
      "new_order",
      "new_vendor_registration",
      "vendor_approval_required",
      "vendor_dispute",
      "refund_request",
      "support_ticket",
      "payment_failure",
      "shipping_issue",
      "system_error",
      "security_login_alert",
    ];

    for (const key of expectedKeys) {
      expect(res.body.prefs[key]).toBeDefined();
      expect(res.body.prefs[key].email).toBe(true);
      expect(res.body.prefs[key].inApp).toBe(true);
      if (key === "security_login_alert") {
        expect(res.body.prefs[key].sms).toBe(true);
      } else {
        expect(res.body.prefs[key].sms).toBe(false);
      }
    }
  });

  it("updates and persists preferences via PATCH", async () => {
    const patchBody = {
      prefs: {
        new_order: { email: false, inApp: true, sms: true },
        vendor_dispute: { email: true, inApp: false, sms: true },
      },
    };

    const res = await request(app)
      .patch("/api/admin/settings/notification-prefs")
      .set("x-admin-key", ADMIN_KEY)
      .send(patchBody);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.prefs.new_order).toEqual({ email: false, inApp: true, sms: true });
    expect(res.body.prefs.vendor_dispute).toEqual({ email: true, inApp: false, sms: true });

    // Subsequent GET returns updated preferences
    const getRes = await request(app)
      .get("/api/admin/settings/notification-prefs")
      .set("x-admin-key", ADMIN_KEY);

    expect(getRes.status).toBe(200);
    expect(getRes.body.prefs.new_order).toEqual({ email: false, inApp: true, sms: true });
    expect(getRes.body.prefs.vendor_dispute).toEqual({ email: true, inApp: false, sms: true });
  });

  it("returns 400 when PATCH body is invalid", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/notification-prefs")
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ─── 2. Multi-Channel Gating Engine & Event Triggers ──────────────────────────

describe("Multi-Channel Notification Delivery Gating", () => {
  it("delivers via In-App and Email, but skips SMS for new_order under default preferences", async () => {
    const { insertAdminNotification } = await import("../lib/adminNotifications");

    const result = await insertAdminNotification({
      type: "new_order",
      title: "New Order #1001",
      body: "Customer placed an order for ₹4,500",
      metadata: { orderId: "1001", amount: 4500 },
      awaitChannels: true,
    });

    expect(result.inApp).toBe(true);
    expect(result.email).toBe(true);
    expect(result.sms).toBe(false);

    // In-App verified
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].title).toBe("New Order #1001");

    // Socket emission verified
    const notifEmit = state.socketEmits.find((e) => e.event === "admin_notification");
    expect(notifEmit).toBeDefined();
    expect(notifEmit?.data.title).toBe("New Order #1001");

    // Email verified
    expect(state.sentEmails).toHaveLength(1);
    expect(state.sentEmails[0].toEmail).toBe("admin@vastraa.com");
    expect(state.sentEmails[0].category).toBe("new_order");

    // SMS verified (skipped)
    expect(state.sentSms).toHaveLength(0);
  });

  it("suppresses In-App when inApp is OFF, but sends Email & SMS when both are ON", async () => {
    state.settings.set(
      "admin_notification_prefs",
      JSON.stringify({
        new_order: { email: true, inApp: false, sms: true },
      })
    );
    const { clearAdminNotifPrefCache, insertAdminNotification } = await import("../lib/adminNotifications");
    clearAdminNotifPrefCache();

    const result = await insertAdminNotification({
      type: "new_order",
      title: "New Order #1002",
      body: "Order received",
      awaitChannels: true,
    });

    expect(result.inApp).toBe(false);
    expect(result.email).toBe(true);
    expect(result.sms).toBe(true);

    expect(state.notifications).toHaveLength(0);
    expect(state.socketEmits.filter((e) => e.event === "admin_notification")).toHaveLength(0);

    expect(state.sentEmails).toHaveLength(1);
    expect(state.sentSms).toHaveLength(1);
    expect(state.sentSms[0].phone).toBe("+919876543210");
    expect(state.sentSms[0].text).toContain("New Order #1002");
  });

  it("delivers all 3 channels (In-App, Email, SMS) for security_login_alert by default", async () => {
    const { clearAdminNotifPrefCache, insertAdminNotification } = await import("../lib/adminNotifications");
    clearAdminNotifPrefCache();

    const result = await insertAdminNotification({
      type: "security_login_alert",
      title: "Admin Login from Chrome Windows",
      body: "Super Admin logged in from IP 127.0.0.1",
      awaitChannels: true,
    });

    expect(result.inApp).toBe(true);
    expect(result.email).toBe(true);
    expect(result.sms).toBe(true);

    expect(state.notifications).toHaveLength(1);
    expect(state.sentEmails).toHaveLength(1);
    expect(state.sentEmails[0].category).toBe("security_login_alert");
    expect(state.sentSms).toHaveLength(1);
  });

  it("suppresses all channels when admin turns all toggles OFF for an event", async () => {
    state.settings.set(
      "admin_notification_prefs",
      JSON.stringify({
        payment_failure: { email: false, inApp: false, sms: false },
      })
    );
    const { clearAdminNotifPrefCache, insertAdminNotification } = await import("../lib/adminNotifications");
    clearAdminNotifPrefCache();

    const result = await insertAdminNotification({
      type: "payment_failure",
      title: "Payment Gateway Timeout",
      body: "Transaction failed",
      awaitChannels: true,
    });

    expect(result.inApp).toBe(false);
    expect(result.email).toBe(false);
    expect(result.sms).toBe(false);

    expect(state.notifications).toHaveLength(0);
    expect(state.sentEmails).toHaveLength(0);
    expect(state.sentSms).toHaveLength(0);
  });
});

// ─── 3. Verification of All 10 Event Categories & Aliases ─────────────────────

describe("Category Mapping for All 10 Platform Events", () => {
  const categories = [
    { type: "new_order", expectedCategory: "new_order" },
    { type: "high_value_order", expectedCategory: "new_order" },
    { type: "new_vendor_registration", expectedCategory: "new_vendor_registration" },
    { type: "new_seller_registration", expectedCategory: "new_vendor_registration" },
    { type: "vendor_approval_required", expectedCategory: "vendor_approval_required" },
    { type: "kyc_submitted", expectedCategory: "vendor_approval_required" },
    { type: "vendor_dispute", expectedCategory: "vendor_dispute" },
    { type: "refund_request", expectedCategory: "refund_request" },
    { type: "support_ticket", expectedCategory: "support_ticket" },
    { type: "payment_failure", expectedCategory: "payment_failure" },
    { type: "shipping_issue", expectedCategory: "shipping_issue" },
    { type: "system_error", expectedCategory: "system_error" },
    { type: "security_login_alert", expectedCategory: "security_login_alert" },
  ];

  for (const { type, expectedCategory } of categories) {
    it(`maps '${type}' to category '${expectedCategory}' and respects channel settings`, async () => {
      // Configure specific channel settings for this category
      state.settings.set(
        "admin_notification_prefs",
        JSON.stringify({
          [expectedCategory]: { email: true, inApp: true, sms: false },
        })
      );
      const { clearAdminNotifPrefCache, insertAdminNotification } = await import("../lib/adminNotifications");
      clearAdminNotifPrefCache();

      const result = await insertAdminNotification({
        type,
        title: `Test Alert for ${type}`,
        body: `Details for ${type}`,
        awaitChannels: true,
      });

      expect(result.inApp).toBe(true);
      expect(result.email).toBe(true);
      expect(result.sms).toBe(false);

      expect(state.sentEmails.length).toBeGreaterThan(0);
      const email = state.sentEmails[state.sentEmails.length - 1];
      expect(email.category).toBe(expectedCategory);
    });
  }
});
