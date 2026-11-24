import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ShowcaseProductCard, type ShowcaseProduct } from "./ShowcaseProductCard";
import type { ProductSummary } from "@workspace/api-client-react";

interface DualProductShowcaseProps {
  onQuickView?: (product: ProductSummary) => void;
}

function ProductSkeletonGroup() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-white rounded-[10px] sm:rounded-xl border border-[#E5DED2] p-2 flex flex-col gap-2 animate-pulse w-full box-border"
        >
          <div className="w-full aspect-[4/5] bg-slate-100 rounded-lg shrink-0" />
          <div className="h-3 bg-slate-100 rounded-sm w-3/4 mt-1" />
          <div className="h-3.5 bg-slate-100 rounded-sm w-1/2" />
          <div className="h-2.5 bg-slate-100 rounded-sm w-1/3 mt-auto" />
        </div>
      ))}
    </div>
  );
}

export function DualProductShowcase({ onQuickView }: DualProductShowcaseProps) {
  const [newArrivals, setNewArrivals] = useState<ShowcaseProduct[]>([]);
  const [bestsellers, setBestsellers] = useState<ShowcaseProduct[]>([]);
  const [loadingNew, setLoadingNew] = useState(true);
  const [loadingBest, setLoadingBest] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Fetch New Arrivals (limit 4, sorted newest first)
    apiFetch("/api/products?limit=4&sort=newest")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: any) => {
        if (!isMounted) return;
        if (data && Array.isArray(data.products)) {
          setNewArrivals(data.products.slice(0, 4));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingNew(false);
      });

    // Fetch Bestselling Products (limit 4)
    apiFetch("/api/products/bestsellers?limit=4")
      .then((res) => {
        if (res.ok) return res.json();
        // Fallback to /api/products?limit=4&sort=popular if needed
        return apiFetch("/api/products?limit=4&sort=popular").then((r) =>
          r.ok ? r.json() : null
        );
      })
      .then((data: any) => {
        if (!isMounted) return;
        if (data && Array.isArray(data.products)) {
          setBestsellers(data.products.slice(0, 4));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingBest(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section
      aria-label="New Arrivals & Bestselling Products"
      className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12 box-border"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-start">
        {/* ── LEFT SECTION: NEW ARRIVALS ── */}
        <div className="flex flex-col w-full min-w-0">
          {/* Section Header: Fixed height for identical baseline alignment */}
          <div className="flex items-center justify-between pb-3.5 border-b border-[#E5DED2]/80 mb-5 h-10">
            <h2 className="font-serif text-xl sm:text-[22px] font-bold text-[#071B3B] tracking-tight leading-none">
              New Arrivals
            </h2>
            <Link
              href="/new-arrivals"
              className="group inline-flex items-center gap-1 text-xs sm:text-[13px] font-semibold text-[#071B3B] hover:text-[#D9A441] transition-colors leading-none"
            >
              <span>View All</span>
              <ArrowRight
                size={14}
                className="group-hover:translate-x-1 transition-transform"
              />
            </Link>
          </div>

          {/* Product Grid: 4 equal-width columns on sm+, 2 on mobile */}
          <div className="w-full">
            {loadingNew ? (
              <ProductSkeletonGroup />
            ) : newArrivals.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full auto-rows-fr">
                {newArrivals.map((product) => (
                  <ShowcaseProductCard
                    key={product.id}
                    product={product}
                    onQuickView={onQuickView}
                  />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-white/60 rounded-xl border border-dashed border-[#E5DED2] text-sm text-slate-500">
                New collections are coming soon.
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT SECTION: BESTSELLING PRODUCTS ── */}
        <div className="flex flex-col w-full min-w-0">
          {/* Section Header: Fixed height matching New Arrivals exactly */}
          <div className="flex items-center justify-between pb-3.5 border-b border-[#E5DED2]/80 mb-5 h-10">
            <h2 className="font-serif text-xl sm:text-[22px] font-bold text-[#071B3B] tracking-tight leading-none">
              Bestselling Products
            </h2>
            <Link
              href="/products?sort=popular"
              className="group inline-flex items-center gap-1 text-xs sm:text-[13px] font-semibold text-[#071B3B] hover:text-[#D9A441] transition-colors leading-none"
            >
              <span>View All</span>
              <ArrowRight
                size={14}
                className="group-hover:translate-x-1 transition-transform"
              />
            </Link>
          </div>

          {/* Product Grid: 4 equal-width columns on sm+, 2 on mobile */}
          <div className="w-full">
            {loadingBest ? (
              <ProductSkeletonGroup />
            ) : bestsellers.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full auto-rows-fr">
                {bestsellers.map((product) => (
                  <ShowcaseProductCard
                    key={product.id}
                    product={product}
                    onQuickView={onQuickView}
                  />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-white/60 rounded-xl border border-dashed border-[#E5DED2] text-sm text-slate-500">
                New bestselling items will appear here soon.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
