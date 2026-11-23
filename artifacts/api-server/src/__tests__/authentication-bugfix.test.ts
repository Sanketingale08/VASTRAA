import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "../lib/passwords";

const mockSellersMap = new Map<string, any>();
const mockUsersMap = new Map<string, any>();
const mockSessionsMap = new Map<string, any>();

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((vals: any) => ({
          returning: vi.fn(() => Promise.resolve([{ id: "vendor-test-999", ...vals }])),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])),
        })),
      })),
    },
    vendorsTable: tag("vendors", [
      "id", "vendorId", "name", "location", "status", "statusReason",
      "ownerId", "mobile", "panNumber", "panCardUrl", "bankHolder",
      "bankName", "bankAccount", "bankIfsc", "shopCity", "shopState",
      "shopPincode", "contactEmail"
    ]),
    usersTable: tag("users", ["id", "email", "name", "passwordHash", "role", "status"]),
    productsTable: tag("products", ["id", "vendorId"]),
    ordersTable: tag("orders", ["id", "status"]),
    mongoSellers: {
      findById: vi.fn(async (id: string) => {
        if (!id) return null;
        const clean = id.trim().toLowerCase();
        return mockSellersMap.get(id) ||
          Array.from(mockSellersMap.values()).find((s) =>
            (s.id && s.id.toLowerCase() === clean) ||
            (s.sellerId && s.sellerId.toLowerCase() === clean) ||
            (s.vendorId && s.vendorId.toLowerCase() === clean) ||
            (s.ownerId && s.ownerId.toLowerCase() === clean)
          ) || null;
      }),
      findBySellerId: vi.fn(async (id: string) => {
        if (!id) return null;
        const clean = id.trim().toLowerCase();
        return mockSellersMap.get(id) ||
          Array.from(mockSellersMap.values()).find((s) =>
            (s.id && s.id.toLowerCase() === clean) ||
            (s.sellerId && s.sellerId.toLowerCase() === clean) ||
            (s.vendorId && s.vendorId.toLowerCase() === clean) ||
            (s.ownerId && s.ownerId.toLowerCase() === clean)
          ) || null;
      }),
      findByVendorId: vi.fn(async (id: string) => {
        if (!id) return null;
        const clean = id.trim().toLowerCase();
        return mockSellersMap.get(id) ||
          Array.from(mockSellersMap.values()).find((s) =>
            (s.id && s.id.toLowerCase() === clean) ||
            (s.sellerId && s.sellerId.toLowerCase() === clean) ||
            (s.vendorId && s.vendorId.toLowerCase() === clean) ||
            (s.ownerId && s.ownerId.toLowerCase() === clean)
          ) || null;
      }),
      findByOwnerId: vi.fn(async (ownerId: string) => {
        return Array.from(mockSellersMap.values()).find((s) => s.ownerId === ownerId) || null;
      }),
      findByEmail: vi.fn(async (email: string) => {
        const clean = (email || "").toLowerCase().trim();
        return Array.from(mockSellersMap.values()).find((s) =>
          (s.email || "").toLowerCase().trim() === clean ||
          (s.contactEmail || "").toLowerCase().trim() === clean
        ) || null;
      }),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || "vendor-test-999";
        const sellerDoc = { ...doc, id, sellerId: doc.sellerId || id, vendorId: doc.vendorId || id };
        mockSellersMap.set(id, sellerDoc);
        if (doc.email) mockSellersMap.set(doc.email.toLowerCase().trim(), sellerDoc);
        return sellerDoc;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        let existing = mockSellersMap.get(id) ||
          Array.from(mockSellersMap.values()).find((s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockSellersMap.set(existing.id, updated);
          return updated;
        }
        return null;
      }),
    },
    mongoUsers: {
      findById: vi.fn(async (id: string) => {
        return mockUsersMap.get(id) || Array.from(mockUsersMap.values()).find((u) => u.id === id) || null;
      }),
      findByEmail: vi.fn(async (email: string, role?: string) => {
        const clean = (email || "").toLowerCase().trim();
        return Array.from(mockUsersMap.values()).find((u) => {
          const uEmail = (u.email || "").toLowerCase().trim();
          const matchesEmail = uEmail === clean;
          const matchesRole = !role || u.role === role || (role === "customer" && (u.role === "user" || !u.role));
          return matchesEmail && matchesRole;
        }) || null;
      }),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `usr_${Math.random()}`;
        const userDoc = { ...doc, id };
        mockUsersMap.set(id, userDoc);
        if (doc.email) mockUsersMap.set(doc.email.toLowerCase().trim(), userDoc);
        return userDoc;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockUsersMap.get(id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockUsersMap.set(id, updated);
          return updated;
        }
        return null;
      }),
    },
    mongoSessions: {
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `sess_${Math.random()}`;
        const sDoc = { ...doc, id };
        mockSessionsMap.set(id, sDoc);
        return sDoc;
      }),
      findById: vi.fn(async (id: string) => mockSessionsMap.get(id) || null),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = mockSessionsMap.get(id);
        if (existing) {
          const updated = { ...existing, ...updates };
          mockSessionsMap.set(id, updated);
          return updated;
        }
        return null;
      }),
      delete: vi.fn(async (id: string) => {
        mockSessionsMap.delete(id);
        return true;
      }),
    },
    mongoR2Assets: {
      findByObjectKey: vi.fn().mockResolvedValue(null),
      saveAsset: vi.fn().mockResolvedValue(undefined),
    },
    mongoVendors: {
      findById: vi.fn().mockResolvedValue(null),
    },
    isMongoDbConnected: vi.fn().mockReturnValue(true),
    setMongoConnected: vi.fn(),
    getCollection: vi.fn(() => ({
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      updateOne: vi.fn().mockResolvedValue({}),
      insertOne: vi.fn().mockResolvedValue({}),
    })),
    getNextSequenceValue: vi.fn(async () => 101),
    formatVendorId: vi.fn((seq: number) => `VEND-${seq}`),
    isInternalRawId: vi.fn(() => false),
    getCanonicalSellerId: vi.fn((v: any) => {
      if (!v) return "";
      if (v.sellerId && !v.sellerId.includes("-")) return v.sellerId;
      if (v.vendorId && !v.vendorId.includes("-")) return v.vendorId;
      return v.sellerId || v.vendorId || v.id || "";
    }),
    eq: (a: any, b: any) => ({ a, b }),
    or: (...args: any[]) => ({ args }),
    sql: (...args: any[]) => args,
  };
});

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: () => "127.0.0.1",
}));

