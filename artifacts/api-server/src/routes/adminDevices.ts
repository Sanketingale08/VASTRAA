import { Router } from "express";
import { mongoAdminDevices, mongoAdminDeviceActivities } from "@workspace/db";
import { requireAdminKey } from "../middlewares/isAdmin";
import { invalidateDeviceSessions, logDeviceActivity, verifyDeviceSignature } from "../lib/deviceVerification";
import { getIp } from "../lib/auditLog";

const router = Router();

// ── Public / Semi-Public Device Endpoints (Exempt from Device Gate) ──────────

/**
 * Register / Announce a device identity from a browser.
 * Generates initial registration record (pending, or auto-authorized if initial system device).
 */
router.post("/admin/devices/register", async (req: any, res: any) => {
  try {
    const { deviceId, publicKey, deviceName, platform, userAgent } = req.body ?? {};
    if (!deviceId || typeof deviceId !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(deviceId.trim())) {
      return res.status(400).json({ success: false, error: "Valid Device ID (6-64 alphanumeric characters) is required." });
    }

    const cleanDeviceId = deviceId.trim();
    const existing = await mongoAdminDevices.findById(cleanDeviceId);
    const ip = getIp(req);
    const ua = userAgent || req.headers["user-agent"] || "";

    if (existing) {
      // Update metadata on existing device
      await mongoAdminDevices.update(cleanDeviceId, {
        lastLoginIp: ip,
        lastLoginBrowser: ua,
        userAgent: ua,
        platform: platform || existing.platform,
        publicKey: publicKey || existing.publicKey,
      });

      return res.json({
        success: true,
        device: {
          deviceId: existing.deviceId,
          deviceName: existing.deviceName,
          status: existing.status,
          authorizedDate: existing.authorizedDate,
        },
      });
    }

    // New device: Check if this is the first device in the system
    const totalCount = await mongoAdminDevices.count();
    const isFirstDevice = totalCount === 0;

    const initialStatus = isFirstDevice ? "authorized" : "pending";
    const newDevice = await mongoAdminDevices.create({
      deviceId: cleanDeviceId,
      deviceName: deviceName || (platform ? `${platform} Browser` : "Admin Device"),
      publicKey: publicKey || "",
      status: initialStatus,
      authorizedBy: isFirstDevice ? "System (Initial Super Admin Bootstrap)" : null,
      authorizedDate: isFirstDevice ? new Date() : null,
      lastLoginIp: ip,
      lastLoginBrowser: ua,
      userAgent: ua,
      platform: platform || "Unknown",
    });

    await logDeviceActivity({
      deviceId: cleanDeviceId,
      deviceName: newDevice.deviceName,
      action: isFirstDevice ? "device_auto_authorized_bootstrap" : "device_registered",
      administrator: isFirstDevice ? "System" : undefined,
      result: isFirstDevice ? "success" : "denied",
      details: { platform, isFirstDevice },
      ipAddress: ip,
      userAgent: ua,
    });

    return res.json({
      success: true,
      status: newDevice.status,
      device: {
        deviceId: newDevice.deviceId,
        deviceName: newDevice.deviceName,
        status: newDevice.status,
        authorizedDate: newDevice.authorizedDate,
        authorizedBy: newDevice.authorizedBy,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to register device." });
  }
});

/**
 * Check device / browser authorization status without requiring full admin key.
 * Used by Unauthorized Device screen and AdminGuard.
 */
router.get(["/admin/devices/check", "/admin/browser/check"], async (req: any, res: any) => {
  try {
    const deviceId =
      (req.headers["x-browser-id"] as string) ||
      (req.headers["x-device-id"] as string) ||
      (req.query.browserId as string) ||
      (req.query.deviceId as string) ||
      (req.cookies?.td_admin_device_id as string);
    if (!deviceId) {
      return res.json({ authorized: false, status: "unauthorized", message: "No Browser ID provided." });
    }

    const cleanDeviceId = String(deviceId).trim();
    const device = await mongoAdminDevices.findById(cleanDeviceId);

    if (!device) {
      return res.json({ authorized: false, status: "unauthorized", deviceId: cleanDeviceId, browserId: cleanDeviceId });
    }

    return res.json({
      authorized: device.status === "authorized",
      status: device.status,
      deviceId: device.deviceId,
      browserId: device.deviceId,
      deviceName: device.deviceName,
      browserName: device.browser || device.deviceName,
      authorizedDate: device.authorizedDate,
      revocationReason: device.revocationReason,
    });
  } catch (err: any) {
    return res.status(500).json({ authorized: false, status: "error", error: err?.message });
  }
});

/**
 * Cryptographically verify browser authorization before allowing access to /admin/login.
 * Pre-login endpoint: verifies Browser ID, timestamp, and ECDSA signature against public key.
 */
router.post(["/admin/devices/verify-browser", "/admin/browser/verify"], async (req: any, res: any) => {
  try {
    const { browserId, deviceId, browserName, deviceName, timestamp, signature, publicKey } = req.body ?? {};
    const id = (
      browserId ||
      deviceId ||
      (req.headers["x-browser-id"] as string) ||
      (req.headers["x-device-id"] as string)
    )?.trim();

    if (!id) {
      return res.status(400).json({
        authorized: false,
        status: "unauthorized",
        error: "Browser ID is required.",
      });
    }

    let device = await mongoAdminDevices.findById(id);

    // Bootstrap check: if 0 devices/browsers exist in database, auto-enroll this first browser instance
    if (!device) {
      const totalDevices = await mongoAdminDevices.count().catch(() => 0);
      if (totalDevices === 0) {
        const ip = getIp(req);
        device = await mongoAdminDevices.create({
          deviceId: id,
          deviceName: deviceName || "Super Admin Primary Device",
          browser: browserName || "Primary Browser",
          os: deviceName || "OS",
          deviceType: "desktop",
          status: "authorized",
          ipAddress: ip,
          lastLoginIp: ip,
          publicKey: publicKey || undefined,
          authorizedAt: new Date().toISOString(),
          authorizedBy: "System (Initial Super Admin Bootstrap)",
          notes: "Automatically authorized initial administrator browser instance.",
        });
        await logDeviceActivity({
          deviceId: id,
          deviceName: device.deviceName,
          action: "browser_auto_authorized_bootstrap",
          administrator: "System",
          result: "success",
          ipAddress: ip,
        });
      } else {
        // Unknown browser -> auto register as pending so Super Admin can inspect and allow it
        const ip = getIp(req);
        device = await mongoAdminDevices.create({
          deviceId: id,
          deviceName: deviceName || "Admin Browser",
          browser: browserName || "Browser",
          os: deviceName || "OS",
          deviceType: "desktop",
          status: "pending",
          ipAddress: ip,
          lastLoginIp: ip,
          publicKey: publicKey || undefined,
          notes: "Auto-registered pending browser authorization request.",
        });
        await logDeviceActivity({
          deviceId: id,
          deviceName: device.deviceName,
          action: "browser_registered",
          result: "denied",
          ipAddress: ip,
        });
        return res.json({
          authorized: false,
          status: "pending",
          browserId: id,
          deviceId: id,
          browserName: device.browser || browserName,
          deviceName: device.deviceName,
          message:
            "Unauthorized Browser – This browser is not authorized to access the VASTRAA Admin Panel. Please contact the Super Admin for access.",
        });
      }
    }

    if (device.status === "blocked") {
      return res.json({
        authorized: false,
        status: "blocked",
        browserId: id,
        deviceId: id,
        browserName: device.browser || browserName,
        deviceName: device.deviceName,
        message: "Unauthorized Browser – This browser has been blocked by the Super Admin.",
      });
    }

    if (device.status === "revoked") {
      return res.json({
        authorized: false,
        status: "revoked",
        browserId: id,
        deviceId: id,
        browserName: device.browser || browserName,
        deviceName: device.deviceName,
        message: "Unauthorized Browser – Access for this browser has been revoked.",
      });
    }

    if (device.status !== "authorized") {
      return res.json({
        authorized: false,
        status: device.status,
        browserId: id,
        deviceId: id,
        browserName: device.browser || browserName,
        deviceName: device.deviceName,
        message:
          "Unauthorized Browser – This browser is not authorized to access the VASTRAA Admin Panel. Please contact the Super Admin for access.",
      });
    }

    // Status is authorized. Verify cryptographic proof if signature and public key are provided
    if (signature && timestamp) {
      let isValid = false;
      let effectiveKey = device.publicKey;

      // 1. First try with stored device public key if available
      if (effectiveKey) {
        isValid = verifyDeviceSignature(id, timestamp, signature, effectiveKey);
      }

      // 2. If stored key failed or not present, but client supplied public key, check with client's public key
      if (!isValid && publicKey) {
        if (verifyDeviceSignature(id, timestamp, signature, publicKey)) {
          isValid = true;
          effectiveKey = publicKey;
          // Synchronize confirmed public key into database
          await mongoAdminDevices.update(id, { publicKey });
        }
      }

      if (!isValid && (effectiveKey || publicKey)) {
        await logDeviceActivity({
          deviceId: id,
          deviceName: device.deviceName,
          action: "cryptographic_proof_failed",
          result: "denied",
          reason: "Invalid cryptographic signature provided by browser client.",
          ipAddress: getIp(req),
        });
        return res.status(403).json({
          authorized: false,
          status: "invalid_credential",
          browserId: id,
          deviceId: id,
          error: "Unauthorized Browser – Cryptographic browser credential verification failed.",
        });
      }
    }

    // Update last seen timestamp & IP
    const ip = getIp(req);
    mongoAdminDevices
      .update(id, {
        lastSeenAt: new Date().toISOString(),
        lastLoginIp: ip,
        publicKey: device.publicKey || publicKey || undefined,
      })
      .catch(() => {});

    return res.json({
      authorized: true,
      status: "authorized",
      browserId: id,
      deviceId: id,
      browserName: device.browser || browserName,
      deviceName: device.deviceName,
      authorizedDate: device.authorizedDate,
    });
  } catch (err: any) {
    return res.status(500).json({ authorized: false, status: "error", error: err?.message });
  }
});

// ── Protected Device Management Endpoints (Super Admin Only) ─────────────────

/**
 * List all devices with statistics, search, and filtering.
 */
router.get("/admin/devices", requireAdminKey, async (req: any, res: any) => {
  try {
    const { status, search, page = "1", limit = "50" } = req.query;
    const filter: any = {};

    if (status && status !== "all") {
      filter.status = status;
    }

    if (search && typeof search === "string" && search.trim()) {
      const q = search.trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { deviceId: { $regex: escaped, $options: "i" } },
        { deviceName: { $regex: escaped, $options: "i" } },
        { deviceDescription: { $regex: escaped, $options: "i" } },
        { authorizedBy: { $regex: escaped, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [devices, totalCount, stats] = await Promise.all([
      mongoAdminDevices.findMany(filter, { sort: { createdAt: -1 }, skip, limit: limitNum }),
      mongoAdminDevices.count(filter),
      mongoAdminDevices.getStats(),
    ]);

    return res.json({
      success: true,
      devices,
      totalCount,
      page: pageNum,
      limit: limitNum,
      stats,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to fetch devices." });
  }
});

/**
 * Fetch Device Activity Logs.
 */
router.get("/admin/devices/activities", requireAdminKey, async (req: any, res: any) => {
  try {
    const { deviceId, limit = "100" } = req.query;
    const filter: any = {};
    if (deviceId) filter.deviceId = String(deviceId).trim();

    const limitNum = Math.min(200, Math.max(1, parseInt(String(limit), 10) || 100));
    const activities = await mongoAdminDeviceActivities.findMany(filter, { sort: { timestamp: -1 }, limit: limitNum });

    return res.json({
      success: true,
      activities,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to fetch device activities." });
  }
});

/**
 * Super Admin authorizes / allows a device.
 */
router.post("/admin/devices/allow", requireAdminKey, async (req: any, res: any) => {
  try {
    const { deviceId, deviceName, deviceDescription, status = "authorized" } = req.body ?? {};
    if (!deviceId || typeof deviceId !== "string" || !deviceId.trim()) {
      return res.status(400).json({ success: false, error: "Device ID is required." });
    }

    const cleanDeviceId = deviceId.trim();
    const adminUser = req.admin?.email || req.admin?.name || "Super Admin";
    const now = new Date();
    const targetStatus = status === "blocked" ? "blocked" : "authorized";

    let device = await mongoAdminDevices.findById(cleanDeviceId);

    if (device) {
      device = await mongoAdminDevices.update(cleanDeviceId, {
        deviceName: deviceName?.trim() || device.deviceName,
        deviceDescription: deviceDescription !== undefined ? deviceDescription.trim() : device.deviceDescription,
        status: targetStatus,
        authorizedBy: targetStatus === "authorized" ? adminUser : device.authorizedBy,
        authorizedDate: targetStatus === "authorized" ? now : device.authorizedDate,
        revokedDate: targetStatus === "blocked" ? now : null,
        revokedBy: targetStatus === "blocked" ? adminUser : null,
        revocationReason: targetStatus === "blocked" ? "Blocked on allow-devices submission" : null,
      });
    } else {
      // Register newly allowed device
      device = await mongoAdminDevices.create({
        deviceId: cleanDeviceId,
        deviceName: deviceName?.trim() || "Authorized Admin Device",
        deviceDescription: deviceDescription?.trim() || "",
        status: targetStatus,
        authorizedBy: targetStatus === "authorized" ? adminUser : null,
        authorizedDate: targetStatus === "authorized" ? now : null,
        revokedDate: targetStatus === "blocked" ? now : null,
        revokedBy: targetStatus === "blocked" ? adminUser : null,
      });
    }

    await logDeviceActivity({
      deviceId: cleanDeviceId,
      deviceName: device?.deviceName,
      action: targetStatus === "authorized" ? "device_authorized" : "device_blocked",
      administrator: adminUser,
      result: "success",
      details: { authorizedBy: adminUser, targetStatus },
      ipAddress: getIp(req),
    });

    return res.json({
      success: true,
      message: targetStatus === "authorized" ? "Device authorized successfully." : "Device registered as blocked.",
      device,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to authorize device." });
  }
});

/**
 * Super Admin blocks a device.
 */
router.post("/admin/devices/:deviceId/block", requireAdminKey, async (req: any, res: any) => {
  try {
    const { deviceId } = req.params;
    const { reason } = req.body ?? {};
    const cleanDeviceId = String(deviceId).trim();
    const adminUser = req.admin?.email || req.admin?.name || "Super Admin";
    const now = new Date();

    const existing = await mongoAdminDevices.findById(cleanDeviceId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Device not found." });
    }

    const updated = await mongoAdminDevices.update(cleanDeviceId, {
      status: "blocked",
      revokedDate: now,
      revokedBy: adminUser,
      revocationReason: reason || "Blocked by Super Admin",
    });

    // Invalidate all active sessions for this device
    const sessionsKilled = await invalidateDeviceSessions(cleanDeviceId);

    await logDeviceActivity({
      deviceId: cleanDeviceId,
      deviceName: existing.deviceName,
      action: "device_blocked",
      administrator: adminUser,
      result: "blocked",
      details: { reason, sessionsKilled },
      ipAddress: getIp(req),
    });

    return res.json({
      success: true,
      message: "Device has been blocked and its active admin sessions have been terminated.",
      device: updated,
      sessionsKilled,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to block device." });
  }
});

/**
 * Super Admin unblocks a previously blocked device.
 */
router.post("/admin/devices/:deviceId/unblock", requireAdminKey, async (req: any, res: any) => {
  try {
    const { deviceId } = req.params;
    const cleanDeviceId = String(deviceId).trim();
    const adminUser = req.admin?.email || req.admin?.name || "Super Admin";
    const now = new Date();

    const existing = await mongoAdminDevices.findById(cleanDeviceId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Device not found." });
    }

    const updated = await mongoAdminDevices.update(cleanDeviceId, {
      status: "authorized",
      authorizedBy: adminUser,
      authorizedDate: now,
      revokedDate: null,
      revokedBy: null,
      revocationReason: null,
    });

    await logDeviceActivity({
      deviceId: cleanDeviceId,
      deviceName: existing.deviceName,
      action: "device_unblocked",
      administrator: adminUser,
      result: "success",
      details: { unblockedBy: adminUser },
      ipAddress: getIp(req),
    });

    return res.json({
      success: true,
      message: "Device unblocked and authorized successfully.",
      device: updated,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to unblock device." });
  }
});

/**
 * Super Admin revokes a device's access.
 */
router.post("/admin/devices/:deviceId/revoke", requireAdminKey, async (req: any, res: any) => {
  try {
    const { deviceId } = req.params;
    const { reason } = req.body ?? {};
    const cleanDeviceId = String(deviceId).trim();
    const adminUser = req.admin?.email || req.admin?.name || "Super Admin";
    const now = new Date();

    const existing = await mongoAdminDevices.findById(cleanDeviceId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Device not found." });
    }

    const updated = await mongoAdminDevices.update(cleanDeviceId, {
      status: "revoked",
      revokedDate: now,
      revokedBy: adminUser,
      revocationReason: reason || "Access revoked by Super Admin",
    });

    // Invalidate active sessions
    const sessionsKilled = await invalidateDeviceSessions(cleanDeviceId);

    await logDeviceActivity({
      deviceId: cleanDeviceId,
      deviceName: existing.deviceName,
      action: "access_revoked",
      administrator: adminUser,
      result: "revoked",
      details: { reason, sessionsKilled },
      ipAddress: getIp(req),
    });

    return res.json({
      success: true,
      message: "Device access revoked and active sessions invalidated.",
      device: updated,
      sessionsKilled,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to revoke device access." });
  }
});

/**
 * Super Admin deletes a device record.
 */
router.delete("/admin/devices/:deviceId", requireAdminKey, async (req: any, res: any) => {
  try {
    const { deviceId } = req.params;
    const cleanDeviceId = String(deviceId).trim();
    const adminUser = req.admin?.email || req.admin?.name || "Super Admin";

    const existing = await mongoAdminDevices.findById(cleanDeviceId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Device not found." });
    }

    await invalidateDeviceSessions(cleanDeviceId);
    await mongoAdminDevices.delete(cleanDeviceId);

    await logDeviceActivity({
      deviceId: cleanDeviceId,
      deviceName: existing.deviceName,
      action: "device_deleted",
      administrator: adminUser,
      result: "success",
      ipAddress: getIp(req),
    });

    return res.json({
      success: true,
      message: "Device record deleted successfully.",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to delete device." });
  }
});

/**
 * Get single device details with activity history.
 */
router.get("/admin/devices/:deviceId", requireAdminKey, async (req: any, res: any) => {
  try {
    const { deviceId } = req.params;
    const cleanDeviceId = String(deviceId).trim();

    const device = await mongoAdminDevices.findById(cleanDeviceId);
    if (!device) {
      return res.status(404).json({ success: false, error: "Device not found." });
    }

    const activities = await mongoAdminDeviceActivities.findMany({ deviceId: cleanDeviceId }, { sort: { timestamp: -1 }, limit: 20 });

    return res.json({
      success: true,
      device,
      activities,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to fetch device details." });
  }
});

export default router;

