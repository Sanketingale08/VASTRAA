import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminProfileOtpModal, ProfileSection } from "../AdminSettings";

// Mock toast hook
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("Admin Profile OTP Verification Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AdminProfileOtpModal Component", () => {
    it("renders Email OTP input when requiresEmailOtp is true", () => {
      render(
        <AdminProfileOtpModal
          challengeId="challenge-123"
          requiresEmailOtp={true}
          requiresMobileOtp={false}
          emailTarget="a***n@vastraa.com"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByText("Verify Contact Details")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Enter 6-digit Email OTP")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Enter 6-digit Mobile OTP")).not.toBeInTheDocument();
      expect(screen.getByText("Verify OTP")).toBeInTheDocument();
    });

    it("renders Mobile OTP input when requiresMobileOtp is true", () => {
      render(
        <AdminProfileOtpModal
          challengeId="challenge-123"
          requiresEmailOtp={false}
          requiresMobileOtp={true}
          mobileTarget="+91 •••••• 43210"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByPlaceholderText("Enter 6-digit Mobile OTP")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Enter 6-digit Email OTP")).not.toBeInTheDocument();
      expect(screen.getByText("Verify OTP")).toBeInTheDocument();
    });

    it("renders both OTP fields when both email and mobile are changed", () => {
      render(
        <AdminProfileOtpModal
          challengeId="challenge-123"
          requiresEmailOtp={true}
          requiresMobileOtp={true}
          emailTarget="a***n@vastraa.com"
          mobileTarget="+91 •••••• 43210"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByPlaceholderText("Enter 6-digit Email OTP")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Enter 6-digit Mobile OTP")).toBeInTheDocument();
    });

    it("submits OTP and handles verification success", async () => {
      const onSuccessMock = vi.fn();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, success: true, message: "Profile updated successfully!" }),
      });

      render(
        <AdminProfileOtpModal
          challengeId="challenge-123"
          requiresEmailOtp={true}
          requiresMobileOtp={false}
          emailTarget="a***n@vastraa.com"
          onClose={vi.fn()}
          onSuccess={onSuccessMock}
        />
      );

      const input = screen.getByPlaceholderText("Enter 6-digit Email OTP");
      fireEvent.change(input, { target: { value: "123456" } });

      const verifyBtn = screen.getByText("Verify OTP");
      fireEvent.click(verifyBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/admin/settings/profile/verify-otp",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              challengeId: "challenge-123",
              emailOtp: "123456",
            }),
          })
        );
        expect(onSuccessMock).toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            description: "Profile updated successfully!",
          })
        );
      });
    });

    it("displays error message when OTP is invalid", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: "Incorrect Email OTP. 4 attempts remaining." }),
      });

      render(
        <AdminProfileOtpModal
          challengeId="challenge-123"
          requiresEmailOtp={true}
          requiresMobileOtp={false}
          emailTarget="a***n@vastraa.com"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      const input = screen.getByPlaceholderText("Enter 6-digit Email OTP");
      fireEvent.change(input, { target: { value: "000000" } });

      const verifyBtn = screen.getByText("Verify OTP");
      fireEvent.click(verifyBtn);

      await waitFor(() => {
        expect(screen.getByText("Incorrect Email OTP. 4 attempts remaining.")).toBeInTheDocument();
      });
    });
  });

  describe("ProfileSection Integration", () => {
    it("renders profile details and allows entering edit mode", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "Super Admin",
          email: "admin@vastraa.com",
          mobile: "+91 98765 43210",
        }),
      });

      renderWithClient(<ProfileSection />);

      await waitFor(() => {
        expect(screen.getByText("Super Admin")).toBeInTheDocument();
        expect(screen.getByText("admin@vastraa.com")).toBeInTheDocument();
      });

      const editBtn = screen.getByText("Edit Profile");
      fireEvent.click(editBtn);

      expect(screen.getByDisplayValue("Super Admin")).toBeInTheDocument();
      expect(screen.getByDisplayValue("admin@vastraa.com")).toBeInTheDocument();
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
    });

    it("triggers OTP modal when new email is submitted", async () => {
      // 1. Initial GET profile
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "Super Admin",
          email: "admin@vastraa.com",
          mobile: "+91 98765 43210",
        }),
      });

      renderWithClient(<ProfileSection />);

      await waitFor(() => {
        expect(screen.getByText("Edit Profile")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Edit Profile"));

      const emailInput = screen.getByDisplayValue("admin@vastraa.com");
      fireEvent.change(emailInput, { target: { value: "newemail@vastraa.com" } });

      // 2. Mock request-verification response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          requiresVerification: true,
          challengeId: "challenge-email-999",
          requiresEmailOtp: true,
          requiresMobileOtp: false,
          emailTarget: "n***l@vastraa.com",
          resendCooldownSeconds: 60,
        }),
      });

      fireEvent.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(screen.getByText("Verify Contact Details")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Enter 6-digit Email OTP")).toBeInTheDocument();
      });
    });
  });
});

