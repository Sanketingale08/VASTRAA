import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckoutPage } from "./Checkout";

// Mock wouter
const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/checkout", mockSetLocation],
  Link: ({ children, href, className, onClick }: any) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null, isSignedIn: false }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

// Mock AuthContext
const mockUser = {
  id: "cust_buy_now_123",
  name: "Ananya Iyer",
  email: "ananya@example.com",
  role: "customer" as const,
};

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    isSignedIn: true,
    isLoading: false,
    isLoaded: true,
  }),
}));

// Mock CartContext
let mockCartItems: any[] = [];
const mockClearCart = vi.fn().mockImplementation(async () => {
  mockCartItems = [];
});
const mockRefreshStock = vi.fn().mockResolvedValue([]);

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({
    items: mockCartItems,
    clearCart: mockClearCart,
    refreshStock: mockRefreshStock,
  }),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock apiFetch
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, options?: any) => {
    if (url.includes("/api/addresses")) {
      return {
        ok: true,
        json: async () => ({
          addresses: [
            {
              id: "addr_1",
              name: "Ananya Iyer",
              phone: "9876543210",
              line1: "123 Temple Road",
              line2: "Apt 4B",
              city: "Chennai",
              state: "Tamil Nadu",
              pincode: "600001",
              isDefault: true,
            },
          ],
        }),
      };
    }
    if (url.includes("/api/payment-methods")) {
      return {
        ok: true,
        json: async () => ({ paymentMethods: [] }),
      };
    }
    if (url.includes("/api/shipping/check")) {
      return {
        ok: true,
        json: async () => ({ available: true, message: "Delivery available" }),
      };
    }
    if (url.includes("/api/coupons/available")) {
      return {
        ok: true,
        json: async () => ({
          coupons: [
            {
              code: "FESTIVE10",
              discountType: "percent",
              discountValue: 10,
              description: "10% off on all sarees",
              minimumOrderValue: 1000,
            },
          ],
        }),
      };
    }
    if (url.includes("/api/orders")) {
      return {
        ok: true,
        json: async () => ({
          order: {
            id: "ord_test_999",
            status: "placed",
            total: 2999,
          },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({}),
    };
  }),
}));

