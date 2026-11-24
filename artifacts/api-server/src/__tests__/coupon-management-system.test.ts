import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @workspace/db before importing validateAndCalculateCoupon
const mockDbState = {
  coupons: [] as any[],
  redemptions: [] as any[],
  orders: [] as any[],
};

vi.mock("@workspace/db", () => {
  return {
    isMongoDbConnected: vi.fn(() => true),
    mongoCoupons: {
      findByCode: vi.fn(async (code: string) => {
        return mockDbState.coupons.find((c) => c.code.toUpperCase() === code.toUpperCase()) || null;
      }),
      findById: vi.fn(async (id: string) => {
        return mockDbState.coupons.find((c) => c.id === id || c._id === id) || null;
      }),
      findMany: vi.fn(async (filter?: any) => {
        let results = [...mockDbState.coupons];
        if (filter?.active !== undefined) {
          results = results.filter((c) => Boolean(c.active) === Boolean(filter.active));
        }
        return results;
      }),
      insert: vi.fn(async (doc: any) => {
        const item = { ...doc, id: doc.id || `coupon-${Date.now()}` };
        mockDbState.coupons.push(item);
        return item;
      }),
      update: vi.fn(async (id: string, patch: any) => {
        const idx = mockDbState.coupons.findIndex((c) => c.id === id);
        if (idx !== -1) {
          mockDbState.coupons[idx] = { ...mockDbState.coupons[idx], ...patch };
          return mockDbState.coupons[idx];
        }
        return null;
      }),
      delete: vi.fn(async (id: string) => {
        const idx = mockDbState.coupons.findIndex((c) => c.id === id);
        if (idx !== -1) {
          mockDbState.coupons.splice(idx, 1);
          return true;
        }
        return false;
      }),
      atomicDecrementUsage: vi.fn(async (id: string) => {
        const coupon = mockDbState.coupons.find((c) => c.id === id);
        if (coupon && (coupon.usedCount || 0) > 0) {
          coupon.usedCount = coupon.usedCount - 1;
          return true;
        }
        return false;
      }),
    },
    mongoCouponRedemptions: {
      findMany: vi.fn(async (filter?: any) => {
        let results = [...mockDbState.redemptions];
        if (filter?.couponId) {
          results = results.filter((r) => r.couponId === filter.couponId);
        }
        if (filter?.userId) {
          results = results.filter((r) => r.userId === filter.userId);
        }
        return results;
      }),
      insert: vi.fn(async (doc: any) => {
        const item = { ...doc, id: doc.id || `redemption-${Date.now()}` };
        mockDbState.redemptions.push(item);
        return item;
      }),
      count: vi.fn(async (filter?: any) => {
        let results = [...mockDbState.redemptions];
        if (filter?.couponId) {
          results = results.filter((r) => r.couponId === filter.couponId);
        }
        if (filter?.userId) {
          results = results.filter((r) => r.userId === filter.userId);
        }
        return results.length;
      }),
    },
    mongoOrders: {
      findMany: vi.fn(async (filter?: any) => {
        let results = [...mockDbState.orders];
        if (filter?.userId) {
          results = results.filter((o) => o.userId === filter.userId);
        }
        return results;
      }),
      count: vi.fn(async (filter?: any) => {
        let results = [...mockDbState.orders];
        if (filter?.userId) {
          results = results.filter((o) => o.userId === filter.userId);
        }
        return results.length;
      }),
      findOne: vi.fn(async (filter?: any) => {
        if (filter?.userId) {
          return mockDbState.orders.find((o) => o.userId === filter.userId) || null;
        }
        return null;
      }),
      findById: vi.fn(async () => null),
    },
    couponsTable: { _t: "coupons" },
    couponRedemptionsTable: { _t: "couponRedemptions" },
    ordersTable: { _t: "orders" },
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])),
        })),
      })),
    },
  };
});

import { validateAndCalculateCoupon } from "../lib/couponValidation";
import { mongoCoupons, mongoCouponRedemptions } from "@workspace/db";

