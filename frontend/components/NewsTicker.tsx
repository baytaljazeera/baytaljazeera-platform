"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Newspaper, AlertCircle, Star, Megaphone, ChevronLeft, ChevronRight, Gift, Tag, Flame, Sparkles } from "lucide-react";

interface NewsItem {
  id: number;
  title: string;
  content: string;
  type?: string;
  priority?: number;
  speed?: number;
  background_color?: string | null;
  text_color?: string | null;
  icon?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
}

const defaultNews: NewsItem[] = [
  { id: 1, title: "مرحباً بكم في بيت الجزيرة", content: "منصتكم العقارية الأولى", type: "announcement" },
];

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  newspaper: Newspaper,
  star: Star,
  megaphone: Megaphone,
  alert: AlertCircle,
  gift: Gift,
  tag: Tag,
  fire: Flame,
  sparkles: Sparkles,
};

export default function NewsTicker() {
  const pathname = usePathname();
  const [news, setNews] = useState<NewsItem[]>(defaultNews);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);

  const hideTickerPaths = ['/admin', '/admin-login', '/request-access'];
  const shouldHideTicker = hideTickerPaths.some(path => pathname?.startsWith(path));

  useEffect(() => {
    if (shouldHideTicker) return;
    
    const fetchNews = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch("/api/news?active=true", {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (res.ok) {
          const data = await res.json();
          if (data.news && data.news.length > 0) {
            setNews(data.news);
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          // Silently fail - use default news
        }
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
    const interval = setInterval(fetchNews, 60000);
    return () => clearInterval(interval);
  }, [shouldHideTicker]);

  const averageSpeed = useMemo(() => {
    if (news.length === 0) return 25;
    const totalSpeed = news.reduce((sum, item) => sum + (item.speed || 25), 0);
    return Math.round(totalSpeed / news.length);
  }, [news]);

  if (shouldHideTicker) {
    return null;
  }

  const getIcon = (item: NewsItem) => {
    if (item.icon && iconMap[item.icon]) {
      const Icon = iconMap[item.icon];
      return <Icon className="w-4 h-4" />;
    }
    
    switch (item.type) {
      case "alert":
        return <AlertCircle className="w-4 h-4" />;
      case "promo":
        return <Star className="w-4 h-4" />;
      case "announcement":
        return <Megaphone className="w-4 h-4" />;
      default:
        return <Newspaper className="w-4 h-4" />;
    }
  };

  const handleScrollBackward = () => {
    if (tickerRef.current) {
      tickerRef.current.scrollLeft += 300;
      setIsPaused(true);
      setTimeout(() => setIsPaused(false), 3000);
    }
  };

  const handleScrollForward = () => {
    if (tickerRef.current) {
      tickerRef.current.scrollLeft -= 300;
      setIsPaused(true);
      setTimeout(() => setIsPaused(false), 3000);
    }
  };

  const handleCtaClick = (url: string | null | undefined) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const duplicatedNews = [...news, ...news, ...news, ...news];

  return (
    <div
      className="relative bg-gradient-to-l from-[#001a2e] via-[#002845] to-[#001a2e] text-white overflow-hidden hidden md:block"
      dir="rtl"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      role="region"
      aria-label="شريط الأخبار"
    >
      <div className="absolute inset-0 bg-[url('/patterns/card-pattern.png')] opacity-5" />
      
      <div className="relative flex items-center h-10">
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-bold text-xs z-10 shadow-lg">
          <Newspaper className="w-4 h-4" />
          <span>آخر الأخبار</span>
        </div>

        <button
          onClick={handleScrollForward}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[#002845] hover:bg-[#D4AF37] hover:text-[#002845] transition z-10 border-x border-white/20"
          title="التالي"
          aria-label="الخبر التالي"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div 
          ref={tickerRef}
          className="flex-1 overflow-hidden scroll-smooth"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div
            className={`flex whitespace-nowrap ticker-content ${isPaused ? 'paused' : ''}`}
            style={{ animationDuration: `${averageSpeed}s` }}
          >
            {duplicatedNews.map((item, idx) => (
              <div
                key={`${item.id}-${idx}`}
                className="inline-flex items-center gap-2 px-6 text-sm flex-shrink-0"
                style={{ color: item.text_color || "white" }}
              >
                <span className="text-[#D4AF37]">{getIcon(item)}</span>
                <span className="font-medium">{item.title}</span>
                {item.content && (
                  <>
                    <span className="text-white/40 mx-2">|</span>
                    <span className="text-white/70">{item.content}</span>
                  </>
                )}
                {item.cta_label && item.cta_url && (
                  <button
                    onClick={() => handleCtaClick(item.cta_url)}
                    className="bg-[#D4AF37] text-[#002845] px-3 py-0.5 rounded text-xs font-bold hover:bg-[#c9a432] transition-colors cursor-pointer"
                  >
                    {item.cta_label}
                  </button>
                )}
                <span className="text-[#D4AF37] mx-6">✦</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleScrollBackward}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[#002845] hover:bg-[#D4AF37] hover:text-[#002845] transition z-10 border-x border-white/20"
          title="السابق"
          aria-label="الخبر السابق"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <style jsx>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(50%);
          }
        }
        .ticker-content {
          animation: ticker var(--speed, 25s) linear infinite;
        }
        .ticker-content.paused {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
