"use client";

// Single loading vocabulary. Lines, blocks, stat-card shape.
// Prefer skeletons over spinners — they reduce perceived load time.

export function BJSkeletonLine({ width = "100%", height = 12 }: { width?: string; height?: number }) {
  return (
    <span
      aria-hidden
      style={{ width, height }}
      className="inline-block rounded-bj-sm bg-brand-paper-2 animate-pulse"
    />
  );
}

export function BJSkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`rounded-bj-lg bg-brand-paper-2 animate-pulse ${className}`}
    />
  );
}

export function BJSkeletonStat() {
  return (
    <div className="bg-white rounded-bj-lg border border-brand-royal/10 shadow-card p-5">
      <BJSkeletonLine width="60%" />
      <div className="mt-3"><BJSkeletonLine width="40%" height={28} /></div>
      <div className="mt-3"><BJSkeletonLine width="80%" height={10} /></div>
    </div>
  );
}
