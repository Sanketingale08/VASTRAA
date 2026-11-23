import React from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export function CustomerGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#F4F5F7]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#0A1F44] animate-spin" />
          <p className="text-xs font-bold uppercase tracking-widest text-[#0A1F44]">
            Authenticating...
          </p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    const redirectUrl =
      location && location !== "/" && location !== "/sign-in" && location !== "/login" && location !== "/signup" && location !== "/sign-up"
        ? `/sign-in?redirect=${encodeURIComponent(location)}`
        : "/sign-in";
    return <Redirect to={redirectUrl} />;
  }

  return <>{children}</>;
}
