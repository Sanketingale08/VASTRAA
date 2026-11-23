import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { signAccessToken } from "../lib/jwt";
import { mongoOrders, mongoGeneric, isMongoDbConnected, mongoUsers } from "@workspace/db";
import {
  findStoredInvoice,
  listInvoicesForOrder,
  ensureOrderInvoicesGenerated,
  type StoredInvoiceSnapshot,
} from "../lib/invoiceStorage";

describe("Order Invoice Listing and Document Retrieval — Bug Fix Verification", () => {
  const customerId = "cust_invoice_test_1";
  const customerEmail = "customer_test@vastraa.com";
  const customerToken = signAccessToken({ sub: customerId, role: "customer", email: customerEmail });

  const otherCustomerId = "cust_invoice_test_2";
  const otherCustomerToken = signAccessToken({ sub: otherCustomerId, role: "customer", email: "other@vastraa.com" });

  const seller1Id = "seller_inv_test_1";
  const seller2Id = "seller_inv_test_2";
  const seller1Token = signAccessToken({ sub: seller1Id, role: "seller", email: "seller1@vastraa.com" });

  const adminKey = "dev-admin-key";

  const singleVendorOrderId = "ORD-INV-LIST-SINGLE-001";
  const multiVendorOrderId = "ORD-INV-LIST-MULTI-002";
  const ungeneratedOrderId = "ORD-INV-LIST-FRESH-003";

  beforeAll(async () => {
    // Ensure test user exists in mongoUsers
    await mongoUsers.insert({
      id: customerId,
      email: customerEmail,
      name: "Pooja Sharma",
      role: "customer",
    }).catch(() => {});

    // Clean up any pre-existing test data
    try {
      await mongoOrders.delete(singleVendorOrderId).catch(() => {});
      await mongoOrders.delete(multiVendorOrderId).catch(() => {});
      await mongoOrders.delete(ungeneratedOrderId).catch(() => {});
      if (isMongoDbConnected()) {
        const col = mongoGeneric.getCollection<StoredInvoiceSnapshot>("invoices");
        await col.deleteMany({ orderId: { $in: [singleVendorOrderId, multiVendorOrderId, ungeneratedOrderId] } }).catch(() => {});
      }
    } catch {}

    // Seed Single Vendor Order
    await mongoOrders.insert({
      id: singleVendorOrderId,
      displayId: "V-SINGLE-101",
      userId: customerId,
      customerEmail: customerEmail,
      paymentMethod: "upi",
      paymentStatus: "paid",
      status: "confirmed",
      total: 2500,
      subtotal: 2380.95,
      tax: 119.05,
      shipping: 0,
      createdAt: new Date().toISOString(),
      address: {
        name: "Pooja Sharma",
        phone: "9876543210",
        line1: "123 FC Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411004",
        email: customerEmail,
      },
      items: [
        {
          productId: "prod_saree_single_1",
          name: "Authentic Paithani Silk Saree",
          price: 2500,
          quantity: 1,
          vendorId: seller1Id,
          vendorName: "Yeola Artisans",
        },
      ],
    });

    // Seed Multi Vendor Order
    await mongoOrders.insert({
      id: multiVendorOrderId,
      displayId: "V-MULTI-202",
      userId: customerId,
      customerEmail: customerEmail,
      paymentMethod: "card",
      paymentStatus: "paid",
      status: "confirmed",
      total: 6000,
      subtotal: 5714.28,
      tax: 285.72,
      shipping: 0,
      createdAt: new Date().toISOString(),
      address: {
        name: "Pooja Sharma",
        phone: "9876543210",
        line1: "123 FC Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411004",
        email: customerEmail,
      },
      items: [
        {
          productId: "prod_saree_m1",
          name: "Banarasi Katan Silk",
          price: 3500,
          quantity: 1,
          vendorId: seller1Id,
          vendorName: "Yeola Artisans",
        },
        {
          productId: "prod_saree_m2",
          name: "Chanderi Cotton Silk",
          price: 2500,
          quantity: 1,
          vendorId: seller2Id,
          vendorName: "Chanderi Heritage",
        },
      ],
    });

    // Seed Fresh order without invoices
    await mongoOrders.insert({
      id: ungeneratedOrderId,
      displayId: "V-FRESH-303",
      userId: customerId,
      customerEmail: customerEmail,
      paymentMethod: "cod",
      paymentStatus: "pending",
      status: "confirmed",
      total: 1800,
      subtotal: 1714.29,
      tax: 85.71,
      shipping: 0,
      createdAt: new Date().toISOString(),
      address: {
        name: "Pooja Sharma",
        phone: "9876543210",
        line1: "123 FC Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411004",
        email: customerEmail,
      },
      items: [
        {
          productId: "prod_saree_fresh",
          name: "Tussar Silk Handloom Saree",
          price: 1800,
          quantity: 1,
          vendorId: seller1Id,
          vendorName: "Yeola Artisans",
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      await mongoOrders.delete(singleVendorOrderId).catch(() => {});
      await mongoOrders.delete(multiVendorOrderId).catch(() => {});
      await mongoOrders.delete(ungeneratedOrderId).catch(() => {});
      if (isMongoDbConnected()) {
        const col = mongoGeneric.getCollection<StoredInvoiceSnapshot>("invoices");
        await col.deleteMany({ orderId: { $in: [singleVendorOrderId, multiVendorOrderId, ungeneratedOrderId] } }).catch(() => {});
      }
    } catch {}
  });

  it("1. Customer can list invoices for their order without 'Failed to list invoices' error", async () => {
    const res = await request(app)
      .get(`/api/orders/${singleVendorOrderId}/invoices`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.orderId).toBe(singleVendorOrderId);
    expect(res.body.displayId).toBe("V-SINGLE-101");
    expect(res.body.isMultiVendor).toBe(false);
    expect(Array.isArray(res.body.documents)).toBe(true);
    expect(res.body.documents.length).toBeGreaterThanOrEqual(1);

    const doc = res.body.documents[0];
    expect(doc).toHaveProperty("id");
    expect(doc).toHaveProperty("invoiceNumber");
    expect(doc).toHaveProperty("documentType", "tax_invoice");
    expect(doc).toHaveProperty("documentTitle", "TAX INVOICE");
    expect(doc).toHaveProperty("sellerName");
    expect(doc).toHaveProperty("grandTotal", 2500);
    expect(doc).toHaveProperty("downloadUrl");
    expect(doc).toHaveProperty("previewUrl");
  });

  it("2. Listing invoices by order displayId (e.g. 'V-SINGLE-101') also works cleanly", async () => {
    const res = await request(app)
      .get("/api/orders/V-SINGLE-101/invoices")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.documents.length).toBeGreaterThanOrEqual(1);
    expect(res.body.documents[0].grandTotal).toBe(2500);
  });

  it("3. Multi-vendor order returns Master Order Summary AND seller tax invoices", async () => {
    const res = await request(app)
      .get(`/api/orders/${multiVendorOrderId}/invoices`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isMultiVendor).toBe(true);
    expect(res.body.documents.length).toBe(3); // 1 MOS + 2 Seller Tax Invoices

    const docTypes = res.body.documents.map((d: any) => d.documentType);
    expect(docTypes).toContain("master_order_summary");
    expect(docTypes).toContain("tax_invoice");

    const mos = res.body.documents.find((d: any) => d.documentType === "master_order_summary");
    expect(mos).toBeDefined();
    expect(mos.grandTotal).toBe(6000);
    expect(mos.documentTitle).toBe("MASTER ORDER SUMMARY");
  });

  it("4. Admin can list invoices for any order using x-admin-key", async () => {
    const res = await request(app)
      .get(`/api/orders/${singleVendorOrderId}/invoices`)
      .set("x-admin-key", adminKey);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.documents.length).toBeGreaterThanOrEqual(1);
  });

  it("5. Seller sees only their own suborder invoice for multi-vendor checkout", async () => {
    const res = await request(app)
      .get(`/api/orders/${multiVendorOrderId}/invoices`)
      .set("Authorization", `Bearer ${seller1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Seller 1 only sees their suborder tax invoice, not Master Order Summary and not Seller 2's invoice
    for (const doc of res.body.documents) {
      expect(doc.sellerId).toBe(seller1Id);
      expect(doc.documentType).toBe("tax_invoice");
    }
  });

  it("6. Unauthorized customer receives 403 Forbidden and CANNOT see another customer's invoices", async () => {
    const res = await request(app)
      .get(`/api/orders/${singleVendorOrderId}/invoices`)
      .set("Authorization", `Bearer ${otherCustomerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(res.body.error).toContain("Forbidden");
  });

  it("7. Unauthenticated request without token receives 401 Unauthorized", async () => {
    const res = await request(app)
      .get(`/api/orders/${singleVendorOrderId}/invoices`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("8. An order without pre-existing invoices dynamically generates baseline invoices", async () => {
    const res = await request(app)
      .get(`/api/orders/${ungeneratedOrderId}/invoices`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.documents.length).toBeGreaterThanOrEqual(1);
    expect(res.body.documents[0].grandTotal).toBe(1800);
  });

  it("9. Single invoice HTML preview works cleanly", async () => {
    const res = await request(app)
      .get(`/api/orders/${singleVendorOrderId}/invoice?format=html`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.text).toContain("TAX INVOICE");
    expect(res.text).toContain("BILL OF SUPPLY");
    expect(res.text).toContain("Pooja Sharma");
  });

  it("10. Single invoice JSON metadata works cleanly", async () => {
    const res = await request(app)
      .get(`/api/orders/${singleVendorOrderId}/invoice?format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.template).toBe("vastraa-v2");
    expect(res.body.invoice).toBeDefined();
    expect(res.body.snapshot.financials.grandTotal).toBe(2500);
  });
});
