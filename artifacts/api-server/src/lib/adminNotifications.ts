import {
  db,
  notificationsTable,
  ADMIN_NOTIFICATION_USER_ID,
  siteSettingsTable,
  mongoSiteSettings,
  mongoGeneric,
  mongoNotifications,
} from "@workspace/db";
import type { AdminNotificationType } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// ─── Map notification types → admin_notification_prefs category keys ──────────

export const TYPE_TO_PREF_KEY: Record<string, string> = {
  // 1. New Order
  new_order: "new_order",
  order_placed: "new_order",
  high_value_order: "new_order",

  // 2. New Seller Registration
  new_vendor_registration: "new_vendor_registration",
  new_seller_registration: "new_vendor_registration",

  // 3. Seller Approval Required
  vendor_approval_required: "vendor_approval_required",
  kyc_submitted: "vendor_approval_required",
  product_pending_approval: "vendor_approval_required",

  // 4. Seller Dispute
  vendor_dispute: "vendor_dispute",
  seller_dispute: "vendor_dispute",
  customer_complaint: "vendor_dispute",

  // 5. Refund Request
  refund_request: "refund_request",
  return_request: "refund_request",

  // 6. Support Ticket
  support_ticket: "support_ticket",
  seller_support_request: "support_ticket",
  ticket_created: "support_ticket",

  // 7. Payment Failure
  payment_failure: "payment_failure",
  payout_failed: "payment_failure",
  payment_gateway_issue: "payment_failure",

  // 8. Shipping Issue
  shipping_issue: "shipping_issue",
  shipment_delayed: "shipping_issue",
  delivery_failed: "shipping_issue",

  // 9. System Error
  system_error: "system_error",
  system_error_alert: "system_error",
  email_delivery_failed: "system_error",

  // 10. Security / Login Alert
  security_login_alert: "security_login_alert",
  admin_login: "security_login_alert",
  unauthorized_device_attempt: "security_login_alert",
  security_key_changed: "security_login_alert",
};

export interface PrefRow {
  email: boolean;
  inApp: boolean;
  sms: boolean;
}

export const NOTIF_DEFAULTS: Record<string, PrefRow> = {
  new_order:                { email: true,  inApp: true,  sms: false },
  new_vendor_registration:  { email: true,  inApp: true,  sms: false },
  vendor_approval_required: { email: true,  inApp: true,  sms: false },
  vendor_dispute:           { email: true,  inApp: true,  sms: false },
  refund_request:           { email: true,  inApp: true,  sms: false },
  support_ticket:           { email: true,  inApp: true,  sms: false },
  payment_failure:          { email: true,  inApp: true,  sms: false },
  shipping_issue:           { email: true,  inApp: true,  sms: false },
  system_error:             { email: true,  inApp: true,  sms: false },
  security_login_alert:     { email: true,  inApp: true,  sms: true  },
};

// ─── Setting helper ───────────────────────────────────────────────────────────

