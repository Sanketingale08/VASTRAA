import React from "react";
import { Heart, Star } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useWishlist } from "@/context/WishlistContext";
import { useUser } from "@clerk/react";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import type { ProductSummary } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface ShowcaseProduct {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  rating?: number;
  reviewCount?: number;
  reviews?: number;
  images?: string[];
  image?: string;
  category?: string;
  subcategory?: string;
}

interface ShowcaseProductCardProps {
  product: ShowcaseProduct;
  onQuickView?: (product: ProductSummary) => void;
}

export function ShowcaseProductCard({ product }: ShowcaseProductCardProps) {
  const { wishlistedIds, toggle } = useWishlist();
  const { isSignedIn } = useUser();
  const isWishlisted = wishlistedIds.has(product.id);

  const rawImage =
    (product.images && product.images.length > 0 ? product.images[0] : undefined) ??
    product.image;
  const imageUrl = getProductImageSrc(rawImage);

  const rating = Number(product.rating ?? 0);
  const reviews = Number(product.reviewCount ?? product.reviews ?? 0);

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSignedIn) {
      window.location.href = `${basePath}/sign-in`;
      return;
    }
    toggle(product.id);
  };

  const formattedReviews = reviews >= 1000 ? `${(reviews / 1000).toFixed(1)}k` : reviews;

  return (
    <Link
      href={`/products/${product.id}`}
      className="group relative flex flex-col w-full h-full min-w-0 bg-white rounded-[10px] sm:rounded-xl border border-[#E5DED2] overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 box-border"
    >
      {/* 1. Image Container: Exact fixed aspect ratio with identical positioning */}
      <div className="relative w-full aspect-[4/5] bg-[#F7F5F0] overflow-hidden shrink-0">
        <img
          src={imageUrl}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
          onError={replaceProductImageWithFallback}
        />

        {/* Floating Heart Button in identical top-right position */}
        <button
          type="button"
          onClick={handleWishlistClick}
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
          className="absolute top-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/95 backdrop-blur-xs shadow-xs flex items-center justify-center text-[#071B3B] hover:bg-white hover:scale-110 active:scale-95 transition-all z-10"
        >
          <Heart
            size={14}
            className={cn(
              "transition-colors",
              isWishlisted
                ? "fill-rose-500 text-rose-500"
                : "text-[#071B3B] stroke-[1.8]"
            )}
          />
        </button>
      </div>

      {/* 2. Product Information: Standardized typography & fixed height layout */}
      <div className="p-2 sm:p-2.5 md:p-3 flex flex-col justify-between flex-1 min-w-0">
        <div className="flex flex-col min-w-0">
          {/* Product Name: Fixed height container (2 lines max), preventing card height drift */}
          <div className="h-8 sm:h-9 flex items-start overflow-hidden">
            <h3
              title={product.name}
              className="text-[11px] sm:text-xs md:text-[13px] font-medium text-[#071B3B] leading-tight line-clamp-2 group-hover:text-[#D9A441] transition-colors"
            >
              {product.name}
            </h3>
          </div>

          {/* Pricing: Clean vertical baseline alignment */}
          <div className="flex items-baseline gap-1.5 mt-1 sm:mt-1.5 h-4 sm:h-5">
            <span className="text-xs sm:text-sm font-bold text-[#071B3B] whitespace-nowrap">
              ₹ {Math.round(product.price).toLocaleString("en-IN")}
            </span>
            {product.originalPrice && product.originalPrice > product.price ? (
              <span className="text-[10px] text-gray-400 line-through whitespace-nowrap">
                ₹ {Math.round(product.originalPrice).toLocaleString("en-IN")}
              </span>
            ) : null}
          </div>
        </div>

        {/* Star Rating & Review Count: Fixed bottom height */}
        <div className="flex items-center gap-1 mt-1 sm:mt-1.5 pt-1 text-[10px] sm:text-[11px] text-slate-600 border-t border-[#E5DED2]/40 h-5">
          <Star size={11} className="fill-amber-400 text-amber-400 shrink-0" />
          <span className="font-semibold text-slate-700">
            {rating > 0 ? rating.toFixed(1) : "4.8"}
          </span>
          <span className="text-slate-400 truncate">
            ({reviews > 0 ? formattedReviews : "1.2k"})
          </span>
        </div>
      </div>
    </Link>
  );
}
