import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignInPage from "./SignIn";
import SignUpPage from "./SignUp";
import SellerLoginPage from "./seller/SellerLogin";
import AdminLoginPage from "./AdminLogin";
import { Navbar } from "@/components/Navbar";

// Track setLocation calls
const mockSetLocation = vi.fn();
let mockCurrentLocation = "/";

vi.mock("wouter", () => ({
  useLocation: () => [mockCurrentLocation, mockSetLocation],
  Link: ({ children, href, className, onClick }: any) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
  Redirect: ({ to }: { to: string }) => {
    mockSetLocation(to);
    return null;
  },
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null, isSignedIn: false }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

// Mock Wishlist & Cart context for Navbar
vi.mock("@/context/WishlistContext", () => ({
  useWishlist: () => ({ items: [], wishlistCount: 0 }),
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ items: [], cartCount: 0 }),
}));

// Mock TanStack React Query for Navbar search
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null, isLoading: false }),
}));

// AuthContext mock state
let mockAuthUser: any = null;
let mockIsSignedIn = false;
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn().mockImplementation(async () => {
  mockAuthUser = null;
  mockIsSignedIn = false;
});
const mockRefreshUser = vi.fn();

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: mockAuthUser,
    isSignedIn: mockIsSignedIn,
    isLoading: false,
    isLoaded: true,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signOut: mockSignOut,
    refreshUser: mockRefreshUser,
  }),
}));

// Mock apiFetch
const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

