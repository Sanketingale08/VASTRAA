import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import crypto from "crypto";

const ADMIN_KEY = "test-admin-key-profile-otp";

const state = vi.hoisted(() => ({
  settings: {
    admin_name: "Super Admin",
    admin_email: "admin@vastraa.com",
    admin_mobile: "+91 98765 43210",
  } as Record<string, string>,
  sentEmails: [] as Array<{ toEmail: string; otp: string; name?: string }>,
  sentSms: [] as Array<{ to: string; body: string }>,
  auditLogs: [] as any[],
}));

vi.mock("@workspace/db", () => {
  const siteSettingsTable: any = { _t: "site_settings", key: "key", value: "value", updatedAt: "updated_at" };
  const adminAuditLogsTable: any = { _t: "admin_audit_logs" };
  const adminLoginSessionsTable: any = { _t: "admin_login_sessions" };

  const mongoSiteSettings = {
    get: vi.fn(async (key: string) => state.settings[key] ?? null),
    set: vi.fn(async (key: string, value: string) => {
      state.settings[key] = value;
    }),
    delete: vi.fn(async (key: string) => {
      delete state.settings[key];
    }),
  };

  const db: any = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          then: (resolve: any) => resolve([]),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((vals: any) => ({
        onConflictDoUpdate: vi.fn(async () => {
          if (vals.key && vals.value !== undefined) {
            state.settings[vals.key] = vals.value;
          }
        }),
        returning: vi.fn(async () => [{ id: "mock-id" }]),
        catch: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          catch: vi.fn(),
        })),
      })),
    })),
  };

  return {
    db,
    siteSettingsTable,
    adminAuditLogsTable,
    adminLoginSessionsTable,
    mongoSiteSettings,
    mongoGeneric: {},
    mongoAuditLogs: {},
    isMongoDbConnected: () => true,
  };
});

