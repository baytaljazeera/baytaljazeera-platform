"use client";

import { useEffect, useRef, useState, useCallback, createContext, useContext, ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Info, ShieldAlert, CheckCircle2, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────
// Premium confirmation + alert dialog system for بيت الجزيرة admin.
// Replaces window.confirm() and window.alert() — those native browser
// popups don't match a premium platform. This component renders via
// React Portal to document.body so it escapes every stacking context
// (sidebar, sticky headers, AIChatbot launcher), animates in/out with
// a backdrop blur, traps focus, supports Enter/ESC keyboard shortcuts,
// and follows the gold-on-royal-blue + paper aesthetic.
//
// Two ways to use it:
//   1) Imperative helper:
//        import { confirmDialog, alertDialog } from "@/components/ui/ConfirmDialog";
//        const ok = await confirmDialog({ title, body, variant: "danger", confirmText: "حذف" });
//        if (ok) { /* do the thing */ }
//        await alertDialog({ title, body, variant: "success" });
//   2) Provider + hook (for app-wide single-instance host).
//
// Choosing imperative API because most admin handlers are already
// async and the call-sites read top-to-bottom (await confirm → do).
// ─────────────────────────────────────────────────────────────────────

export type DialogVariant = "danger" | "warning" | "info" | "success" | "neutral";

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  /** Require a second click on the confirm button to prevent muscle-memory accidents. */
  doubleConfirm?: boolean;
  /** Show a checkbox the user must tick before confirm is enabled. */
  acknowledgeText?: string;
  /** Optional small hint shown under the title (e.g. "هذا الإجراء لا يمكن التراجع عنه"). */
  hint?: string;
}

export interface AlertOptions {
  title: string;
  body?: ReactNode;
  variant?: DialogVariant;
  buttonText?: string;
}

export interface PromptOptions {
  title: string;
  body?: ReactNode;
  placeholder?: string;
  initialValue?: string;
  /** Minimum length the user must type before submit enables. Default 1. */
  minLength?: number;
  /** Multi-line textarea instead of single input. */
  multiline?: boolean;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  hint?: string;
}

// ─── Variant styles ──────────────────────────────────────────────────
const VARIANT_CONFIG: Record<DialogVariant, {
  iconBg: string;
  iconColor: string;
  Icon: typeof AlertTriangle;
  ring: string;
  confirmBtn: string;
  hintTone: string;
}> = {
  danger: {
    iconBg: "bg-gradient-to-br from-red-50 to-red-100",
    iconColor: "text-red-600",
    Icon: ShieldAlert,
    ring: "ring-red-200",
    confirmBtn: "bg-gradient-to-l from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-[0_8px_20px_-6px_rgba(220,38,38,0.5)]",
    hintTone: "text-red-700 bg-red-50 border-red-200",
  },
  warning: {
    iconBg: "bg-gradient-to-br from-amber-50 to-amber-100",
    iconColor: "text-amber-600",
    Icon: AlertTriangle,
    ring: "ring-amber-200",
    confirmBtn: "bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-[0_8px_20px_-6px_rgba(245,158,11,0.5)]",
    hintTone: "text-amber-800 bg-amber-50 border-amber-200",
  },
  info: {
    iconBg: "bg-gradient-to-br from-[#FFFCEE] to-[#FFF7E0]",
    iconColor: "text-[#9A7D28]",
    Icon: Info,
    ring: "ring-[#D4AF37]/40",
    confirmBtn: "bg-gradient-to-l from-[#D4AF37] to-[#B8860B] hover:from-[#B8860B] hover:to-[#9A7D28] text-[#002845] font-bold shadow-[0_8px_20px_-6px_rgba(212,175,55,0.5)]",
    hintTone: "text-[#9A7D28] bg-[#FFFCEE] border-[#D4AF37]/40",
  },
  success: {
    iconBg: "bg-gradient-to-br from-emerald-50 to-emerald-100",
    iconColor: "text-emerald-600",
    Icon: CheckCircle2,
    ring: "ring-emerald-200",
    confirmBtn: "bg-gradient-to-l from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-[0_8px_20px_-6px_rgba(16,185,129,0.5)]",
    hintTone: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  neutral: {
    iconBg: "bg-gradient-to-br from-slate-50 to-slate-100",
    iconColor: "text-slate-600",
    Icon: Info,
    ring: "ring-slate-200",
    confirmBtn: "bg-gradient-to-l from-[#002845] to-[#003d66] hover:from-[#001830] hover:to-[#002845] text-white shadow-[0_8px_20px_-6px_rgba(0,40,69,0.5)]",
    hintTone: "text-slate-700 bg-slate-50 border-slate-200",
  },
};

// ─── Imperative host (singleton) ─────────────────────────────────────
// We render ONE host component into document.body and pipe imperative
// calls through it via a tiny event bus. This avoids needing a Provider
// in the layout tree.
type ResolveFn = (value: boolean) => void;
type PromptResolveFn = (value: string | null) => void;
type Request =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: ResolveFn }
  | { kind: "alert"; opts: AlertOptions; resolve: ResolveFn }
  | { kind: "prompt"; opts: PromptOptions; resolve: PromptResolveFn };

