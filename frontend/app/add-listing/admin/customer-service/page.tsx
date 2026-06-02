"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";
import { alertDialog } from "@/components/ui/ConfirmDialog";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Headset, MessageCircle, Clock, CheckCircle, AlertCircle, Search, RefreshCw, 
  Send, User, Mail, Phone, ExternalLink, FileText, Calendar, X, 
  AlertTriangle, Building2, XCircle, Eye, Trash2, Loader2
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface Reply {
  id: number;
  sender_name: string;
  sender_type: string;
  sender_role?: string | null;
  message: string;
  visibility?: "customer_visible" | "internal" | null;
  created_at: string;
}

interface SupportTicket {
  id: number;
  ticket_number: string;
  subject: string;
  description: string;
  user_name: string;
  user_email: string;
  user_phone: string;
  category: string;
  status: string;
  priority: string;
  reply_count: number;
  created_at: string;
  updated_at: string;
  ticket_type?: string | null;
  related_property_id?: string | null;
  invoice_id?: number | null;
  report_reason_code?: string | null;
  source?: string | null;
  department?: string | null;
  // Set by /api/support/:id/transfer. Drives the "Transfer to
  // Finance" button: only visible when null and refund_id is null.
  finance_inbox_state?: string | null;
  refund_id?: number | null;
  refund_case_number?: string | null;
}

// Unified taxonomy labels — surfaces ticket_type as a colored chip on
// each ticket card so the operator instantly sees "this is a property
// report" / "this is a billing complaint" / "this is an escalation"
// without opening the ticket. Matches the type enum from
// frontend/components/requests/RequestComposer.tsx.
const TICKET_TYPE_BADGES: Record<string, { label: string; tone: string; icon: string }> = {
  financial:          { label: "مالية",            tone: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "💳" },
  account:            { label: "حسابي",             tone: "bg-blue-50 text-blue-700 border-blue-200",          icon: "👤" },
  technical:          { label: "تقنية",             tone: "bg-purple-50 text-purple-700 border-purple-200",    icon: "🛠️" },
  billing_complaint:  { label: "شكوى مالية",        tone: "bg-amber-50 text-amber-700 border-amber-200",       icon: "🧾" },
  refund_claim:       { label: "طلب استرداد",       tone: "bg-rose-50 text-rose-700 border-rose-200",          icon: "↩️" },
  service_complaint:  { label: "شكوى خدمة",         tone: "bg-amber-50 text-amber-700 border-amber-200",       icon: "📝" },
  general_complaint:  { label: "شكوى عامة",         tone: "bg-amber-50 text-amber-700 border-amber-200",       icon: "📣" },
  property_report:    { label: "بلاغ ضد إعلان",     tone: "bg-rose-50 text-rose-700 border-rose-200",          icon: "🚩" },
  content_report:     { label: "بلاغ محتوى",        tone: "bg-rose-50 text-rose-700 border-rose-200",          icon: "🚫" },
  escalation:         { label: "تصعيد من المساعد", tone: "bg-violet-50 text-violet-700 border-violet-200",    icon: "🤖" },
};

interface AccountComplaint {
  id: number;
  user_id: string | null;
  user_name: string;
  user_email: string;
  user_phone: string;
  category: string;
  subject: string;
  details: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  submitter_name?: string;
  submitter_email?: string;
  auto_assigned_role?: string | null;
  complaint_type?: string | null;
  invoice_id?: number | null;
}

interface SupportStats {
  total: number;
  new: number;
  in_progress: number;
  resolved: number;
  closed: number;
  high_priority: number;
}

interface ComplaintStats {
  total: number;
  new: number;
  in_review: number;
  closed: number;
  dismissed: number;
}

type TabType = "support" | "complaints";

const supportStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-red-100", text: "text-red-700", label: "جديد" },
  open: { bg: "bg-red-100", text: "text-red-700", label: "مفتوح" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المعالجة" },
  resolved: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل" },
  closed: { bg: "bg-slate-100", text: "text-slate-600", label: "مغلق" },
};

const complaintStatusColors: Record<string, { bg: string; text: string; label: string; border: string }> = {
  new: { bg: "bg-red-100", text: "text-red-700", label: "جديد", border: "border-red-300" },
  in_review: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المراجعة", border: "border-amber-300" },
  closed: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل", border: "border-green-300" },
  dismissed: { bg: "bg-slate-100", text: "text-slate-600", label: "غير مقبول", border: "border-slate-300" },
};

const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: "bg-purple-100", text: "text-purple-700", label: "عاجل" },
  high: { bg: "bg-red-100", text: "text-red-700", label: "عالي" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700", label: "متوسط" },
  low: { bg: "bg-green-100", text: "text-green-700", label: "منخفض" },
};

const supportCategoryLabels: Record<string, string> = {
  general: "عام",
  technical: "فني",
  billing: "مالي",
  account: "حساب",
  listing: "إعلان",
};

const complaintCategoryLabels: Record<string, string> = {
  account_issue: "مشكلة في الحساب",
  subscription: "مشكلة في الاشتراك",
  technical: "مشكلة تقنية",
  billing: "مشكلة في الفواتير",
  other: "شكوى أخرى",
};

