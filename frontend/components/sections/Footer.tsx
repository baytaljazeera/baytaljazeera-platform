"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { 
  Phone, Mail, MapPin, Facebook, Twitter, Instagram, 
  Youtube, Heart, Shield, Award
} from "lucide-react";
import { useSiteSettingsStore } from "@/lib/stores/siteSettingsStore";

export function Footer() {
  const pathname = usePathname();
  const currentYear = 2026;
  const { settings: siteSettings, fetchSettings } = useSiteSettingsStore();
  
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);
  
  const hideFooterPaths = ['/admin', '/admin-login', '/request-access'];
  const shouldHideFooter = hideFooterPaths.some(path => pathname?.startsWith(path));
  
  if (shouldHideFooter) {
    return null;
  }

  
  
  return (
    <footer className="bg-gradient-to-b from-[#002845] to-[#001a30] text-white" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          <div>
            <Link href="/" className="flex items-center gap-3 mb-6">
              <Image
                src="/logo.svg"
                alt={siteSettings.siteName}
                width={48}
                height={48}
                className="rounded-lg"
              />
              <span className="text-2xl font-extrabold">{siteSettings.siteName}</span>
            </Link>
            <p className="text-slate-300 text-sm leading-relaxed mb-6">
              منصة عقارية رائدة تقدم خدمات متميزة في مجال العقارات
              بمعايير جودة عالية وتصميم يعكس الهوية العربية الأصيلة.
            </p>
            <div className="flex items-center gap-3">
              <a href="#" className="w-10 h-10 bg-white/10 hover:bg-[#D4AF37] rounded-full flex items-center justify-center transition">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 bg-white/10 hover:bg-[#D4AF37] rounded-full flex items-center justify-center transition">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 bg-white/10 hover:bg-[#D4AF37] rounded-full flex items-center justify-center transition">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 bg-white/10 hover:bg-[#D4AF37] rounded-full flex items-center justify-center transition">
                <Youtube className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <span className="w-8 h-1 bg-[#D4AF37] rounded-full" />
              {siteSettings.quickLinksTitle}
            </h3>
            <ul className="space-y-3">
              {siteSettings.quickLinks.map((link: { href: string; label: string }) => (
                <li key={link.href}>
                  <Link 
                    href={link.href} 
                    className="text-slate-300 hover:text-[#D4AF37] transition text-sm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <span className="w-8 h-1 bg-[#D4AF37] rounded-full" />
              {siteSettings.accountLinksTitle}
            </h3>
            <ul className="space-y-3">
              {siteSettings.accountLinks.map((link: { href: string; label: string }) => (
                <li key={link.href}>
                  <Link 
                    href={link.href} 
                    className="text-slate-300 hover:text-[#D4AF37] transition text-sm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <span className="w-8 h-1 bg-[#D4AF37] rounded-full" />
              تواصل معنا
            </h3>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                  <Phone className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <span dir="ltr">{siteSettings.sitePhone}</span>
              </li>
              <li className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                  <Mail className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <span>{siteSettings.siteEmail}</span>
              </li>
              <li className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <span>{siteSettings.siteAddress}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10">
          <div className="flex flex-wrap gap-2 mb-8">
            <span className="text-slate-400 text-sm">المدن:</span>
            {siteSettings.footerCities.map((city: string) => (
              <Link
                key={city}
                href={`/search?city=${encodeURIComponent(city)}`}
                className="text-sm text-slate-300 hover:text-[#D4AF37] transition"
              >
                {city}
              </Link>
            ))}
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Shield className="w-4 h-4 text-green-500" />
                <span>منصة موثوقة</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Award className="w-4 h-4 text-[#D4AF37]" />
                <span>جودة عالية</span>
              </div>
            </div>

            <p className="text-slate-400 text-sm flex items-center gap-1">
              © {currentYear} {siteSettings.siteName} أونلاين. جميع الحقوق محفوظة.
              <Heart className="w-4 h-4 text-red-500 fill-red-500 mx-1" />
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
