"use client";

import { useState, useRef, useEffect } from "react";
import { Share2, X, Copy, Check, Link2 } from "lucide-react";

interface ShareButtonProps {
  title: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  className?: string;
  buttonClassName?: string;
  showLabel?: boolean;
}

export default function ShareButton({
  title,
  description = "",
  url,
  imageUrl,
  className = "",
  buttonClassName = "",
  showLabel = true,
}: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");
  const shareText = description || title;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareOptions = [
    {
      name: "واتساب",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      ),
      color: "bg-[#25D366] hover:bg-[#1ebe5d]",
      priority: true, // Mark as priority option
      onClick: () => {
        const shareText = `${title}\n${description ? description + '\n' : ''}${shareUrl}`;
        window.open(
          `https://wa.me/?text=${encodeURIComponent(shareText)}`,
          "_blank"
        );
        setIsOpen(false);
      },
    },
    {
      name: "X (تويتر)",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
      color: "bg-black hover:bg-gray-800",
      onClick: () => {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`,
          "_blank"
        );
        setIsOpen(false);
      },
    },
    {
      name: "فيسبوك",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
      color: "bg-[#1877F2] hover:bg-[#0d6efd]",
      onClick: () => {
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
          "_blank"
        );
        setIsOpen(false);
      },
    },
    {
      name: "تلغرام",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      ),
      color: "bg-[#0088cc] hover:bg-[#0077b5]",
      onClick: () => {
        window.open(
          `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`,
          "_blank"
        );
        setIsOpen(false);
      },
    },
    {
      name: "البريد",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      color: "bg-slate-600 hover:bg-slate-700",
      onClick: () => {
        window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`;
        setIsOpen(false);
      },
    },
  ];

  const handleMainButtonClick = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        setIsOpen(true);
      }
    } else {
      setIsOpen(true);
    }
  };

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        onClick={handleMainButtonClick}
        className={buttonClassName || "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"}
      >
        <Share2 className="w-5 h-5" />
        {showLabel && <span className="text-sm">مشاركة</span>}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setIsOpen(false)} />
          
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 lg:hidden animate-slide-up">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold text-[#002845]">شارك هذا الإعلان</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-4">
                <Link2 className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-600 truncate flex-1" dir="ltr">
                  {shareUrl}
                </span>
                <button
                  onClick={copyToClipboard}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    copied 
                      ? "bg-green-500 text-white" 
                      : "bg-[#002845] text-white hover:bg-[#003366]"
                  }`}
                >
                  {copied ? (
                    <span className="flex items-center gap-1">
                      <Check className="w-4 h-4" />
                      تم
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Copy className="w-4 h-4" />
                      نسخ
                    </span>
                  )}
                </button>
              </div>
              
              <div className="space-y-3">
                {/* واتساب - أولوية عالية */}
                {shareOptions.filter(opt => opt.priority).map((option) => (
                  <button
                    key={option.name}
                    onClick={option.onClick}
                    className="w-full flex items-center gap-3 p-4 rounded-xl hover:bg-slate-50 transition-colors border-2 border-[#25D366]/20 bg-[#25D366]/5"
                  >
                    <span className={`w-12 h-12 rounded-full flex items-center justify-center text-white ${option.color} shadow-lg`}>
                      {option.icon}
                    </span>
                    <div className="flex-1 text-right">
                      <span className="text-base font-bold text-[#002845] block">{option.name}</span>
                      <span className="text-xs text-slate-500">الخيار الأكثر استخداماً</span>
                    </div>
                  </button>
                ))}
                
                {/* باقي الخيارات */}
                <div className="grid grid-cols-4 gap-3 pt-2 border-t border-slate-200">
                  {shareOptions.filter(opt => !opt.priority).map((option) => (
                    <button
                      key={option.name}
                      onClick={option.onClick}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <span className={`w-12 h-12 rounded-full flex items-center justify-center text-white ${option.color}`}>
                        {option.icon}
                      </span>
                      <span className="text-xs text-slate-600 text-center leading-tight">{option.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 pt-0">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full py-3 text-slate-500 font-medium"
              >
                إلغاء
              </button>
            </div>
          </div>

          <div className="hidden lg:block absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 min-w-[280px] overflow-hidden">
            <div className="p-3 border-b bg-slate-50">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-xs text-slate-500 truncate flex-1" dir="ltr">
                  {shareUrl.length > 35 ? shareUrl.slice(0, 35) + "..." : shareUrl}
                </span>
                <button
                  onClick={copyToClipboard}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                    copied 
                      ? "bg-green-500 text-white" 
                      : "bg-[#002845] text-white hover:bg-[#003366]"
                  }`}
                >
                  {copied ? "تم!" : "نسخ"}
                </button>
              </div>
            </div>
            
            <div className="p-2 space-y-1">
              {/* واتساب - أولوية عالية */}
              {shareOptions.filter(opt => opt.priority).map((option) => (
                <button
                  key={option.name}
                  onClick={option.onClick}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors border-2 border-[#25D366]/30 bg-[#25D366]/5 font-semibold"
                >
                  <span className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${option.color} shadow-md`}>
                    {option.icon}
                  </span>
                  <div className="flex-1 text-right">
                    <span className="text-base text-[#002845] block">{option.name}</span>
                    <span className="text-xs text-slate-500">الخيار الأكثر استخداماً</span>
                  </div>
                </button>
              ))}
              
              {/* باقي الخيارات */}
              {shareOptions.filter(opt => !opt.priority).map((option) => (
                <button
                  key={option.name}
                  onClick={option.onClick}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${option.color}`}>
                    {option.icon}
                  </span>
                  <span className="text-sm text-slate-700">{option.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