vi.mock("../middlewares/isAdmin", () => {
  return {
    requireAdminKey: (req: any, res: any, next: any) => {
      const key = req.headers["x-admin-key"];
      if (key !== ADMIN_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      next();
    },
    clearAdminKeyCache: vi.fn(),
    sha256hex: (str: string) => crypto.createHash("sha256").update(str).digest("hex"),
  };
});

vi.mock("../lib/transactionalEmail", () => ({
  sendAdminProfileOtpEmail: vi.fn(async (opts: any) => {
    state.sentEmails.push(opts);
    return { delivered: true };
  }),
}));

vi.mock("../lib/sms", () => ({
  sendSms: vi.fn(async (to: string, body: string) => {
    state.sentSms.push({ to, body });
  }),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn(async (log: any) => {
    state.auditLogs.push(log);
  }),
  getIp: () => "127.0.0.1",
}));

vi.mock("../lib/adminNotifications", () => ({
  clearAdminNotifPrefCache: vi.fn(),
}));

vi.mock("../middlewares/maintenanceMode", () => ({
  clearMaintenanceModeCache: vi.fn(),
}));

vi.mock("../lib/cashfree", () => ({
  getCashfreeConfig: vi.fn(),
  testCashfreeConnection: vi.fn(),
}));

describe("Admin Profile OTP Verification Workflow", () => {
  let app: Express;

  beforeEach(async () => {
    state.settings = {
      admin_name: "Super Admin",
      admin_email: "admin@vastraa.com",
      admin_mobile: "+91 98765 43210",
    };
    state.sentEmails = [];
    state.sentSms = [];
    state.auditLogs = [];

    const adminSettingsModule = await import("../routes/adminSettings");
    app = express();
    app.use(express.json());
    app.use("/api", adminSettingsModule.default);
  });

  it("1. GET /api/admin/settings/profile returns current admin profile", async () => {
    const res = await request(app)
      .get("/api/admin/settings/profile")
      .set("x-admin-key", ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: "Super Admin",
      email: "admin@vastraa.com",
      mobile: "+91 98765 43210",
    });
  });

  it("2. Name-only update does not require OTP and updates immediately", async () => {
    const res = await request(app)
      .post("/api/admin/settings/profile/request-verification")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        name: "Chief Administrator",
        email: "admin@vastraa.com",
        mobile: "+91 98765 43210",
      });

    expect(res.status).toBe(200);
    expect(res.body.requiresVerification).toBe(false);
    expect(res.body.message).toBe("Profile updated successfully!");
    expect(state.settings.admin_name).toBe("Chief Administrator");
    expect(state.sentEmails.length).toBe(0);
    expect(state.sentSms.length).toBe(0);
  });

  it("3. Email change triggers Email OTP requirement and dispatches code", async () => {
    const res = await request(app)
      .post("/api/admin/settings/profile/request-verification")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        name: "Super Admin",
        email: "newadmin@vastraa.com",
        mobile: "+91 98765 43210",
      });

    expect(res.status).toBe(200);
    expect(res.body.requiresVerification).toBe(true);
    expect(res.body.requiresEmailOtp).toBe(true);
    expect(res.body.requiresMobileOtp).toBe(false);
    expect(res.body.challengeId).toBeDefined();
    expect(res.body.emailTarget).toContain("***");
    expect(state.sentEmails.length).toBe(1);
    expect(state.sentEmails[0].toEmail).toBe("newadmin@vastraa.com");
    expect(state.sentEmails[0].otp).toHaveLength(6);
    expect(state.sentSms.length).toBe(0);

    // Database must NOT be updated yet
    expect(state.settings.admin_email).toBe("admin@vastraa.com");
  });

  it("4. Mobile change triggers Mobile OTP requirement and dispatches SMS", async () => {
    const res = await request(app)
      .post("/api/admin/settings/profile/request-verification")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        name: "Super Admin",
        email: "admin@vastraa.com",
        mobile: "+91 91234 56789",
      });

    expect(res.status).toBe(200);
    expect(res.body.requiresVerification).toBe(true);
    expect(res.body.requiresEmailOtp).toBe(false);
    expect(res.body.requiresMobileOtp).toBe(true);
    expect(res.body.challengeId).toBeDefined();
    expect(state.sentSms.length).toBe(1);
    expect(state.sentSms[0].to).toBe("+91 91234 56789");
    expect(state.sentSms[0].body).toContain("verification code");

    // Database must NOT be updated yet
    expect(state.settings.admin_mobile).toBe("+91 98765 43210");
  });

  it("5. Dual Email + Mobile change triggers both OTPs and requires both to verify", async () => {
    const initRes = await request(app)
      .post("/api/admin/settings/profile/request-verification")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        name: "Lead Admin",
        email: "lead@vastraa.com",
        mobile: "+91 99988 77665",
      });

    expect(initRes.status).toBe(200);
    expect(initRes.body.requiresVerification).toBe(true);
    expect(initRes.body.requiresEmailOtp).toBe(true);
    expect(initRes.body.requiresMobileOtp).toBe(true);
    const challengeId = initRes.body.challengeId;

    const emailOtp = state.sentEmails[0].otp;
    const match = state.sentSms[0].body.match(/\b\d{6}\b/);
    expect(match).not.toBeNull();
    const mobileOtp = match![0];

    // Attempt verification with invalid Email OTP
    const invalidEmailRes = await request(app)
      .post("/api/admin/settings/profile/verify-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        challengeId,
        emailOtp: "000000",
        mobileOtp,
      });

    expect(invalidEmailRes.status).toBe(400);
    expect(invalidEmailRes.body.error).toContain("Incorrect Email OTP");
    // Verify database remains untouched
    expect(state.settings.admin_email).toBe("admin@vastraa.com");
    expect(state.settings.admin_mobile).toBe("+91 98765 43210");

    // Attempt verification with invalid Mobile OTP
    const invalidMobileRes = await request(app)
      .post("/api/admin/settings/profile/verify-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        challengeId,
        emailOtp,
        mobileOtp: "000000",
      });

    expect(invalidMobileRes.status).toBe(400);
    expect(invalidMobileRes.body.error).toContain("Incorrect Mobile OTP");
    expect(state.settings.admin_email).toBe("admin@vastraa.com");

    // Verify with both valid OTPs
    const validRes = await request(app)
      .post("/api/admin/settings/profile/verify-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        challengeId,
        emailOtp,
        mobileOtp,
      });

    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.message).toBe("Profile updated successfully!");

    // Database is now safely updated
    expect(state.settings.admin_name).toBe("Lead Admin");
    expect(state.settings.admin_email).toBe("lead@vastraa.com");
    expect(state.settings.admin_mobile).toBe("+91 99988 77665");

    // Reusing the same challenge must fail
    const reuseRes = await request(app)
      .post("/api/admin/settings/profile/verify-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        challengeId,
        emailOtp,
        mobileOtp,
      });
    expect(reuseRes.status).toBe(400);
  });

  it("6. Resend OTP enforces cooldown timer", async () => {
    const initRes = await request(app)
      .post("/api/admin/settings/profile/request-verification")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        name: "Super Admin",
        email: "cooldown@vastraa.com",
        mobile: "+91 98765 43210",
      });

    const challengeId = initRes.body.challengeId;

    // Immediate resend should be rate limited (429)
    const earlyResend = await request(app)
      .post("/api/admin/settings/profile/resend-otp")
      .set("x-admin-key", ADMIN_KEY)
      .send({ challengeId });

    expect(earlyResend.status).toBe(429);
    expect(earlyResend.body.error).toContain("Please wait");
  });

  it("7. Direct PATCH to profile rejects unverified contact alterations", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/profile")
      .set("x-admin-key", ADMIN_KEY)
      .send({
        email: "hack@vastraa.com",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("OTP verification");
    expect(state.settings.admin_email).toBe("admin@vastraa.com");
  });
});

