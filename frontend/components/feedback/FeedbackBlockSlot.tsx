"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import FeedbackBlock from "./FeedbackBlock";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Renders the inline feedback block only when:
 * - Feedback is enabled and displayMode is "inline"
 * - Current page is search (list or map) or listing details
 * Use this component in search page and listing page below main content.
 */
export default function FeedbackBlockSlot() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const view = searchParams?.get("view") || null;

  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [questions, setQuestions] = useState<unknown[]>([]);

  const isSearch = pathname === "/search";
  const isListing = pathname.startsWith("/listing/");
  const pageType = isListing ? "listing" : isSearch ? (view === "map" ? "search_map" : "search") : null;

  useEffect(() => {
    if (!isSearch && !isListing) return;
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
  }, [isSearch, isListing, pageType]);

  if (!settings?.enabled || settings.displayMode !== "inline" || !pageType) return null;
  if (pageType === "search" && !settings.showOnSearch) return null;
  if (pageType === "search_map" && !settings.showOnMapPage) return null;
  if (pageType === "listing" && !settings.showOnPropertyDetails) return null;

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const settingsForm = {
    headingText: settings.headingText,
    thankYouMessage: settings.thankYouMessage,
    successMessage: settings.successMessage,
    enableProblemQuestion: settings.enableProblemQuestion,
    enableCommentField: settings.enableCommentField,
  };

  return (
    <div className="py-6 px-4">
      <FeedbackBlock
        settings={settingsForm}
        questions={questions}
        pageType={pageType}
        pageUrl={pageUrl}
      />
    </div>
  );
}
