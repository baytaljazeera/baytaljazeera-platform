import { create } from 'zustand';

interface FooterLink {
  href: string;
  label: string;
}

interface SiteSettings {
  siteName: string;
  siteEmail: string;
  sitePhone: string;
  siteAddress: string;
  footerCities: string[];
  quickLinksTitle: string;
  quickLinks: FooterLink[];
  accountLinksTitle: string;
  accountLinks: FooterLink[];
}

interface SiteSettingsState {
  settings: SiteSettings;
  isLoading: boolean;
  isLoaded: boolean;
  fetchSettings: () => Promise<void>;
}

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'بيت الجزيرة',
  siteEmail: 'info@aqar.sa',
  sitePhone: '920000000',
  siteAddress: 'المملكة العربية السعودية',
  footerCities: ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'تبوك', 'أبها'],
  quickLinksTitle: 'روابط سريعة',
  quickLinks: [
    { href: "/search", label: "البحث عن عقار" },
    { href: "/listings/new", label: "إضافة إعلان" },
    { href: "/plans", label: "الباقات والأسعار" }
  ],
  accountLinksTitle: 'الحساب',
  accountLinks: [
    { href: "/login", label: "تسجيل الدخول" },
    { href: "/register", label: "إنشاء حساب" },
    { href: "/complaint", label: "تقديم شكوى" }
  ],
};

export const useSiteSettingsStore = create<SiteSettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  isLoaded: false,

  fetchSettings: async () => {
    if (get().isLoaded || get().isLoading) return;
    
    set({ isLoading: true });
    
    try {
      const response = await fetch('/api/settings/public');
      
      if (response.ok) {
        const data = await response.json();
        set({
          settings: {
            siteName: data.siteName || DEFAULT_SETTINGS.siteName,
            siteEmail: data.siteEmail || DEFAULT_SETTINGS.siteEmail,
            sitePhone: data.sitePhone || DEFAULT_SETTINGS.sitePhone,
            siteAddress: data.siteAddress || DEFAULT_SETTINGS.siteAddress,
            footerCities: data.footerCities || DEFAULT_SETTINGS.footerCities,
            quickLinksTitle: data.quickLinksTitle || DEFAULT_SETTINGS.quickLinksTitle,
            quickLinks: data.quickLinks || DEFAULT_SETTINGS.quickLinks,
            accountLinksTitle: data.accountLinksTitle || DEFAULT_SETTINGS.accountLinksTitle,
            accountLinks: data.accountLinks || DEFAULT_SETTINGS.accountLinks,
          },
          isLoading: false,
          isLoaded: true,
        });
      } else {
        set({ isLoading: false, isLoaded: true });
      }
    } catch (error) {
      console.error('Failed to fetch site settings:', error);
      set({ isLoading: false, isLoaded: true });
    }
  },
}));
