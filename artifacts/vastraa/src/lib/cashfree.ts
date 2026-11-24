/**
 * Dynamically loads the Cashfree Drop-in SDK v3 only when needed (e.g., checkout/payment modals).
 * Prevents Cashfree's heavy script from blocking Home page LCP, FCP, or TBT.
 */
let cashfreeLoadPromise: Promise<any> | null = null;

export function loadCashfreeSdk(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cashfree SDK cannot be loaded on the server."));
  }

  if ((window as any).Cashfree) {
    return Promise.resolve((window as any).Cashfree);
  }

  if (cashfreeLoadPromise) {
    return cashfreeLoadPromise;
  }

  cashfreeLoadPromise = new Promise((resolve, reject) => {
    // Check if script tag already exists
    const existing = document.querySelector('script[src*="cashfree.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).Cashfree));
      existing.addEventListener("error", (e) => reject(new Error("Failed to load Cashfree SDK script")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      resolve((window as any).Cashfree);
    };
    script.onerror = () => {
      cashfreeLoadPromise = null;
      reject(new Error("Failed to load Cashfree payment gateway SDK. Please check your internet connection."));
    };
    document.head.appendChild(script);
  });

  return cashfreeLoadPromise;
}

