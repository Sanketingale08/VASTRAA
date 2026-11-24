import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type DeviceStatus = "authorized" | "unauthorized" | "blocked" | "revoked" | "pending";

export interface AdminDevice {
  id: string;
  deviceId: string;
  deviceName?: string;
  deviceDescription?: string;
  publicKey?: string;
  status: DeviceStatus;
  authorizedBy?: string | null;
  authorizedDate?: Date | null;
  lastLoginDate?: Date | null;
  lastLoginIp?: string | null;
  lastLoginBrowser?: string | null;
  createdAt: Date;
  updatedAt: Date;
  revokedDate?: Date | null;
  revokedBy?: string | null;
  revocationReason?: string | null;
  userAgent?: string | null;
  platform?: string | null;
}

export interface AdminDeviceActivity {
  id: string;
  deviceId: string;
  deviceName?: string;
  action: string;
  administrator?: string;
  result: "success" | "blocked" | "denied" | "failed" | "revoked";
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export const adminDevicesTable = pgTable("admin_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: text("device_id").notNull().unique(),
  deviceName: text("device_name"),
  deviceDescription: text("device_description"),
  publicKey: text("public_key"),
  status: text("status").notNull().default("pending"),
  authorizedBy: text("authorized_by"),
  authorizedDate: timestamp("authorized_date", { withTimezone: true }),
  lastLoginDate: timestamp("last_login_date", { withTimezone: true }),
  lastLoginIp: text("last_login_ip"),
  lastLoginBrowser: text("last_login_browser"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  revokedDate: timestamp("revoked_date", { withTimezone: true }),
  revokedBy: text("revoked_by"),
  revocationReason: text("revocation_reason"),
  userAgent: text("user_agent"),
  platform: text("platform"),
});

export const adminDeviceActivitiesTable = pgTable("admin_device_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: text("device_id").notNull(),
  deviceName: text("device_name"),
  action: text("action").notNull(),
  administrator: text("administrator"),
  result: text("result").notNull().default("success"),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
});

