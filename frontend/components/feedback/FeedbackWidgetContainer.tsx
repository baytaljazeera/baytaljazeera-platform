"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import FeedbackLinkOnly from "./FeedbackLinkOnly";
import FeedbackFloating from "./FeedbackFloating";
import FeedbackPopup from "./FeedbackPopup";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const BLOCKED_PATHS = ["/login", "/register", "/admin-login", "/add-listing/admin", "/checkout"];
const FEEDBACK_SESSION_KEY = "feedback_shown_session";
const FEEDBACK_LAST_SHOWN_KEY = "feedback_last_shown";
const FEEDBACK_SUBMITTED_SESSION = "feedback_submitted_session";

interface Settings {
  enabled: boolean;
  showOnHomepage?: boolean;
  showOnSearch?: boolean;
  showOnMapPage?: boolean;
  showOnPropertyDetails?: boolean;
  displayMode?: "inline" | "floating" | "popup";
  delaySeconds?: number;
  frequency?: "every_visit" | "once_per_session" | "once_per_7_days";
  headingText?: string;
  thankYouMessage?: string;
  successMessage?: string;
  enableProblemQuestion?: boolean;
  enableCommentField?: boolean;
}

interface Question {
  id: number;
  question_text_ar: string;
  question_type: string;
  options: unknown;
  is_required: boolean;
}

function getPageType(pathname: string, view: string | null): "home" | "search" | "search_map" | "listing" | null {
  if (pathname === "/") return "home";
  if (pathname === "/search") return view === "map" ? "search_map" : "search";
  if (pathname.startsWith("/listing/")) return "listing";
  return null;
}

function shouldShowOnPage(settings: Settings, pageType: string | null): boolean {
  if (!pageType) return false;
  if (pageType === "home") return !!settings.showOnHomepage;
  if (pageType === "search") return !!settings.showOnSearch;
  if (pageType === "search_map") return !!settings.showOnMapPage;
  if (pageType === "listing") return !!settings.showOnPropertyDetails;
  return false;
}

function canShowByFrequency(frequency: string): boolean {
  if (typeof sessionStorage === "undefined" || typeof localStorage === "undefined") return true;
  if (frequency === "every_visit") return true;
  if (sessionStorage.getItem(FEEDBACK_SUBMITTED_SESSION)) return false;
  if (frequency === "once_per_session") {
    if (sessionStorage.getItem(FEEDBACK_SESSION_KEY)) return false;
    sessionStorage.setItem(FEEDBACK_SESSION_KEY, "1");
    return true;
  }
  if (frequency === "once_per_7_days") {
    const last = localStorage.getItem(FEEDBACK_LAST_SHOWN_KEY);
    if (last) {
      const diff = Date.now() - parseInt(last, 10);
      if (diff < 7 * 24 * 60 * 60 * 1000) return false;
    }
    localStorage.setItem(FEEDBACK_LAST_SHOWN_KEY, String(Date.now()));
    return true;
  }
  return true;
}

export default function FeedbackWidgetContainer() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const view = searchParams?.get("view") || null;

  const [settings, setSettings] = useState<Settings | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [popupOpen, setPopupOpen] = useState(false);

  const isBlocked = BLOCKED_PATHS.some((p) => pathname.startsWith(p) || pathname === p);
  const pageType = getPageType(pathname, view);

  useEffect(() => {
    if (isBlocked) return;
    let cancelled = false;
    (async () => {
      try {
        const [setRes, qRes] = await Promise.all([
          fetch(`${API_URL}/api/feedback/settings`, { credentials: "include" }),
          fetch(`${API_URL}/api/feedback/questions?pageType=${pageType || ""}`, { credentials: "include" }),
        ]);
        if (cancelled) return;
        if (setRes.ok) {
          const data = await setRes.json();
          setSettings(data);
        }
        if (qRes.ok) {
          const data = await qRes.json();
          setQuestions(data.questions || []);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isBlocked, pageType]);

  const handleSubmitted = useCallback(() => {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(FEEDBACK_SUBMITTED_SESSION, "1");
  }, []);

  if (isBlocked || !settings?.enabled || !pageType || !shouldShowOnPage(settings, pageType)) {
    return null;
  }

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const settingsForm = {
    headingText: settings.headingText,
    thankYouMessage: settings.thankYouMessage,
    successMessage: settings.successMessage,
    enableProblemQuestion: settings.enableProblemQuestion,
    enableCommentField: settings.enableCommentField,
  };

  // Home: link only
  if (pageType === "home") {
    return (
      <div className="fixed bottom-6 left-6 z-[8000]" style={{ direction: "ltr" }}>
        <FeedbackLinkOnly
          settings={settingsForm}
          questions={questions}
          pageUrl={pageUrl}
        />
      </div>
    );
  }

  // Search or listing: floating or popup (inline is rendered by the page itself)
  const displayMode = settings.displayMode || "inline";
  const delay = Math.max(0, Math.min(120, settings.delaySeconds ?? 25));

  if (displayMode === "popup") {
    const showPopup = canShowByFrequency(settings.frequency || "once_per_session");
    if (!showPopup) return null;
    return (
      <>
        {popupOpen ? (
          <FeedbackPopup
            settings={settingsForm}
            questions={questions}
            pageType={pageType}
            pageUrl={pageUrl}
            onClose={() => setPopupOpen(false)}
            onSuccess={handleSubmitted}
          />
        ) : (
          <PopupTrigger delaySeconds={delay} onShow={() => setPopupOpen(true)} />
        )}
      </>
    );
  }

  if (displayMode === "floating") {
    if (!canShowByFrequency(settings.frequency || "once_per_session")) return null;
    return (
      <FeedbackFloating
        settings={settingsForm}
        questions={questions}
        pageType={pageType}
        pageUrl={pageUrl}
        delaySeconds={delay}
        onSuccess={handleSubmitted}
      />
    );
  }

  return null;
}

function PopupTrigger({ delaySeconds, onShow }: { delaySeconds: number; onShow: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setShow(true);
      onShow();
    }, delaySeconds * 1000);
    return () => clearTimeout(t);
  }, [delaySeconds, onShow]);
  return null;
}
