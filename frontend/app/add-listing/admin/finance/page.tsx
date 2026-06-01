"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";
import { normalizeConfirmationPhrase } from "@/lib/utils";
import { alertDialog, promptDialog } from "@/components/ui/ConfirmDialog";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  Search,
  Filter,
  Ban,
  PlayCircle,
  CreditCard,
  Wallet,
  PiggyBank,
  UserCheck,
  UserX,
  Timer,
  FileText,
  Eye,
  Mail,
  RotateCcw,
  Download,
  Printer,
  X,
  Trash2,
  Headset,
  Send,
} from "lucide-react";

interface FinanceStats {
  users: {
    total: number;
    active: number;
    expired: number;
    suspended: number;
    noSubscription: number;
  };
  revenue: {
    total: number;
    monthly: number;
    refundsTotal: number;
    pendingRefunds: number;
    pendingRefundsCount: number;
    pendingWithdrawalRequests?: number;
    pendingWithdrawalRequestsCount?: number;
  };
  planDistribution: Array<{
    name_ar: string;
    color: string;
    subscribers: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    subscriptions: number;
    revenue: number;
  }>;
}

interface Subscriber {
  id: string;
  name: string;
  email: string;
  phone: string;
  registered_at: string;
  subscription_id: number;
  plan_id: number;
  subscription_status: string;
  started_at: string;
  expires_at: string;
  paid_amount: number;
  suspended_at: string | null;
  suspension_reason: string | null;
  plan_name: string;
  plan_price: number;
  plan_color: string;
}

interface FinanceQueueTicket {
  id: number;
  ticket_number: string;
  subject: string;
  status: string;
  department: string;
  category?: string | null;
  user_name?: string;
  user_email?: string;
  created_at: string;
  updated_at: string;
  reply_count?: number;
  // populated once support hands the ticket to finance — this is the
  // signal the Correspondence inbox uses to filter, so messages don't
  // mix with raw financial requests sitting in Support's queue.
  transferred_to_finance_at?: string | null;
  auto_assigned_role?: string | null;
  invoice_id?: number | null;
  refund_id?: number | null;
  amount?: number | null;
}

interface Refund {
  id: number;
  user_id: string;
  amount: number;
  reason: string;
  status: string;
  created_at: string;
  user_name: string;
  user_email: string;
  plan_name: string;
  invoice_number?: string;
  invoice_id?: number;
  decision_note?: string;
  payout_confirmed_at?: string;
  bank_reference?: string;
  refund_invoice_number?: string;
  refund_invoice_issued_at?: string;
  payout_proof_url?: string | null;
  ticket_id?: number | null;
}

// ── Refund Case (new state machine) ───────────────────────────────
type CaseState =
  | "pending_review"
  | "waiting_customer_info"
  | "approved"
  | "awaiting_bank_transfer"
  | "proof_uploaded"
  | "completed"
  | "rejected";

interface RefundCase {
  id: number;
  case_number?: string | null;
  status: CaseState;
  amount: number;
  original_amount?: number | null;
  estimated_refund_amount?: number | null;
  approved_refund_amount?: number | null;
  refund_type?: string;
  reason?: string | null;
  created_at: string;
  updated_at: string;
  state_changed_at?: string | null;
  due_at?: string | null;
  priority?: string | null;
  payout_proof_url?: string | null;
  payout_confirmed_at?: string | null;
  bank_reference?: string | null;
  refund_invoice_number?: string | null;
  bank_name?: string | null;
  bank_account_iban?: string | null;
  account_holder_name?: string | null;
  ticket_id?: number | null;
  invoice_id?: number | null;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  ticket_number?: string | null;
  original_invoice_number?: string | null;
  assigned_finance_user_id?: string | null;
  pre_wait_status?: string | null;
  decision_note?: string | null;
}

interface CaseCounters {
  finance_inbox: number;
  pending_review: number;
  waiting_customer_info: number;
  approved: number;
  awaiting_bank_transfer: number;
  proof_uploaded: number;
  cases_active_total: number;
  completed: number;
  rejected: number;
}

interface FinanceInboxTicket {
  id: number;
  ticket_number: string;
  subject: string;
  description?: string;
  status: string;
  category?: string | null;
  subcategory?: string | null;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  invoice_id?: number | null;
  reply_count?: number;
  created_at: string;
  updated_at: string;
  transferred_to_finance_at?: string | null;
  refund_bank_details_snapshot?: {
    bank_name?: string;
    bank_account_iban?: string;
    account_holder_name?: string;
  } | null;
  user_bank_name?: string | null;
  user_bank_iban?: string | null;
  user_account_holder?: string | null;
}

interface RefundCaseEvent {
  id: number;
  event_type: string;
  from_state?: string | null;
  to_state?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  note?: string | null;
  payload?: any;
  created_at: string;
}

const EMPTY_CASE_COUNTERS: CaseCounters = {
  finance_inbox: 0,
  pending_review: 0,
  waiting_customer_info: 0,
  approved: 0,
  awaiting_bank_transfer: 0,
  proof_uploaded: 0,
  cases_active_total: 0,
  completed: 0,
  rejected: 0,
};

const CASE_STATE_LABEL: Record<CaseState, string> = {
  pending_review: "قيد المراجعة",
  waiting_customer_info: "بانتظار بيانات العميل",
  approved: "معتمد",
  awaiting_bank_transfer: "بانتظار التحويل البنكي",
  proof_uploaded: "إيصال مرفوع",
  completed: "مكتمل",
  rejected: "مرفوض",
};

const CASE_STATE_TONE: Record<CaseState, string> = {
  pending_review: "bg-slate-50 text-slate-800 border-slate-200",
  waiting_customer_info: "bg-amber-50 text-amber-900 border-amber-200",
  approved: "bg-sky-50 text-sky-900 border-sky-200",
  awaiting_bank_transfer: "bg-rose-50 text-rose-900 border-rose-300",
  proof_uploaded: "bg-violet-50 text-violet-900 border-violet-200",
  completed: "bg-emerald-50 text-emerald-900 border-emerald-200",
  rejected: "bg-gray-100 text-gray-700 border-gray-200",
};

const ACTIVE_BOARD_COLUMNS: CaseState[] = [
  "pending_review",
  "waiting_customer_info",
  "approved",
  "awaiting_bank_transfer",
  "proof_uploaded",
];

// Module-level so CaseDetailModal can use it without prop-drilling.
function fmtSAR(amount: number): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
  }).format(amount);
}

// Finance Correspondence inbox shows only tickets Support has actually
// handed off — either with the new transferred_to_finance_at stamp, or
// (legacy fallback) tickets whose owning role is now finance_admin.
// Anything still owned by support_admin stays on the Support side.
function isFinanceInboxTicket(t: FinanceQueueTicket): boolean {
  return (
    t.department === "financial" &&
    (Boolean(t.transferred_to_finance_at) || t.auto_assigned_role === "finance_admin")
  );
}

