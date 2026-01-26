"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { MapPin, BedDouble, Bath, Square, Heart, Trash2 } from "lucide-react";
import { getImageUrl } from "@/lib/imageUrl";

type Listing = {
  id: string;
  title: string;
  description?: string;
  city?: string;
  district?: string;
  type?: string;
  purpose?: string;
  price?: number;
  land_area?: number;
  building_area?: number;
  bedrooms?: number;
  bathrooms?: number;
  image_url?: string;
  images?: string[]; // إضافة images array
};

export default function FavoritesPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFavorites();
  }, []);

  async function fetchFavorites() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/favorites", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        return;
      }

      const data = await res.json();
      setFavorites(data.favorites || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function removeFavorite(listingId: string) {
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/favorites/${listingId}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setFavorites(favorites.filter((f) => f.id !== listingId));
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] to-[#fdf6db] flex items-center justify-center">
        <div className="text-white text-lg">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] via-[#123a64] to-[#fdf6db] py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-400 fill-current" />
            مفضلتي
          </h1>
          <Link href="/search" className="text-white/80 hover:text-white text-sm">
            تصفح العقارات →
          </Link>
        </div>

        {favorites.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <Heart className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-4">لم تقم بإضافة أي عقار إلى المفضلة بعد</p>
            <Link
              href="/search"
              className="inline-block bg-[#002845] text-white font-bold px-6 py-2 rounded-full hover:bg-[#01375e]"
            >
              تصفح العقارات
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {favorites.map((listing) => (
              <div
                key={listing.id}
                className="bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-100 group"
              >
                <div className="relative h-48">
                  <Image
                    src={getImageUrl(listing.image_url) || `/images/property${(parseInt(listing.id.slice(-2), 16) % 10) + 1}.jpg`}
                    alt={listing.title}
                    fill
                    className="object-cover"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.src = "/images/property1.jpg";
                    }}
                  />
                  <button
                    onClick={() => removeFavorite(listing.id)}
                    className="absolute top-3 left-3 bg-white/90 p-2 rounded-full shadow hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                  {listing.type && (
                    <span className="absolute top-3 right-3 bg-[#002845]/80 text-white text-xs px-3 py-1 rounded-full">
                      {listing.type}
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  <h3 className="font-bold text-[#002845] line-clamp-1">{listing.title}</h3>

                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {listing.city}{listing.district ? ` - ${listing.district}` : ""}
                  </p>

                  <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    {listing.land_area && (
                      <span className="flex items-center gap-1">
                        <Square className="w-3 h-3" />
                        {listing.land_area} م²
                      </span>
                    )}
                    {listing.bedrooms && (
                      <span className="flex items-center gap-1">
                        <BedDouble className="w-3 h-3" />
                        {listing.bedrooms} غرف
                      </span>
                    )}
                    {listing.bathrooms && (
                      <span className="flex items-center gap-1">
                        <Bath className="w-3 h-3" />
                        {listing.bathrooms}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="font-extrabold text-[#002845]">
                      {listing.price?.toLocaleString()} ريال
                    </span>
                    <Link
                      href={`/listing/${listing.id}`}
                      className="text-xs text-[#002845] font-bold hover:underline"
                    >
                      عرض التفاصيل
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
