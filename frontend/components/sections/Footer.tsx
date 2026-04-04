"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { 
  Mail, MapPin, Facebook, Twitter, Instagram, 
  Youtube, Heart, Shield, Award
} from "lucide-react";
import { useSiteSettingsStore } from "@/lib/stores/siteSettingsStore";

/** Shared interactive style for WhatsApp + email in footer contact block */
const footerContactLinkClass =
  "text-slate-300 transition-colors duration-150 underline-offset-4 hover:underline decoration-transparent hover:decoration-current";

/** Official-style WhatsApp mark (green) for contact row */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <path
        fill="#25D366"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.883 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
      />
    </svg>
  );
}

export function Footer() {
  const pathname = usePathname();
  const currentYear = 2026;
  const { settings: siteSettings, fetchSettings } = useSiteSettingsStore();
  
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);
  
  const hideFooterPaths = ['/admin', '/admin-login', '/request-access', '/add-listing/admin'];
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
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#25D366]/15 shrink-0">
                  <WhatsAppIcon className="w-6 h-6" />
                </div>
                <a
                  href="https://wa.me/12345401444"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${footerContactLinkClass} hover:text-[#25D366]`}
                  dir="ltr"
                >
                  {siteSettings.sitePhone || "+1(234) 540-1444"}
                </a>
              </li>
              <li className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <a
                  href="mailto:info@Baytaljazeera.com"
                  className={`${footerContactLinkClass} hover:text-[#D4AF37] break-all`}
                  dir="ltr"
                >
                  {siteSettings.siteEmail || "info@Baytaljazeera.com"}
                </a>
              </li>
              <li className="flex items-center gap-3 text-slate-300 text-sm">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <span>
                  {(siteSettings.siteAddress || "").replace(/IFAZ/g, "IFZA Dubai")}
                </span>
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