export default function FinancePage() {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [allRefunds, setAllRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "cases" | "subscribers" | "refunds" | "payments" | "invoices" | "messages" | "withdrawals">("cases");
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [paymentStats, setPaymentStats] = useState<any>(null);
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);
  const [subscriberFilter, setSubscriberFilter] = useState("all");
  const [refundFilter, setRefundFilter] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modal states
  const [refundModal, setRefundModal] = useState<{
    isOpen: boolean;
    invoice: any | null;
    reason: string;
    loading: boolean;
  }>({ isOpen: false, invoice: null, reason: "", loading: false });
  
  const [successModal, setSuccessModal] = useState<{
    isOpen: boolean;
    message: string;
    type: "success" | "error";
  }>({ isOpen: false, message: "", type: "success" });

  const [reviewModal, setReviewModal] = useState<{
    isOpen: boolean;
    refund: Refund | null;
    action: "approve" | "reject";
    note: string;
    loading: boolean;
    subscriptionAction: "none" | "suspend" | "cancel";
    cancelQuota: boolean;
  }>({ isOpen: false, refund: null, action: "approve", note: "", loading: false, subscriptionAction: "none", cancelQuota: false });

  const [payoutModal, setPayoutModal] = useState<{
    isOpen: boolean;
    refund: Refund | null;
    bankReference: string;
    payoutProofUrl: string;
    uploadingProof: boolean;
    loading: boolean;
  }>({ isOpen: false, refund: null, bankReference: "", payoutProofUrl: "", uploadingProof: false, loading: false });

  const [suspendModal, setSuspendModal] = useState<{
    isOpen: boolean;
    subscriber: Subscriber | null;
    reason: string;
    loading: boolean;
  }>({ isOpen: false, subscriber: null, reason: "", loading: false });

  const [activateModal, setActivateModal] = useState<{
    isOpen: boolean;
    subscriber: Subscriber | null;
    reason: string;
    loading: boolean;
  }>({ isOpen: false, subscriber: null, reason: "", loading: false });

  const [withdrawalModal, setWithdrawalModal] = useState<{
    isOpen: boolean;
    request: any | null;
    action: "approve" | "reject" | "complete" | "convert";
    notes: string;
    bankReference: string;
    selectedPlanId: number | null;
    loading: boolean;
  }>({ isOpen: false, request: null, action: "approve", notes: "", bankReference: "", selectedPlanId: null, loading: false });

  const [withdrawalFilter, setWithdrawalFilter] = useState<"all" | "finance_review" | "in_progress" | "completed" | "rejected">("finance_review");
  const [plans, setPlans] = useState<any[]>([]);

  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [resetInvoiceOpen, setResetInvoiceOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const RESET_INVOICES_PHRASE = "تصفير الفواتير التجريبية";

  // ── Refund Case state machine: board + detail + inbox ────────────
  const [caseCounters, setCaseCounters] = useState<CaseCounters>(EMPTY_CASE_COUNTERS);
  const [cases, setCases] = useState<RefundCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [caseBoardFilter, setCaseBoardFilter] = useState<"active" | "completed" | "rejected" | "all">("active");
  const [caseDetail, setCaseDetail] = useState<{
    open: boolean;
    loading: boolean;
    case: RefundCase | null;
    events: RefundCaseEvent[];
    ticketReplies: Array<{ id: number; message: string; sender_type: string; created_at: string }>;
    actionLoading: boolean;
  }>({ open: false, loading: false, case: null, events: [], ticketReplies: [], actionLoading: false });

  // ─── Refund Requests (replaces the old Finance Inbox of tickets) ───
  // Per the owner's reset (10 rules): finance only sees the refund
  // request OBJECT. Never the underlying support ticket, never a
  // chat thread. The card displays support_note as the single
  // consolidated brief.
  type RefundRequestRow = {
    id: number;
    case_number: string | null;
    status: string;
    amount: number;
    original_amount: number | null;
    estimated_refund_amount: number | null;
    approved_refund_amount: number | null;
    refund_type: string;
    reason: string | null;
    support_note: string | null;
    support_followup_required: boolean;
    user_id: string;
    user_name: string | null;
    user_email: string | null;
    invoice_id: number | null;
    original_invoice_number: string | null;
    created_at: string;
    updated_at: string;
    state_changed_at: string | null;
    priority: string | null;
    due_at: string | null;
  };
  const [refundRequests, setRefundRequests] = useState<RefundRequestRow[]>([]);
  const [loadingRefundRequests, setLoadingRefundRequests] = useState(false);
  const [refundActionModal, setRefundActionModal] = useState<{
    open: boolean;
    request: RefundRequestRow | null;
    action: "approve" | "reject" | "request-info" | null;
    approvedAmount: string;
    note: string;
    loading: boolean;
  }>({ open: false, request: null, action: null, approvedAmount: "", note: "", loading: false });

  // Legacy (kept to avoid TS errors from old code paths; not used by
  // the new Refund Requests tab. Round 3 cleanup will reap them.)
  const [financeInbox, setFinanceInbox] = useState<FinanceInboxTicket[]>([]);
  const [loadingFinanceInbox, setLoadingFinanceInbox] = useState(false);
  const [inboxItemModal, setInboxItemModal] = useState<{
    open: boolean;
    loading: boolean;
    ticket: FinanceInboxTicket | null;
    replies: Array<{ id: number; message: string; sender_type: string; created_at: string }>;
    replyBody: string;
    sending: boolean;
  }>({ open: false, loading: false, ticket: null, replies: [], replyBody: "", sending: false });
  const [convertModal, setConvertModal] = useState<{
    open: boolean;
    ticket: FinanceInboxTicket | null;
    amount: string;
    bankName: string;
    iban: string;
    holder: string;
    loading: boolean;
  }>({ open: false, ticket: null, amount: "", bankName: "", iban: "", holder: "", loading: false });

  const [financeQueueTickets, setFinanceQueueTickets] = useState<FinanceQueueTicket[]>([]);
  const [loadingFinanceQueue, setLoadingFinanceQueue] = useState(false);
  const [financeTicketModal, setFinanceTicketModal] = useState<{
    open: boolean;
    ticketId: number | null;
    loading: boolean;
    ticket: Record<string, unknown> | null;
    replies: Array<Record<string, unknown>>;
    replyBody: string;
    sending: boolean;
    statusUpdating: boolean;
  }>({
    open: false,
    ticketId: null,
    loading: false,
    ticket: null,
    replies: [],
    replyBody: "",
    sending: false,
    statusUpdating: false,
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  // ── Refund Case state machine: keep counters fresh always ──────
  // (used by tabs nav badges + the cases board banner). Polls
  // gently every 30s while the dashboard is mounted.
  useEffect(() => {
    void fetchCaseCounters();
    const t = setInterval(() => { void fetchCaseCounters(); }, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "cases") void fetchCases(caseBoardFilter);
    if (activeTab === "messages") void fetchRefundRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, caseBoardFilter]);

  // Removed: this effect used to fetch /api/support and filter into
  // a "finance queue" of tickets. Per the owner's reset rules (10),
  // finance never reads support tickets — the new "messages" tab
  // pulls refund-request summaries via fetchRefundRequests instead.
  // Leaving an empty array initialiser so the legacy component
  // references downstream don't crash on undefined.
  useEffect(() => {
    setFinanceQueueTickets([]);
    setLoadingFinanceQueue(false);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          setSessionRole(data.user?.role ?? null);
        }
      } catch {
        setSessionRole(null);
      }
    })();
  }, []);

  async function fetchPlans() {
    try {
      const res = await fetch(`${API_URL}/api/plans`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error("Error fetching plans:", err);
    }
  }

  function financeTicketStatusLabel(status: string | undefined) {
    switch (status) {
      case "new":
      case "open":
        return "جديدة";
      case "in_progress":
        return "قيد المعالجة";
      case "resolved":
        return "تم الحل";
      case "closed":
        return "مغلقة";
      default:
        return status || "—";
    }
  }

  async function openFinanceTicketModal(ticketId: number) {
    setFinanceTicketModal({
      open: true,
      ticketId,
      loading: true,
      ticket: null,
      replies: [],
      replyBody: "",
      sending: false,
      statusUpdating: false,
    });
    try {
      const res = await fetch(`${API_URL}/api/__deprecated_finance_legacy__/${ticketId}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setFinanceTicketModal((prev) => ({
          ...prev,
          loading: false,
          ticket: (data.ticket as Record<string, unknown>) ?? null,
          replies: (data.replies as Array<Record<string, unknown>>) || [],
        }));
      } else {
        setFinanceTicketModal((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setFinanceTicketModal((prev) => ({ ...prev, loading: false }));
    }
  }

  async function updateFinanceTicketStatus(status: "resolved" | "closed" | "in_progress" | "new") {
    const id = financeTicketModal.ticketId;
    if (id == null) return;
    setFinanceTicketModal((prev) => ({ ...prev, statusUpdating: true }));
    try {
      const res = await fetch(`${API_URL}/api/__deprecated_finance_legacy__/${id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        const t = data.ticket as Record<string, unknown> | undefined;
        setFinanceTicketModal((prev) => ({
          ...prev,
          statusUpdating: false,
          ticket: t ? { ...prev.ticket, ...t } : prev.ticket,
        }));
        const listRes = await fetch(`${API_URL}/api/__deprecated_finance_legacy__`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          setFinanceQueueTickets((listData.tickets || []).filter(isFinanceInboxTicket));
        }
      } else {
        setFinanceTicketModal((prev) => ({ ...prev, statusUpdating: false }));
      }
    } catch {
      setFinanceTicketModal((prev) => ({ ...prev, statusUpdating: false }));
    }
  }

  async function sendFinanceTicketReply() {
    const id = financeTicketModal.ticketId;
    if (id == null || !financeTicketModal.replyBody.trim()) return;
    setFinanceTicketModal((prev) => ({ ...prev, sending: true }));
    try {
      const res = await fetch(`${API_URL}/api/__deprecated_finance_legacy__/${id}/reply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ message: financeTicketModal.replyBody.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        const newReply = data.reply as Record<string, unknown> | undefined;
        setFinanceTicketModal((prev) => ({
          ...prev,
          replyBody: "",
          replies: newReply ? [...prev.replies, newReply] : prev.replies,
          sending: false,
        }));
        const listRes = await fetch(`${API_URL}/api/__deprecated_finance_legacy__`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          setFinanceQueueTickets((listData.tickets || []).filter(isFinanceInboxTicket));
        }
      } else {
        setFinanceTicketModal((prev) => ({ ...prev, sending: false }));
      }
    } catch {
      setFinanceTicketModal((prev) => ({ ...prev, sending: false }));
    }
  }

  useEffect(() => {
    fetchStats();
    fetchSubscribers();
    fetchRefunds();
    fetchAllRefunds();
    fetchPayments();
    fetchInvoices();
    fetchPaymentStats();
    fetchWithdrawalRequests();
  }, []);

  // Convert a Support-transferred ticket into a refund operation. The
  // accountant lands on the inbox, picks a ticket, and we hand it off
  // to the from-ticket endpoint. Optional amount prompt lets them
  // override the invoice total if it's partial; empty = use invoice.
  async function convertTicketToRefund(ticket: FinanceQueueTicket) {
    if (ticket.refund_id) {
      await alertDialog({
        title: "هذه التذكرة مرتبطة بطلب استرداد",
        message: `سبق تحويلها إلى عملية استرداد رقم #${ticket.refund_id}. افتح تبويب "الاستردادات" لمتابعتها.`,
        variant: "info",
      });
      return;
    }

    const promptedAmount = await promptDialog({
      title: "تحويل المراسلة إلى عملية استرداد",
      message: `سيتم إنشاء طلب استرداد بحالة "تحت العمليات" مرتبط بالتذكرة ${ticket.ticket_number || ("#" + ticket.id)}. يمكنك ترك المبلغ فارغاً لاستخدام قيمة الفاتورة المرتبطة، أو إدخال مبلغ جزئي.`,
      label: "المبلغ بالريال (اختياري)",
      placeholder: "مثال: 199.00",
      confirmText: "تحويل إلى عملية استرداد",
      cancelText: "تراجع",
      variant: "warning",
    });

    if (promptedAmount === null) return; // user cancelled

    const trimmed = promptedAmount.trim();
    let amount: number | null = null;
    if (trimmed) {
      const parsed = parseFloat(trimmed);
      if (Number.isNaN(parsed) || parsed <= 0) {
        await alertDialog({
          title: "مبلغ غير صالح",
          message: "أدخل مبلغاً رقمياً أكبر من صفر، أو اتركه فارغاً للاستخدام التلقائي.",
          variant: "error",
        });
        return;
      }
      amount = parsed;
    }

    try {
      const res = await fetch(`${API_URL}/api/finance/refunds/from-ticket/${ticket.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(amount != null ? { amount } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alertDialog({
          title: "تعذّر التحويل إلى استرداد",
          message: data?.error || "حدث خطأ غير متوقع. حاول مجدداً.",
          variant: "error",
        });
        return;
      }
      await alertDialog({
        title: "تم تحويل المراسلة إلى عملية استرداد",
        message: `الطلب رقم #${data?.refund?.id ?? "—"} يظهر الآن في تبويب "الاستردادات" تحت "تحت العمليات". لن ينتقل إلى "تم الاسترداد" حتى يتم رفع إثبات التحويل البنكي.`,
        variant: "success",
      });
      setActiveTab("refunds");
      setRefundFilter("approved");
      try {
        const listRes = await fetch(`${API_URL}/api/__deprecated_finance_legacy__`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          setFinanceQueueTickets((listData.tickets || []).filter(isFinanceInboxTicket));
        }
      } catch { /* ignore */ }
      await fetchRefunds("approved");
    } catch (err) {
      await alertDialog({
        title: "فشل الاتصال بالخادم",
        message: "تحقق من اتصال الإنترنت ثم حاول مرة أخرى.",
        variant: "error",
      });
    }
  }

  // ── Refund Case state machine: API helpers ─────────────────────
  async function fetchCaseCounters() {
    try {
      const res = await fetch(`${API_URL}/api/finance/counters`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCaseCounters({ ...EMPTY_CASE_COUNTERS, ...(data.counters || {}) });
      }
    } catch { /* leave previous values */ }
  }

  async function fetchCases(filter: "active" | "completed" | "rejected" | "all" = caseBoardFilter) {
    setLoadingCases(true);
    try {
      const res = await fetch(`${API_URL}/api/finance/cases?state=${filter}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCases((data.cases || []) as RefundCase[]);
      }
    } finally {
      setLoadingCases(false);
    }
  }

  async function fetchFinanceInbox() {
    // Legacy stub kept so older useEffect references don't crash. The
    // new "messages" tab fetches refund requests instead — see
    // fetchRefundRequests() below.
    setLoadingFinanceInbox(false);
    setFinanceInbox([]);
  }

  async function fetchRefundRequests() {
    setLoadingRefundRequests(true);
    try {
      const res = await fetch(`${API_URL}/api/finance/refund-requests`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        // Endpoint returns refund-request summary rows; the contract
        // explicitly excludes ticket_id / ticket_number / replies.
        setRefundRequests((data.cases || data.refund_requests || []) as RefundRequestRow[]);
      } else {
        setRefundRequests([]);
      }
    } finally {
      setLoadingRefundRequests(false);
    }
  }

  function openRefundAction(request: RefundRequestRow, action: "approve" | "reject" | "request-info") {
    setRefundActionModal({
      open: true,
      request,
      action,
      approvedAmount: action === "approve"
        ? String(request.estimated_refund_amount ?? request.amount ?? "")
        : "",
      note: "",
      loading: false,
    });
  }

  async function submitRefundAction() {
    const { request, action, approvedAmount, note } = refundActionModal;
    if (!request || !action) return;
    setRefundActionModal(p => ({ ...p, loading: true }));
    try {
      let url = "";
      let body: any = {};
      if (action === "approve") {
        const amt = parseFloat(approvedAmount);
        if (!Number.isFinite(amt) || amt <= 0) {
          await alertDialog({ title: "أدخل المبلغ المعتمد", body: "المبلغ يجب أن يكون أكبر من صفر", variant: "warning" });
          setRefundActionModal(p => ({ ...p, loading: false }));
          return;
        }
        url = `${API_URL}/api/finance/refund-requests/${request.id}/approve`;
        body = { payload: { approved_refund_amount: amt }, note: note.trim() };
      } else if (action === "reject") {
        if (note.trim().length < 5) {
          await alertDialog({ title: "اكتب سبب الرفض", body: "السبب مطلوب وسيُبلَّغ للعميل عبر الدعم", variant: "warning" });
          setRefundActionModal(p => ({ ...p, loading: false }));
          return;
        }
        url = `${API_URL}/api/finance/refund-requests/${request.id}/reject`;
        body = { note: note.trim() };
      } else {
        if (note.trim().length < 5) {
          await alertDialog({ title: "اكتب الملاحظة للدعم", body: "اشرح ما تحتاجه من الدعم بدقة", variant: "warning" });
          setRefundActionModal(p => ({ ...p, loading: false }));
          return;
        }
        url = `${API_URL}/api/finance/refund-requests/${request.id}/request-info`;
        body = { note: note.trim() };
      }
      const res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alertDialog({
          title: "تعذّر تنفيذ الإجراء",
          body: data?.error || "حدث خطأ غير متوقع",
          variant: "danger",
        });
        setRefundActionModal(p => ({ ...p, loading: false }));
        return;
      }
      setRefundActionModal({ open: false, request: null, action: null, approvedAmount: "", note: "", loading: false });
      await Promise.all([fetchRefundRequests(), fetchCaseCounters(), fetchCases()]);
    } catch (e) {
      await alertDialog({
        title: "خطأ في الاتصال",
        body: "تحقق من الاتصال وحاول مجدداً",
        variant: "danger",
      });
      setRefundActionModal(p => ({ ...p, loading: false }));
    }
  }

  async function openCaseDetail(id: number) {
    setCaseDetail({ open: true, loading: true, case: null, events: [], ticketReplies: [], actionLoading: false });
    try {
      const res = await fetch(`${API_URL}/api/finance/cases/${id}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCaseDetail({
          open: true,
          loading: false,
          case: data.case as RefundCase,
          events: (data.events || []) as RefundCaseEvent[],
          ticketReplies: (data.ticket_replies || []) as any[],
          actionLoading: false,
        });
      } else {
        setCaseDetail((p) => ({ ...p, loading: false }));
      }
    } catch {
      setCaseDetail((p) => ({ ...p, loading: false }));
    }
  }

  async function caseTransition(toState: CaseState, opts: { note?: string; payload?: any } = {}) {
    if (!caseDetail.case) return;
    setCaseDetail((p) => ({ ...p, actionLoading: true }));
    try {
      const res = await fetch(`${API_URL}/api/finance/cases/${caseDetail.case.id}/transition`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ to: toState, note: opts.note || "", payload: opts.payload || {} }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alertDialog({
          title: "تعذّر تغيير الحالة",
          message: data?.error || "غير متاح",
          variant: "error",
        });
        setCaseDetail((p) => ({ ...p, actionLoading: false }));
        return;
      }
      // Refresh detail + board + counters in parallel
      await Promise.all([
        openCaseDetail(caseDetail.case.id),
        fetchCases(),
        fetchCaseCounters(),
      ]);
    } catch {
      setCaseDetail((p) => ({ ...p, actionLoading: false }));
    }
  }

  async function uploadCaseProof(file: File): Promise<string | null> {
    if (file.size > 8 * 1024 * 1024) {
      await alertDialog({
        title: "حجم الملف كبير",
        message: "يجب ألا يتجاوز حجم الإيصال 8 ميجابايت.",
        variant: "error",
      });
      return null;
    }
    try {
      const fd = new FormData();
      fd.append("file", file);
      let url = "";
      const res = await fetch(`${API_URL}/api/uploads`, {
        method: "POST",
        credentials: "include",
        headers: getAuthHeaders(),
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        url = data?.url || data?.fileUrl || data?.path || "";
      }
      if (!url) {
        url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(file);
        });
      }
      return url;
    } catch {
      await alertDialog({
        title: "فشل رفع الصورة",
        message: "تعذّر رفع صورة إثبات التحويل. حاول مرة أخرى.",
        variant: "error",
      });
      return null;
    }
  }

  async function attachProofToCase(file: File, bankReference: string) {
    if (!caseDetail.case) return;
    setCaseDetail((p) => ({ ...p, actionLoading: true }));
    const url = await uploadCaseProof(file);
    if (!url) {
      setCaseDetail((p) => ({ ...p, actionLoading: false }));
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/finance/cases/${caseDetail.case.id}/attach-proof`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ payout_proof_url: url, bank_reference: bankReference || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alertDialog({
          title: "تعذّر رفع الإثبات",
          message: data?.error || "غير متاح",
          variant: "error",
        });
        setCaseDetail((p) => ({ ...p, actionLoading: false }));
        return;
      }
      await Promise.all([
        openCaseDetail(caseDetail.case.id),
        fetchCases(),
        fetchCaseCounters(),
      ]);
    } catch {
      setCaseDetail((p) => ({ ...p, actionLoading: false }));
    }
  }

  // Inbox actions
  async function openInboxItem(id: number) {
    setInboxItemModal({ open: true, loading: true, ticket: null, replies: [], replyBody: "", sending: false });
    try {
      const res = await fetch(`${API_URL}/api/finance/inbox/${id}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setInboxItemModal({
          open: true,
          loading: false,
          ticket: data.ticket as FinanceInboxTicket,
          replies: (data.replies || []) as any[],
          replyBody: "",
          sending: false,
        });
      } else {
        setInboxItemModal((p) => ({ ...p, loading: false }));
      }
    } catch {
      setInboxItemModal((p) => ({ ...p, loading: false }));
    }
  }

  async function sendInboxReply() {
    const t = inboxItemModal.ticket;
    if (!t || !inboxItemModal.replyBody.trim()) return;
    setInboxItemModal((p) => ({ ...p, sending: true }));
    try {
      const res = await fetch(`${API_URL}/api/finance/inbox/${t.id}/reply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ message: inboxItemModal.replyBody.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setInboxItemModal((p) => ({
          ...p,
          replies: data.reply ? [...p.replies, data.reply] : p.replies,
          replyBody: "",
          sending: false,
        }));
      } else {
        setInboxItemModal((p) => ({ ...p, sending: false }));
      }
    } catch {
      setInboxItemModal((p) => ({ ...p, sending: false }));
    }
  }

  async function resolveInboxItem() {
    const t = inboxItemModal.ticket;
    if (!t) return;
    const note = await promptDialog({
      title: "إغلاق الاستفسار في صندوق المالية",
      message: `سيُغلق ${t.ticket_number} بحالة "تم الرد"، ويُسمح للعميل بإعادة فتحه خلال 7 أيام فقط.`,
      label: "ملاحظة داخلية (اختياري)",
      placeholder: "مثال: تم الرد على استفسار الفاتورة.",
      confirmText: "تأكيد الإغلاق",
      cancelText: "تراجع",
      variant: "info",
    });
    if (note === null) return;
    const res = await fetch(`${API_URL}/api/finance/inbox/${t.id}/resolve`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ note: (note || "").trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      await alertDialog({ title: "تعذّر الإغلاق", message: data?.error || "—", variant: "error" });
      return;
    }
    await alertDialog({
      title: "تم الإغلاق",
      message: "تم الرد على العميل وأُغلقت التذكرة. مهلة إعادة الفتح: 7 أيام.",
      variant: "success",
    });
    setInboxItemModal({ open: false, loading: false, ticket: null, replies: [], replyBody: "", sending: false });
    await Promise.all([fetchFinanceInbox(), fetchCaseCounters()]);
  }

  async function returnInboxItemToSupport() {
    const t = inboxItemModal.ticket;
    if (!t) return;
    const note = await promptDialog({
      title: "إعادة التذكرة إلى الدعم",
      message: "هذا الإجراء يُعيد التذكرة لقائمة الدعم. اكتب سبباً مختصراً.",
      label: "السبب",
      placeholder: "مثال: هذه ليست مالية — يجب أن يعالجها الدعم.",
      confirmText: "إعادة للدعم",
      cancelText: "تراجع",
      variant: "warning",
    });
    if (note === null) return;
    const res = await fetch(`${API_URL}/api/finance/inbox/${t.id}/return-to-support`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ note: (note || "").trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      await alertDialog({ title: "تعذّر الإرجاع", message: data?.error || "—", variant: "error" });
      return;
    }
    setInboxItemModal({ open: false, loading: false, ticket: null, replies: [], replyBody: "", sending: false });
    await Promise.all([fetchFinanceInbox(), fetchCaseCounters()]);
  }

  function openConvertModal(t: FinanceInboxTicket) {
    const snap = t.refund_bank_details_snapshot || {};
    setConvertModal({
      open: true,
      ticket: t,
      amount: "",
      bankName: (snap.bank_name || t.user_bank_name || "").toString(),
      iban: (snap.bank_account_iban || t.user_bank_iban || "").toString(),
      holder: (snap.account_holder_name || t.user_account_holder || "").toString(),
      loading: false,
    });
  }

  async function submitConvertToCase() {
    const t = convertModal.ticket;
    if (!t) return;
    setConvertModal((p) => ({ ...p, loading: true }));
    const body: any = {};
    if (convertModal.amount.trim()) body.amount = parseFloat(convertModal.amount.trim());
    if (convertModal.bankName || convertModal.iban || convertModal.holder) {
      body.bank = {
        bank_name: convertModal.bankName.trim(),
        bank_account_iban: convertModal.iban.trim(),
        account_holder_name: convertModal.holder.trim(),
      };
    }
    try {
      const res = await fetch(`${API_URL}/api/finance/inbox/${t.id}/convert-to-case`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await alertDialog({
          title: "تعذّر التحويل لقضية استرداد",
          message: data?.error || "—",
          variant: "error",
        });
        setConvertModal((p) => ({ ...p, loading: false }));
        return;
      }
      setConvertModal({ open: false, ticket: null, amount: "", bankName: "", iban: "", holder: "", loading: false });
      setInboxItemModal({ open: false, loading: false, ticket: null, replies: [], replyBody: "", sending: false });
      await Promise.all([fetchFinanceInbox(), fetchCases(), fetchCaseCounters()]);
      setActiveTab("cases");
      if (data?.refund?.id) {
        void openCaseDetail(data.refund.id);
      }
    } catch {
      setConvertModal((p) => ({ ...p, loading: false }));
    }
  }

  async function fetchWithdrawalRequests() {
    try {
      const status = withdrawalFilter === "all" ? "all" : withdrawalFilter;
      const res = await fetch(`/api/ambassador/admin/financial-requests?status=${status}`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setWithdrawalRequests(data.requests || []);
      }
    } catch (err) {
      console.error("Error fetching withdrawal requests:", err);
    }
  }

  useEffect(() => {
    fetchWithdrawalRequests();
  }, [withdrawalFilter]);

  function openWithdrawalModal(request: any, action: "approve" | "reject" | "complete" | "convert") {
    setWithdrawalModal({
      isOpen: true,
      request,
      action,
      notes: "",
      bankReference: "",
      selectedPlanId: null,
      loading: false
    });
  }

  async function handleWithdrawalAction() {
    if (!withdrawalModal.request) return;
    
    const { request, action, notes, bankReference, selectedPlanId } = withdrawalModal;
    
    if (action === "reject" && !notes.trim()) {
      setSuccessModal({ isOpen: true, message: '❌ يجب إدخال سبب الرفض', type: 'error' });
      return;
    }
    
    if (action === "complete" && !bankReference.trim()) {
      setSuccessModal({ isOpen: true, message: '❌ يجب إدخال رقم المرجع', type: 'error' });
      return;
    }
    
    if (action === "convert" && !selectedPlanId) {
      setSuccessModal({ isOpen: true, message: '❌ يجب اختيار الباقة', type: 'error' });
      return;
    }
    
    setWithdrawalModal(prev => ({ ...prev, loading: true }));
    
    try {
      let endpoint = '';
      let body: any = {};
      
      switch (action) {
        case "approve":
          endpoint = `/api/ambassador/admin/financial-requests/${request.id}/approve`;
          body = { notes };
          break;
        case "reject":
          endpoint = `/api/ambassador/admin/financial-requests/${request.id}/reject`;
          body = { notes };
          break;
        case "complete":
          endpoint = `/api/ambassador/admin/financial-requests/${request.id}/complete`;
          body = { payment_reference: bankReference, notes };
          break;
        case "convert":
          endpoint = `/api/ambassador/admin/financial-requests/${request.id}/convert-to-subscription`;
          body = { plan_id: selectedPlanId, notes };
          break;
      }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        const messages: Record<string, string> = {
          approve: '✅ تمت الموافقة بنجاح - سيتم إشعار العميل',
          reject: '❌ تم رفض الطلب - سيتم إشعار العميل',
          complete: '🎉 تم إتمام التحويل بنجاح',
          convert: '🎁 تم تحويل الرصيد لاشتراك بنجاح'
        };
        setSuccessModal({ isOpen: true, message: messages[action], type: 'success' });
        setWithdrawalModal({ isOpen: false, request: null, action: "approve", notes: "", bankReference: "", selectedPlanId: null, loading: false });
        await fetchWithdrawalRequests();
        await fetchStats();
      } else {
        const error = await res.json().catch(() => ({}));
        setSuccessModal({ isOpen: true, message: `❌ ${error.error || 'حدث خطأ'}`, type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setSuccessModal({ isOpen: true, message: '❌ حدث خطأ في الاتصال', type: 'error' });
    }
    
    setWithdrawalModal(prev => ({ ...prev, loading: false }));
  }

  function getWithdrawalStatusBadge(status: string) {
    const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
      pending: { label: 'معلق', color: 'bg-gray-100 text-gray-700 border-gray-300', icon: '⏳' },
      finance_review: { label: 'في انتظار المالية', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: '💰' },
      in_progress: { label: 'قيد التنفيذ', color: 'bg-amber-100 text-amber-700 border-amber-300', icon: '⚡' },
      completed: { label: 'مكتمل', color: 'bg-green-100 text-green-700 border-green-300', icon: '✅' },
      rejected: { label: 'مرفوض', color: 'bg-red-100 text-red-700 border-red-300', icon: '❌' },
      converted_to_subscription: { label: 'تحويل لاشتراك', color: 'bg-purple-100 text-purple-700 border-purple-300', icon: '🎁' }
    };
    const config = statusConfig[status] || statusConfig.pending;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.color} border`}>
        {config.icon} {config.label}
      </span>
    );
  }

  async function fetchAllRefunds() {
    try {
      const res = await fetch(`${API_URL}/api/finance/refunds`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAllRefunds(data.refunds || []);
      }
    } catch (err) {
      console.error("Error fetching all refunds:", err);
    }
  }

  async function fetchPayments() {
    try {
      const res = await fetch(`${API_URL}/api/finance/payments`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
      }
    } catch (err) {
      console.error("Error fetching payments:", err);
    }
  }

  async function fetchInvoices() {
    try {
      const res = await fetch(`${API_URL}/api/finance/invoices`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch (err) {
      console.error("Error fetching invoices:", err);
    }
  }

  async function fetchPaymentStats() {
    try {
      const res = await fetch(`${API_URL}/api/finance/payment-stats`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPaymentStats(data);
      }
    } catch (err) {
      console.error("Error fetching payment stats:", err);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch(`${API_URL}/api/finance/stats`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSubscribers(status?: string) {
    try {
      const url = status && status !== "all" 
        ? `/api/finance/subscribers?status=${status}` 
        : "/api/finance/subscribers";
      const res = await fetch(url, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSubscribers(data.subscribers);
      }
    } catch (err) {
      console.error("Error fetching subscribers:", err);
    }
  }

  async function fetchRefunds(status?: string) {
    try {
      const url = status ? `/api/finance/refunds?status=${status}` : "/api/finance/refunds";
      const res = await fetch(url, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRefunds(data.refunds);
      }
    } catch (err) {
      console.error("Error fetching refunds:", err);
    }
  }

  function openSuspendModal(subscriber: Subscriber) {
    setSuspendModal({ isOpen: true, subscriber, reason: "", loading: false });
  }

  async function confirmSuspend() {
    if (!suspendModal.subscriber || !suspendModal.reason.trim()) return;
    
    setSuspendModal(prev => ({ ...prev, loading: true }));
    
    try {
      const res = await fetch(`/api/finance/subscribers/${suspendModal.subscriber.id}/suspend`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: suspendModal.reason }),
      });
      
      setSuspendModal({ isOpen: false, subscriber: null, reason: "", loading: false });
      
      if (res.ok) {
        setSuccessModal({ isOpen: true, message: "تم إيقاف الاشتراك بنجاح وتم إشعار العميل", type: "success" });
        fetchSubscribers(subscriberFilter);
        fetchStats();
      } else {
        const error = await res.json();
        setSuccessModal({ isOpen: true, message: error.error || "حدث خطأ في إيقاف الاشتراك", type: "error" });
      }
    } catch (err) {
      console.error("Error suspending:", err);
      setSuspendModal({ isOpen: false, subscriber: null, reason: "", loading: false });
      setSuccessModal({ isOpen: true, message: "حدث خطأ في الاتصال", type: "error" });
    }
  }

  function openActivateModal(subscriber: Subscriber) {
    setActivateModal({ isOpen: true, subscriber, reason: "", loading: false });
  }

  async function confirmActivate() {
    if (!activateModal.subscriber || !activateModal.reason.trim()) return;
    
    setActivateModal(prev => ({ ...prev, loading: true }));
    
    try {
      const res = await fetch(`/api/finance/subscribers/${activateModal.subscriber.id}/activate`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: activateModal.reason }),
      });
      
      setActivateModal({ isOpen: false, subscriber: null, reason: "", loading: false });
      
      if (res.ok) {
        setSuccessModal({ isOpen: true, message: "تم إعادة تفعيل الاشتراك بنجاح وتم إشعار العميل", type: "success" });
        fetchSubscribers(subscriberFilter);
        fetchStats();
      } else {
        setSuccessModal({ isOpen: true, message: "حدث خطأ في تفعيل الاشتراك", type: "error" });
      }
    } catch (err) {
      console.error("Error activating:", err);
      setActivateModal({ isOpen: false, subscriber: null, reason: "", loading: false });
      setSuccessModal({ isOpen: true, message: "حدث خطأ في الاتصال", type: "error" });
    }
  }

  // Smart refund suggestion — fetched from backend when an approve
  // modal opens for a refund that has an invoice_id. Returns
  // pro-rated calculation: days used vs remaining + 3 strategy
  // options + a recommended amount. The accountant clicks to apply
  // one to the amount field; the workflow stays manual.
  interface RefundSuggestion {
    invoice: { id: number; invoice_number: string; total: number; currency: string; plan_name?: string };
    subscription: {
      duration_days: number; days_used: number; days_remaining: number; usage_percent: number;
      started_at: string | null; expires_at: string | null;
    };
    options: {
      full_refund: { amount: number; label: string; rationale: string };
      prorated:    { amount: number; label: string; rationale: string };
      no_refund:   { amount: number; label: string; rationale: string };
    };
    recommendation: { strategy: string; amount: number; rationale: string };
  }
  const [suggestion, setSuggestion] = useState<RefundSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  function openReviewModal(refund: Refund, action: "approve" | "reject") {
    setReviewModal({ isOpen: true, refund, action, note: "", loading: false, subscriptionAction: "none", cancelQuota: false });
    setSuggestion(null);
    if (action === "approve" && refund.invoice_id) {
      setSuggestionLoading(true);
      fetch(`${API_URL}/api/finance/refunds/suggestion?invoice_id=${refund.invoice_id}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setSuggestion(d); })
        .catch(() => { /* silent — suggestion is optional */ })
        .finally(() => setSuggestionLoading(false));
    }
  }

  async function submitReview() {
    if (!reviewModal.refund) return;
    
    setReviewModal(prev => ({ ...prev, loading: true }));
    
    try {
      const bodyData: any = { decision_note: reviewModal.note };
      
      // Add subscription options only for approve action
      if (reviewModal.action === "approve") {
        bodyData.subscription_action = reviewModal.subscriptionAction;
        bodyData.cancel_quota = reviewModal.cancelQuota;
      }
      
      const res = await fetch(`/api/finance/refunds/${reviewModal.refund.id}/${reviewModal.action}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
      
      setReviewModal({ isOpen: false, refund: null, action: "approve", note: "", loading: false, subscriptionAction: "none", cancelQuota: false });
      
      if (res.ok) {
        let message = reviewModal.action === "approve" ? "تم الموافقة على طلب الاسترداد" : "تم رفض طلب الاسترداد";
        if (reviewModal.action === "approve") {
          if (reviewModal.subscriptionAction === "suspend") {
            message += " وتم إيقاف الاشتراك";
          } else if (reviewModal.subscriptionAction === "cancel") {
            message += " وتم إلغاء الاشتراك";
          }
          if (reviewModal.cancelQuota) {
            message += " وتم إلغاء الحصص";
          }
        }
        setSuccessModal({ 
          isOpen: true, 
          message, 
          type: "success" 
        });
        fetchRefunds(refundFilter);
        fetchAllRefunds();
        fetchStats();
      } else {
        const error = await res.json();
        setSuccessModal({ isOpen: true, message: error.error || "حدث خطأ", type: "error" });
      }
    } catch (err) {
      console.error("Error processing refund:", err);
      setReviewModal({ isOpen: false, refund: null, action: "approve", note: "", loading: false, subscriptionAction: "none", cancelQuota: false });
      setSuccessModal({ isOpen: true, message: "حدث خطأ في الاتصال", type: "error" });
    }
  }

  function openPayoutModal(refund: Refund) {
    setPayoutModal({
      isOpen: true, refund,
      bankReference: "", payoutProofUrl: "",
      uploadingProof: false, loading: false,
    });
  }

  // Upload the bank transfer screenshot. Uses the platform's generic
  // upload route (/api/uploads or /api/payments/uploads/payout-proof
  // depending on env); we try the dedicated endpoint first and fall
  // back to the generic one so this works even if backend deploy lags.
  async function uploadPayoutProof(file: File) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      await alertDialog({
        title: "حجم الملف كبير",
        message: "يجب ألا يتجاوز حجم صورة الإثبات 8 ميجابايت.",
        variant: "error",
      });
      return;
    }
    setPayoutModal(prev => ({ ...prev, uploadingProof: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      let url = "";
      let res = await fetch(`${API_URL}/api/uploads`, {
        method: "POST",
        credentials: "include",
        headers: getAuthHeaders(),
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        url = data?.url || data?.fileUrl || data?.path || "";
      }
      if (!url) {
        // Last-ditch fallback: convert to a data URL so the proof at least
        // gets persisted alongside the refund. Backend accepts any string.
        url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(file);
        });
      }
      setPayoutModal(prev => ({ ...prev, payoutProofUrl: url, uploadingProof: false }));
    } catch (err) {
      setPayoutModal(prev => ({ ...prev, uploadingProof: false }));
      await alertDialog({
        title: "فشل رفع الصورة",
        message: "تعذّر رفع صورة إثبات التحويل. حاول مرة أخرى.",
        variant: "error",
      });
    }
  }

  async function confirmPayout() {
    if (!payoutModal.refund) return;

    if (!payoutModal.payoutProofUrl.trim()) {
      await alertDialog({
        title: "إثبات التحويل البنكي مطلوب",
        message: "ارفع صورة لإيصال التحويل البنكي أولاً. لن ينتقل الطلب إلى \"تم الاسترداد\" قبل ذلك.",
        variant: "warning",
      });
      return;
    }

    setPayoutModal(prev => ({ ...prev, loading: true }));

    try {
      const res = await fetch(`/api/finance/refunds/${payoutModal.refund.id}/confirm-payout`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          bank_reference: payoutModal.bankReference,
          payout_proof_url: payoutModal.payoutProofUrl,
        }),
      });

      setPayoutModal({ isOpen: false, refund: null, bankReference: "", payoutProofUrl: "", uploadingProof: false, loading: false });

      if (res.ok) {
        setSuccessModal({ isOpen: true, message: "تم تأكيد التحويل البنكي ونقل الطلب إلى \"تم الاسترداد\"", type: "success" });
        fetchRefunds(refundFilter);
        fetchAllRefunds();
        fetchStats();
      } else {
        const error = await res.json();
        setSuccessModal({ isOpen: true, message: error.error || "حدث خطأ", type: "error" });
      }
    } catch (err) {
      console.error("Error confirming payout:", err);
      setPayoutModal({ isOpen: false, refund: null, bankReference: "", payoutProofUrl: "", uploadingProof: false, loading: false });
      setSuccessModal({ isOpen: true, message: "حدث خطأ في الاتصال", type: "error" });
    }
  }

  async function generateRefundInvoice(refundId: number) {
    try {
      const res = await fetch(`/api/finance/refunds/${refundId}/generate-invoice`, {
        method: "POST",
        credentials: "include",
      });
      
      if (res.ok) {
        const data = await res.json();
        setSuccessModal({ 
          isOpen: true, 
          message: `تم إنشاء فاتورة الاسترداد بنجاح. رقم الفاتورة: ${data.refund_invoice_number}`, 
          type: "success" 
        });
        fetchRefunds(refundFilter);
        fetchAllRefunds();
      } else {
        const error = await res.json();
        setSuccessModal({ isOpen: true, message: error.error || "حدث خطأ", type: "error" });
      }
    } catch (err) {
      console.error("Error generating refund invoice:", err);
      setSuccessModal({ isOpen: true, message: "حدث خطأ في الاتصال", type: "error" });
    }
  }

  function openRefundModal(invoice: typeof invoices[0]) {
    const subtotal = parseFloat(invoice.subtotal) || 0;
    const total = parseFloat(invoice.total) || 0;
    
    if (subtotal <= 0 && total <= 0) {
      setSuccessModal({ isOpen: true, message: "لا يمكن استرداد فاتورة بدون مبلغ", type: "error" });
      return;
    }
    
    setRefundModal({ isOpen: true, invoice, reason: "", loading: false });
  }

  async function submitRefundRequest() {
    if (!refundModal.invoice || !refundModal.reason.trim()) return;
    
    const invoice = refundModal.invoice;
    const subtotal = parseFloat(invoice.subtotal) || 0;
    const total = parseFloat(invoice.total) || 0;
    
    setRefundModal(prev => ({ ...prev, loading: true }));
    
    try {
      const res = await fetch(`${API_URL}/api/finance/refunds`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.id,
          user_id: invoice.user_id,
          amount: subtotal > 0 ? subtotal : total,
          reason: refundModal.reason,
        }),
      });
      
      setRefundModal({ isOpen: false, invoice: null, reason: "", loading: false });
      
      if (res.ok) {
        setSuccessModal({ isOpen: true, message: "تم تقديم طلب الاسترداد بنجاح", type: "success" });
        fetchRefunds(refundFilter);
        fetchStats();
        fetchInvoices();
      } else {
        const error = await res.json();
        setSuccessModal({ isOpen: true, message: error.error || "حدث خطأ", type: "error" });
      }
    } catch (err) {
      console.error("Error requesting refund:", err);
      setRefundModal({ isOpen: false, invoice: null, reason: "", loading: false });
      setSuccessModal({ isOpen: true, message: "حدث خطأ في الاتصال", type: "error" });
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  async function handleResetTestInvoices() {
    if (normalizeConfirmationPhrase(resetPhrase) !== RESET_INVOICES_PHRASE) {
      setSuccessModal({
        isOpen: true,
        message: "يجب كتابة العبارة المطلوبة حرفياً للتأكيد",
        type: "error",
      });
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/finance/reset-invoices`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = data as {
          error?: string;
          detail?: string;
          table?: string;
          constraint?: string;
          code?: string;
        };
        const parts = [
          d.error || "فشل تصفير الفواتير",
          d.code && `رمز: ${d.code}`,
          d.table && `جدول: ${d.table}`,
          d.constraint && `قيود: ${d.constraint}`,
          d.detail && `التفاصيل: ${d.detail}`,
        ].filter(Boolean);
        throw new Error(parts.join("\n"));
      }
      setResetInvoiceOpen(false);
      setResetPhrase("");
      const ok = data as {
        message?: string;
        invoices_truncated?: boolean;
        skipped?: Array<{ label: string; code: string; detail?: string }>;
      };
      const skippedList = Array.isArray(ok.skipped) ? ok.skipped : [];
      const baseMsg = ok.message || "تم حذف جميع الفواتير التجريبية وإعادة ضبط الترقيم";
      const skipSummary =
        skippedList.length > 0
          ? "\n\nتم تخطّي:\n" +
            skippedList
              .map((s) => `• ${s.label} [${s.code}]${s.detail ? ` — ${s.detail}` : ""}`)
              .join("\n")
          : "";
      setSuccessModal({
        isOpen: true,
        message: baseMsg + skipSummary,
        type:
          ok.invoices_truncated === false || skippedList.length > 0 ? "error" : "success",
      });
      await Promise.all([
        fetchInvoices(),
        fetchPaymentStats(),
        fetchStats(),
        fetchRefunds(refundFilter),
        fetchAllRefunds(),
      ]);
    } catch (e) {
      setSuccessModal({
        isOpen: true,
        message: e instanceof Error ? e.message : "حدث خطأ",
        type: "error",
      });
    } finally {
      setResetLoading(false);
    }
  }

  const financeTabs = useMemo(() => {
    const pendingCount = allRefunds.filter((r) => r.status === "pending").length;
    const awaitingPayoutCount = allRefunds.filter(
      (r) => r.status === "approved" && !r.payout_confirmed_at
    ).length;
    const withdrawalPendingCount = stats?.revenue?.pendingWithdrawalRequestsCount || 0;
    return [
      // Cases Board is the new primary workspace. Listed first so the
      // accountant lands here by default; legacy "الاستردادات" tab
      // stays as a compatibility layer (banner inside warns it's legacy).
      {
        id: "cases" as const,
        label: "قضايا الاسترداد",
        icon: Wallet,
        casesAwaitingBank: caseCounters.awaiting_bank_transfer,
        casesActive: caseCounters.cases_active_total,
      },
      { id: "messages" as const, label: "صندوق المالية", icon: MessageSquare, inboxCount: caseCounters.finance_inbox },
      { id: "overview" as const, label: "نظرة عامة", icon: TrendingUp },
      { id: "payments" as const, label: "المدفوعات", icon: CreditCard },
      { id: "invoices" as const, label: "الفواتير", icon: PiggyBank },
      { id: "subscribers" as const, label: "المشتركون", icon: Users },
      {
        id: "refunds" as const,
        label: "الاستردادات (قديم)",
        icon: Wallet,
        pendingCount,
        awaitingPayoutCount,
      },
      {
        id: "withdrawals" as const,
        label: "طلبات سحب السفراء",
        icon: DollarSign,
        withdrawalPending: withdrawalPendingCount,
      },
    ];
  }, [allRefunds, stats?.revenue?.pendingWithdrawalRequestsCount, caseCounters]);

  if (loading) {
    return (
      <div className="space-y-6 min-h-[60vh] max-w-7xl mx-auto" dir="rtl">
        <div className="flex flex-wrap justify-between gap-4 items-start">
          <div className="space-y-2 flex-1 min-w-[200px]">
            <div className="h-9 bg-slate-200/90 rounded-xl w-56 max-w-full animate-pulse" />
            <div className="h-4 bg-slate-100 rounded-lg w-80 max-w-full animate-pulse" />
          </div>
          <div className="flex gap-2 shrink-0">
            <div className="h-11 w-36 bg-slate-100 rounded-xl animate-pulse" />
            <div className="h-11 w-28 bg-slate-200/80 rounded-xl animate-pulse" />
          </div>
        </div>
        <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-12 min-w-[100px] bg-slate-100 rounded-lg animate-pulse shrink-0" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-36 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm animate-pulse"
            >
              <div className="h-3 bg-slate-100 rounded w-2/3 mb-4" />
              <div className="h-9 bg-slate-200/80 rounded-lg w-1/2" />
            </div>
          ))}
        </div>
        <div className="h-52 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">المالية والاشتراكات</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة المدفوعات والاشتراكات والاستردادات</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sessionRole === "super_admin" && (
            <button
              type="button"
              onClick={() => {
                setResetPhrase("");
                setResetInvoiceOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-300 ease-out border border-red-800 shadow-sm active:scale-[0.98]"
            >
              <Trash2 className="w-4 h-4" />
              تصفير الفواتير التجريبية
            </button>
          )}
          <button
            onClick={() => {
              fetchStats();
              fetchSubscribers();
              fetchRefunds();
              fetchAllRefunds();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl hover:bg-[#003d5c] transition-all duration-300 ease-out shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {financeTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            // On mobile the tab bar scrolls horizontally; the active
            // tab can disappear off-screen and leave the operator
            // unable to see which view they're on. After click, pull
            // the tab back into the centre. Inline-only nudge so we
            // don't yank the page.
            ref={(el) => {
              if (el && activeTab === tab.id && typeof window !== "undefined" && window.innerWidth < 768) {
                try { el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }
                catch { /* older browsers */ }
              }
            }}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`group flex items-center gap-2 px-4 py-3 border-b-2 transition-all duration-300 ease-out shrink-0 rounded-t-lg ${
              activeTab === tab.id
                ? "border-[#D4AF37] text-[#D4AF37] font-bold bg-[#D4AF37]/5"
                : "border-transparent text-gray-500 hover:text-[#002845] hover:bg-slate-50/90"
            }`}
          >
            <tab.icon className="w-4 h-4 transition-transform duration-300 ease-out group-hover:scale-110" />
            {tab.label}
            {tab.id === "cases" && tab.casesAwaitingBank > 0 && (
              <span className="unread-badge-breathe bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full min-w-[20px] text-center shadow-md mr-1" title="قضايا بانتظار تحويل بنكي">
                {tab.casesAwaitingBank}
              </span>
            )}
            {tab.id === "messages" && tab.inboxCount > 0 && (
              <span className="bg-[#D4AF37] text-[#002845] text-[10px] font-black px-2 py-0.5 rounded-full min-w-[20px] text-center mr-1">
                {tab.inboxCount}
              </span>
            )}
            {tab.id === "refunds" &&
              (tab.pendingCount > 0 || tab.awaitingPayoutCount > 0) && (
                <span className="flex items-center gap-1 mr-1">
                  {tab.pendingCount > 0 && (
                    <span className="unread-badge-breathe bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center shadow-md">
                      {tab.pendingCount}
                    </span>
                  )}
                  {tab.awaitingPayoutCount > 0 && (
                    <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {tab.awaitingPayoutCount}
                    </span>
                  )}
                </span>
              )}
            {tab.id === "withdrawals" && tab.withdrawalPending > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                {tab.withdrawalPending}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "overview" && stats && (
        <div className="space-y-6">
          {allRefunds.filter(r => r.status === 'approved' && !r.payout_confirmed_at).length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-amber-800">مهام معلقة - تحويلات بنكية</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    يوجد <span className="font-bold">{allRefunds.filter(r => r.status === 'approved' && !r.payout_confirmed_at).length}</span> طلب استرداد بانتظار التحويل البنكي
                  </p>
                  <button
                    onClick={() => { setActiveTab('refunds'); setRefundFilter('approved'); fetchRefunds('approved'); }}
                    className="mt-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg transition"
                  >
                    عرض الطلبات المعلقة
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              label="إجمالي المستخدمين"
              value={stats.users.total}
              color="blue"
            />
            <StatCard
              icon={UserCheck}
              label="المشتركون النشطون"
              value={stats.users.active}
              color="green"
              subtext={`${Math.round((stats.users.active / stats.users.total) * 100)}% من الإجمالي`}
            />
            <StatCard
              icon={Timer}
              label="منتهية الصلاحية"
              value={stats.users.expired}
              color="yellow"
            />
            <StatCard
              icon={UserX}
              label="موقوفون إدارياً"
              value={stats.users.suspended}
              color="red"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              icon={DollarSign}
              label="إجمالي الدخل"
              value={formatCurrency(stats.revenue.total)}
              color="gold"
              isLarge
            />
            <StatCard
              icon={TrendingUp}
              label="دخل الشهر الحالي"
              value={formatCurrency(stats.revenue.monthly)}
              color="green"
            />
            <StatCard
              icon={TrendingDown}
              label="إجمالي الاستردادات"
              value={formatCurrency(stats.revenue.refundsTotal)}
              color="red"
            />
            <StatCard
              icon={Clock}
              label="استردادات معلقة"
              value={stats.revenue.pendingRefundsCount}
              color="yellow"
              subtext={formatCurrency(stats.revenue.pendingRefunds)}
            />
            <StatCard
              icon={Wallet}
              label="طلبات سحب سفراء معلقة"
              value={stats.revenue.pendingWithdrawalRequestsCount || 0}
              color="yellow"
              subtext={formatCurrency(stats.revenue.pendingWithdrawalRequests || 0)}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-[#002845] mb-4">توزيع الباقات</h3>
              <div className="space-y-3">
                {stats.planDistribution.map((plan, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: plan.color }}
                    />
                    <span className="flex-1 text-sm">{plan.name_ar}</span>
                    <span className="font-bold text-[#002845]">{plan.subscribers}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-[#002845] mb-4">الاتجاه الشهري</h3>
              <div className="space-y-2">
                {stats.monthlyTrend.slice(0, 6).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">{item.month}</span>
                    <div className="flex gap-4">
                      <span className="text-[#002845]">{item.subscriptions} مدفوعات مكتملة</span>
                      <span className="font-bold text-[#D4AF37]">{formatCurrency(item.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "subscribers" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="بحث عن مشترك..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <div className="flex gap-2">
              {[
                { id: "all", label: "الكل" },
                { id: "active", label: "نشط" },
                { id: "expired", label: "منتهي" },
                { id: "suspended", label: "موقوف" },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => {
                    setSubscriberFilter(filter.id);
                    fetchSubscribers(filter.id);
                  }}
                  className={`px-4 py-2 rounded-xl text-sm transition ${
                    subscriberFilter === filter.id
                      ? "bg-[#002845] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right p-4 text-sm font-bold text-gray-600">المستخدم</th>
                  <th className="text-right p-4 text-sm font-bold text-gray-600">الباقة</th>
                  <th className="text-right p-4 text-sm font-bold text-gray-600">الحالة</th>
                  <th className="text-right p-4 text-sm font-bold text-gray-600">تاريخ الانتهاء</th>
                  <th className="text-right p-4 text-sm font-bold text-gray-600">المبلغ</th>
                  <th className="text-center p-4 text-sm font-bold text-gray-600">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {subscribers
                  .filter((s) =>
                    searchQuery
                      ? s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        s.email?.toLowerCase().includes(searchQuery.toLowerCase())
                      : true
                  )
                  .map((subscriber) => (
                    <tr key={subscriber.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-[#002845]">{subscriber.name || "بدون اسم"}</p>
                          <p className="text-xs text-gray-500">{subscriber.email}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className="px-3 py-1 rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: subscriber.plan_color || "#ccc" }}
                        >
                          {subscriber.plan_name || "بدون باقة"}
                        </span>
                      </td>
                      <td className="p-4">
                        <StatusBadge status={subscriber.subscription_status} expiresAt={subscriber.expires_at} />
                      </td>
                      <td className="p-4 text-sm text-gray-600">
                        {subscriber.expires_at
                          ? new Date(subscriber.expires_at).toLocaleDateString("ar-SA")
                          : "-"}
                      </td>
                      <td className="p-4 font-bold text-[#D4AF37]">
                        {formatCurrency(Number(subscriber.paid_amount) || Number(subscriber.plan_price) || 0)}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center gap-2">
                          {subscriber.subscription_status === "suspended" ? (
                            <button
                              onClick={() => openActivateModal(subscriber)}
                              className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"
                              title="إعادة التفعيل"
                            >
                              <PlayCircle className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => openSuspendModal(subscriber)}
                              className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                              title="إيقاف"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "cases" && (
        <div className="space-y-4" dir="rtl">
          {/* Bank action banner: appears when any case is awaiting the
              accountant's physical trip to the bank. Pulses when there's
              a case older than 24h. */}
          {caseCounters.awaiting_bank_transfer > 0 && (() => {
            const oldest = cases.find(c => c.status === "awaiting_bank_transfer");
            const hoursOld = oldest?.state_changed_at
              ? Math.floor((Date.now() - new Date(oldest.state_changed_at).getTime()) / 3600000)
              : 0;
            const urgent = hoursOld >= 24;
            return (
              <div className={`relative overflow-hidden rounded-2xl border-2 p-5 shadow-lg ${
                urgent
                  ? "border-rose-300 bg-gradient-to-l from-rose-50 via-white to-white"
                  : "border-[#D4AF37]/40 bg-gradient-to-l from-[#FFFCEE] via-white to-white"
              }`}>
                <div className={`absolute inset-y-0 right-0 w-1.5 ${urgent ? "bg-rose-500 animate-pulse" : "bg-[#D4AF37] animate-pulse"}`} />
                <div className="flex flex-wrap items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    urgent ? "bg-rose-100 text-rose-700" : "bg-[#D4AF37]/20 text-[#9A7D28]"
                  }`}>
                    <CreditCard className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <h3 className={`text-lg font-black ${urgent ? "text-rose-900" : "text-[#002845]"}`}>
                      🏦 {caseCounters.awaiting_bank_transfer} قضية بانتظار ذهابك للبنك
                    </h3>
                    <p className={`text-sm mt-0.5 ${urgent ? "text-rose-800" : "text-[#002845]/70"}`}>
                      {oldest && hoursOld > 0
                        ? `أقدم قضية: ${oldest.case_number || "#" + oldest.id} منذ ${hoursOld} ساعة`
                        : "اذهب إلى البنك ونفّذ التحويل، ثم ارفع الإيصال هنا."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("col-awaiting_bank_transfer");
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start", inline: "center" });
                    }}
                    className="px-4 py-2 rounded-xl bg-[#002845] text-white text-sm font-bold hover:bg-[#003d5c] transition"
                  >
                    افتح القائمة
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Header + filter */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-[#002845] flex items-center gap-2">
                <Wallet className="w-6 h-6 text-[#D4AF37]" />
                لوحة قضايا الاسترداد
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                مساحة العمل الأساسية للمالية. كل قضية لها حالة واضحة، مبلغ معتمد، وخط زمني.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(["active", "completed", "rejected", "all"] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setCaseBoardFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    caseBoardFilter === f
                      ? "bg-[#002845] text-white shadow"
                      : "bg-white text-[#002845]/70 border border-gray-200 hover:bg-slate-50"
                  }`}
                >
                  {f === "active" ? "نشطة" : f === "completed" ? "مكتملة" : f === "rejected" ? "مرفوضة" : "الكل"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { void fetchCases(caseBoardFilter); void fetchCaseCounters(); }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-[#002845] hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingCases ? "animate-spin" : ""}`} />
                تحديث
              </button>
            </div>
          </div>

          {/* Counters strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { k: "pending_review", label: "قيد المراجعة", v: caseCounters.pending_review, tone: "bg-slate-50 text-slate-800" },
              { k: "waiting_customer_info", label: "بانتظار العميل", v: caseCounters.waiting_customer_info, tone: "bg-amber-50 text-amber-900" },
              { k: "approved", label: "معتمد", v: caseCounters.approved, tone: "bg-sky-50 text-sky-900" },
              { k: "awaiting_bank_transfer", label: "بانتظار البنك", v: caseCounters.awaiting_bank_transfer, tone: "bg-rose-50 text-rose-900" },
              { k: "proof_uploaded", label: "إيصال مرفوع", v: caseCounters.proof_uploaded, tone: "bg-violet-50 text-violet-900" },
              { k: "completed", label: "مكتمل", v: caseCounters.completed, tone: "bg-emerald-50 text-emerald-900" },
            ].map(s => (
              <div key={s.k} className={`rounded-xl p-3 border border-white shadow-sm ${s.tone}`}>
                <div className="text-[10px] font-bold opacity-70">{s.label}</div>
                <div className="text-2xl font-black mt-0.5">{s.v}</div>
              </div>
            ))}
          </div>

          {/* Board */}
          {caseBoardFilter === "active" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              {ACTIVE_BOARD_COLUMNS.map((colState) => {
                const colCases = cases.filter(c => c.status === colState);
                return (
                  <div
                    key={colState}
                    id={`col-${colState}`}
                    className={`rounded-2xl border-2 p-3 min-h-[200px] ${CASE_STATE_TONE[colState]}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-black">{CASE_STATE_LABEL[colState]}</h4>
                      <span className="text-xs font-bold bg-white/80 px-2 py-0.5 rounded-full">
                        {colCases.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {colCases.length === 0 ? (
                        <p className="text-xs opacity-60 text-center py-4">لا توجد قضايا هنا</p>
                      ) : colCases.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => void openCaseDetail(c.id)}
                          className="w-full text-right bg-white rounded-xl p-3 hover:shadow-md transition border border-white/60"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[10px] text-gray-500">{c.case_number || `#${c.id}`}</span>
                            {c.due_at && colState === "awaiting_bank_transfer" && (() => {
                              const days = Math.ceil((new Date(c.due_at).getTime() - Date.now()) / 86400000);
                              return (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  days < 0 ? "bg-rose-100 text-rose-900"
                                  : days <= 1 ? "bg-amber-100 text-amber-900"
                                  : "bg-emerald-100 text-emerald-900"
                                }`}>
                                  {days < 0 ? `متأخر ${Math.abs(days)}ي` : `${days}ي متبقي`}
                                </span>
                              );
                            })()}
                          </div>
                          <p className="text-sm font-bold text-[#002845] truncate">{c.user_name || "—"}</p>
                          <p className="text-[11px] text-gray-500 truncate">{c.user_email || ""}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-base font-black text-[#D4AF37]">
                              {formatCurrency(Number(c.approved_refund_amount ?? c.estimated_refund_amount ?? c.amount))}
                            </span>
                            {colState === "awaiting_bank_transfer" && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-700">
                                <CreditCard className="w-3 h-3" /> اذهب للبنك
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {loadingCases ? (
                <div className="p-12 flex justify-center">
                  <RefreshCw className="w-10 h-10 animate-spin text-[#D4AF37]" />
                </div>
              ) : cases.length === 0 ? (
                <div className="p-12 text-center text-gray-500">لا توجد قضايا</div>
              ) : (
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 font-bold text-[#002845]">القضية</th>
                      <th className="px-4 py-3 font-bold text-[#002845]">العميل</th>
                      <th className="px-4 py-3 font-bold text-[#002845]">المبلغ</th>
                      <th className="px-4 py-3 font-bold text-[#002845]">الحالة</th>
                      <th className="px-4 py-3 font-bold text-[#002845]">آخر تغيير</th>
                      <th className="px-4 py-3 font-bold text-[#002845] w-32">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map(c => (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-mono text-xs">{c.case_number || `#${c.id}`}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#002845]">{c.user_name || "—"}</p>
                          <p className="text-[10px] text-gray-500">{c.user_email || ""}</p>
                        </td>
                        <td className="px-4 py-3 font-bold text-[#D4AF37]">
                          {formatCurrency(Number(c.approved_refund_amount ?? c.estimated_refund_amount ?? c.amount))}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold border ${CASE_STATE_TONE[c.status]}`}>
                            {CASE_STATE_LABEL[c.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[10px] text-gray-500">
                          {c.state_changed_at ? new Date(c.state_changed_at).toLocaleString("ar-SA") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void openCaseDetail(c.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#002845] text-white text-xs font-bold hover:bg-[#003d5c]"
                          >
                            <Eye className="w-3 h-3" />
                            عرض
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "refunds" && (
        <div className="space-y-4">
          {/* Legacy compatibility banner */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-black text-amber-900 text-sm">واجهة قديمة — للحفظ فقط</p>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                هذا التبويب هو نسخة قديمة من الاستردادات. استخدم تبويب <span className="font-bold">قضايا الاسترداد</span> كمسار رئيسي. هنا تبقى البيانات قابلة للقراءة فقط حتى نقل كل الاستردادات للنظام الجديد.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("cases")}
                className="mt-2 text-xs font-black text-amber-900 underline"
              >
                ← فتح لوحة قضايا الاسترداد
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            {(() => {
              const pendingCount = allRefunds.filter(r => r.status === 'pending').length;
              const awaitingPayoutCount = allRefunds.filter(r => r.status === 'approved' && !r.payout_confirmed_at).length;
              const completedCount = allRefunds.filter(r => r.status === 'completed').length;
              const rejectedCount = allRefunds.filter(r => r.status === 'rejected').length;
              
              return [
                { id: "pending", label: "قيد الانتظار", icon: Clock, badge: pendingCount, badgeColor: "bg-red-500" },
                { id: "approved", label: "تحت العمليات", icon: Wallet, badge: awaitingPayoutCount, badgeColor: "bg-yellow-500" },
                { id: "completed", label: "تم الاسترداد", icon: CheckCircle2, badge: completedCount, badgeColor: "bg-green-500" },
                { id: "rejected", label: "غير مقبولة", icon: XCircle, badge: rejectedCount, badgeColor: "bg-gray-400" },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => {
                    setRefundFilter(filter.id);
                    fetchRefunds(filter.id);
                  }}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition ${
                    refundFilter === filter.id
                      ? "bg-[#002845] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <filter.icon className="w-4 h-4" />
                  {filter.label}
                  {filter.badge > 0 && (
                    <span className={`absolute -top-2 -right-2 ${filter.badgeColor} text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center shadow-lg`}>
                      {filter.badge}
                    </span>
                  )}
                </button>
              ));
            })()}
          </div>

          <div className="grid gap-4">
            {refunds.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-gray-500">
                لا توجد طلبات استرداد
              </div>
            ) : (
              refunds.map((refund) => (
                <div
                  key={refund.id}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-[#002845]">{refund.user_name}</p>
                      <p className="text-sm text-gray-500">{refund.user_email}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {refund.invoice_number && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                            <FileText className="w-3 h-3" />
                            {refund.invoice_number}
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          الباقة: {refund.plan_name || "غير محدد"}
                        </span>
                      </div>
                      {refund.reason && (
                        <p className="text-sm mt-2 text-gray-600 bg-yellow-50 px-3 py-2 rounded-lg">
                          السبب: {refund.reason}
                        </p>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-2xl font-bold text-[#D4AF37]">
                        {formatCurrency(refund.amount)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(refund.created_at).toLocaleDateString("ar-SA")}
                      </p>
                    </div>
                  </div>
                  {refund.status === "pending" && (
                    <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => openReviewModal(refund, "approve")}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        موافقة
                      </button>
                      <button
                        onClick={() => openReviewModal(refund, "reject")}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600"
                      >
                        <XCircle className="w-4 h-4" />
                        رفض
                      </button>
                    </div>
                  )}
                  {refund.status === "approved" && !refund.payout_confirmed_at && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="bg-green-50 rounded-lg p-3 mb-3">
                        <p className="text-sm text-green-700 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          تمت الموافقة - في انتظار التحويل البنكي
                        </p>
                        {refund.decision_note && (
                          <p className="text-xs text-green-600 mt-1">ملاحظة: {refund.decision_note}</p>
                        )}
                      </div>
                      <button
                        onClick={() => openPayoutModal(refund)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600"
                      >
                        <CreditCard className="w-4 h-4" />
                        تأكيد التحويل البنكي
                      </button>
                    </div>
                  )}
                  {refund.status === "completed" && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="bg-blue-50 rounded-lg p-3 mb-3">
                        <p className="text-sm text-blue-700 flex items-center gap-2">
                          <CreditCard className="w-4 h-4" />
                          تم التحويل البنكي
                        </p>
                        {refund.bank_reference && (
                          <p className="text-xs text-blue-600 mt-1">رقم المرجع: {refund.bank_reference}</p>
                        )}
                        {refund.payout_confirmed_at && (
                          <p className="text-xs text-blue-500 mt-1">
                            تاريخ التحويل: {new Date(refund.payout_confirmed_at).toLocaleDateString("ar-SA")}
                          </p>
                        )}
                      </div>
                      {refund.refund_invoice_number ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => window.open(`/refund-invoices/${refund.id}`, '_blank')}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl hover:bg-[#003d66]"
                          >
                            <Eye className="w-4 h-4" />
                            عرض فاتورة الاسترداد
                          </button>
                          <span className="px-3 py-2 bg-green-100 text-green-700 rounded-xl text-sm flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            {refund.refund_invoice_number}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => generateRefundInvoice(refund.id)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#D4AF37] text-white rounded-xl hover:bg-[#c4a030]"
                        >
                          <FileText className="w-4 h-4" />
                          إنشاء فاتورة استرداد
                        </button>
                      )}
                    </div>
                  )}
                  {refund.status === "rejected" && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-sm text-red-700 flex items-center gap-2">
                          <XCircle className="w-4 h-4" />
                          تم رفض الطلب
                        </p>
                        {refund.decision_note && (
                          <p className="text-xs text-red-600 mt-1">السبب: {refund.decision_note}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-6">
          {paymentStats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                icon={CreditCard}
                label="إجمالي المدفوعات"
                value={`${paymentStats.total.amount.toFixed(2)} ريال`}
                color="gold"
                subtext={`${paymentStats.total.count} عملية`}
              />
              <StatCard
                icon={TrendingUp}
                label="مدفوعات اليوم"
                value={`${paymentStats.today.amount.toFixed(2)} ريال`}
                color="green"
                subtext={`${paymentStats.today.count} عملية`}
              />
              <StatCard
                icon={DollarSign}
                label="مدفوعات الشهر"
                value={`${paymentStats.month.amount.toFixed(2)} ريال`}
                color="blue"
                subtext={`${paymentStats.month.count} عملية`}
              />
              <StatCard
                icon={FileText}
                label="عدد الفواتير"
                value={paymentStats.invoicesCount}
                color="yellow"
              />
            </div>
          )}

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-[#002845] mb-4">سجل المدفوعات</h3>
            {payments.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">لا توجد مدفوعات بعد</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">رقم العملية</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">العميل</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">الباقة</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">المبلغ</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">الحالة</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {payment.transaction_id}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#002845]">{payment.user_name}</div>
                          <div className="text-xs text-gray-500">{payment.user_email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{payment.plan_name}</span>
                          {payment.previous_plan_name && (
                            <span className="text-xs text-gray-500 block">
                              ترقية من {payment.previous_plan_name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-[#D4AF37]">
                            {parseFloat(payment.amount).toFixed(2)} ريال
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            payment.status === 'completed' 
                              ? 'bg-green-100 text-green-600'
                              : payment.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-600'
                              : 'bg-red-100 text-red-600'
                          }`}>
                            {payment.status === 'completed' ? 'مكتمل' : payment.status === 'pending' ? 'معلق' : 'فشل'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(payment.created_at).toLocaleDateString('ar-SA')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "invoices" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-[#002845] mb-4">الفواتير الصادرة</h3>
          {invoices.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">لا توجد فواتير بعد</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">رقم الفاتورة</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">العميل</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">الباقة</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">الإجمالي</th>
                    <th className="px-4 py-3 text-right text-sm font-bold text-gray-600">التاريخ</th>
                    <th className="px-4 py-3 text-center text-sm font-bold text-gray-600">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm font-bold text-[#002845]">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#002845]">{invoice.user_name}</div>
                        <div className="text-xs text-gray-500">{invoice.user_email}</div>
                      </td>
                      <td className="px-4 py-3 font-medium">{invoice.plan_name}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-[#D4AF37]">
                          {parseFloat(invoice.total).toFixed(2)} ريال
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(invoice.issued_at).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => window.open(`/invoices/${invoice.id}`, '_blank')}
                            className="p-2 rounded-lg bg-[#002845] text-white hover:bg-[#003d66] transition-colors"
                            title="عرض الفاتورة"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openRefundModal(invoice)}
                            className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                            title="طلب استرداد"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "withdrawals" && (
        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#002845]">طلبات سحب السفراء</h2>
                <p className="text-sm text-gray-500 mt-1">إدارة طلبات السحب المالية للسفراء</p>
              </div>
              <div className="flex items-center gap-2">
                {(["finance_review", "in_progress", "completed", "rejected", "all"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setWithdrawalFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      withdrawalFilter === filter
                        ? "bg-[#002845] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {filter === "finance_review" && "💰 بانتظار المالية"}
                    {filter === "in_progress" && "⚡ قيد التنفيذ"}
                    {filter === "completed" && "✅ مكتمل"}
                    {filter === "rejected" && "❌ مرفوض"}
                    {filter === "all" && "📋 الكل"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {withdrawalRequests.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <Wallet className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">لا توجد طلبات سحب بهذه الحالة</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {withdrawalRequests.map((request) => (
                <div key={request.id} className="p-5 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold shadow-lg">
                        ${((request.amount_cents || 0) / 100).toFixed(0)}
                      </div>
                      <div>
                        <p className="font-bold text-[#002845] text-lg">{request.user_name || 'مستخدم'}</p>
                        <p className="text-sm text-gray-500">{request.user_email}</p>
                        <div className="flex items-center gap-3 mt-2">
                          {getWithdrawalStatusBadge(request.status)}
                          <span className="text-xs text-gray-400">
                            {new Date(request.created_at).toLocaleDateString('ar-SA', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        {request.finance_notes && (
                          <p className="text-sm text-gray-600 mt-2 bg-gray-50 px-3 py-2 rounded-lg">
                            📝 {request.finance_notes}
                          </p>
                        )}
                        {request.payment_reference && (
                          <p className="text-sm text-green-600 mt-2">
                            🧾 رقم المرجع: {request.payment_reference}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      {request.status === 'finance_review' && (
                        <>
                          <button 
                            onClick={() => openWithdrawalModal(request, 'approve')} 
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg transition font-medium flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            موافقة
                          </button>
                          <button 
                            onClick={() => openWithdrawalModal(request, 'reject')} 
                            className="px-4 py-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition font-medium flex items-center gap-2"
                          >
                            <XCircle className="w-4 h-4" />
                            رفض
                          </button>
                          <button 
                            onClick={() => openWithdrawalModal(request, 'convert')} 
                            className="px-4 py-2 rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 transition font-medium flex items-center gap-2"
                          >
                            <CreditCard className="w-4 h-4" />
                            تحويل لاشتراك
                          </button>
                        </>
                      )}
                      {request.status === 'in_progress' && (
                        <>
                          <button 
                            onClick={() => openWithdrawalModal(request, 'complete')} 
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:shadow-lg transition font-medium flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            تأكيد التحويل
                          </button>
                          <button 
                            onClick={() => openWithdrawalModal(request, 'convert')} 
                            className="px-4 py-2 rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 transition font-medium flex items-center gap-2"
                          >
                            <CreditCard className="w-4 h-4" />
                            تحويل لاشتراك
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "messages" && (
        <div className="space-y-4" dir="rtl">
          <div className="rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-l from-[#FFFCEE] via-white to-white p-5 shadow-[0_8px_24px_-12px_rgba(212,175,55,0.35)]">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#D4AF37]/15 text-[#9A7D28]">
                <Wallet className="w-5 h-5" />
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-black text-[#002845]">طلبات الاسترداد</h3>
                <p className="text-sm text-[#002845]/70 mt-1 leading-relaxed">
                  طلبات استرداد محالة من الدعم بعد مراجعتها مع العميل. القرار هنا: اعتماد، رفض، أو طلب معلومات من الدعم.
                </p>
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2 leading-relaxed">
                  ⚠️ ملاحظة الدعم أسفل كل بطاقة هي السياق الكامل. لا يمكنك فتح محادثة الدعم — هذا متعمد.
                </p>
              </div>
              <div className="text-xs font-black text-[#9A7D28] bg-white border border-[#D4AF37]/30 rounded-xl px-3 py-2">
                {refundRequests.length} طلب
              </div>
            </div>
          </div>
          {loadingRefundRequests && refundRequests.length === 0 ? (
            <div className="p-12 flex justify-center bg-white rounded-2xl border border-gray-100">
              <RefreshCw className="w-10 h-10 animate-spin text-[#D4AF37]" />
            </div>
          ) : refundRequests.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-gray-100">
              <Wallet className="w-14 h-14 text-gray-200 mx-auto mb-3" />
              <p className="font-bold text-[#002845]">لا توجد طلبات استرداد قيد المراجعة</p>
              <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                سيظهر هنا فقط ما يحيله الدعم بعد فحصه مع العميل وكتابة ملخّص كافٍ.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {refundRequests.map((r) => (
                <article
                  key={r.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] text-gray-500">{r.case_number || `#${r.id}`}</p>
                      <h4 className="font-black text-[#002845] truncate">{r.user_name || "—"}</h4>
                      <p className="text-xs text-gray-500 truncate">{r.user_email || ""}</p>
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-xs text-gray-500">المبلغ المطلوب</p>
                      <p className="text-2xl font-black text-[#D4AF37]">
                        {formatCurrency(Number(r.estimated_refund_amount ?? r.amount ?? 0))}
                      </p>
                    </div>
                  </div>
                  {r.original_invoice_number && (
                    <p className="text-[11px] text-gray-500">
                      الفاتورة الأصلية: <span className="font-mono text-[#002845]">{r.original_invoice_number}</span>
                    </p>
                  )}
                  {r.reason && (
                    <p className="text-xs text-[#002845]/80">
                      <span className="font-bold">السبب: </span>{r.reason}
                    </p>
                  )}
                  <div className="rounded-xl border border-[#D4AF37]/30 bg-[#FFFCEE]/60 p-3">
                    <p className="text-[10px] font-black text-[#9A7D28] mb-1">ملاحظة الدعم</p>
                    <p className="text-xs text-[#002845] whitespace-pre-wrap leading-relaxed">
                      {r.support_note || "—"}
                    </p>
                  </div>
                  {r.support_followup_required && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900">
                      ⏳ بانتظار تحديث من الدعم
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => openRefundAction(r, "approve")}
                      disabled={r.status !== "pending_review"}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ✅ اعتماد
                    </button>
                    <button
                      type="button"
                      onClick={() => openRefundAction(r, "reject")}
                      disabled={r.status !== "pending_review"}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ❌ رفض
                    </button>
                    <button
                      type="button"
                      onClick={() => openRefundAction(r, "request-info")}
                      disabled={r.status !== "pending_review" || r.support_followup_required}
                      title={r.status !== "pending_review" ? "متاح فقط في حالة قيد المراجعة" : ""}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-black hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ⏎ طلب معلومات من الدعم
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Refund action modal — approve/reject/request-info */}
      {refundActionModal.open && refundActionModal.request && (
        <div className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className={`h-1.5 ${
              refundActionModal.action === "approve" ? "bg-emerald-500"
              : refundActionModal.action === "reject" ? "bg-rose-500"
              : "bg-amber-500"
            }`} />
            <div className="px-5 py-4 border-b border-slate-100">
              <h4 className="font-black text-[#002845]">
                {refundActionModal.action === "approve" && "اعتماد طلب الاسترداد"}
                {refundActionModal.action === "reject" && "رفض طلب الاسترداد"}
                {refundActionModal.action === "request-info" && "طلب معلومات من الدعم"}
              </h4>
              <p className="text-xs text-gray-500 mt-1">
                {refundActionModal.request.case_number || `#${refundActionModal.request.id}`} · {refundActionModal.request.user_name}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {refundActionModal.action === "approve" && (
                <div>
                  <label className="block text-xs font-bold text-[#002845] mb-1">
                    المبلغ المعتمد (ر.س) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={refundActionModal.approvedAmount}
                    onChange={(e) => setRefundActionModal(p => ({ ...p, approvedAmount: e.target.value }))}
                    className="w-full border-2 border-slate-200 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm outline-none"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    يمكن تخفيض المبلغ المطلوب ({formatCurrency(Number(refundActionModal.request.estimated_refund_amount ?? 0))}) إلى مبلغ جزئي.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-[#002845] mb-1">
                  {refundActionModal.action === "approve" && "ملاحظة الاعتماد (اختياري)"}
                  {refundActionModal.action === "reject" && <>سبب الرفض <span className="text-rose-600">*</span></>}
                  {refundActionModal.action === "request-info" && <>ما تطلبه من الدعم <span className="text-rose-600">*</span></>}
                </label>
                <textarea
                  value={refundActionModal.note}
                  onChange={(e) => setRefundActionModal(p => ({ ...p, note: e.target.value }))}
                  rows={4}
                  placeholder={
                    refundActionModal.action === "approve" ? "" :
                    refundActionModal.action === "reject" ? "السبب سيُسجَّل في تاريخ القضية." :
                    "اشرح ما تحتاج من الدعم متابعته مع العميل (50 حرف على الأقل لطلب التحديث)."
                  }
                  className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-sm outline-none resize-y"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundActionModal({ open: false, request: null, action: null, approvedAmount: "", note: "", loading: false })}
                disabled={refundActionModal.loading}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-white"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void submitRefundAction()}
                disabled={refundActionModal.loading}
                className={`px-5 py-2 rounded-xl text-white text-sm font-black inline-flex items-center gap-2 ${
                  refundActionModal.action === "approve" ? "bg-emerald-600 hover:bg-emerald-700"
                  : refundActionModal.action === "reject" ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-amber-500 hover:bg-amber-600"
                } disabled:opacity-50`}
              >
                {refundActionModal.loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legacy queue tab — keep as compatibility-only block under
          the messages tab; reachable only if explicit older URL.
          Hidden so it doesn't render twice. */}
      {false && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-l from-[#FFFCEE] via-white to-white p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#D4AF37]/15 text-[#9A7D28]">
                <Headset className="w-5 h-5" />
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-black text-[#002845]">صندوق وصول المالية (قديم)</h3>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-500">
              يعرض المراسلات المُحوَّلة من الدعم فقط — رد الفريق على العميل يُرسل من خلال هذا الصندوق ويصل العميل في صفحة تذاكره.
            </div>
            <button
              type="button"
              onClick={() => {
                setLoadingFinanceQueue(true);
                void (async () => {
                  try {
                    const res = await fetch(`${API_URL}/api/__deprecated_finance_legacy__`, {
                      credentials: "include",
                      headers: getAuthHeaders(),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setFinanceQueueTickets((data.tickets || []).filter(isFinanceInboxTicket));
                    }
                  } finally {
                    setLoadingFinanceQueue(false);
                  }
                })();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-[#002845] hover:bg-slate-50 transition-all duration-300"
            >
              <RefreshCw className={`w-4 h-4 ${loadingFinanceQueue ? "animate-spin" : ""}`} />
              تحديث القائمة
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {loadingFinanceQueue && financeQueueTickets.length === 0 ? (
              <div className="p-12 flex justify-center">
                <RefreshCw className="w-10 h-10 animate-spin text-[#D4AF37]" />
              </div>
            ) : financeQueueTickets.length === 0 ? (
              <div className="p-12 text-center">
                <MessageSquare className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                <p className="font-bold text-[#002845]">صندوق المالية فارغ حالياً</p>
                <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                  لا توجد مراسلات محوّلة من الدعم بانتظار المالية. سيظهر هنا فقط ما يحوّله فريق الدعم بعد فحص شكوى أو طلب استرداد مع العميل.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right min-w-[640px]">
                  <thead className="bg-slate-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 font-bold text-[#002845]">التذكرة</th>
                      <th className="px-4 py-3 font-bold text-[#002845]">العميل</th>
                      <th className="px-4 py-3 font-bold text-[#002845]">الحالة</th>
                      <th className="px-4 py-3 font-bold text-[#002845]">آخر تحديث</th>
                      <th className="px-4 py-3 font-bold text-[#002845] w-72">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financeQueueTickets.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b border-gray-50 hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-gray-500">{t.ticket_number}</span>
                            {t.transferred_to_finance_at && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#D4AF37]/15 text-[#9A7D28] px-2 py-0.5 text-[10px] font-bold">
                                <Headset className="w-3 h-3" />
                                محوّل من الدعم
                              </span>
                            )}
                            {t.refund_id && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                                استرداد #{t.refund_id}
                              </span>
                            )}
                          </div>
                          <span className="font-medium text-[#002845]">{t.subject}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          <span className="block">{t.user_name || "—"}</span>
                          <span className="text-xs text-gray-400">{t.user_email || ""}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                              t.status === "closed"
                                ? "bg-slate-100 text-slate-700"
                                : t.status === "resolved"
                                  ? "bg-emerald-50 text-emerald-800"
                                  : "bg-amber-50 text-amber-900"
                            }`}
                          >
                            {financeTicketStatusLabel(t.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {t.updated_at
                            ? new Date(t.updated_at).toLocaleString("ar-SA")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void openFinanceTicketModal(t.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#002845] text-white text-xs font-bold hover:bg-[#003d5c] transition-all duration-300"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              عرض / رد
                            </button>
                            {!t.refund_id ? (
                              <button
                                type="button"
                                onClick={() => void convertTicketToRefund(t)}
                                title="إنشاء طلب استرداد مرتبط بهذه التذكرة"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] text-xs font-black hover:shadow-md transition-all duration-300"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                تحويل إلى عملية استرداد
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("refunds");
                                  setRefundFilter("approved");
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-all duration-300"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                فتح الاسترداد #{t.refund_id}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {financeTicketModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2 bg-slate-50">
              <div className="min-w-0">
                <h4 className="font-black text-[#002845] truncate">
                  {financeTicketModal.ticket?.subject
                    ? String(financeTicketModal.ticket.subject)
                    : "تذكرة مالية"}
                </h4>
                {financeTicketModal.ticket?.ticket_number != null && (
                  <p className="text-xs font-mono text-gray-500 mt-0.5">
                    {String(financeTicketModal.ticket.ticket_number)}
                  </p>
                )}
                {!financeTicketModal.loading && financeTicketModal.ticket?.status != null && (
                  <span className="inline-flex mt-2 rounded-full bg-slate-100 text-slate-800 px-2.5 py-0.5 text-xs font-bold">
                    {financeTicketStatusLabel(String(financeTicketModal.ticket.status))}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  setFinanceTicketModal({
                    open: false,
                    ticketId: null,
                    loading: false,
                    ticket: null,
                    replies: [],
                    replyBody: "",
                    sending: false,
                    statusUpdating: false,
                  })
                }
                className="p-2 rounded-lg hover:bg-gray-200 transition shrink-0"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
              {financeTicketModal.loading ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-[#D4AF37]" />
                </div>
              ) : (
                <>
                  {financeTicketModal.ticket?.description != null &&
                    String(financeTicketModal.ticket.description).trim() !== "" && (
                      <div className="rounded-xl bg-slate-50 p-3 text-sm border border-slate-100 mb-2">
                        <p className="text-xs font-bold text-gray-500 mb-1">وصف التذكرة</p>
                        <p className="text-gray-800 whitespace-pre-wrap">
                          {String(financeTicketModal.ticket.description)}
                        </p>
                      </div>
                    )}
                  {financeTicketModal.replies.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-4">لا ردود بعد من الفريق.</p>
                  ) : (
                    financeTicketModal.replies.map((r) => (
                      <div
                        key={String(r.id)}
                        className={`rounded-xl p-3 text-sm ${
                          r.sender_type === "admin"
                            ? "bg-[#D4AF37]/10 mr-2 border border-[#D4AF37]/20"
                            : "bg-slate-50 ml-2 border border-slate-100"
                        }`}
                      >
                        <div className="flex justify-between gap-2 text-xs text-gray-500 mb-1">
                          <span className="font-bold text-[#002845]">
                            {String(r.sender_name ?? (r.sender_type === "admin" ? "الفريق" : "العميل"))}
                          </span>
                          <span>
                            {r.created_at
                              ? new Date(String(r.created_at)).toLocaleString("ar-SA")
                              : ""}
                          </span>
                        </div>
                        <p className="text-gray-800 whitespace-pre-wrap">{String(r.message ?? "")}</p>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 bg-slate-50 space-y-3">
              <p className="text-xs font-bold text-[#002845]">إدارة الحالة</p>
              <div className="flex flex-wrap gap-2">
                {(["new", "in_progress", "resolved", "closed"] as const).map((st) => {
                  const current = String(financeTicketModal.ticket?.status ?? "");
                  const active = current === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={
                        financeTicketModal.loading ||
                        financeTicketModal.statusUpdating ||
                        active
                      }
                      onClick={() => void updateFinanceTicketStatus(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        active
                          ? "bg-[#002845] text-white cursor-default"
                          : "bg-white border border-slate-200 text-[#002845] hover:bg-slate-100 disabled:opacity-40"
                      }`}
                    >
                      {financeTicketStatusLabel(st)}
                    </button>
                  );
                })}
              </div>
              {financeTicketModal.statusUpdating && (
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  جاري تحديث الحالة…
                </p>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 bg-white space-y-2">
              <label className="text-xs font-bold text-gray-600">رد للعميل</label>
              <textarea
                value={financeTicketModal.replyBody}
                onChange={(e) =>
                  setFinanceTicketModal((prev) => ({ ...prev, replyBody: e.target.value }))
                }
                placeholder="اكتب ردك — سيصل للعميل ويظهر في تذكرته…"
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setFinanceTicketModal({
                      open: false,
                      ticketId: null,
                      loading: false,
                      ticket: null,
                      replies: [],
                      replyBody: "",
                      sending: false,
                      statusUpdating: false,
                    })
                  }
                  className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100"
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  disabled={
                    financeTicketModal.sending ||
                    !financeTicketModal.replyBody.trim() ||
                    financeTicketModal.loading ||
                    financeTicketModal.statusUpdating
                  }
                  onClick={() => void sendFinanceTicketReply()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#002845] text-white text-sm font-black hover:bg-[#003d5c] disabled:opacity-40 transition-all duration-300"
                >
                  {financeTicketModal.sending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  إرسال الرد
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {refundModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-l from-[#002845] to-[#003d66] p-6 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <RotateCcw className="w-6 h-6" />
                  طلب استرداد
                </h3>
                <button
                  onClick={() => setRefundModal({ isOpen: false, invoice: null, reason: "", loading: false })}
                  className="p-1 hover:bg-white/20 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {refundModal.invoice && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">الفاتورة:</span>
                    <span className="font-mono font-bold text-[#002845]">{refundModal.invoice.invoice_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">العميل:</span>
                    <span className="font-bold text-[#002845]">{refundModal.invoice.user_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">المبلغ:</span>
                    <span className="font-bold text-[#D4AF37]">
                      {parseFloat(refundModal.invoice.subtotal || refundModal.invoice.total).toFixed(2)} ر.س
                    </span>
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  سبب طلب الاسترداد <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={refundModal.reason}
                  onChange={(e) => setRefundModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="اكتب سبب الاسترداد هنا..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent resize-none"
                  rows={3}
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={submitRefundRequest}
                  disabled={!refundModal.reason.trim() || refundModal.loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#D4AF37] text-white rounded-xl hover:bg-[#B8960F] transition disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                >
                  {refundModal.loading ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                  تقديم الطلب
                </button>
                <button
                  onClick={() => setRefundModal({ isOpen: false, invoice: null, reason: "", loading: false })}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition font-bold"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reviewModal.isOpen && reviewModal.refund && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`p-6 ${reviewModal.action === "approve" ? "bg-green-50" : "bg-red-50"}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  reviewModal.action === "approve" ? "bg-green-100" : "bg-red-100"
                }`}>
                  {reviewModal.action === "approve" ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#002845]">
                    {reviewModal.action === "approve" ? "الموافقة على الاسترداد" : "رفض الاسترداد"}
                  </h3>
                  <p className="text-sm text-gray-500">{reviewModal.refund.user_name}</p>
                </div>
              </div>
              
              <div className="bg-white rounded-xl p-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">المبلغ المطلوب من العميل:</span>
                  <span className="font-bold text-[#D4AF37]">{formatCurrency(reviewModal.refund.amount)}</span>
                </div>
                {reviewModal.refund.reason && (
                  <div className="mt-2 text-sm">
                    <span className="text-gray-600">السبب:</span>
                    <p className="text-gray-800 mt-1">{reviewModal.refund.reason}</p>
                  </div>
                )}
              </div>

              {/* Smart refund suggestion — appears only on approve flow
                  when the refund has an invoice link. Shows the 3
                  strategies + a clear recommendation based on days
                  used vs remaining on the subscription. */}
              {reviewModal.action === "approve" && (suggestionLoading || suggestion) && (
                <div className="mb-4 rounded-2xl border-2 border-[#D4AF37]/40 bg-gradient-to-br from-[#FFFCEE] to-white p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center text-[#002845]">
                      🧮
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-extrabold text-[#002845]">اقتراح ذكي للاسترداد</div>
                      <div className="text-[11px] text-slate-500">محسوب من بيانات الفاتورة + استخدام الاشتراك</div>
                    </div>
                  </div>
                  {suggestionLoading || !suggestion ? (
                    <div className="text-center text-slate-400 py-3 text-sm">جاري الحساب…</div>
                  ) : (
                    <>
                      {/* Subscription usage bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                          <span>{suggestion.subscription.days_used} من {suggestion.subscription.duration_days} يوم مُستخدمة</span>
                          <span className="font-bold text-[#9A7D28]">{suggestion.subscription.days_remaining} يوم متبقي</span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-l from-[#D4AF37] to-[#B8860B] transition-all"
                            style={{ width: `${suggestion.subscription.usage_percent}%` }}
                          />
                        </div>
                      </div>
                      {/* Recommendation banner */}
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 mb-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-[12px] text-emerald-900">
                          <strong>التوصية:</strong> {suggestion.recommendation.rationale}
                        </div>
                        <div className="text-base font-extrabold text-emerald-700">
                          {formatCurrency(suggestion.recommendation.amount)}
                        </div>
                      </div>
                      {/* Three options as clickable chips */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {([
                          ["full_refund", suggestion.options.full_refund],
                          ["prorated",    suggestion.options.prorated],
                          ["no_refund",   suggestion.options.no_refund],
                        ] as const).map(([key, opt]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              if (!reviewModal.refund) return;
                              // Mutate the refund.amount locally so the
                              // accountant SEES what they're approving.
                              // (We don't have a separate "amount" field
                              // in the modal — we patch the refund obj.)
                              setReviewModal((prev) => prev.refund
                                ? { ...prev, refund: { ...prev.refund, amount: opt.amount } }
                                : prev);
                            }}
                            className="p-2.5 rounded-xl border border-slate-200 hover:border-[#D4AF37] hover:bg-[#FFFCEE] transition text-right group"
                          >
                            <div className="text-[10px] text-slate-500">{opt.label}</div>
                            <div className="text-base font-extrabold text-[#002845] mt-0.5">
                              {formatCurrency(opt.amount)}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{opt.rationale}</div>
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-3 text-center">
                        💡 اضغط أي خيار لاستخدامه — تقدر تعدّل المبلغ يدوياً بعدها لو أردت.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ملاحظة للعميل {reviewModal.action === "reject" ? "(مطلوب)" : "(اختياري)"}
                </label>
                <textarea
                  value={reviewModal.note}
                  onChange={(e) => setReviewModal(prev => ({ ...prev, note: e.target.value }))}
                  rows={3}
                  placeholder={reviewModal.action === "approve" ? "أي ملاحظات للعميل..." : "اكتب سبب الرفض..."}
                  className="w-full border-2 border-gray-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none resize-none"
                />
              </div>
              
              {reviewModal.action === "approve" && (
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
                  <h4 className="font-bold text-amber-800 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    إجراءات على الاشتراك
                  </h4>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">إجراء الاشتراك:</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewModal(prev => ({ ...prev, subscriptionAction: "none" }))}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                          reviewModal.subscriptionAction === "none" 
                            ? "bg-gray-700 text-white" 
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        لا شيء
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewModal(prev => ({ ...prev, subscriptionAction: "suspend" }))}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                          reviewModal.subscriptionAction === "suspend" 
                            ? "bg-amber-500 text-white" 
                            : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                        }`}
                      >
                        إيقاف مؤقت
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewModal(prev => ({ ...prev, subscriptionAction: "cancel" }))}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                          reviewModal.subscriptionAction === "cancel" 
                            ? "bg-red-500 text-white" 
                            : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                        }`}
                      >
                        إلغاء الاشتراك
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 pt-2 border-t border-amber-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reviewModal.cancelQuota}
                        onChange={(e) => setReviewModal(prev => ({ ...prev, cancelQuota: e.target.checked }))}
                        className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                      />
                      <span className="text-sm text-gray-700">إلغاء حصص الإعلانات (الباقات)</span>
                    </label>
                  </div>
                  
                  {(reviewModal.subscriptionAction !== "none" || reviewModal.cancelQuota) && (
                    <div className="text-xs text-amber-700 bg-amber-100 rounded-lg p-2 mt-2">
                      ⚠️ سيتم تطبيق هذه الإجراءات فوراً عند الموافقة
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4 flex gap-3">
              <button
                onClick={submitReview}
                disabled={reviewModal.loading || (reviewModal.action === "reject" && !reviewModal.note.trim())}
                className={`flex-1 py-3 text-white rounded-xl font-bold transition disabled:opacity-50 ${
                  reviewModal.action === "approve" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {reviewModal.loading ? "جاري المعالجة..." : (reviewModal.action === "approve" ? "موافقة" : "رفض")}
              </button>
              <button
                onClick={() => setReviewModal({ isOpen: false, refund: null, action: "approve", note: "", loading: false, subscriptionAction: "none", cancelQuota: false })}
                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition"
                disabled={reviewModal.loading}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {payoutModal.isOpen && payoutModal.refund && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="p-6 bg-blue-50 overflow-y-auto">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#002845]">تأكيد التحويل البنكي</h3>
                  <p className="text-sm text-gray-500">{payoutModal.refund.user_name}</p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">المبلغ المحول:</span>
                  <span className="font-bold text-[#D4AF37]">{formatCurrency(payoutModal.refund.amount)}</span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-gray-600">البريد الإلكتروني:</span>
                  <span className="text-gray-800">{payoutModal.refund.user_email}</span>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-bold text-[#002845] mb-2">
                  إثبات التحويل البنكي
                  <span className="text-red-500 mr-1">*</span>
                </label>
                <div className="text-[11px] text-gray-500 mb-2">
                  ارفع صورة (PNG / JPG) من إيصال التحويل من بنكك. لن يكتمل الاسترداد بدونها.
                </div>
                {!payoutModal.payoutProofUrl ? (
                  <label
                    className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-6 cursor-pointer transition ${
                      payoutModal.uploadingProof
                        ? "border-gray-200 bg-gray-50 cursor-wait"
                        : "border-[#D4AF37]/40 bg-[#FFFCEE] hover:bg-[#FFF7D6]"
                    }`}
                  >
                    {payoutModal.uploadingProof ? (
                      <>
                        <RefreshCw className="w-6 h-6 animate-spin text-[#D4AF37]" />
                        <span className="text-xs font-bold text-[#9A7D28]">جاري رفع الصورة…</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-6 h-6 text-[#9A7D28]" />
                        <span className="text-xs font-bold text-[#9A7D28]">اضغط لاختيار صورة إثبات التحويل</span>
                        <span className="text-[10px] text-gray-500">حتى 8 ميجابايت</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadPayoutProof(f);
                      }}
                      disabled={payoutModal.uploadingProof}
                    />
                  </label>
                ) : (
                  <div className="flex items-center gap-3 border-2 border-emerald-200 bg-emerald-50 rounded-xl p-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-emerald-800">تم رفع صورة الإثبات</p>
                      <a
                        href={payoutModal.payoutProofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-emerald-700 underline truncate block"
                      >
                        فتح الصورة في تبويب جديد
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPayoutModal(prev => ({ ...prev, payoutProofUrl: "" }))
                      }
                      className="text-emerald-700 hover:text-emerald-900 p-1"
                      aria-label="إزالة"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">رقم المرجع البنكي (اختياري)</label>
                <input
                  type="text"
                  value={payoutModal.bankReference}
                  onChange={(e) => setPayoutModal(prev => ({ ...prev, bankReference: e.target.value }))}
                  placeholder="مثال: TRX-123456789"
                  className="w-full border-2 border-gray-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none"
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                <p className="text-xs text-yellow-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  يجب تنفيذ التحويل البنكي فعلياً قبل التأكيد. عند الضغط، يُبلَّغ العميل بإتمام الاسترداد (يصل خلال 4-6 أيام عمل بنكية).
                </p>
              </div>
            </div>

            <div className="p-4 flex gap-3 border-t border-gray-100 bg-white">
              <button
                onClick={confirmPayout}
                disabled={payoutModal.loading || !payoutModal.payoutProofUrl}
                title={!payoutModal.payoutProofUrl ? "ارفع صورة إثبات التحويل أولاً" : ""}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {payoutModal.loading ? "جاري التأكيد..." : "تأكيد التحويل وإتمام الاسترداد"}
              </button>
              <button
                onClick={() =>
                  setPayoutModal({ isOpen: false, refund: null, bankReference: "", payoutProofUrl: "", uploadingProof: false, loading: false })
                }
                className="flex-1 py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition"
                disabled={payoutModal.loading}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {suspendModal.isOpen && suspendModal.subscriber && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-[#D4AF37]/30">
            <div className="bg-gradient-to-r from-[#002845] to-[#003d66] p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                  <Ban className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">إيقاف الاشتراك</h3>
                  <p className="text-[#D4AF37] text-sm mt-1">{suspendModal.subscriber.name}</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-bold text-amber-800">تنبيه مهم</p>
                    <p className="text-xs text-amber-600">هذا الإجراء قابل للعكس</p>
                  </div>
                </div>
                <p className="text-sm text-amber-700">
                  سيتم إيقاف اشتراك <span className="font-bold">{suspendModal.subscriber.plan_name}</span> للعميل مؤقتاً. 
                  يمكنك إعادة تفعيله لاحقاً.
                </p>
              </div>
              
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">الباقة:</span>
                  <span className="font-bold" style={{ color: suspendModal.subscriber.plan_color }}>{suspendModal.subscriber.plan_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">البريد:</span>
                  <span className="text-gray-800">{suspendModal.subscriber.email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">المبلغ المدفوع:</span>
                  <span className="font-bold text-[#D4AF37]">{formatCurrency(Number(suspendModal.subscriber.paid_amount) || 0)}</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">سبب الإيقاف <span className="text-red-500">*</span></label>
                <textarea
                  value={suspendModal.reason}
                  onChange={(e) => setSuspendModal(prev => ({ ...prev, reason: e.target.value }))}
                  rows={2}
                  placeholder="أضف ملاحظة توضح سبب الإيقاف للتوثيق..."
                  className="w-full border-2 border-gray-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">* مطلوب للتوثيق وسيتم إشعار العميل بالسبب</p>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 flex gap-3">
              <button
                onClick={confirmSuspend}
                disabled={suspendModal.loading || !suspendModal.reason.trim()}
                className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {suspendModal.loading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Ban className="w-5 h-5" />
                )}
                {suspendModal.loading ? "جاري الإيقاف..." : "تأكيد الإيقاف"}
              </button>
              <button
                onClick={() => setSuspendModal({ isOpen: false, subscriber: null, reason: "", loading: false })}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-600 rounded-xl font-medium hover:bg-white transition"
                disabled={suspendModal.loading}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {activateModal.isOpen && activateModal.subscriber && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-[#D4AF37]/30">
            <div className="bg-gradient-to-r from-[#002845] to-[#003d66] p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-green-500/20 flex items-center justify-center">
                  <PlayCircle className="w-7 h-7 text-green-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">إعادة تفعيل الاشتراك</h3>
                  <p className="text-[#D4AF37] text-sm mt-1">{activateModal.subscriber.name}</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-bold text-green-800">إعادة التفعيل</p>
                    <p className="text-xs text-green-600">سيتم إشعار العميل تلقائياً</p>
                  </div>
                </div>
                <p className="text-sm text-green-700">
                  سيتم إعادة تفعيل اشتراك <span className="font-bold">{activateModal.subscriber.plan_name}</span> للعميل 
                  وسيتمكن من استخدام جميع مزايا الباقة.
                </p>
              </div>
              
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">الباقة:</span>
                  <span className="font-bold" style={{ color: activateModal.subscriber.plan_color }}>{activateModal.subscriber.plan_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">البريد:</span>
                  <span className="text-gray-800">{activateModal.subscriber.email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">تاريخ الإيقاف:</span>
                  <span className="text-red-600">{activateModal.subscriber.suspended_at ? new Date(activateModal.subscriber.suspended_at).toLocaleDateString("ar-SA") : "-"}</span>
                </div>
                {activateModal.subscriber.suspension_reason && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">سبب الإيقاف السابق:</span>
                    <span className="text-gray-800">{activateModal.subscriber.suspension_reason}</span>
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">سبب إعادة التفعيل <span className="text-red-500">*</span></label>
                <textarea
                  value={activateModal.reason}
                  onChange={(e) => setActivateModal(prev => ({ ...prev, reason: e.target.value }))}
                  rows={2}
                  placeholder="أضف ملاحظة توضح سبب إعادة التفعيل للتوثيق..."
                  className="w-full border-2 border-gray-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">* مطلوب للتوثيق وسيتم إشعار العميل</p>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 flex gap-3">
              <button
                onClick={confirmActivate}
                disabled={activateModal.loading || !activateModal.reason.trim()}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {activateModal.loading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <PlayCircle className="w-5 h-5" />
                )}
                {activateModal.loading ? "جاري التفعيل..." : "تأكيد التفعيل"}
              </button>
              <button
                onClick={() => setActivateModal({ isOpen: false, subscriber: null, reason: "", loading: false })}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-600 rounded-xl font-medium hover:bg-white transition"
                disabled={activateModal.loading}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {withdrawalModal.isOpen && withdrawalModal.request && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-[#D4AF37]/30">
            <div className={`p-6 ${
              withdrawalModal.action === "approve" ? "bg-gradient-to-r from-green-600 to-emerald-600" :
              withdrawalModal.action === "reject" ? "bg-gradient-to-r from-red-600 to-rose-600" :
              withdrawalModal.action === "complete" ? "bg-gradient-to-r from-blue-600 to-indigo-600" :
              "bg-gradient-to-r from-purple-600 to-violet-600"
            }`}>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  {withdrawalModal.action === "approve" && <CheckCircle2 className="w-7 h-7 text-white" />}
                  {withdrawalModal.action === "reject" && <XCircle className="w-7 h-7 text-white" />}
                  {withdrawalModal.action === "complete" && <Wallet className="w-7 h-7 text-white" />}
                  {withdrawalModal.action === "convert" && <CreditCard className="w-7 h-7 text-white" />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {withdrawalModal.action === "approve" && "الموافقة على طلب السحب"}
                    {withdrawalModal.action === "reject" && "رفض طلب السحب"}
                    {withdrawalModal.action === "complete" && "تأكيد التحويل المالي"}
                    {withdrawalModal.action === "convert" && "تحويل لاشتراك"}
                  </h3>
                  <p className="text-white/80 text-sm mt-1">{withdrawalModal.request.user_name}</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">المبلغ:</span>
                  <span className="font-bold text-[#D4AF37] text-lg">${((withdrawalModal.request.amount_cents || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">البريد:</span>
                  <span className="text-gray-800">{withdrawalModal.request.user_email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">تاريخ الطلب:</span>
                  <span className="text-gray-800">{new Date(withdrawalModal.request.created_at).toLocaleDateString('ar-SA')}</span>
                </div>
              </div>
              
              {withdrawalModal.action === "approve" && (
                <div className="bg-green-50 rounded-2xl p-4 border border-green-200">
                  <p className="text-green-700 text-sm">
                    ✅ سيتم إشعار العميل بالموافقة على طلبه وأن التحويل قيد التنفيذ.
                  </p>
                </div>
              )}
              
              {withdrawalModal.action === "reject" && (
                <div className="bg-red-50 rounded-2xl p-4 border border-red-200">
                  <p className="text-red-700 text-sm">
                    ⚠️ سيتم إرجاع المبلغ لمحفظة العميل وإشعاره بسبب الرفض.
                  </p>
                </div>
              )}
              
              {withdrawalModal.action === "complete" && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    رقم المرجع / التحويل <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={withdrawalModal.bankReference}
                    onChange={(e) => setWithdrawalModal(prev => ({ ...prev, bankReference: e.target.value }))}
                    placeholder="أدخل رقم مرجع التحويل البنكي..."
                    className="w-full border-2 border-gray-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none"
                  />
                </div>
              )}
              
              {withdrawalModal.action === "convert" && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    اختر الباقة <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={withdrawalModal.selectedPlanId || ""}
                    onChange={(e) => setWithdrawalModal(prev => ({ ...prev, selectedPlanId: parseInt(e.target.value) }))}
                    className="w-full border-2 border-gray-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none"
                  >
                    <option value="">اختر باقة...</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name_ar} - {plan.price} ر.س
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-purple-600 mt-2">
                    🎁 سيتم تحويل رصيد العميل إلى اشتراك بالباقة المختارة
                  </p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  ملاحظات {withdrawalModal.action === "reject" ? <span className="text-red-500">*</span> : "(اختياري)"}
                </label>
                <textarea
                  value={withdrawalModal.notes}
                  onChange={(e) => setWithdrawalModal(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder={
                    withdrawalModal.action === "reject" ? "اكتب سبب الرفض (مطلوب)..." : 
                    "أي ملاحظات إضافية..."
                  }
                  className="w-full border-2 border-gray-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none resize-none"
                />
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 flex gap-3">
              <button
                onClick={handleWithdrawalAction}
                disabled={withdrawalModal.loading}
                className={`flex-1 py-3 text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center gap-2 ${
                  withdrawalModal.action === "approve" ? "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600" :
                  withdrawalModal.action === "reject" ? "bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600" :
                  withdrawalModal.action === "complete" ? "bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600" :
                  "bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600"
                }`}
              >
                {withdrawalModal.loading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {withdrawalModal.action === "approve" && <><CheckCircle2 className="w-5 h-5" /> موافقة</>}
                    {withdrawalModal.action === "reject" && <><XCircle className="w-5 h-5" /> رفض</>}
                    {withdrawalModal.action === "complete" && <><CheckCircle2 className="w-5 h-5" /> تأكيد التحويل</>}
                    {withdrawalModal.action === "convert" && <><CreditCard className="w-5 h-5" /> تحويل لاشتراك</>}
                  </>
                )}
              </button>
              <button
                onClick={() => setWithdrawalModal({ isOpen: false, request: null, action: "approve", notes: "", bankReference: "", selectedPlanId: null, loading: false })}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-600 rounded-xl font-medium hover:bg-white transition"
                disabled={withdrawalModal.loading}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {resetInvoiceOpen && sessionRole === "super_admin" && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-red-200">
            <div className="bg-red-50 p-5 border-b border-red-100">
              <div className="flex items-center gap-2 text-red-900 font-bold text-lg">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                تصفير الفواتير التجريبية (ما قبل الإطلاق)
              </div>
              <p className="text-sm text-red-800 mt-3 leading-relaxed">
                سيتم <span className="font-black">تصفير بيئة المالية بالكامل</span>: سجل المدفوعات (وجميع عمليات TXN مثل النخبة)، الفواتير، طلبات الاسترداد، الاعتراضات البنكية، الشكاوى المرتبطة بالفواتير/الاسترداد، تذاكر قسم المالية (ومراسلاتها في البريد الموحد)، طلبات تمديد النخبة، وسجل تدقيق الفوترة.
                لا يمكن التراجع. للاختبار أو ما قبل الإطلاق فقط بعد نسخة احتياطية.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-700">
                للتأكيد، اكتب العبارة التالية حرفياً في الحقل:
              </p>
              <code className="block text-center text-sm font-mono bg-gray-100 py-2 px-3 rounded-lg border border-gray-200 select-all">
                {RESET_INVOICES_PHRASE}
              </code>
              <input
                type="text"
                value={resetPhrase}
                onChange={(e) => setResetPhrase(e.target.value)}
                placeholder="اكتب العبارة هنا"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-red-400 focus:outline-none"
                autoComplete="off"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetInvoiceOpen(false);
                    setResetPhrase("");
                  }}
                  disabled={resetLoading}
                  className="flex-1 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetTestInvoices()}
                  disabled={
                    resetLoading ||
                    normalizeConfirmationPhrase(resetPhrase) !== RESET_INVOICES_PHRASE
                  }
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {resetLoading ? "جاري التنفيذ…" : "تنفيذ التصفير"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {successModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden ${
              successModal.type === "error" ? "max-w-lg" : "max-w-sm"
            }`}
          >
            <div className={`p-8 text-center ${successModal.type === "success" ? "bg-green-50" : "bg-red-50"}`}>
              <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                successModal.type === "success" ? "bg-green-100" : "bg-red-100"
              }`}>
                {successModal.type === "success" ? (
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                ) : (
                  <XCircle className="w-8 h-8 text-red-600" />
                )}
              </div>
              <p
                className={`text-lg font-bold whitespace-pre-wrap break-words text-right ${
                  successModal.type === "success" ? "text-green-800" : "text-red-800"
                }`}
              >
                {successModal.message}
              </p>
            </div>
            <div className="p-4">
              <button
                onClick={() => setSuccessModal({ isOpen: false, message: "", type: "success" })}
                className="w-full py-3 bg-[#002845] text-white rounded-xl hover:bg-[#003d66] transition font-bold"
              >
                حسناً
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────── Case Detail modal ───────────────── */}
      {caseDetail.open && (
        <CaseDetailModal
          state={caseDetail}
          onClose={() =>
            setCaseDetail({ open: false, loading: false, case: null, events: [], ticketReplies: [], actionLoading: false })
          }
          onTransition={(to, opts) => caseTransition(to, opts)}
          onAttachProof={(file, ref) => attachProofToCase(file, ref)}
          onUpdateBankInfo={async (bank) => {
            if (!caseDetail.case) return;
            const res = await fetch(`${API_URL}/api/finance/cases/${caseDetail.case.id}/customer-info`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
              body: JSON.stringify(bank),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              await alertDialog({
                title: "تعذّر حفظ بيانات البنك",
                message: data?.error || "—",
                variant: "error",
              });
              return;
            }
            await Promise.all([openCaseDetail(caseDetail.case.id), fetchCases(), fetchCaseCounters()]);
          }}
        />
      )}

      {/* ───────────────── Inbox item modal ───────────────── */}
      {inboxItemModal.open && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-[60] p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h4 className="font-black text-[#002845]">
                  {inboxItemModal.ticket?.subject || "تذكرة"}
                </h4>
                <p className="text-xs font-mono text-gray-500 mt-0.5">
                  {inboxItemModal.ticket?.ticket_number}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInboxItemModal({ open: false, loading: false, ticket: null, replies: [], replyBody: "", sending: false })}
                className="p-2 rounded-lg hover:bg-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {inboxItemModal.loading ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-[#D4AF37]" />
                </div>
              ) : (
                <>
                  {inboxItemModal.ticket?.description && (
                    <div className="bg-slate-50 rounded-xl p-3 text-sm text-[#002845] whitespace-pre-line">
                      {inboxItemModal.ticket.description}
                    </div>
                  )}
                  {inboxItemModal.replies.map((r) => (
                    <div
                      key={r.id}
                      className={`rounded-xl p-3 text-sm ${
                        r.sender_type === "admin"
                          ? "bg-[#FFFCEE] border border-[#D4AF37]/40 mr-6"
                          : r.sender_type === "internal"
                            ? "bg-amber-50 border border-amber-200 text-amber-900 text-xs italic"
                            : "bg-slate-50 border border-slate-200 ml-6"
                      }`}
                    >
                      <p className="whitespace-pre-line">{r.message}</p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {new Date(r.created_at).toLocaleString("ar-SA")}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="border-t border-gray-100 p-3 space-y-2">
              <textarea
                value={inboxItemModal.replyBody}
                onChange={(e) => setInboxItemModal((p) => ({ ...p, replyBody: e.target.value }))}
                placeholder="اكتب ردك للعميل..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:border-[#D4AF37] focus:outline-none resize-none"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={sendInboxReply}
                  disabled={!inboxItemModal.replyBody.trim() || inboxItemModal.sending}
                  className="flex-1 px-4 py-2 rounded-xl bg-[#002845] text-white text-sm font-bold hover:bg-[#003d5c] disabled:opacity-40"
                >
                  <Send className="w-4 h-4 inline" /> إرسال الرد
                </button>
                <button
                  type="button"
                  onClick={() => inboxItemModal.ticket && openConvertModal(inboxItemModal.ticket)}
                  disabled={!inboxItemModal.ticket}
                  className="px-3 py-2 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] text-xs font-black hover:shadow disabled:opacity-40"
                >
                  تحويل لقضية استرداد
                </button>
                <button
                  type="button"
                  onClick={resolveInboxItem}
                  className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                >
                  إغلاق كاستفسار
                </button>
                <button
                  type="button"
                  onClick={returnInboxItemToSupport}
                  className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-[#002845] text-xs font-bold hover:bg-slate-50"
                >
                  إعادة للدعم
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────── Convert-to-Case modal ───────────────── */}
      {convertModal.open && convertModal.ticket && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-[65] p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92dvh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-l from-[#FFFCEE] via-white to-white">
              <h4 className="font-black text-[#002845]">تحويل إلى قضية استرداد</h4>
              <p className="text-xs text-gray-500 mt-1">
                {convertModal.ticket.ticket_number} · {convertModal.ticket.user_name}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <label className="text-xs font-bold text-[#002845]">المبلغ المقدّر (اختياري)</label>
                <input
                  type="number"
                  step="0.01"
                  value={convertModal.amount}
                  onChange={(e) => setConvertModal((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="اتركه فارغاً لاستخدام قيمة الفاتورة"
                  className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-bold text-[#002845] mb-2">بيانات البنك (اختياري — إن كانت متوفرة)</p>
                <input
                  type="text"
                  value={convertModal.bankName}
                  onChange={(e) => setConvertModal((p) => ({ ...p, bankName: e.target.value }))}
                  placeholder="اسم البنك"
                  className="w-full mb-2 border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={convertModal.iban}
                  onChange={(e) => setConvertModal((p) => ({ ...p, iban: e.target.value }))}
                  placeholder="رقم IBAN"
                  className="w-full mb-2 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                />
                <input
                  type="text"
                  value={convertModal.holder}
                  onChange={(e) => setConvertModal((p) => ({ ...p, holder: e.target.value }))}
                  placeholder="اسم صاحب الحساب"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-gray-500 mt-2">
                  إذا تركت الحقول فارغة وما عثرنا على بيانات بنك في ملف العميل، تُفتح القضية بحالة <span className="font-bold">«بانتظار بيانات العميل»</span>.
                </p>
              </div>
            </div>
            <div className="border-t border-gray-100 p-4 flex gap-2">
              <button
                type="button"
                onClick={submitConvertToCase}
                disabled={convertModal.loading}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-black disabled:opacity-50"
              >
                {convertModal.loading ? "جاري التحويل..." : "تأكيد"}
              </button>
              <button
                type="button"
                onClick={() => setConvertModal({ open: false, ticket: null, amount: "", bankName: "", iban: "", holder: "", loading: false })}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Case Detail modal — full case workspace. Extracted so the main
// FinancePage stays readable. State-driven action buttons appear
// only when the matching transition is legal.
// ─────────────────────────────────────────────────────────────────
function CaseDetailModal({
  state, onClose, onTransition, onAttachProof, onUpdateBankInfo,
}: {
  state: {
    loading: boolean;
    case: RefundCase | null;
    events: RefundCaseEvent[];
    ticketReplies: Array<{ id: number; message: string; sender_type: string; created_at: string }>;
    actionLoading: boolean;
  };
  onClose: () => void;
  onTransition: (to: CaseState, opts?: { note?: string; payload?: any }) => Promise<void>;
  onAttachProof: (file: File, bankRef: string) => Promise<void>;
  onUpdateBankInfo: (bank: { bank_name: string; bank_account_iban: string; account_holder_name: string }) => Promise<void>;
}) {
  const c = state.case;
  const [approveAmount, setApproveAmount] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [bankEdit, setBankEdit] = useState({ bank_name: "", bank_account_iban: "", account_holder_name: "" });
  const [bankEditOpen, setBankEditOpen] = useState(false);

  useEffect(() => {
    if (!c) return;
    setApproveAmount(String(c.approved_refund_amount ?? c.estimated_refund_amount ?? c.amount ?? ""));
    setApproveNote("");
    setRejectNote("");
    setBankRef(c.bank_reference || "");
    setBankEdit({
      bank_name: c.bank_name || "",
      bank_account_iban: c.bank_account_iban || "",
      account_holder_name: c.account_holder_name || "",
    });
  }, [c?.id, c?.status]);

  if (!c && !state.loading) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92dvh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-l from-[#002845] to-[#003d66] text-white px-6 py-5 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono text-[#D4AF37]">{c?.case_number || (c ? `#${c.id}` : "")}</p>
            <h3 className="text-2xl font-black mt-1 flex items-center gap-3 flex-wrap">
              {c ? fmtSAR(Number(c.approved_refund_amount ?? c.estimated_refund_amount ?? c.amount)) : "—"}
              {c && (
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${CASE_STATE_TONE[c.status]}`}>
                  {CASE_STATE_LABEL[c.status]}
                </span>
              )}
            </h3>
            <p className="text-sm text-white/80 mt-1">{c?.user_name} · {c?.user_email}</p>
            {c?.due_at && (
              <p className="text-xs text-[#D4AF37] mt-1">
                الموعد المستهدف: {new Date(c.due_at).toLocaleDateString("ar-SA")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {state.loading || !c ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-10 h-10 animate-spin text-[#D4AF37]" />
            </div>
          ) : (
            <>
              {/* Tasks panel — state-driven instructions */}
              <div className="rounded-2xl border-2 border-[#D4AF37]/30 bg-[#FFFCEE] p-4">
                <h4 className="font-black text-[#002845] text-sm mb-2">المهام الآن</h4>
                {c.status === "pending_review" && (
                  <ol className="text-sm text-[#002845] space-y-1 list-decimal pr-5">
                    <li>راجع المراسلة وبيانات الفاتورة في الأسفل</li>
                    <li>حدّد المبلغ المعتمد، ثم اضغط «اعتمد»</li>
                    <li>أو ارفض مع كتابة السبب</li>
                  </ol>
                )}
                {c.status === "waiting_customer_info" && (
                  <p className="text-sm text-[#002845]">
                    بانتظار العميل لتزويدنا ببيانات البنك. عند وصولها، اضغط «استلمت البيانات».
                  </p>
                )}
                {c.status === "approved" && (
                  <ol className="text-sm text-[#002845] space-y-1 list-decimal pr-5">
                    <li>تأكد من اكتمال بيانات البنك</li>
                    <li>اضغط «ابدأ التحويل البنكي» لإدراج القضية في قائمة عمل المحاسب</li>
                  </ol>
                )}
                {c.status === "awaiting_bank_transfer" && (
                  <ol className="text-sm text-[#002845] space-y-1 list-decimal pr-5">
                    <li>اذهب إلى <span className="font-black">{c.bank_name || "—"}</span></li>
                    <li>حوّل <span className="font-black text-[#D4AF37]">{fmtSAR(Number(c.approved_refund_amount ?? c.amount))}</span> إلى IBAN: <span className="font-mono">{c.bank_account_iban}</span></li>
                    <li>صوّر الإيصال، وارفعه أدناه</li>
                  </ol>
                )}
                {c.status === "proof_uploaded" && (
                  <p className="text-sm text-[#002845]">
                    تم رفع الإيصال. اضغط «تأكيد الاكتمال» لإبلاغ العميل ولإصدار فاتورة الاسترداد.
                  </p>
                )}
                {(c.status === "completed" || c.status === "rejected") && (
                  <p className="text-sm text-[#002845]">القضية مغلقة. {c.decision_note ? `الملاحظة: ${c.decision_note}` : ""}</p>
                )}
              </div>

              {/* Action region per state */}
              {c.status === "pending_review" && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#002845]">المبلغ المعتمد (ر.س)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={approveAmount}
                    onChange={(e) => setApproveAmount(e.target.value)}
                    className="w-full border-2 border-gray-200 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-sm outline-none"
                  />
                  <textarea
                    value={approveNote}
                    onChange={(e) => setApproveNote(e.target.value)}
                    placeholder="ملاحظة الاعتماد (اختياري)"
                    rows={2}
                    className="w-full border-2 border-gray-200 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-sm resize-none outline-none"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={state.actionLoading || !approveAmount}
                      onClick={() => onTransition("approved", { note: approveNote, payload: { approved_refund_amount: parseFloat(approveAmount) } })}
                      className="py-2.5 rounded-xl bg-sky-600 text-white text-sm font-black hover:bg-sky-700 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-4 h-4 inline" /> اعتماد
                    </button>
                    <button
                      type="button"
                      disabled={state.actionLoading}
                      onClick={() => onTransition("waiting_customer_info", { note: approveNote })}
                      className="py-2.5 rounded-xl bg-amber-500 text-white text-sm font-black hover:bg-amber-600 disabled:opacity-40"
                    >
                      <Clock className="w-4 h-4 inline" /> طلب بيانات البنك
                    </button>
                    <button
                      type="button"
                      disabled={state.actionLoading || !rejectNote.trim()}
                      onClick={() => onTransition("rejected", { note: rejectNote })}
                      className="py-2.5 rounded-xl bg-rose-600 text-white text-sm font-black hover:bg-rose-700 disabled:opacity-40"
                    >
                      <XCircle className="w-4 h-4 inline" /> رفض
                    </button>
                  </div>
                  <input
                    type="text"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="سبب الرفض (مطلوب للرفض)"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              )}

              {c.status === "approved" && (
                <button
                  type="button"
                  disabled={state.actionLoading}
                  onClick={() => onTransition("awaiting_bank_transfer")}
                  className="w-full py-3 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-black"
                >
                  ابدأ التحويل البنكي →
                </button>
              )}

              {c.status === "awaiting_bank_transfer" && (
                <div className="space-y-2 border-2 border-rose-200 bg-rose-50 rounded-2xl p-4">
                  <label className="text-sm font-black text-rose-900">رفع إيصال التحويل البنكي</label>
                  <input
                    type="text"
                    value={bankRef}
                    onChange={(e) => setBankRef(e.target.value)}
                    placeholder="رقم المرجع البنكي (اختياري)"
                    className="w-full border border-rose-200 rounded-xl px-3 py-2 text-sm"
                  />
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) await onAttachProof(f, bankRef);
                      e.target.value = "";
                    }}
                    disabled={state.actionLoading}
                    className="w-full text-xs"
                  />
                  <p className="text-[10px] text-rose-700">القضية لن تنتقل إلى «إيصال مرفوع» قبل رفع الصورة.</p>
                </div>
              )}

              {c.status === "proof_uploaded" && (
                <div className="space-y-2">
                  {c.payout_proof_url && (
                    <a
                      href={c.payout_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-xs text-sky-700 underline"
                    >
                      عرض إيصال التحويل المرفوع
                    </a>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={state.actionLoading}
                      onClick={() => onTransition("completed")}
                      className="py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-40"
                    >
                      تأكيد الاكتمال وإبلاغ العميل
                    </button>
                    <button
                      type="button"
                      disabled={state.actionLoading}
                      onClick={() => onTransition("awaiting_bank_transfer", { note: "إعادة للمراجعة — إيصال غير مكتمل" })}
                      className="py-2.5 rounded-xl bg-white border border-rose-200 text-rose-700 text-sm font-bold hover:bg-rose-50 disabled:opacity-40"
                    >
                      إعادة الإيصال
                    </button>
                  </div>
                </div>
              )}

              {c.status === "waiting_customer_info" && (
                <button
                  type="button"
                  onClick={() => setBankEditOpen(true)}
                  className="w-full py-3 rounded-xl bg-emerald-600 text-white font-black hover:bg-emerald-700"
                >
                  استلمت البيانات — افتح نموذج الإدخال
                </button>
              )}

              {/* Bank info panel */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-black text-[#002845] text-sm">بيانات التحويل البنكي</h4>
                  {!bankEditOpen && (
                    <button
                      type="button"
                      onClick={() => setBankEditOpen(true)}
                      className="text-xs text-sky-700 underline"
                    >
                      تعديل
                    </button>
                  )}
                </div>
                {bankEditOpen ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={bankEdit.bank_name}
                      onChange={(e) => setBankEdit((p) => ({ ...p, bank_name: e.target.value }))}
                      placeholder="اسم البنك"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={bankEdit.bank_account_iban}
                      onChange={(e) => setBankEdit((p) => ({ ...p, bank_account_iban: e.target.value }))}
                      placeholder="رقم IBAN"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                    />
                    <input
                      type="text"
                      value={bankEdit.account_holder_name}
                      onChange={(e) => setBankEdit((p) => ({ ...p, account_holder_name: e.target.value }))}
                      placeholder="اسم صاحب الحساب"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!bankEdit.bank_name || !bankEdit.bank_account_iban || !bankEdit.account_holder_name}
                        onClick={async () => {
                          await onUpdateBankInfo(bankEdit);
                          setBankEditOpen(false);
                        }}
                        className="flex-1 py-2 rounded-lg bg-[#002845] text-white text-xs font-bold disabled:opacity-40"
                      >
                        حفظ
                      </button>
                      <button
                        type="button"
                        onClick={() => setBankEditOpen(false)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-xs"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <dl className="text-xs space-y-1">
                    <div className="flex justify-between"><dt className="text-gray-500">البنك:</dt><dd className="font-bold">{c.bank_name || "—"}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">IBAN:</dt><dd className="font-mono">{c.bank_account_iban || "—"}</dd></div>
                    <div className="flex justify-between"><dt className="text-gray-500">صاحب الحساب:</dt><dd className="font-bold">{c.account_holder_name || "—"}</dd></div>
                  </dl>
                )}
              </div>

              {/* Timeline */}
              <div className="rounded-2xl border border-gray-100 p-4">
                <h4 className="font-black text-[#002845] text-sm mb-3">خط الزمن</h4>
                <ol className="relative border-r-2 border-[#D4AF37]/30 pr-4 space-y-3">
                  {state.events.length === 0 && (
                    <li className="text-xs text-gray-500">لا توجد أحداث بعد.</li>
                  )}
                  {state.events.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute right-[-22px] top-1 w-3 h-3 rounded-full bg-[#D4AF37]" />
                      <p className="text-xs font-bold text-[#002845]">
                        {e.event_type === "state_changed"
                          ? `${e.from_state ? CASE_STATE_LABEL[e.from_state as CaseState] || e.from_state : "—"} → ${CASE_STATE_LABEL[e.to_state as CaseState] || e.to_state}`
                          : e.event_type}
                      </p>
                      {e.note && <p className="text-xs text-gray-700 mt-0.5">{e.note}</p>}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {e.actor_name || "—"} · {new Date(e.created_at).toLocaleString("ar-SA")}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Evidence: linked ticket conversation */}
              {state.ticketReplies.length > 0 && (
                <details className="rounded-2xl border border-gray-100">
                  <summary className="cursor-pointer px-4 py-3 font-bold text-[#002845] text-sm flex items-center gap-2">
                    📎 الدليل المساند: محادثة الدعم ({state.ticketReplies.length} رسالة)
                  </summary>
                  <div className="p-3 space-y-2 max-h-72 overflow-y-auto bg-slate-50">
                    {state.ticketReplies.map((r) => (
                      <div
                        key={r.id}
                        className={`rounded-lg p-2 text-xs ${
                          r.sender_type === "admin"
                            ? "bg-[#FFFCEE] border border-[#D4AF37]/30"
                            : r.sender_type === "internal"
                              ? "bg-amber-50 border border-amber-200 italic"
                              : "bg-white border border-gray-200"
                        }`}
                      >
                        <p className="whitespace-pre-line">{r.message}</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(r.created_at).toLocaleString("ar-SA")}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  subtext,
  isLarge,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string | number;
  color: "blue" | "green" | "yellow" | "red" | "gold";
  subtext?: string;
  isLarge?: boolean;
}) {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    yellow: "bg-yellow-100 text-yellow-600",
    red: "bg-red-100 text-red-600",
    gold: "bg-[#D4AF37]/20 text-[#D4AF37]",
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-xl ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className={`font-bold text-[#002845] ${isLarge ? "text-3xl" : "text-2xl"}`}>
        {value}
      </p>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}

function StatusBadge({ status, expiresAt }: { status: string; expiresAt: string | null }) {
  const isExpired = expiresAt && new Date(expiresAt) < new Date();
  
  if (status === "suspended") {
    return (
      <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold">
        موقوف
      </span>
    );
  }
  
  if (isExpired) {
    return (
      <span className="px-3 py-1 bg-yellow-100 text-yellow-600 rounded-full text-xs font-bold">
        منتهي
      </span>
    );
  }
  
  if (status === "active") {
    return (
      <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-xs font-bold">
        نشط
      </span>
    );
  }
  
  return (
    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">
      {status || "غير محدد"}
    </span>
  );
}
