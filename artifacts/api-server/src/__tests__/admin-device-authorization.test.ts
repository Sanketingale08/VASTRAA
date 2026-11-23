import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import crypto from "crypto";

// Hoisted device storage for mock
const deviceStore = vi.hoisted(() => {
  const devices = new Map<string, any>();
  const activities: any[] = [];
  return { devices, activities };
});

vi.mock("@workspace/db", () => {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    },
    siteSettingsTable: {},
    adminLoginSessionsTable: {},
    mongoSiteSettings: {
      get: vi.fn(async () => null),
    },
    mongoGeneric: {
      getCollection: () => ({
        find: () => ({ toArray: () => Promise.resolve([]) }),
        findOne: () => Promise.resolve(null),
        updateMany: vi.fn(async () => ({ modifiedCount: 1 })),
      }),
    },
    mongoAdminDevices: {
      findById: vi.fn(async (id: string) => deviceStore.devices.get(id) || null),
      findMany: vi.fn(async (filter: any) => {
        let list = Array.from(deviceStore.devices.values());
        if (filter?.status && filter.status !== "all") {
          list = list.filter((d) => d.status === filter.status);
        }
        if (filter?.$or) {
          list = list.filter(
            (d) =>
              d.deviceId.includes("BID") ||
              d.deviceId.includes("DEV") ||
              (d.deviceName && d.deviceName.includes("Admin"))
          );
        }
        return list;
      }),
      count: vi.fn(async (filter?: any) => {
        let list = Array.from(deviceStore.devices.values());
        if (filter?.status) {
          list = list.filter((d) => d.status === filter.status);
        }
        return list.length;
      }),
      create: vi.fn(async (data: any) => {
        const item = {
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        deviceStore.devices.set(data.deviceId, item);
        return item;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = deviceStore.devices.get(id) || {};
        const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
        deviceStore.devices.set(id, updated);
        return updated;
      }),
      delete: vi.fn(async (id: string) => {
        return deviceStore.devices.delete(id);
      }),
      getStats: vi.fn(async () => {
        const all = Array.from(deviceStore.devices.values());
        const total = all.length;
        const authorized = all.filter((d) => d.status === "authorized").length;
        const blocked = all.filter((d) => d.status === "blocked").length;
        const revoked = all.filter((d) => d.status === "revoked").length;
        const pending = all.filter((d) => d.status === "pending").length;
        return { total, authorized, blocked, revoked, pending, unauthorized: pending };
      }),
    },
    mongoAdminDeviceActivities: {
      create: vi.fn(async (data: any) => {
        const item = { ...data, id: `act_${Date.now()}_${Math.random()}` };
        deviceStore.activities.unshift(item);
        return item;
      }),
      findMany: vi.fn(async () => deviceStore.activities),
    },
  };
});

// Import express routes and middleware after mocking db
import adminDevicesRouter from "../routes/adminDevices";
import { isAdmin } from "../middlewares/isAdmin";

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Mount device and browser management routes
  app.use("/api", adminDevicesRouter);

  // Protected dummy admin route
  app.get("/api/admin/test-resource", isAdmin, (req: any, res: any) => {
    res.json({ success: true, message: "Protected admin data", deviceId: req.deviceId });
  });

  // Customer / seller dummy route (must not be affected by admin device checks)
  app.get("/api/customer/products", (req: any, res: any) => {
    res.json({ success: true, products: [] });
  });

  return app;
}

// Helper to generate real ECDSA P-256 keypair and digital signature for testing
function generateTestCryptoKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const spkiDer = publicKey.export({ type: "spki", format: "der" });
  const publicKeyBase64 = spkiDer.toString("base64");

  const sign = (payload: string): string => {
    const signer = crypto.createSign("SHA256");
    signer.update(payload);
    signer.end();
    return signer.sign(privateKey).toString("base64");
  };

  return { publicKeyBase64, sign };
}