export async function getAdminSetting(key: string): Promise<string | null> {
  try {
    if (mongoSiteSettings && typeof mongoSiteSettings.get === "function") {
      const val = await mongoSiteSettings.get(key);
      if (val !== null && val !== undefined) return val;
    }
  } catch {}
  try {
    const [row] = await db
      .select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

// ─── Preference cache (60s TTL) ───────────────────────────────────────────────

let _prefCache: { prefs: Record<string, PrefRow>; expiresAt: number } | null = null;

export async function getAdminNotifPrefs(): Promise<Record<string, PrefRow>> {
  if (_prefCache && Date.now() < _prefCache.expiresAt) return _prefCache.prefs;
  let val: string | null = null;
  try {
    val = await getAdminSetting("admin_notification_prefs");
  } catch {}

  try {
    let stored: Record<string, Partial<PrefRow>> = {};
    if (val) {
      stored = JSON.parse(val);
    }
    const merged: Record<string, PrefRow> = {};
    for (const [k, def] of Object.entries(NOTIF_DEFAULTS)) {
      const inc = stored[k] ?? {};
      merged[k] = {
        email: typeof inc.email === "boolean" ? inc.email : def.email,
        inApp: typeof inc.inApp === "boolean" ? inc.inApp : def.inApp,
        sms:   typeof inc.sms   === "boolean" ? inc.sms   : def.sms,
      };
    }
    _prefCache = { prefs: merged, expiresAt: Date.now() + 60_000 };
    return merged;
  } catch {
    return { ...NOTIF_DEFAULTS };
  }
}

/** Call this whenever notification prefs are saved so the cache is refreshed immediately. */
export function clearAdminNotifPrefCache(): void {
  _prefCache = null;
}

// ─── Main Notification Trigger & Multi-Channel Delivery Engine ────────────────

export interface InsertAdminNotificationOpts {
  tx?: any;
  type: AdminNotificationType | string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  forceChannels?: { email?: boolean; inApp?: boolean; sms?: boolean };
  awaitChannels?: boolean;
}

export interface AdminNotificationDeliveryResult {
  id: string;
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

export async function insertAdminNotification(
  opts: InsertAdminNotificationOpts
): Promise<AdminNotificationDeliveryResult> {
  const { type, title, body, metadata, forceChannels } = opts;
  const prefKey = TYPE_TO_PREF_KEY[type] || type;
  const prefs = await getAdminNotifPrefs();
  const pref = prefs[prefKey] ?? NOTIF_DEFAULTS[prefKey] ?? { email: true, inApp: true, sms: false };

  const shouldSendInApp = forceChannels?.inApp !== undefined ? forceChannels.inApp : pref.inApp !== false;
  const shouldSendEmail = forceChannels?.email !== undefined ? forceChannels.email : pref.email === true;
  const shouldSendSms = forceChannels?.sms !== undefined ? forceChannels.sms : pref.sms === true;

  const id = crypto.randomUUID();
  let inAppSent = false;
  let emailSent = false;
  let smsSent = false;

  // 1. Channel: IN-APP NOTIFICATION
  if (shouldSendInApp) {
    try {
      await mongoGeneric.getCollection("notifications").insertOne({
        id,
        _id: id,
        userId: ADMIN_NOTIFICATION_USER_ID,
        type,
        title,
        body,
        read: false,
        isRead: false,
        metadata: metadata ?? {},
        createdAt: new Date(),
      } as any);
      inAppSent = true;
    } catch {
      try {
        const client = opts.tx ?? db;
        await client.insert(notificationsTable).values({
          id,
          userId: ADMIN_NOTIFICATION_USER_ID,
          type: type as any,
          title,
          body,
          metadata: metadata ?? {},
        });
        inAppSent = true;
      } catch (dbErr: any) {
        logger.error({ dbErr, type }, "Failed to persist admin in-app notification");
      }
    }

    if (inAppSent) {
      // Real-time broadcast via Socket.IO
      try {
        const { getIO } = await import("./socket");
        const io = getIO();
        if (io) {
          const payload = {
            id,
            type,
            title,
            body,
            metadata: metadata ?? {},
            read: false,
            createdAt: new Date().toISOString(),
          };
          io.to("admin").emit("admin_notification", payload);
          io.emit("admin_notification", payload);

          // Broadcast updated unread count to Admin Navbar immediately
          void (async () => {
            try {
              let count = 0;
              try {
                count = await mongoNotifications.count({
                  userId: ADMIN_NOTIFICATION_USER_ID,
                  $or: [{ read: false }, { isRead: false }],
                });
              } catch {
                const [row] = await db
                  .select({ count: notificationsTable.id })
                  .from(notificationsTable)
                  .where(eq(notificationsTable.userId, ADMIN_NOTIFICATION_USER_ID));
                count = row ? 1 : 0;
              }
              io.to("admin").emit("admin_unread_count", { count });
              io.emit("admin_unread_count", { count });
            } catch {}
          })();
        }
      } catch (sockErr: any) {
        logger.warn({ sockErr }, "Socket broadcast for admin notification encountered error");
      }
    }
  }

  const deliveryTasks: Promise<any>[] = [];

  // 2. Channel: EMAIL NOTIFICATION
  if (shouldSendEmail) {
    const emailTask = (async () => {
      try {
        const adminEmail =
          (await getAdminSetting("admin_email")) ||
          process.env.ADMIN_NOTIFICATION_EMAIL ||
          "admin@vastraa.com";

        if (adminEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) {
          const { sendAdminAlertEmail } = await import("./transactionalEmail");
          const result = await sendAdminAlertEmail({
            toEmail: adminEmail.trim(),
            category: prefKey,
            title,
            body,
            metadata: metadata as Record<string, any>,
          });
          emailSent = result.delivered || result.queued;
        } else {
          logger.warn({ adminEmail }, "Admin email address not configured or invalid format");
        }
      } catch (mailErr: any) {
        logger.error({ mailErr, type, title }, "Failed to deliver admin notification email");
      }
    })();
    deliveryTasks.push(emailTask);
  }

  // 3. Channel: SMS NOTIFICATION
  if (shouldSendSms) {
    const smsTask = (async () => {
      try {
        const adminMobile =
          (await getAdminSetting("admin_mobile")) ||
          process.env.ADMIN_NOTIFICATION_PHONE ||
          "";

        if (adminMobile && adminMobile.trim()) {
          const { sendSms } = await import("./sms");
          const text = `[VASTRAA Alert] ${title}: ${body}`.slice(0, 155);
          await sendSms(adminMobile.trim(), text);
          smsSent = true;
        } else {
          logger.warn("Admin mobile number not configured for SMS alerts");
        }
      } catch (smsErr: any) {
        logger.error({ smsErr, type, title }, "Failed to deliver admin notification SMS");
      }
    })();
    deliveryTasks.push(smsTask);
  }

  if (opts.awaitChannels && deliveryTasks.length > 0) {
    await Promise.allSettled(deliveryTasks);
  }

  return { id, inApp: inAppSent, email: emailSent, sms: smsSent };
}