let push: ((r: Request) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    if (!push) {
      // Host not yet mounted — fall back to native so we never block
      // the operator. This is only possible if the host failed to
      // mount; in practice it's always available.
      const ok = window.confirm(opts.title + (opts.body ? "\n\n" + String(opts.body) : ""));
      resolve(ok);
      return;
    }
    push({ kind: "confirm", opts, resolve });
  });
}

export function promptDialog(opts: PromptOptions): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    if (!push) {
      const value = window.prompt(opts.title + (opts.body ? "\n" + String(opts.body) : ""), opts.initialValue || "");
      resolve(value);
      return;
    }
    push({ kind: "prompt", opts, resolve: resolve as PromptResolveFn });
  });
}

export function alertDialog(opts: AlertOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  return new Promise((resolve) => {
    if (!push) {
      window.alert(opts.title + (opts.body ? "\n\n" + String(opts.body) : ""));
      resolve(true);
      return;
    }
    push({ kind: "alert", opts, resolve });
  });
}

// ─── Host component ──────────────────────────────────────────────────
// Render <DialogHost /> ONCE in the root layout. It listens for
// imperative calls via the `push` function above and renders the
// currently-active dialog.
export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  const current = queue[0];
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    push = (r: Request) => setQueue((q) => [...q, r]);
    return () => { push = null; };
  }, []);
  const dismiss = useCallback((value: boolean | string | null) => {
    setQueue((q) => {
      if (q.length === 0) return q;
      const [first, ...rest] = q;
      // Each resolver type only accepts its native shape — coerce
      // when the caller passed the "wrong" shape (e.g. backdrop click
      // on a prompt should resolve with null, not false).
      if (first.kind === "prompt") {
        (first.resolve as PromptResolveFn)(typeof value === "string" ? value : null);
      } else {
        (first.resolve as ResolveFn)(typeof value === "boolean" ? value : false);
      }
      return rest;
    });
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {current && (
        <DialogBody
          key={queue.length + "-" + current.kind}
          request={current}
          onClose={dismiss}
        />
      )}
    </AnimatePresence>,
    document.body
  );
}