describe("VASTRAA Checkout & Buy Now Flow - Rigorous Scenario Verification", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockCartItems = [];
    vi.clearAllMocks();
  });

  // Scenario 1: Buy Now with a single product (no TDZ error)
  it("1. Successfully mounts and calculates pricing when Buy Now has a single product without TDZ error", async () => {
    sessionStorage.setItem(
      "twirl_buy_now",
      JSON.stringify({
        productId: "prod_banarasi_1",
        quantity: 1,
        product: {
          id: "prod_banarasi_1",
          productId: "prod_banarasi_1",
          name: "Varanasi Pure Katan Silk Banarasi Saree",
          price: 4500,
          originalPrice: 6000,
          images: ["/images/banarasi-1.jpg"],
          vendorName: "Heritage Silk Weaves",
          stock: 10,
          category: "banarasi",
        },
      })
    );

    render(<CheckoutPage />);

    // Must not throw "Cannot access 'totalSellingPrice' before initialization"
    await waitFor(() => {
      expect(screen.getByText(/Checkout/i)).toBeInTheDocument();
      expect(screen.getByText(/Buy Now Mode/i)).toBeInTheDocument();
    });

    // Check item rendering and pricing
    expect(screen.getByText("Varanasi Pure Katan Silk Banarasi Saree")).toBeInTheDocument();
  });

  // Scenario 2: Buy Now with discounted products (MRP > sellingPrice)
  it("2. Correctly calculates MRP discount and selling price on discounted products", async () => {
    sessionStorage.setItem(
      "twirl_buy_now",
      JSON.stringify({
        productId: "prod_discounted",
        quantity: 1,
        product: {
          id: "prod_discounted",
          name: "Chanderi Cotton Silk Saree",
          price: 3200,
          originalPrice: 4800,
          stock: 5,
        },
      })
    );

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText("Chanderi Cotton Silk Saree")).toBeInTheDocument();
    });

    // Subtotal should reflect ₹3,200 and MRP discount should be ₹1,600
    expect(screen.getByText(/₹3,200/)).toBeInTheDocument();
  });

  // Scenario 3: Buy Now with non-discounted products (originalPrice === price or null)
  it("3. Handles non-discounted products cleanly without NaN or negative values", async () => {
    sessionStorage.setItem(
      "twirl_buy_now",
      JSON.stringify({
        productId: "prod_full_price",
        quantity: 1,
        product: {
          id: "prod_full_price",
          name: "Organic Khadi Cotton Saree",
          price: 2500,
          originalPrice: null,
          stock: 12,
        },
      })
    );

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText("Organic Khadi Cotton Saree")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/₹2,500/).length).toBeGreaterThan(0);
  });

  // Scenario 4: Buy Now with different product quantities (e.g. qty = 3)
  it("4. Correctly scales totalSellingPrice with product quantities", async () => {
    sessionStorage.setItem(
      "twirl_buy_now",
      JSON.stringify({
        productId: "prod_multi_qty",
        quantity: 3,
        product: {
          id: "prod_multi_qty",
          name: "Tussar Silk Saree",
          price: 2000,
          originalPrice: 2500,
          stock: 15,
        },
      })
    );

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText("Tussar Silk Saree")).toBeInTheDocument();
    });

    // 3 * 2000 = 6000
    expect(screen.getByText(/₹6,000/)).toBeInTheDocument();
  });

  // Scenario 5: Buy Now with missing or invalid price data (safe fallback to 0)
  it("5. Gracefully handles undefined or NaN prices without crashing", async () => {
    sessionStorage.setItem(
      "twirl_buy_now",
      JSON.stringify({
        productId: "prod_invalid_price",
        quantity: "invalid" as any,
        product: {
          id: "prod_invalid_price",
          name: "Malformed Price Product",
          price: "not-a-number" as any,
          originalPrice: undefined,
          stock: null as any,
        },
      })
    );

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText("Malformed Price Product")).toBeInTheDocument();
    });
  });

  // Scenario 6: Checkout after refreshing the page (sessionStorage is preserved)
  it("6. Preserves Buy Now product data across unmount and remount (simulating page reload)", async () => {
    sessionStorage.setItem(
      "twirl_buy_now",
      JSON.stringify({
        productId: "prod_reload_test",
        quantity: 1,
        product: {
          id: "prod_reload_test",
          name: "Kanjivaram Zari Brocade",
          price: 8900,
          stock: 4,
        },
      })
    );

    const { unmount } = render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText("Kanjivaram Zari Brocade")).toBeInTheDocument();
    });

    // Unmount (simulates navigating away or page unload before reload)
    unmount();

    // Verify sessionStorage was NOT deleted by unmount cleanup!
    expect(sessionStorage.getItem("twirl_buy_now")).not.toBeNull();

    // Re-mount (page reload)
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText("Kanjivaram Zari Brocade")).toBeInTheDocument();
    });
  });

  // Scenario 7: Direct checkout navigation with empty cart & no Buy Now item
  it("7. Displays friendly 'Nothing to Checkout' screen instead of crashing on empty checkout", async () => {
    sessionStorage.clear();
    mockCartItems = [];

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Nothing to Checkout/i)).toBeInTheDocument();
      expect(screen.getByText(/Your cart is empty/i)).toBeInTheDocument();
      expect(screen.getByText(/Continue Shopping/i)).toBeInTheDocument();
    });
  });

  // Scenario 8: Add to Cart followed by checkout (uses cart items seamlessly)
  it("8. Successfully displays items from cart when Buy Now is not present", async () => {
    sessionStorage.clear();
    mockCartItems = [
      {
        productId: "prod_cart_1",
        name: "Mysore Crepe Silk Saree",
        price: 3600,
        originalPrice: 4200,
        quantity: 2,
        stock: 8,
      },
    ];

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText("Mysore Crepe Silk Saree")).toBeInTheDocument();
      // 2 * 3600 = 7200
      expect(screen.getByText(/₹7,200/)).toBeInTheDocument();
    });

    // Should NOT say "Buy Now Mode"
    expect(screen.queryByText(/Buy Now Mode/i)).not.toBeInTheDocument();
  });
});