vi.mock("../lib/sellerVerification", () => ({
  consumeSellerEmailVerification: vi.fn(),
}));

import authRouter from "../routes/auth";
import vendorsRouter from "../routes/vendors";

describe("VASTRAA Authentication Bug Fix - Comprehensive Test Suite", () => {
  let app: express.Express;

  beforeEach(() => {
    mockSellersMap.clear();
    mockUsersMap.clear();
    mockSessionsMap.clear();

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api", authRouter);
    app.use("/api", vendorsRouter);
  });

  // Scenario 1: Customer login with correct credentials (both PBKDF2 & bcrypt)
  describe("1. Customer Login", () => {
    it("1.1 Successfully logs in a customer with PBKDF2 password hash", async () => {
      const password = "CustomerPassword123!";
      const pbkdf2Hash = hashPassword(password);
      mockUsersMap.set("cust_pbkdf2", {
        id: "cust_pbkdf2",
        email: "customer_pbkdf2@example.com",
        name: "PBKDF2 Customer",
        role: "customer",
        passwordHash: pbkdf2Hash,
        status: "active",
      });

      const res = await request(app)
        .post("/api/auth/sign-in")
        .send({
          email: "customer_pbkdf2@example.com",
          password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("token");
      expect(res.body.user).toMatchObject({
        id: "cust_pbkdf2",
        email: "customer_pbkdf2@example.com",
        role: "customer",
      });
    });

    it("1.2 Successfully logs in a customer with bcrypt password hash", async () => {
      const password = "BcryptCustomerPassword123!";
      const bcryptHash = bcrypt.hashSync(password, 10);
      mockUsersMap.set("cust_bcrypt", {
        id: "cust_bcrypt",
        email: "customer_bcrypt@example.com",
        name: "Bcrypt Customer",
        role: "customer",
        passwordHash: bcryptHash,
        status: "active",
      });

      const res = await request(app)
        .post("/api/auth/sign-in")
        .send({
          email: "customer_bcrypt@example.com",
          password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("token");
      expect(res.body.user.id).toBe("cust_bcrypt");
    });

    it("1.3 Normalizes customer email (trims leading/trailing whitespace and lowercases)", async () => {
      const password = "NormalizedPassword123!";
      const hash = hashPassword(password);
      mockUsersMap.set("cust_norm", {
        id: "cust_norm",
        email: "clean.customer@vastraa.com",
        name: "Clean Customer",
        role: "customer",
        passwordHash: hash,
        status: "active",
      });

      const res = await request(app)
        .post("/api/auth/sign-in")
        .send({
          email: "   Clean.Customer@VASTRAA.com   ",
          password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe("clean.customer@vastraa.com");
    });

    // Scenario 2: Customer login with incorrect credentials
    it("2. Returns 'Invalid email or password' on incorrect password", async () => {
      const hash = hashPassword("CorrectPassword123!");
      mockUsersMap.set("cust_test", {
        id: "cust_test",
        email: "wrong_pwd@example.com",
        name: "Test User",
        role: "customer",
        passwordHash: hash,
        status: "active",
      });

      const res = await request(app)
        .post("/api/auth/sign-in")
        .send({
          email: "wrong_pwd@example.com",
          password: "DefinetelyWrongPassword!",
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/Invalid email or password/i);
    });

    it("2.1 Returns 'Invalid email or password' on non-existent customer", async () => {
      const res = await request(app)
        .post("/api/auth/sign-in")
        .send({
          email: "nonexistent_cust@vastraa.com",
          password: "SomePassword123!",
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/Invalid email or password/i);
    });
  });

  // Scenarios 3-9: Seller Authentication & Lifecycle
  describe("2. Seller Login & Lifecycle", () => {
    const sellerPassword = "SecureSellerPassword123!";
    const sellerBcryptHash = bcrypt.hashSync(sellerPassword, 10);
    const sellerPbkdf2Hash = hashPassword(sellerPassword);

    beforeEach(() => {
      // Set up an approved active seller
      mockUsersMap.set("usr_seller_1", {
        id: "usr_seller_1",
        email: "artisan@vastraatest.com",
        role: "seller",
        name: "Artisan Weaves",
        passwordHash: sellerBcryptHash,
      });

      mockSellersMap.set("sel_101", {
        id: "sel_101",
        sellerId: "VEND-101",
        vendorId: "VEND-101",
        name: "Artisan Weaves Shop",
        shopName: "Artisan Weaves Shop",
        email: "artisan@vastraatest.com",
        contactEmail: "artisan@vastraatest.com",
        ownerId: "usr_seller_1",
        passwordHash: sellerBcryptHash,
        status: "approved",
      });
    });

    // Scenario 3: Seller login with correct Seller ID and password
    it("3. Successfully logs in using Seller ID (e.g. VEND-101) with bcrypt hash", async () => {
      const res = await request(app)
        .post("/api/seller/login")
        .send({
          identifier: "VEND-101",
          password: sellerPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("token");
      expect(res.body.vendor.sellerId).toBe("VEND-101");
      expect(res.body.user.role).toBe("seller");
    });

    it("3.1 Case-insensitive match on Seller ID (e.g. vend-101 matches VEND-101)", async () => {
      const res = await request(app)
        .post("/api/seller/login")
        .send({
          identifier: "vend-101",
          password: sellerPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    // Scenario 4: Seller login with correct registered email and password
    it("4. Successfully logs in using registered email and password", async () => {
      const res = await request(app)
        .post("/api/seller/login")
        .send({
          email: "   Artisan@VastraaTest.com   ",
          password: sellerPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.vendor.shopName).toBe("Artisan Weaves Shop");
    });

    it("4.1 Supports PBKDF2 hash on seller account", async () => {
      mockSellersMap.set("sel_pbkdf2", {
        id: "sel_pbkdf2",
        sellerId: "VEND-PBKDF2",
        name: "PBKDF2 Silks",
        email: "pbkdf2_seller@vastraa.com",
        ownerId: "usr_pbkdf2",
        passwordHash: sellerPbkdf2Hash,
        status: "approved",
      });

      const res = await request(app)
        .post("/api/seller/login")
        .send({
          email: "pbkdf2_seller@vastraa.com",
          password: sellerPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    // Scenario 5: Seller login with incorrect credentials
    it("5. Rejects login with incorrect password and returns 'Invalid email or password'", async () => {
      const res = await request(app)
        .post("/api/seller/login")
        .send({
          identifier: "VEND-101",
          password: "TotallyWrongPassword!",
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/Invalid email or password/i);
    });

    // Scenario 6: Seller login before admin approval
    it("6. Rejects login before admin approval with 'Your account is awaiting admin approval'", async () => {
      mockSellersMap.set("sel_pending", {
        id: "sel_pending",
        sellerId: "VEND-PENDING",
        name: "Pending Silk Shop",
        email: "pending@vastraa.com",
        passwordHash: sellerBcryptHash,
        status: "pending",
      });

      const res = await request(app)
        .post("/api/seller/login")
        .send({
          email: "pending@vastraa.com",
          password: sellerPassword,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("VENDOR_PENDING");
      expect(res.body.message || res.body.error).toMatch(/Your account is awaiting admin approval/i);
    });

    // Scenario 7: Seller login after admin approval
    it("7. Allows login after admin approval", async () => {
      const sellerDoc = mockSellersMap.get("sel_101");
      sellerDoc.status = "approved";

      const res = await request(app)
        .post("/api/seller/login")
        .send({
          identifier: "VEND-101",
          password: sellerPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.vendor.status).toBe("approved");
    });

    // Scenario 8: Seller login after admin suspension
    it("8. Rejects login after admin suspension with 'Your account has been suspended'", async () => {
      const sellerDoc = mockSellersMap.get("sel_101");
      sellerDoc.status = "suspended";

      const res = await request(app)
        .post("/api/seller/login")
        .send({
          identifier: "VEND-101",
          password: sellerPassword,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("VENDOR_SUSPENDED");
      expect(res.body.message || res.body.error).toMatch(/Your account has been suspended/i);
    });

    // Scenario 9: Seller login after admin reactivation using the same credentials
    it("9. Successfully logs in after reactivation using existing credentials without re-registration", async () => {
      const sellerDoc = mockSellersMap.get("sel_101");
      // Admin reactivates account
      sellerDoc.status = "approved";
      sellerDoc.reactivationPending = true;

      const res = await request(app)
        .post("/api/seller/login")
        .send({
          identifier: "VEND-101",
          password: sellerPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.vendor.status).toBe("approved");
    });

    // Scenario 10: Inactive / deactivated account
    it("10. Rejects login for deactivated seller with 'Your account is inactive'", async () => {
      const sellerDoc = mockSellersMap.get("sel_101");
      sellerDoc.status = "deactivated";

      const res = await request(app)
        .post("/api/seller/login")
        .send({
          identifier: "VEND-101",
          password: sellerPassword,
        });

      expect(res.status).toBe(403);
      expect(res.body.message || res.body.error).toMatch(/Your account is inactive/i);
    });
  });
});