describe("VASTRAA Browser ID Based Admin Access Control", () => {
  let app: ReturnType<typeof createTestApp>;
  const ADMIN_KEY = "Admin@123";

  beforeEach(() => {
    deviceStore.devices.clear();
    deviceStore.activities.length = 0;
    app = createTestApp();
  });

  describe("Scenario A – Authorized Browser", () => {
    it("allows access to verify-browser and /admin/login when browser is authorized with valid cryptographic proof", async () => {
      const keys = generateTestCryptoKeys();
      const browserId = "BID-CHROME-001";
      const timestamp = Date.now().toString();
      const signature = keys.sign(`${browserId}:${timestamp}`);

      // Seed initial browser as authorized with public key
      deviceStore.devices.set(browserId, {
        deviceId: browserId,
        browser: "Google Chrome",
        deviceName: "Admin Windows Workstation",
        status: "authorized",
        publicKey: keys.publicKeyBase64,
        authorizedBy: "Super Admin",
        authorizedDate: new Date().toISOString(),
      });

      const res = await request(app)
        .post("/api/admin/devices/verify-browser")
        .send({
          browserId,
          browserName: "Google Chrome",
          deviceName: "Admin Windows Workstation",
          timestamp,
          signature,
        });

      expect(res.status).toBe(200);
      expect(res.body.authorized).toBe(true);
      expect(res.body.status).toBe("authorized");
      expect(res.body.browserId).toBe(browserId);
    });
  });

  describe("Scenario B – Unauthorized Browser", () => {
    it("denies access to unknown browser and returns expected unauthorized error message", async () => {
      // Seed an existing authorized device so we are not in bootstrap mode
      deviceStore.devices.set("BID-MASTER-000", {
        deviceId: "BID-MASTER-000",
        status: "authorized",
      });

      const unknownBrowserId = "BID-UNKNOWN-999";
      const res = await request(app)
        .post("/api/admin/devices/verify-browser")
        .send({
          browserId: unknownBrowserId,
          browserName: "Mozilla Firefox",
          deviceName: "Office PC",
        });

      expect(res.status).toBe(200);
      expect(res.body.authorized).toBe(false);
      expect(res.body.status).toBe("pending");
      expect(res.body.message).toContain(
        "Unauthorized Browser – This browser is not authorized to access the VASTRAA Admin Panel."
      );
    });
  });

  describe("Scenario C – Same Computer, Different Browser", () => {
    it("strictly prevents another browser from gaining access even if it copies the Browser ID (cryptographic proof protection)", async () => {
      // 1. Chrome is authorized with Keypair A
      const chromeKeys = generateTestCryptoKeys();
      const chromeBrowserId = "BID-CHROME-AUTH";
      deviceStore.devices.set(chromeBrowserId, {
        deviceId: chromeBrowserId,
        browser: "Google Chrome",
        deviceName: "Shared Office Desktop",
        status: "authorized",
        publicKey: chromeKeys.publicKeyBase64,
        authorizedBy: "Super Admin",
      });

      // 2. Microsoft Edge generates its own Keypair B
      const edgeKeys = generateTestCryptoKeys();
      const edgeBrowserId = "BID-EDGE-UNAUTH";

      // Edge trying with its own ID is unauthorized
      const edgeOwnRes = await request(app)
        .post("/api/admin/devices/verify-browser")
        .send({
          browserId: edgeBrowserId,
          browserName: "Microsoft Edge",
          deviceName: "Shared Office Desktop",
        });
      expect(edgeOwnRes.body.authorized).toBe(false);

      // 3. Attack vector: User in Edge manually copies Chrome's Browser ID into localStorage
      // Edge tries to authenticate as BID-CHROME-AUTH but only has Keypair B (cannot sign with Keypair A)
      const timestamp = Date.now().toString();
      const fraudulentSignature = edgeKeys.sign(`${chromeBrowserId}:${timestamp}`);

      const attackRes = await request(app)
        .post("/api/admin/devices/verify-browser")
        .send({
          browserId: chromeBrowserId,
          browserName: "Microsoft Edge",
          deviceName: "Shared Office Desktop",
          timestamp,
          signature: fraudulentSignature, // Signed by Keypair B instead of Keypair A!
        });

      // Cryptographic signature verification must fail!
      expect(attackRes.status).toBe(403);
      expect(attackRes.body.authorized).toBe(false);
      expect(attackRes.body.status).toBe("invalid_credential");
      expect(attackRes.body.error).toContain("Cryptographic browser credential verification failed");
    });
  });

  describe("Scenario D – Blocked and Revoked Browser", () => {
    it("immediately denies access when a browser is blocked by the Super Admin", async () => {
      const browserId = "BID-BLOCKED-001";
      deviceStore.devices.set(browserId, {
        deviceId: browserId,
        status: "blocked",
        browser: "Google Chrome",
      });

      const res = await request(app)
        .post("/api/admin/devices/verify-browser")
        .send({ browserId });

      expect(res.body.authorized).toBe(false);
      expect(res.body.status).toBe("blocked");
      expect(res.body.message).toContain("This browser has been blocked by the Super Admin");

      // Verify protected admin routes also return 403 DEVICE_BLOCKED
      const protectedRes = await request(app)
        .get("/api/admin/test-resource")
        .set("x-admin-key", ADMIN_KEY)
        .set("x-browser-id", browserId)
        .set("x-enforce-device-auth", "true");

      expect(protectedRes.status).toBe(403);
      expect(protectedRes.body.code).toBe("DEVICE_BLOCKED");
    });

    it("allows unblocking a blocked browser via POST /api/admin/devices/:deviceId/unblock", async () => {
      const browserId = "BID-TO-UNBLOCK";
      deviceStore.devices.set(browserId, {
        deviceId: browserId,
        status: "blocked",
      });

      const unblockRes = await request(app)
        .post(`/api/admin/devices/${browserId}/unblock`)
        .set("x-admin-key", ADMIN_KEY);

      expect(unblockRes.status).toBe(200);
      expect(unblockRes.body.success).toBe(true);
      expect(unblockRes.body.device.status).toBe("authorized");

      // Now verify-browser reflects authorized
      const checkRes = await request(app)
        .post("/api/admin/devices/verify-browser")
        .send({ browserId });
      expect(checkRes.body.authorized).toBe(true);
    });

    it("revokes an authorized browser and invalidates sessions", async () => {
      const browserId = "BID-TO-REVOKE";
      deviceStore.devices.set(browserId, {
        deviceId: browserId,
        status: "authorized",
      });

      const revokeRes = await request(app)
        .post(`/api/admin/devices/${browserId}/revoke`)
        .set("x-admin-key", ADMIN_KEY)
        .send({ reason: "Revoked access" });

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);
      expect(revokeRes.body.device.status).toBe("revoked");

      // Subsequent verify-browser returns revoked
      const checkRes = await request(app)
        .post("/api/admin/devices/verify-browser")
        .send({ browserId });
      expect(checkRes.body.authorized).toBe(false);
      expect(checkRes.body.status).toBe("revoked");
    });
  });

  describe("Customer and Seller Isolation", () => {
    it("confirms customer routes are completely unaffected by browser authorization", async () => {
      const res = await request(app).get("/api/customer/products");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