export default function CustomerServicePage() {
  // Default to the support tab, but auto-switch to "complaints" after stats
  // load if there are more new complaints than new tickets — otherwise the
  // owner could submit a financial complaint and not see it because the
  // page landed on the wrong tab. Once they manually click a tab we stop
  // auto-switching for the rest of the session. A ?tab=… query string
  // (e.g. from the Finance Inbox deep links) also pins the tab and
  // suppresses auto-switching.
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams?.get("tab");
  const initialTab: TabType = tabFromUrl === "complaints" ? "complaints" : "support";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [userPickedTab, setUserPickedTab] = useState(tabFromUrl === "complaints" || tabFromUrl === "support");
  const switchTab = (t: TabType) => {
    setUserPickedTab(true);
    setActiveTab(t);
  };
  
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [supportStats, setSupportStats] = useState<SupportStats | null>(null);
  const [supportFilter, setSupportFilter] = useState("all");
  const [supportSearch, setSupportSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  // Same visibility model the finance side uses: customer_visible reaches
  // the customer's ticket view, internal stays on the staff thread only.
  const [replyVisibility, setReplyVisibility] = useState<"customer_visible" | "internal">("customer_visible");
  
  const [complaints, setComplaints] = useState<AccountComplaint[]>([]);
  const [complaintStats, setComplaintStats] = useState<ComplaintStats>({ new: 0, in_review: 0, closed: 0, dismissed: 0, total: 0 });
  const [complaintFilter, setComplaintFilter] = useState("all");
  const [complaintSearch, setComplaintSearch] = useState("");
  const [selectedComplaint, setSelectedComplaint] = useState<AccountComplaint | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Native confirm() for the transfer handoff looked jarring on a polished
  // admin surface, so we use this state to drive an in-platform modal that
  // lets the agent choose WHERE to transfer and optionally attach a note.
  const [transferTarget, setTransferTarget] = useState<AccountComplaint | null>(null);
  const [transferNote, setTransferNote] = useState("");
  const [transferRole, setTransferRole] = useState<string>("finance_admin");
  const [transferring, setTransferring] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [complaintsTotalRows, setComplaintsTotalRows] = useState(0);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string | number;
    type: "support" | "complaint";
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const u = data.user || data;
        setUserRole(u.role ?? null);
      }
    } catch {
      setUserRole(null);
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/support`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error("Error fetching tickets:", err);
    }
  }, []);

  const fetchSupportStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/support/stats`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSupportStats(data);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, []);

  const fetchTicketDetails = useCallback(async (ticketId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/support/${ticketId}`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
        // Backend bumps admin_last_read_at when staff GETs a ticket.
        // Tell the bell to refetch /admin-unread-count immediately.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("notificationsUpdated"));
        }
      }
    } catch (err) {
      console.error("Error fetching ticket details:", err);
    }
  }, []);

  const fetchComplaintStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/stats`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setComplaintStats({
          new: data.new ?? 0,
          in_review: data.in_review ?? 0,
          closed: data.closed ?? 0,
          dismissed: data.dismissed ?? 0,
          total: data.total ?? 0,
        });
      }
    } catch (error) {
      console.error("Error fetching complaint stats:", error);
    }
  }, []);

  const fetchComplaints = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/account-complaints?limit=100`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setComplaints(data.complaints || []);
        setComplaintsTotalRows(data.pagination?.total ?? data.complaints?.length ?? 0);
      }
    } catch (error) {
      console.error("Error fetching complaints:", error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchCurrentUser(),
        fetchTickets(),
        fetchSupportStats(),
        fetchComplaints(),
        fetchComplaintStats(),
      ]);
      setLoading(false);
    };
    loadData();
  }, [fetchCurrentUser, fetchTickets, fetchSupportStats, fetchComplaints, fetchComplaintStats]);

  // Auto-refresh the support board every 20 seconds. Without this the
  // operator has to manually press "تحديث" — meaning a fresh customer
  // reply sits invisible until they remember to refresh. Tab-visibility
  // aware: we pause polling when the tab is hidden so we don't burn
  // backend cycles on tabs left open overnight.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      void Promise.all([
        fetchTickets(),
        fetchSupportStats(),
        fetchComplaints(),
        fetchComplaintStats(),
      ]);
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(tick, 20_000);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      start();
    }
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [fetchTickets, fetchSupportStats, fetchComplaints, fetchComplaintStats]);

  // Active-thread polling: while a ticket is open in the side panel,
  // re-fetch its replies every 10 seconds so customer messages appear
  // without forcing the operator to close and reopen the ticket. Runs
  // independently of the list poll above so the visible conversation
  // updates faster than the list refresh cadence.
  useEffect(() => {
    if (!selectedTicket?.id) return;
    const ticketId = selectedTicket.id;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => { void fetchTicketDetails(ticketId); }, 10_000);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      start();
    }
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [selectedTicket?.id, fetchTicketDetails]);

  // Auto-switch to the tab with more new items so a fresh complaint isn't
  // hidden behind the default "support" tab. Skipped once the user has
  // clicked any tab themselves so we don't fight their navigation.
  useEffect(() => {
    if (userPickedTab) return;
    const newTickets = supportStats?.new || 0;
    const newComplaints = complaintStats.new || 0;
    if (newComplaints > newTickets) {
      setActiveTab("complaints");
    } else if (newTickets > newComplaints) {
      setActiveTab("support");
    }
  }, [supportStats?.new, complaintStats.new, userPickedTab]);

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([
      fetchCurrentUser(),
      fetchTickets(),
      fetchSupportStats(),
      fetchComplaints(),
      fetchComplaintStats(),
    ]);
    setLoading(false);
  };

  const canHardDelete =
    userRole === "super_admin" || userRole === "admin";

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const url =
        deleteTarget.type === "support"
          ? `${API_URL}/api/support/${deleteTarget.id}`
          : `${API_URL}/api/account-complaints/${deleteTarget.id}`;
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : "تعذّر إتمام المسح النهائي"
        );
        return;
      }
      if (deleteTarget.type === "support") {
        setTickets((prev) => prev.filter((t) => t.id !== deleteTarget.id));
        if (selectedTicket?.id === deleteTarget.id) {
          setSelectedTicket(null);
          setReplies([]);
        }
      } else {
        setComplaints((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      }
      await Promise.all([
        fetchTickets(),
        fetchSupportStats(),
        fetchComplaints(),
        fetchComplaintStats(),
      ]);
      toast.success("تم المسح النهائي بنجاح");
      setDeleteTarget(null);
    } catch {
      toast.error("فشل الاتصال بالخادم");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelectTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setReply("");
    await fetchTicketDetails(ticket.id);
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/support/${selectedTicket.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ message: reply, visibility: replyVisibility }),
      });
      if (res.ok) {
        setReply("");
        await fetchTicketDetails(selectedTicket.id);
        await fetchTickets();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("notificationsUpdated"));
        }
      }
    } catch (err) {
      console.error("Error sending reply:", err);
    } finally {
      setSending(false);
    }
  };

  const handleUpdateTicketStatus = async (status: string) => {
    if (!selectedTicket) return;
    try {
      const res = await fetch(`${API_URL}/api/support/${selectedTicket.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setSelectedTicket({ ...selectedTicket, status });
        await fetchTickets();
        await fetchSupportStats();
      }
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  // Round 3.1: transfer modal lets the agent pick the destination role
  // (finance / content / admin manager / super admin) plus an optional
  // note. The ticket stays here too (co-owned).
  const [ticketTransferModal, setTicketTransferModal] = useState<{
    ticket: SupportTicket | null;
    targetRole: string;
    note: string;
    submitting: boolean;
  }>({ ticket: null, targetRole: "finance_admin", note: "", submitting: false });

  const submitTicketTransfer = async () => {
    const t = ticketTransferModal.ticket;
    if (!t || !ticketTransferModal.targetRole) return;
    setTicketTransferModal(p => ({ ...p, submitting: true }));
    try {
      const res = await fetch(`${API_URL}/api/support/${t.id}/transfer`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          target_role: ticketTransferModal.targetRole,
          note: ticketTransferModal.note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTicketTransferModal({ ticket: null, targetRole: "finance_admin", note: "", submitting: false });
        await fetchTickets();
        if (selectedTicket?.id === t.id) {
          await fetchTicketDetails(t.id);
        }
      } else {
        await alertDialog({ title: "فشل التحويل", body: data?.error || "حاول مجدداً.", variant: "danger" });
        setTicketTransferModal(p => ({ ...p, submitting: false }));
      }
    } catch {
      await alertDialog({ title: "خطأ في الاتصال", body: "تحقق من الإنترنت وحاول مجدداً.", variant: "danger" });
      setTicketTransferModal(p => ({ ...p, submitting: false }));
    }
  };

  const openActionModal = (complaint: AccountComplaint, action: string) => {
    setSelectedComplaint(complaint);
    setActionType(action);
    setAdminNote(complaint.admin_note || "");
    setShowActionModal(true);
  };

  const executeAction = async () => {
    if (!selectedComplaint) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/${selectedComplaint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ status: actionType, adminNote }),
      });
      if (res.ok) {
        setShowActionModal(false);
        setSelectedComplaint(null);
        await Promise.all([fetchComplaints(), fetchComplaintStats()]);
      }
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // Open the in-platform transfer modal. The actual handoff fires from
  // executeTransfer below after the agent picks a destination + (optionally)
  // attaches a triage note explaining why.
  const openTransferModal = (complaint: AccountComplaint) => {
    setTransferTarget(complaint);
    setTransferNote("");
    setTransferRole("finance_admin");
  };
  const executeTransfer = async () => {
    if (!transferTarget) return;
    setTransferring(true);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/${transferTarget.id}/transfer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ target_role: transferRole, note: transferNote.trim() || undefined }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({} as any));
        toast.success(data.message || "تم تحويل الشكوى");
        setTransferTarget(null);
        setTransferNote("");
        await Promise.all([fetchComplaints(), fetchComplaintStats()]);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "خطأ في التحويل");
      }
    } catch (e) {
      toast.error("خطأ في الاتصال بالخادم");
    } finally {
      setTransferring(false);
    }
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesFilter = supportFilter === "all" || t.status === supportFilter;
    const matchesSearch = 
      t.subject?.toLowerCase().includes(supportSearch.toLowerCase()) ||
      t.user_name?.toLowerCase().includes(supportSearch.toLowerCase()) ||
      t.ticket_number?.toLowerCase().includes(supportSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredComplaints = complaints.filter((c) => {
    const matchesFilter = complaintFilter === "all" || c.status === complaintFilter;
    const matchesSearch = 
      c.subject?.toLowerCase().includes(complaintSearch.toLowerCase()) ||
      c.user_name?.toLowerCase().includes(complaintSearch.toLowerCase()) ||
      c.details?.toLowerCase().includes(complaintSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalNew = (supportStats?.new || 0) + complaintStats.new;
  const totalInProgress = (supportStats?.in_progress || 0) + complaintStats.in_review;
  const totalResolved = (supportStats?.resolved || 0) + complaintStats.closed;
  const totalAll = (supportStats?.total || 0) + complaintStats.total;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActionConfig = (action: string) => {
    switch (action) {
      case "in_review": return { title: "قيد المراجعة", color: "bg-amber-500 hover:bg-amber-600", icon: Eye };
      case "closed": return { title: "تم الحل", color: "bg-green-500 hover:bg-green-600", icon: CheckCircle };
      case "dismissed": return { title: "غير مقبول", color: "bg-slate-500 hover:bg-slate-600", icon: XCircle };
      default: return { title: "تحديث", color: "bg-blue-500 hover:bg-blue-600", icon: CheckCircle };
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[#002845]">خدمة العملاء</h1>
          <p className="text-slate-500 text-sm mt-1">إدارة طلبات الدعم الفني وشكاوى الحساب</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl hover:bg-[#001a2e] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Headset className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#002845]">{totalAll}</p>
              <p className="text-xs text-slate-500">إجمالي الطلبات</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{totalNew}</p>
              <p className="text-xs text-slate-500">جديد</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{totalInProgress}</p>
              <p className="text-xs text-slate-500">قيد المعالجة</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{totalResolved}</p>
              <p className="text-xs text-slate-500">تم الحل</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => switchTab("support")}
          className={`px-6 py-3 font-medium transition-all relative ${
            activeTab === "support"
              ? "text-[#002845] border-b-2 border-[#D4AF37]"
              : "text-slate-500 hover:text-[#002845]"
          }`}
        >
          <span className="flex items-center gap-2">
            <Headset className="w-4 h-4" />
            الدعم الفني
            {(supportStats?.new || 0) > 0 && (
              <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                {supportStats?.new}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => switchTab("complaints")}
          className={`px-6 py-3 font-medium transition-all relative ${
            activeTab === "complaints"
              ? "text-[#002845] border-b-2 border-[#D4AF37]"
              : "text-slate-500 hover:text-[#002845]"
          }`}
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            شكاوى الحساب
            {complaintStats.new > 0 && (
              <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                {complaintStats.new}
              </span>
            )}
          </span>
        </button>
      </div>

      {activeTab === "support" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="بحث في التذاكر..."
                value={supportSearch}
                onChange={(e) => setSupportSearch(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {["all", "new", "in_progress", "resolved", "closed"].map((status) => (
                <button
                  key={status}
                  onClick={() => setSupportFilter(status)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    supportFilter === status
                      ? "bg-[#002845] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {status === "all" ? "الكل" : supportStatusColors[status]?.label || status}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-[#D4AF37]" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
              <Headset className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">لا توجد تذاكر دعم</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTickets.map((ticket) => {
                // State-driven background colour. Owner's rule:
                // pink = customer waiting on us / new / urgent.
                // green = resolved. amber = in progress (we acted last).
                const tone =
                  ticket.status === "resolved" || ticket.status === "closed"
                    ? "bg-emerald-50 border-emerald-200"
                    : ticket.status === "new"
                      ? "bg-rose-50 border-rose-200"
                      : ticket.status === "in_progress"
                        ? "bg-amber-50 border-amber-200"
                        : "bg-white border-slate-200";
                const sel =
                  selectedTicket?.id === ticket.id
                    ? "ring-2 ring-[#D4AF37] shadow-pop"
                    : "shadow-sm";
                return (
                <div
                  key={ticket.id}
                  className={`${tone} rounded-2xl border ${sel} overflow-hidden transition-all`}
                >
                  <div className="p-4 md:p-6">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${supportStatusColors[ticket.status]?.bg} ${supportStatusColors[ticket.status]?.text}`}>
                            {supportStatusColors[ticket.status]?.label}
                          </span>
                          <span className={`px-2 py-1 rounded-lg text-xs ${priorityColors[ticket.priority]?.bg} ${priorityColors[ticket.priority]?.text}`}>
                            {priorityColors[ticket.priority]?.label}
                          </span>
                          {/* Unified ticket_type chip — falls back to
                              department when ticket_type isn't set
                              (legacy rows). */}
                          {(() => {
                            const typeKey = ticket.ticket_type || ticket.department || null;
                            const badge = typeKey && TICKET_TYPE_BADGES[typeKey];
                            if (!badge) return null;
                            return (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${badge.tone}`}>
                                <span>{badge.icon}</span>
                                {badge.label}
                              </span>
                            );
                          })()}
                          {ticket.related_property_id && (
                            <a
                              href={`/listing/${ticket.related_property_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition"
                              title="افتح صفحة الإعلان المُبلَّغ عنه"
                            >
                              🏠 افتح الإعلان
                            </a>
                          )}
                          <span className="text-xs text-slate-400 ms-auto">#{ticket.ticket_number}</span>
                        </div>

                        <h3 className="text-lg font-bold text-[#002845] mb-2">{ticket.subject}</h3>
                        <p className="text-sm text-slate-600 line-clamp-2 mb-3">{ticket.description}</p>
                        
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {ticket.user_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {ticket.user_email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatDate(ticket.created_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-4 h-4" />
                            {ticket.reply_count} ردود
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex md:flex-col gap-2">
                        <div className="flex flex-wrap gap-2 w-full md:flex-col">
                          <button
                            type="button"
                            onClick={() => handleSelectTicket(ticket)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#002845] text-white rounded-xl hover:bg-[#001a2e] transition text-sm font-medium min-w-0"
                          >
                            <Eye className="w-4 h-4 shrink-0" />
                            عرض والرد
                          </button>
                          {canHardDelete && (
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({ id: ticket.id, type: "support" })
                              }
                              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition text-sm font-medium"
                              title="مسح نهائي"
                            >
                              <Trash2 className="w-4 h-4 shrink-0" />
                              مسح نهائي
                            </button>
                          )}
                        </div>
                        {/* Transfer ⇄ — opens a modal asking which role
                            to send the ticket to. Ticket stays here too. */}
                        {!ticket.refund_id && (
                          <button
                            onClick={() => setTicketTransferModal({
                              ticket,
                              targetRole: ticket.finance_inbox_state === 'in_inbox' ? 'admin_manager' : 'finance_admin',
                              note: "",
                              submitting: false,
                            })}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-l from-[#FFFCEE] to-white border border-[#D4AF37]/40 text-[#9A7D28] rounded-xl hover:from-[#FFF7D6] hover:shadow-md transition text-sm font-black"
                          >
                            ⇄ تحويل
                          </button>
                        )}
                        {ticket.finance_inbox_state === 'in_inbox' && !ticket.refund_id && (
                          <span className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
                            ✓ مع المالية
                          </span>
                        )}
                        {ticket.refund_id && (
                          <span className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold">
                            ↪ {ticket.refund_case_number || `معاملة #${ticket.refund_id}`}
                          </span>
                        )}
                        {ticket.status === "new" && (
                          <button
                            onClick={() => {
                              setSelectedTicket(ticket);
                              handleUpdateTicketStatus("in_progress");
                            }}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition text-sm font-medium"
                          >
                            <Clock className="w-4 h-4" />
                            قيد المعالجة
                          </button>
                        )}
                        {(ticket.status === "in_progress" || ticket.status === "new") && (
                          <button
                            onClick={() => {
                              setSelectedTicket(ticket);
                              handleUpdateTicketStatus("resolved");
                            }}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                          >
                            <CheckCircle className="w-4 h-4" />
                            تم الحل
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {selectedTicket?.id === ticket.id && (
                    <div className="border-t border-slate-200 bg-slate-50 p-4 md:p-6">
                      <h4 className="text-sm font-bold text-[#002845] mb-4 flex items-center gap-2">
                        <MessageCircle className="w-4 h-4" />
                        المحادثة
                      </h4>
                      
                      <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
                        <div className="p-3 rounded-xl bg-slate-100">
                          <p className="text-xs text-slate-500 mb-1">الرسالة الأصلية</p>
                          <p className="text-sm text-slate-700">{ticket.description}</p>
                        </div>
                        
                        {replies.map((r) => {
                          const isInternal = r.visibility === "internal" || r.sender_type === "internal";
                          const isStaff = r.sender_type === "admin" || isInternal;
                          return (
                            <div
                              key={r.id}
                              className={`p-3 rounded-xl ${
                                isInternal
                                  ? "bg-amber-50 border-2 border-amber-300 mr-8"
                                  : isStaff
                                    ? "bg-[#002845] text-white mr-8"
                                    : "bg-white border border-slate-200 ml-8"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className={`text-xs ${isInternal ? "text-amber-900 font-bold" : isStaff ? "text-white/70" : "text-slate-500"}`}>
                                  {r.sender_name} {r.sender_role ? `· ${r.sender_role === "finance_admin" ? "المالية" : r.sender_role === "support_admin" ? "الدعم" : r.sender_role === "super_admin" ? "الإدارة العليا" : r.sender_role}` : ""}
                                </p>
                                <div className="flex items-center gap-1">
                                  {isInternal && (
                                    <span className="text-[10px] font-black bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                                      🔒 ملاحظة داخلية
                                    </span>
                                  )}
                                  <p className={`text-[10px] ${isInternal ? "text-amber-700" : isStaff ? "text-white/60" : "text-slate-400"}`}>
                                    {formatDate(r.created_at)}
                                  </p>
                                </div>
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Visibility toggle — same model as the
                          finance-inbox composer. Customer-visible
                          replies land in the customer's ticket view,
                          internal notes never reach the customer. */}
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => setReplyVisibility("customer_visible")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                            replyVisibility === "customer_visible"
                              ? "bg-sky-600 text-white shadow"
                              : "bg-white border border-slate-200 text-slate-600"
                          }`}
                        >
                          💬 رد للعميل
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplyVisibility("internal")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                            replyVisibility === "internal"
                              ? "bg-amber-500 text-white shadow"
                              : "bg-white border border-slate-200 text-slate-600"
                          }`}
                        >
                          🔒 ملاحظة داخلية
                        </button>
                        {replyVisibility === "internal" && (
                          <span className="text-[10px] text-amber-700 font-bold">
                            لن يراها العميل — للزملاء فقط
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder={replyVisibility === "internal" ? "ملاحظة داخلية لن يراها العميل..." : "اكتب ردك هنا..."}
                          className={`flex-1 px-4 py-2 border-2 rounded-xl focus:outline-none transition ${
                            replyVisibility === "internal"
                              ? "border-amber-300 bg-amber-50/40 focus:border-amber-500"
                              : "border-slate-200 focus:border-[#D4AF37]"
                          }`}
                          onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                        />
                        <button
                          onClick={handleSendReply}
                          disabled={!reply.trim() || sending}
                          className={`px-4 py-2 text-white rounded-xl transition disabled:opacity-50 ${
                            replyVisibility === "internal"
                              ? "bg-amber-500 hover:bg-amber-600"
                              : "bg-[#D4AF37] hover:bg-[#B8860B]"
                          }`}
                          title={replyVisibility === "internal" ? "إرسال كملاحظة داخلية" : "إرسال للعميل"}
                        >
                          {sending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "complaints" && (
        <div className="space-y-4">
          {complaintsTotalRows > 0 && (
            <p className="text-xs text-slate-500">
              إجمالي الشكاوى المطابقة لصلاحياتك: {complaintsTotalRows}
              {complaints.length < complaintsTotalRows
                ? ` — يُعرض حتى ${complaints.length} في هذه الصفحة (حد أقصى 100)`
                : ""}
            </p>
          )}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="بحث في الشكاوى..."
                value={complaintSearch}
                onChange={(e) => setComplaintSearch(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {["all", "new", "in_review", "closed", "dismissed"].map((status) => (
                <button
                  key={status}
                  onClick={() => setComplaintFilter(status)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    complaintFilter === status
                      ? "bg-[#002845] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {status === "all" ? "الكل" : complaintStatusColors[status]?.label || status}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-[#D4AF37]" />
            </div>
          ) : filteredComplaints.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
              <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">لا توجد شكاوى</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredComplaints.map((complaint) => {
                // Triage suggestion: does this complaint look financial?
                // We detect billing-flavor on EITHER category, complaint_type,
                // or an invoice attachment. We DON'T auto-transfer — that
                // would defeat the triage-first design. We just nudge the
                // agent so they don't accidentally close-out a real money
                // dispute as "resolved" when it needs Finance.
                const looksFinancial =
                  ["billing", "subscription", "refund"].includes(String(complaint.category || "")) ||
                  ["billing", "refund"].includes(String(complaint.complaint_type || "")) ||
                  complaint.invoice_id != null;
                const alreadyWithFinance = complaint.auto_assigned_role === "finance_admin";
                const suggestTransfer =
                  looksFinancial &&
                  !alreadyWithFinance &&
                  (complaint.status === "new" || complaint.status === "in_review");
                return (
                <div
                  key={complaint.id}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                    suggestTransfer ? "border-[#D4AF37]/60 ring-1 ring-[#D4AF37]/30" : "border-slate-200"
                  }`}
                >
                  {/* Triage hint strip — surfaces ONLY when this looks
                      financial and hasnt been transferred yet. Nudges
                      the agent toward the right governance flow
                      (Support triages → transfers to Finance). */}
                  {suggestTransfer && (
                    <div className="bg-gradient-to-l from-[#FFFCEE] via-[#FFF7E0] to-[#FFFCEE] border-b border-[#D4AF37]/30 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 text-[12px] text-[#9a7d28] font-bold">
                        <span className="text-base">🏦</span>
                        <span>شكوى ذات طابع مالي — يُفضّل تحويلها لقسم المالية بعد التواصل مع العميل</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openTransferModal(complaint)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] rounded-lg text-[11px] font-bold hover:opacity-90 transition active:scale-95 shadow-[0_4px_12px_-2px_rgba(212,175,55,0.4)]"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        تحويل للمالية الآن
                      </button>
                    </div>
                  )}
                  {alreadyWithFinance && (
                    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-[11px] text-amber-800 font-medium">
                      <Building2 className="w-3.5 h-3.5" />
                      محوّلة حالياً إلى قسم المالية
                    </div>
                  )}
                  <div className="p-4 md:p-6">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${complaintStatusColors[complaint.status]?.bg} ${complaintStatusColors[complaint.status]?.text}`}>
                            {complaintStatusColors[complaint.status]?.label}
                          </span>
                          <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs">
                            {complaintCategoryLabels[complaint.category] || complaint.category}
                          </span>
                          <span className="text-xs text-slate-400">#{complaint.id}</span>
                        </div>

                        <h3 className="text-lg font-bold text-[#002845] mb-2">{complaint.subject}</h3>
                        <p className="text-sm text-slate-600 line-clamp-2 mb-3">{complaint.details}</p>
                        
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {complaint.user_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {complaint.user_email}
                          </span>
                          {complaint.user_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-4 h-4" />
                              {complaint.user_phone}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatDate(complaint.created_at)}
                          </span>
                        </div>
                        
                        {complaint.admin_note && (
                          <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                            <p className="text-xs text-amber-600 font-medium mb-1">ملاحظة الإدارة:</p>
                            <p className="text-sm text-amber-800">{complaint.admin_note}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex md:flex-col gap-2">
                        {canHardDelete && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({ id: complaint.id, type: "complaint" })
                            }
                            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition text-sm font-medium w-full md:w-auto"
                            title="مسح نهائي"
                          >
                            <Trash2 className="w-4 h-4 shrink-0" />
                            مسح نهائي
                          </button>
                        )}
                        {complaint.status === "new" && (
                          <>
                            <button
                              onClick={() => openActionModal(complaint, "in_review")}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition text-sm font-medium"
                            >
                              <Eye className="w-4 h-4" />
                              قيد المراجعة
                            </button>
                            <button
                              onClick={() => openActionModal(complaint, "closed")}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                            >
                              <CheckCircle className="w-4 h-4" />
                              تم الحل
                            </button>
                            <button
                              onClick={() => openActionModal(complaint, "dismissed")}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition text-sm font-medium"
                            >
                              <XCircle className="w-4 h-4" />
                              غير مقبول
                            </button>
                            {complaint.auto_assigned_role !== "finance_admin" && (
                              <button
                                onClick={() => openTransferModal(complaint)}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#D4AF37]/15 text-[#9a7d28] border border-[#D4AF37]/40 rounded-xl hover:bg-[#D4AF37]/25 transition text-sm font-medium"
                                title="نقل المسؤولية إلى قسم آخر"
                              >
                                <Building2 className="w-4 h-4" />
                                تحويل
                              </button>
                            )}
                          </>
                        )}
                        {complaint.status === "in_review" && (
                          <>
                            <button
                              onClick={() => openActionModal(complaint, "closed")}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                            >
                              <CheckCircle className="w-4 h-4" />
                              تم الحل
                            </button>
                            <button
                              onClick={() => openActionModal(complaint, "dismissed")}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition text-sm font-medium"
                            >
                              <XCircle className="w-4 h-4" />
                              غير مقبول
                            </button>
                            {complaint.auto_assigned_role !== "finance_admin" && (
                              <button
                                onClick={() => openTransferModal(complaint)}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#D4AF37]/15 text-[#9a7d28] border border-[#D4AF37]/40 rounded-xl hover:bg-[#D4AF37]/25 transition text-sm font-medium"
                                title="نقل المسؤولية إلى قسم آخر"
                              >
                                <Building2 className="w-4 h-4" />
                                تحويل
                              </button>
                            )}
                          </>
                        )}
                        {(complaint.status === "closed" || complaint.status === "dismissed") && (
                          <span className="text-xs text-slate-400 text-center py-2">تم الإغلاق</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-7 w-7 text-red-600" />
              </div>
              <h3
                id="delete-modal-title"
                className="text-lg font-black text-[#002845] mb-2"
              >
                مسح نهائي
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-1">
                هل أنت متأكد من المسح النهائي؟ لا يمكن التراجع عن هذا الإجراء وسيتم
                حذف جميع الردود المرتبطة.
              </p>
              <p className="text-xs text-slate-400 mb-6">
                {deleteTarget.type === "support"
                  ? "تذكرة الدعم الفني"
                  : "شكوى الحساب"}{" "}
                #{deleteTarget.id}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => !isDeleting && setDeleteTarget(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmDelete()}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري المسح…
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      تأكيد المسح
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showActionModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#002845]">
                {getActionConfig(actionType).title}
              </h3>
              <button
                onClick={() => setShowActionModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm text-slate-600 mb-2">ملاحظة للعميل (اختياري)</label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="اكتب ملاحظة للعميل..."
                className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] resize-none"
                rows={3}
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowActionModal(false)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
              >
                إلغاء
              </button>
              <button
                onClick={executeAction}
                disabled={submitting}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition disabled:opacity-50 ${getActionConfig(actionType).color}`}
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : "تأكيد"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer modal — agent picks destination + optional reason. */}
      {/* Generic ticket transfer modal (Round 3.1) */}
      {ticketTransferModal.ticket && (
        <div className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="h-1.5 bg-gradient-to-l from-[#D4AF37] via-[#B8860B] to-[#002845]" />
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-black text-[#002845]">تحويل التذكرة</h3>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                {ticketTransferModal.ticket.ticket_number} · {ticketTransferModal.ticket.user_name}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              <div>
                <label className="block text-xs font-black text-[#002845] mb-2">إلى</label>
                <div className="space-y-2">
                  {[
                    { value: "finance_admin",  label: "💰 قسم المالية",     hint: "للاستردادات والمدفوعات" },
                    { value: "content_admin",  label: "📋 إدارة المحتوى",   hint: "للإعلانات والمحتوى" },
                    { value: "admin_manager",  label: "🧑‍💼 المدير الإداري", hint: "للقرارات الإدارية" },
                    { value: "super_admin",    label: "👑 الإدارة العليا",  hint: "للحالات الحرجة" },
                    { value: "support_admin",  label: "🎧 الدعم الفني",     hint: "إعادة للدعم" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTicketTransferModal(p => ({ ...p, targetRole: opt.value }))}
                      className={`w-full text-right p-3 rounded-xl border-2 transition flex items-center justify-between ${
                        ticketTransferModal.targetRole === opt.value
                          ? "border-[#D4AF37] bg-[#FFFCEE] shadow-md"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div>
                        <p className="font-black text-[#002845]">{opt.label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{opt.hint}</p>
                      </div>
                      {ticketTransferModal.targetRole === opt.value && (
                        <span className="text-[#D4AF37] font-black">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-[#002845] mb-1">ملاحظة (اختيارية)</label>
                <textarea
                  value={ticketTransferModal.note}
                  onChange={(e) => setTicketTransferModal(p => ({ ...p, note: e.target.value }))}
                  rows={2}
                  placeholder="مثال: العميل مصرّ على استرداد كامل المبلغ."
                  className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-sm outline-none resize-y"
                />
              </div>
            </div>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
              <button
                onClick={() => setTicketTransferModal({ ticket: null, targetRole: "finance_admin", note: "", submitting: false })}
                disabled={ticketTransferModal.submitting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-white"
              >
                إلغاء
              </button>
              <button
                onClick={() => void submitTicketTransfer()}
                disabled={ticketTransferModal.submitting}
                className="px-5 py-2 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] text-sm font-black inline-flex items-center gap-2 disabled:opacity-50"
              >
                {ticketTransferModal.submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                تأكيد التحويل
              </button>
            </div>
          </div>
        </div>
      )}

      {transferTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 bg-gradient-to-l from-[#FFF7E0] to-white border-b border-[#D4AF37]/30 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#D4AF37]" />
                تحويل الشكوى
              </h3>
              <button
                onClick={() => { if (!transferring) setTransferTarget(null); }}
                disabled={transferring}
                className="p-1 hover:bg-white rounded-lg transition disabled:opacity-50"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-1">الشكوى</p>
                <p className="text-sm font-semibold text-[#002845] truncate">{transferTarget.subject || "—"}</p>
                {transferTarget.user_name && (
                  <p className="text-xs text-slate-500 mt-0.5">من: {transferTarget.user_name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">
                  إلى أين تريد التحويل؟
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { role: "finance_admin", label: "المالية", hint: "مشاكل الفواتير، الاسترداد، الاشتراكات", icon: "💰" },
                    { role: "content_admin", label: "فريق المحتوى", hint: "الإعلانات، الخريطة، مشاكل العرض", icon: "📋" },
                    { role: "admin_manager", label: "مدير الإدارة", hint: "حالات تحتاج تنسيق بين الأقسام", icon: "🎯" },
                    { role: "admin",         label: "الإدارة العليا", hint: "تصعيد للقيادة — حالات استثنائية", icon: "👑" },
                  ].map((opt) => {
                    const selected = transferRole === opt.role;
                    return (
                      <button
                        key={opt.role}
                        type="button"
                        onClick={() => setTransferRole(opt.role)}
                        disabled={transferring}
                        className={`text-right p-3 rounded-xl border-2 transition flex items-center gap-3 ${
                          selected
                            ? "border-[#D4AF37] bg-[#D4AF37]/10"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        } disabled:opacity-50`}
                      >
                        <span className="text-xl shrink-0">{opt.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold ${selected ? "text-[#002845]" : "text-slate-700"}`}>{opt.label}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{opt.hint}</p>
                        </div>
                        {selected && <CheckCircle className="w-4 h-4 text-[#D4AF37] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  سبب التحويل <span className="text-slate-400 font-normal">(اختياري)</span>
                </label>
                <textarea
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  placeholder="مثلاً: مرتبطة بفاتورة #1234، تحتاج مراجعة استرداد..."
                  rows={2}
                  className="w-full p-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 p-5 pt-3 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setTransferTarget(null)}
                disabled={transferring}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition disabled:opacity-50 text-sm font-medium"
              >
                إلغاء
              </button>
              <button
                onClick={executeTransfer}
                disabled={transferring}
                className="flex-1 px-4 py-2.5 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] rounded-lg hover:shadow-md transition disabled:opacity-50 text-sm font-bold inline-flex items-center justify-center gap-2"
              >
                {transferring ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                {transferring ? "جاري التحويل..." : "تأكيد التحويل"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