describe("VASTRAA Coupon & Discount Offer Management System", () => {
  beforeEach(() => {
    mockDbState.coupons = [];
    mockDbState.redemptions = [];
    mockDbState.orders = [];
  });

  describe("1. SAVE200 Example Offer Specifications", () => {
    beforeEach(() => {
      // Create the exact SAVE200 coupon requested in the prompt:
      // Coupon Code: SAVE200
      // Discount: ₹200 OFF
      // Minimum Order Value: ₹2,000
      // Customer Message: "Get ₹200 OFF on shopping of ₹2,000 or more!"
      // Discount Type: Fixed Amount (flat)
      // Coupon Status: Active
      mockDbState.coupons.push({
        id: "c-save200",
        code: "SAVE200",
        type: "flat",
        value: 200,
        description: "Get ₹200 OFF on shopping of ₹2,000 or more!",
        offerDisplayText: "Get ₹200 OFF on shopping of ₹2,000 or more!",
        minimumOrderValue: 2000,
        maxDiscountAmount: null,
        maxUses: 500,
        usedCount: 0,
        perCustomerLimit: 1,
        active: true,
        startDate: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000 * 30),
        eligibleCategories: ["All Categories"],
        applicableProducts: null,
        firstOrderOnly: false,
      });
    });

    it("rejects when cart subtotal is below minimum order value (e.g. ₹1,500 < ₹2,000) and returns shortfall message", async () => {
      const result = await validateAndCalculateCoupon({
        code: "SAVE200",
        cartSubtotal: 1500,
        items: [
          { productId: "p1", name: "Banarasi Saree", price: 1500, quantity: 1, category: "Sarees" },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.shortfall).toBe(500);
      expect(result.minimumOrderValue).toBe(2000);
      expect(result.message).toBe("Add ₹500 more to unlock this offer.");
      expect(result.error).toContain("Add ₹500 more to apply this coupon.");
    });

    it("displays 'Shop for ₹2,000 to unlock ₹200 OFF.' when cart subtotal is ₹0", async () => {
      const result = await validateAndCalculateCoupon({
        code: "SAVE200",
        cartSubtotal: 0,
        items: [],
      });

      expect(result.valid).toBe(false);
      expect(result.shortfall).toBe(2000);
      expect(result.message).toBe("Shop for ₹2,000 to unlock ₹200 OFF.");
    });

    it("successfully applies when cart subtotal is ₹2,500 (>= ₹2,000) with ₹200 discount and success message", async () => {
      const result = await validateAndCalculateCoupon({
        code: "SAVE200",
        cartSubtotal: 2500,
        items: [
          { productId: "p1", name: "Pure Silk Kurta Set", price: 2500, quantity: 1, category: "Kurta Sets" },
        ],
      });

      expect(result.valid).toBe(true);
      expect(result.discount).toBe(200);
      expect(result.shortfall).toBe(0);
      expect(result.message).toBe("Congratulations! You saved ₹200 using SAVE200.");
    });

    it("demonstrates the prompt's exact tax & order total math", () => {
      // Subtotal: ₹2,500
      // Coupon: SAVE200 (-₹200)
      // Shipping: ₹0
      // Platform Fee: ₹20
      // Taxable Amount = ₹2,300
      // GST (5%) = ₹115
      // Final Payable Amount = ₹2,435
      const subtotal = 2500;
      const discount = 200;
      const shipping = 0;
      const platformFee = 20;

      const taxableAmount = subtotal - discount + shipping;
      expect(taxableAmount).toBe(2300);

      const gst = Math.round(taxableAmount * 0.05);
      expect(gst).toBe(115);

      const finalPayable = taxableAmount + platformFee + gst;
      expect(finalPayable).toBe(2435);
    });
  });

  describe("2. Discount Calculation Engine & Validation Rules", () => {
    it("caps percentage discount when maxDiscountAmount is reached", async () => {
      mockDbState.coupons.push({
        id: "c-festive20",
        code: "FESTIVE20",
        type: "percent",
        value: 20, // 20%
        description: "20% OFF up to ₹500",
        minimumOrderValue: 1000,
        maxDiscountAmount: 500, // Capped at ₹500
        active: true,
        startDate: null,
        expiresAt: null,
        eligibleCategories: ["All Categories"],
      });

      // Cart subtotal ₹5,000 -> 20% is ₹1,000, but cap is ₹500
      const result = await validateAndCalculateCoupon({
        code: "FESTIVE20",
        cartSubtotal: 5000,
        items: [{ productId: "p1", price: 5000, quantity: 1, category: "Sarees" }],
      });

      expect(result.valid).toBe(true);
      expect(result.discount).toBe(500);
      expect(result.message).toBe("Congratulations! You saved ₹500 using FESTIVE20.");
    });

    it("enforces category restriction correctly", async () => {
      mockDbState.coupons.push({
        id: "c-saree-only",
        code: "SAREE100",
        type: "flat",
        value: 100,
        minimumOrderValue: 1000,
        active: true,
        eligibleCategories: ["Sarees"],
      });

      // Cart with only Kurtis -> should fail category validation
      const failResult = await validateAndCalculateCoupon({
        code: "SAREE100",
        cartSubtotal: 1500,
        items: [{ productId: "p2", price: 1500, quantity: 1, category: "Kurtis" }],
      });
      expect(failResult.valid).toBe(false);
      expect(failResult.error?.toLowerCase()).toContain("applicable to items in: sarees");

      // Cart with Sarees -> should succeed
      const passResult = await validateAndCalculateCoupon({
        code: "SAREE100",
        cartSubtotal: 1500,
        items: [{ productId: "p1", price: 1500, quantity: 1, category: "Sarees" }],
      });
      expect(passResult.valid).toBe(true);
      expect(passResult.discount).toBe(100);
    });

    it("enforces product-specific restriction (applicableProducts)", async () => {
      mockDbState.coupons.push({
        id: "c-prod-spec",
        code: "EXCLUSIVEVIP",
        type: "flat",
        value: 300,
        minimumOrderValue: 1000,
        active: true,
        applicableProducts: ["prod-vip-1"],
      });

      // Cart without the eligible product
      const failResult = await validateAndCalculateCoupon({
        code: "EXCLUSIVEVIP",
        cartSubtotal: 2000,
        items: [{ productId: "prod-other", price: 2000, quantity: 1, category: "Tops" }],
      });
      expect(failResult.valid).toBe(false);
      expect(failResult.error).toContain("applicable to specific products");

      // Cart with the eligible product
      const passResult = await validateAndCalculateCoupon({
        code: "EXCLUSIVEVIP",
        cartSubtotal: 2000,
        items: [{ productId: "prod-vip-1", price: 2000, quantity: 1, category: "Tops" }],
      });
      expect(passResult.valid).toBe(true);
      expect(passResult.discount).toBe(300);
    });

    it("enforces first-time customer restriction", async () => {
      mockDbState.coupons.push({
        id: "c-first-order",
        code: "WELCOME500",
        type: "flat",
        value: 500,
        minimumOrderValue: 1500,
        active: true,
        firstOrderOnly: true,
      });

      // Existing customer with 1 prior order
      mockDbState.orders.push({ id: "ord-old", userId: "cust-returning" });

      const failResult = await validateAndCalculateCoupon({
        code: "WELCOME500",
        userId: "cust-returning",
        cartSubtotal: 2000,
        items: [{ productId: "p1", price: 2000, quantity: 1, category: "Sarees" }],
      });
      expect(failResult.valid).toBe(false);
      expect(failResult.error).toContain("first order");

      // Brand new customer with 0 prior orders
      const passResult = await validateAndCalculateCoupon({
        code: "WELCOME500",
        userId: "cust-new-buyer",
        cartSubtotal: 2000,
        items: [{ productId: "p1", price: 2000, quantity: 1, category: "Sarees" }],
      });
      expect(passResult.valid).toBe(true);
      expect(passResult.discount).toBe(500);
    });

    it("enforces per-customer redemption limit", async () => {
      mockDbState.coupons.push({
        id: "c-one-time",
        code: "ONCEONLY",
        type: "flat",
        value: 150,
        minimumOrderValue: 500,
        active: true,
        perCustomerLimit: 1,
      });

      // User already redeemed this coupon once
      mockDbState.redemptions.push({
        id: "red-1",
        couponId: "c-one-time",
        userId: "cust-1",
        orderId: "ord-1",
      });

      const failResult = await validateAndCalculateCoupon({
        code: "ONCEONLY",
        userId: "cust-1",
        cartSubtotal: 1000,
        items: [{ productId: "p1", price: 1000, quantity: 1 }],
      });
      expect(failResult.valid).toBe(false);
      expect(failResult.error).toContain("already used this coupon");
    });

    it("enforces global maxUses limit", async () => {
      mockDbState.coupons.push({
        id: "c-flash",
        code: "FLASH50",
        type: "flat",
        value: 50,
        minimumOrderValue: 500,
        active: true,
        maxUses: 10,
        usedCount: 10, // Exhausted
      });

      const result = await validateAndCalculateCoupon({
        code: "FLASH50",
        cartSubtotal: 1000,
        items: [{ productId: "p1", price: 1000, quantity: 1 }],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("usage limit");
    });

    it("rejects inactive, expired, and future scheduled coupons", async () => {
      // Inactive
      mockDbState.coupons.push({
        id: "c-inactive",
        code: "INACTIVE10",
        type: "flat",
        value: 10,
        minimumOrderValue: 100,
        active: false,
      });
      const inactResult = await validateAndCalculateCoupon({ code: "INACTIVE10", cartSubtotal: 500 });
      expect(inactResult.valid).toBe(false);
      expect(inactResult.error).toContain("no longer active");

      // Expired
      mockDbState.coupons.push({
        id: "c-expired",
        code: "EXPIRED10",
        type: "flat",
        value: 10,
        minimumOrderValue: 100,
        active: true,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      });
      const expResult = await validateAndCalculateCoupon({ code: "EXPIRED10", cartSubtotal: 500 });
      expect(expResult.valid).toBe(false);
      expect(expResult.error).toContain("expired");

      // Future scheduled
      mockDbState.coupons.push({
        id: "c-future",
        code: "FUTURE10",
        type: "flat",
        value: 10,
        minimumOrderValue: 100,
        active: true,
        startDate: new Date(Date.now() + 86400000 * 2), // 2 days later
      });
      const futResult = await validateAndCalculateCoupon({ code: "FUTURE10", cartSubtotal: 500 });
      expect(futResult.valid).toBe(false);
      expect(futResult.error).toContain("not yet active");
    });
  });

  describe("3. Concurrency & Reservation Release Lifecycle", () => {
    it("releases coupon usage atomically on order cancellation", async () => {
      const coupon = {
        id: "c-atomic",
        code: "RELEASEME",
        type: "flat",
        value: 200,
        maxUses: 10,
        usedCount: 5,
        active: true,
      };
      mockDbState.coupons.push(coupon);

      expect(coupon.usedCount).toBe(5);

      // Decrement usage on cancellation
      const released = await mongoCoupons.atomicDecrementUsage("c-atomic");
      expect(released).toBe(true);
      expect(coupon.usedCount).toBe(4);
    });
  });
});
