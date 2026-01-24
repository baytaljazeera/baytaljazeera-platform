"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
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
}

export default function FinancePage() {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [allRefunds, setAllRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "subscribers" | "refunds" | "payments" | "invoices" | "messages" | "withdrawals">("overview");
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
    loading: boolean;
  }>({ isOpen: false, refund: null, bankReference: "", loading: false });

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

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      const res = await fetch("/api/plans", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error("Error fetching plans:", err);
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

  async function fetchWithdrawalRequests() {
    try {
      const status = withdrawalFilter === "all" ? "all" : withdrawalFilter;
      const res = await fetch(`/api/ambassador/admin/financial-requests?status=${status}`, { credentials: "include" });
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
      const res = await fetch("/api/finance/refunds", { credentials: "include" });
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
      const res = await fetch("/api/finance/payments", { credentials: "include" });
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
      const res = await fetch("/api/finance/invoices", { credentials: "include" });
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
      const res = await fetch("/api/finance/payment-stats", { credentials: "include" });
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
      const res = await fetch("/api/finance/stats", { credentials: "include" });
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
      const res = await fetch(url, { credentials: "include" });
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
      const res = await fetch(url, { credentials: "include" });
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

  function openReviewModal(refund: Refund, action: "approve" | "reject") {
    setReviewModal({ isOpen: true, refund, action, note: "", loading: false, subscriptionAction: "none", cancelQuota: false });
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
    setPayoutModal({ isOpen: true, refund, bankReference: "", loading: false });
  }

  async function confirmPayout() {
    if (!payoutModal.refund) return;
    
    setPayoutModal(prev => ({ ...prev, loading: true }));
    
    try {
      const res = await fetch(`/api/finance/refunds/${payoutModal.refund.id}/confirm-payout`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank_reference: payoutModal.bankReference }),
      });
      
      setPayoutModal({ isOpen: false, refund: null, bankReference: "", loading: false });
      
      if (res.ok) {
        setSuccessModal({ isOpen: true, message: "تم تأكيد التحويل البنكي بنجاح", type: "success" });
        fetchRefunds(refundFilter);
        fetchAllRefunds();
        fetchStats();
      } else {
        const error = await res.json();
        setSuccessModal({ isOpen: true, message: error.error || "حدث خطأ", type: "error" });
      }
    } catch (err) {
      console.error("Error confirming payout:", err);
      setPayoutModal({ isOpen: false, refund: null, bankReference: "", loading: false });
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
      const res = await fetch("/api/finance/refunds", {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">المالية والاشتراكات</h1>
          <p className="text-sm text-gray-500 mt-1">إدارة المدفوعات والاشتراكات والاستردادات</p>
        </div>
        <button
          onClick={() => { fetchStats(); fetchSubscribers(); fetchRefunds(); fetchAllRefunds(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl hover:bg-[#003d5c] transition"
        >
          <RefreshCw className="w-4 h-4" />
          تحديث
        </button>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {(() => {
          const pendingCount = allRefunds.filter(r => r.status === 'pending').length;
          const awaitingPayoutCount = allRefunds.filter(r => r.status === 'approved' && !r.payout_confirmed_at).length;
          
          const withdrawalPendingCount = stats?.revenue?.pendingWithdrawalRequestsCount || 0;
          
          return [
            { id: "overview", label: "نظرة عامة", icon: TrendingUp },
            { id: "payments", label: "المدفوعات", icon: CreditCard },
            { id: "invoices", label: "الفواتير", icon: PiggyBank },
            { id: "subscribers", label: "المشتركون", icon: Users },
            { id: "refunds", label: "الاستردادات", icon: Wallet, pendingCount, awaitingPayoutCount },
            { id: "withdrawals", label: "طلبات سحب السفراء", icon: DollarSign, pendingCount: withdrawalPendingCount },
            { id: "messages", label: "مراسلات المالية", icon: MessageSquare },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition ${
                activeTab === tab.id
                  ? "border-[#D4AF37] text-[#D4AF37] font-bold"
                  : "border-transparent text-gray-500 hover:text-[#002845]"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.id === 'refunds' && (pendingCount > 0 || awaitingPayoutCount > 0) && (
                <span className="flex items-center gap-1 mr-1">
                  {pendingCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {pendingCount}
                    </span>
                  )}
                  {awaitingPayoutCount > 0 && (
                    <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {awaitingPayoutCount}
                    </span>
                  )}
                </span>
              )}
              {tab.id === 'withdrawals' && (tab.pendingCount || 0) > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {tab.pendingCount || 0}
                </span>
              )}
            </button>
          ));
        })()}
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
                      <span className="text-[#002845]">{item.subscriptions} اشتراك</span>
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

      {activeTab === "refunds" && (
        <div className="space-y-4">
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
        <div className="bg-white rounded-2xl p-8 text-center">
          <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#002845]">مراسلات المالية</h3>
          <p className="text-gray-500 mt-2">
            هنا ستظهر رسائل العملاء المتعلقة بالمالية والدفع
          </p>
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
                  <span className="text-gray-600">المبلغ:</span>
                  <span className="font-bold text-[#D4AF37]">{formatCurrency(reviewModal.refund.amount)}</span>
                </div>
                {reviewModal.refund.reason && (
                  <div className="mt-2 text-sm">
                    <span className="text-gray-600">السبب:</span>
                    <p className="text-gray-800 mt-1">{reviewModal.refund.reason}</p>
                  </div>
                )}
              </div>
              
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 bg-blue-50">
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
                  <AlertTriangle className="w-4 h-4" />
                  تأكد من أنك قمت بتحويل المبلغ فعلياً عبر النظام البنكي قبل التأكيد
                </p>
              </div>
            </div>
            
            <div className="p-4 flex gap-3">
              <button
                onClick={confirmPayout}
                disabled={payoutModal.loading}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold transition disabled:opacity-50"
              >
                {payoutModal.loading ? "جاري التأكيد..." : "تأكيد التحويل"}
              </button>
              <button
                onClick={() => setPayoutModal({ isOpen: false, refund: null, bankReference: "", loading: false })}
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

      {successModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
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
              <p className={`text-lg font-bold ${
                successModal.type === "success" ? "text-green-800" : "text-red-800"
              }`}>
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
