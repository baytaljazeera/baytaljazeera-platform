import { Crown, Star, Zap, Gem, CreditCard, Shield, Award, Sparkles, Diamond, Trophy, Medal, Rocket, Building2, Home, LucideIcon } from "lucide-react";

export interface IconOption {
  value: string;
  label: string;
  Icon: LucideIcon;
}

export interface BadgeOption {
  value: string;
  label: string;
  color: string;
}

export interface LogoOption {
  value: string;
  label: string;
  emoji: string;
}

export interface ColorOption {
  value: string;
  label: string;
}

// الأيقونات الخمس الرئيسية المخصصة
export const primaryIconOptions: IconOption[] = [
  { value: "leaf", label: "نبتة", Icon: Home },
  { value: "sparkles", label: "بريق", Icon: Sparkles },
  { value: "crown", label: "تاج", Icon: Crown },
  { value: "gem", label: "جوهرة", Icon: Gem },
  { value: "star", label: "نجمة", Icon: Star },
];

// جميع الأيقونات المتاحة
export const iconOptions: IconOption[] = [
  { value: "crown", label: "تاج", Icon: Crown },
  { value: "star", label: "نجمة", Icon: Star },
  { value: "zap", label: "صاعقة", Icon: Zap },
  { value: "gem", label: "جوهرة", Icon: Gem },
  { value: "diamond", label: "ألماسة", Icon: Diamond },
  { value: "trophy", label: "كأس", Icon: Trophy },
  { value: "medal", label: "ميدالية", Icon: Medal },
  { value: "rocket", label: "صاروخ", Icon: Rocket },
  { value: "shield", label: "درع", Icon: Shield },
  { value: "award", label: "جائزة", Icon: Award },
  { value: "sparkles", label: "بريق", Icon: Sparkles },
  { value: "building", label: "مبنى", Icon: Building2 },
  { value: "home", label: "منزل", Icon: Home },
  { value: "credit-card", label: "بطاقة", Icon: CreditCard },
  { value: "leaf", label: "نبتة", Icon: Home },
];

export const badgeOptions: BadgeOption[] = [
  { value: "", label: "بدون شارة", color: "transparent" },
  { value: "الأكثر شعبية", label: "الأكثر شعبية", color: "#D4AF37" },
  { value: "الأفضل قيمة", label: "الأفضل قيمة", color: "#10B981" },
  { value: "موصى به", label: "موصى به", color: "#3B82F6" },
  { value: "حصري", label: "حصري", color: "#8B5CF6" },
  { value: "جديد", label: "جديد", color: "#F59E0B" },
  { value: "عرض خاص", label: "عرض خاص", color: "#EF4444" },
  { value: "مميز", label: "مميز", color: "#EC4899" },
  { value: "VIP", label: "VIP", color: "#6366F1" },
  { value: "للمحترفين", label: "للمحترفين", color: "#14B8A6" },
  { value: "للشركات", label: "للشركات", color: "#0EA5E9" },
];

export const logoOptions: LogoOption[] = [
  { value: "", label: "بدون لوجو", emoji: "❌" },
  { value: "🏠", label: "منزل", emoji: "🏠" },
  { value: "🏢", label: "مبنى", emoji: "🏢" },
  { value: "🏰", label: "قصر", emoji: "🏰" },
  { value: "🏛️", label: "عمارة كلاسيكية", emoji: "🏛️" },
  { value: "🌟", label: "نجمة ذهبية", emoji: "🌟" },
  { value: "⭐", label: "نجمة", emoji: "⭐" },
  { value: "💎", label: "ألماسة", emoji: "💎" },
  { value: "👑", label: "تاج", emoji: "👑" },
  { value: "🏆", label: "كأس", emoji: "🏆" },
  { value: "🎖️", label: "ميدالية", emoji: "🎖️" },
  { value: "🔥", label: "نار", emoji: "🔥" },
  { value: "💫", label: "بريق", emoji: "💫" },
  { value: "🚀", label: "صاروخ", emoji: "🚀" },
  { value: "💰", label: "كيس نقود", emoji: "💰" },
  { value: "🏅", label: "ميدالية ذهبية", emoji: "🏅" },
];

export const colorOptions: ColorOption[] = [
  { value: "#D4AF37", label: "ذهبي" },
  { value: "#003366", label: "كحلي" },
  { value: "#10B981", label: "أخضر" },
  { value: "#3B82F6", label: "أزرق" },
  { value: "#8B5CF6", label: "بنفسجي" },
  { value: "#EC4899", label: "وردي" },
  { value: "#EF4444", label: "أحمر" },
  { value: "#F59E0B", label: "برتقالي" },
  { value: "#14B8A6", label: "فيروزي" },
  { value: "#6366F1", label: "نيلي" },
  { value: "#84CC16", label: "ليموني" },
  { value: "#78716C", label: "رمادي" },
];

export const MAX_PLANS = 6;

export const getIconComponent = (iconName: string | null): LucideIcon => {
  const iconOption = iconOptions.find((i) => i.value === iconName);
  return iconOption?.Icon || Crown;
};

export const getBadgeOption = (value: string | null): BadgeOption | undefined => {
  return badgeOptions.find((b) => b.value === value);
};

export const getLogoOption = (value: string | null): LogoOption | undefined => {
  return logoOptions.find((l) => l.value === value);
};