describe("VASTRAA – Customer Login & Signup Redirection Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mockAuthUser = null;
    mockIsSignedIn = false;
    mockCurrentLocation = "/";
    delete (window as any).location;
    (window as any).location = { search: "", pathname: "/" };
  });

  // Scenario 1: Existing customer login → Homepage ('/')
  it("1. Existing customer login successfully redirects to Homepage ('/')", async () => {
    mockCurrentLocation = "/sign-in";
    window.location.search = "";

    mockSignIn.mockResolvedValueOnce({
      success: true,
      user: {
        id: "cust_101",
        name: "Meera Patel",
        email: "meera@example.com",
        role: "customer",
      },
    });

    render(<SignInPage />);

    // Fill in credentials
    const emailInput = screen.getByPlaceholderText(/name@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/enter your password/i);
    const submitBtn = screen.getByRole("button", { name: /^sign in$/i });

    fireEvent.change(emailInput, { target: { value: "meera@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "SecurePass123!" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("meera@example.com", "SecurePass123!");
      // Must redirect to Homepage ('/'), NOT dashboard or account overview!
      expect(mockSetLocation).toHaveBeenCalledWith("/");
    });
  });

  // Scenario 2: New customer signup → Homepage ('/')
  it("2. New customer signup with verification/authentication redirects to Homepage ('/')", async () => {
    mockCurrentLocation = "/sign-up";
    window.location.search = "";

    mockSignUp.mockResolvedValueOnce({
      success: true,
      requiresVerification: false,
      user: {
        id: "cust_102",
        name: "Ananya Iyer",
        email: "ananya@example.com",
        role: "customer",
      },
    });

    render(<SignUpPage />);

    fireEvent.change(screen.getByPlaceholderText(/enter your full name/i), {
      target: { value: "Ananya Iyer" },
    });
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "ananya@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/^create a password/i), {
      target: { value: "SecurePass123!" },
    });
    fireEvent.change(screen.getByPlaceholderText(/re-enter password/i), {
      target: { value: "SecurePass123!" },
    });

    const createBtn = screen.getByRole("button", { name: /^create account$/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        "Ananya Iyer",
        "ananya@example.com",
        "SecurePass123!",
        "SecurePass123!"
      );
      // Must redirect to Homepage ('/')
      expect(mockSetLocation).toHaveBeenCalledWith("/");
    });
  });

  // Scenario 3: Customer profile icon displays correctly after login
  it("3. Customer profile icon and initials display correctly on Homepage after login", () => {
    mockAuthUser = {
      id: "cust_101",
      name: "Meera Patel",
      firstName: "Meera",
      lastName: "Patel",
      email: "meera@example.com",
      role: "customer",
    };
    mockIsSignedIn = true;

    render(<Navbar />);

    // Should display the user account button with initials "MP"
    const userAccountBtn = screen.getByRole("button", { name: /user account/i });
    expect(userAccountBtn).toBeInTheDocument();
    expect(userAccountBtn).toHaveTextContent("MP");

    // The unauthenticated "Sign In / User Login" link should NOT be shown
    expect(screen.queryByTitle(/sign in \/ user login/i)).not.toBeInTheDocument();
  });

  // Scenario 4: Customer session persists after refreshing homepage
  it("4. Authenticated customer visiting /sign-in or /login is immediately redirected to Homepage ('/')", async () => {
    mockAuthUser = {
      id: "cust_101",
      name: "Meera Patel",
      email: "meera@example.com",
      role: "customer",
    };
    mockIsSignedIn = true;
    mockCurrentLocation = "/login";
    window.location.search = "";

    render(<SignInPage />);

    await waitFor(() => {
      // Authenticated customer must immediately bounce to Homepage ('/')
      expect(mockSetLocation).toHaveBeenCalledWith("/");
    });
  });

  // Scenario 5: Seller login → Seller Dashboard
  it("5. Seller login redirects to Seller Dashboard ('/seller/dashboard')", async () => {
    mockCurrentLocation = "/seller/login";

    // Mock global fetch for seller login API
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        token: "jwt_seller_token_456",
        user: {
          id: "seller_201",
          email: "artisan@heritage.com",
          role: "seller",
        },
      }),
    });
    global.fetch = mockFetch;

    render(<SellerLoginPage />);

    const idInput = screen.getByPlaceholderText(/enter registered email or seller id/i);
    const pwdInput = screen.getByPlaceholderText(/enter your password/i);
    const loginBtn = screen.getByRole("button", { name: /sign in to portal/i });

    fireEvent.change(idInput, { target: { value: "artisan@heritage.com" } });
    fireEvent.change(pwdInput, { target: { value: "SellerPass123!" } });
    fireEvent.click(loginBtn);

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/seller/dashboard");
    });
  });

  // Scenario 6: Admin login → Admin Dashboard
  it("6. Admin login redirects to Admin Dashboard ('/admin/dashboard')", async () => {
    mockCurrentLocation = "/admin/login";

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: "Key verified" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enabled: false }),
      });
    global.fetch = mockFetch;

    render(<AdminLoginPage />);

    const keyInput = screen.getByPlaceholderText(/enter master admin key/i);
    const submitBtn = screen.getByRole("button", { name: /access dashboard/i });

    fireEvent.change(keyInput, { target: { value: "VastraaAdminKey2026!" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/admin/dashboard");
    });
  });

  // Scenario 7: Customer logout → Homepage with unauthenticated state
  it("7. Customer logout navigates to Homepage ('/') with unauthenticated state", async () => {
    mockAuthUser = {
      id: "cust_101",
      name: "Meera Patel",
      firstName: "Meera",
      lastName: "Patel",
      email: "meera@example.com",
      role: "customer",
    };
    mockIsSignedIn = true;

    render(<Navbar />);

    // Open User Menu
    const userAccountBtn = screen.getByRole("button", { name: /user account/i });
    fireEvent.click(userAccountBtn);

    // Click Sign Out
    const signOutBtn = screen.getByRole("button", { name: /sign out/i });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockSetLocation).toHaveBeenCalledWith("/");
    });
  });

  // Scenario 8: Preserves explicit return URL (e.g. ?redirect=/checkout)
  it("8. Preserves explicit return URL for checkout when explicitly requested", async () => {
    mockCurrentLocation = "/sign-in";
    window.location.search = "?redirect=/checkout";

    mockSignIn.mockResolvedValueOnce({
      success: true,
      user: {
        id: "cust_101",
        name: "Meera Patel",
        email: "meera@example.com",
        role: "customer",
      },
    });

    render(<SignInPage />);

    const emailInput = screen.getByPlaceholderText(/name@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/enter your password/i);
    const submitBtn = screen.getByRole("button", { name: /^sign in$/i });

    fireEvent.change(emailInput, { target: { value: "meera@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "SecurePass123!" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/checkout");
    });
  });
});