// ─── Dialog body ─────────────────────────────────────────────────────
function DialogBody({ request, onClose }: { request: Request; onClose: (v: boolean | string | null) => void }) {
  const isAlert = request.kind === "alert";
  const isPrompt = request.kind === "prompt";
  const opts = request.opts as ConfirmOptions & AlertOptions & PromptOptions;
  const variant: DialogVariant = opts.variant ?? (isAlert ? "info" : isPrompt ? "info" : "warning");
  const cfg = VARIANT_CONFIG[variant];
  const Icon = cfg.Icon;

  const [acknowledged, setAcknowledged] = useState(!opts.acknowledgeText);
  const [doubleArmed, setDoubleArmed] = useState(!(request.kind === "confirm" && (opts as ConfirmOptions).doubleConfirm));
  const [promptValue, setPromptValue] = useState<string>(isPrompt ? ((opts as PromptOptions).initialValue || "") : "");
  const promptMinLen = isPrompt ? Math.max(0, (opts as PromptOptions).minLength ?? 1) : 0;
  const promptValid = !isPrompt || promptValue.trim().length >= promptMinLen;

  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Focus: input for prompt, cancel for confirm, OK for alert.
  useEffect(() => {
    if (isPrompt && inputRef.current) {
      inputRef.current.focus();
      // place caret at end so initial value is editable, not selected
      const len = inputRef.current.value.length;
      try { inputRef.current.setSelectionRange(len, len); } catch { /* readonly types */ }
      return;
    }
    const target = isAlert ? confirmRef.current : cancelRef.current;
    target?.focus();
  }, [isAlert, isPrompt]);

  // Keyboard: Esc cancels (resolves null for prompt, false for confirm,
  // true for alert). Enter submits when valid. Multi-line prompts only
  // submit on Enter when Cmd/Ctrl is held so newlines work normally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(isPrompt ? null : isAlert);
        return;
      }
      if (e.key === "Enter" && acknowledged && doubleArmed) {
        if (isPrompt) {
          if ((opts as PromptOptions).multiline && !(e.metaKey || e.ctrlKey)) return;
          if (!promptValid) return;
          e.preventDefault();
          onClose(promptValue.trim());
          return;
        }
        e.preventDefault();
        onClose(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isAlert, isPrompt, acknowledged, doubleArmed, promptValue, promptValid, opts]);

  const handleConfirm = () => {
    if (request.kind === "confirm" && (opts as ConfirmOptions).doubleConfirm && !doubleArmed) {
      setDoubleArmed(true);
      return;
    }
    if (isPrompt) {
      if (!promptValid) return;
      onClose(promptValue.trim());
      return;
    }
    onClose(true);
  };

  return (
    <>
      {/* Backdrop — blurred, dimmed, clickable to cancel */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={() => onClose(isAlert)}
        className="fixed inset-0 bg-[#002845]/55 backdrop-blur-md"
        style={{ zIndex: 99998 }}
        aria-hidden="true"
      />

      {/* Centered dialog */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bj-dialog-title"
        className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
        style={{ zIndex: 99999 }}
      >
        <div
          dir="rtl"
          className={`pointer-events-auto w-full max-w-[460px] bg-white rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,40,69,0.45)] overflow-hidden ring-1 ${cfg.ring} border border-white`}
        >
          {/* Brand strip — gold to royal blue gradient */}
          <div className="h-1.5 bg-gradient-to-l from-[#D4AF37] via-[#B8860B] to-[#002845]" />

          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={`shrink-0 w-12 h-12 rounded-2xl ${cfg.iconBg} flex items-center justify-center`}>
                <Icon className={`w-6 h-6 ${cfg.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="bj-dialog-title" className="text-lg font-extrabold text-[#002845] leading-snug">
                  {opts.title}
                </h2>
                {opts.body && (
                  <div className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                    {typeof opts.body === "string" ? <p>{opts.body}</p> : opts.body}
                  </div>
                )}
              </div>
              {/* Close icon — secondary affordance */}
              <button
                type="button"
                onClick={() => onClose(isAlert)}
                className="shrink-0 -mt-1 -me-1 w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(opts as ConfirmOptions).hint && (
              <p className={`mt-4 text-[12px] font-medium px-3 py-2 rounded-xl border ${cfg.hintTone}`}>
                {(opts as ConfirmOptions).hint}
              </p>
            )}

            {isPrompt && (
              <div className="mt-4">
                {(opts as PromptOptions).multiline ? (
                  <textarea
                    ref={(el) => { inputRef.current = el; }}
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    placeholder={(opts as PromptOptions).placeholder}
                    rows={3}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37] resize-y"
                  />
                ) : (
                  <input
                    ref={(el) => { inputRef.current = el; }}
                    type="text"
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    placeholder={(opts as PromptOptions).placeholder}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37]"
                  />
                )}
                {promptMinLen > 0 && !promptValid && promptValue.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-amber-700">
                    الحد الأدنى: {promptMinLen} حرف ({promptValue.trim().length}/{promptMinLen})
                  </p>
                )}
              </div>
            )}

            {!isAlert && !isPrompt && (opts as ConfirmOptions).acknowledgeText && (
              <label className="mt-4 flex items-start gap-2.5 cursor-pointer select-none p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-[#D4AF37]/50 transition">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 accent-[#D4AF37]"
                />
                <span className="text-sm text-slate-700 leading-relaxed">{(opts as ConfirmOptions).acknowledgeText}</span>
              </label>
            )}

            <div className="mt-6 flex items-center justify-end gap-2.5">
              {!isAlert && (
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => onClose(isPrompt ? null : false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40"
                >
                  {(isPrompt ? (opts as PromptOptions).cancelText : (opts as ConfirmOptions).cancelText) || "إلغاء"}
                </button>
              )}
              <button
                ref={confirmRef}
                type="button"
                onClick={handleConfirm}
                disabled={!acknowledged || (isPrompt && !promptValid)}
                className={`px-5 py-2.5 rounded-xl text-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#D4AF37] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${cfg.confirmBtn}`}
              >
                {isAlert
                  ? (opts as AlertOptions).buttonText || "تم"
                  : isPrompt
                    ? ((opts as PromptOptions).confirmText || "تأكيد")
                    : (!doubleArmed
                        ? `${(opts as ConfirmOptions).confirmText || "تأكيد"} — اضغط مرة أخرى للتأكيد`
                        : (opts as ConfirmOptions).confirmText || "تأكيد")}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// ─── Optional Provider/hook API (for tree-based usage) ───────────────
const DialogContext = createContext<{
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
} | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  return (
    <DialogContext.Provider value={{ confirm: confirmDialog, alert: alertDialog, prompt: promptDialog }}>
      {children}
      <DialogHost />
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  return ctx || { confirm: confirmDialog, alert: alertDialog, prompt: promptDialog };
}
