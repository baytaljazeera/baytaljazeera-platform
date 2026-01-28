"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast, Toaster } from "sonner";
import { 
  Receipt, AlertCircle, CheckCircle2, Clock, XCircle, 
  Banknote, ExternalLink, ArrowLeft
} from "lucide-react";

type Invoice = {
  id: number;
  invoice_number: string;
  plan_name: string;
  subtotal: string;
  vat_amount: string;
  total: string;
  created_at: string;
  refund_id?: number;
  refund_status?: string;
  refund_reason?: string;
  refund_created_at?: string;
  decision_note?: string;
  payout_confirmed_at?: string;
  refund_invoice_number?: string;
};

type RefundInvoice = {
  id: number;
  invoice_number: string;
  invoice_type: string;
  plan_name: string;
  subtotal: string;
  total: string;
  created_at: string;
  payout_confirmed_at?: string;
  bank_reference?: string;
  original_invoice_number?: string;
};

function getRefundStatusBadge(status?: string) {
  if (!status) return null;
  
  switch (status) {
    case 'pending':
      return { text: 'قيد المراجعة', color: 'bg-amber-100 text-amber-700', icon: Clock };
    case 'approved':
      return { text: 'تمت الموافقة', color: 'bg-green-100 text-green-700', icon: CheckCircle2 };
    case 'rejected':
      return { text: 'غير مقبول', color: 'bg-red-100 text-red-700', icon: XCircle };
    case 'completed':
      return { text: 'تم التحويل', color: 'bg-blue-100 text-blue-700', icon: Banknote };
    default:
      return null;
  }
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [refundInvoices, setRefundInvoices] = useState<RefundInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [submittingRefund, setSubmittingRefund] = useState(false);

  useEffect(() => {
    fetchInvoices();
    // تحديث آخر زيارة للفواتير
    fetch('/api/account/pending-counts/invoices/seen', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).catch(() => {});
  }, []);

  async function fetchInvoices() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/account/invoices`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        return;
      }
      
      const data = await res.json();
      setInvoices(data.invoices || []);
      setRefundInvoices(data.refundInvoices || []);
    } catch (err) {
      console.error("Error fetching invoices:", err);
    } finally {
      setLoading(false);
    }
  }

  function openRefundModal(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setRefundReason("");
    setRefundModalOpen(true);
  }

  async function submitRefundRequest() {
    if (!selectedInvoice || !refundReason.trim()) {
      toast.error("يرجى إدخال سبب الاعتراض");
      return;
    }

    setSubmittingRefund(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/account/refunds`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          invoice_id: selectedInvoice.id,
          reason: refundReason.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "حدث خطأ أثناء تقديم الطلب");
        return;
      }

      toast.success("تم تقديم طلب الاسترداد بنجاح");
      setRefundModalOpen(false);
      fetchInvoices();
    } catch (err) {
      console.error("Error submitting refund:", err);
      toast.error("حدث خطأ أثناء تقديم الطلب");
    } finally {
      setSubmittingRefund(false);
    }
  }

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] to-[#fdf6db] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] via-[#123a64] to-[#fdf6db] py-10 px-4">
      <Toaster position="top-center" richColors />
      
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8"
        >
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-3">
            <Receipt className="w-6 sm:w-7 h-6 sm:h-7 text-[#D4AF37]" />
            فواتيري
          </h1>
          
          <Link
            href="/account"
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            العودة لحسابي
          </Link>
        </motion.div>

        {invoices.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl p-12 text-center"
          >
            <Receipt className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h2 className="text-xl font-bold text-slate-600 mb-2">لا توجد فواتير</h2>
            <p className="text-slate-500">لم تقم بأي عمليات شراء حتى الآن</p>
            <Link
              href="/upgrade"
              className="inline-block mt-6 px-6 py-3 bg-[#D4AF37] hover:bg-[#c9a230] text-white font-bold rounded-xl transition"
            >
              ترقية الاشتراك
            </Link>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="bg-gradient-to-r from-[#003366] to-[#01375e] p-4">
              <p className="text-white/80 text-sm">
                إجمالي الفواتير: <span className="text-white font-bold">{invoices.length}</span>
              </p>
            </div>
            
            <div className="divide-y divide-slate-100">
              {invoices.map((invoice, index) => {
                const refundBadge = getRefundStatusBadge(invoice.refund_status);
                const canRequestRefund = !invoice.refund_id || invoice.refund_status === 'rejected';
                
                return (
                  <motion.div
                    key={`${invoice.id}-${invoice.invoice_number}-${index}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-5 hover:bg-slate-50 transition"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-[#003366] text-lg">{invoice.invoice_number}</span>
                          {refundBadge && (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${refundBadge.color}`}>
                              <refundBadge.icon className="w-3 h-3" />
                              {refundBadge.text}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                          <span className="bg-[#003366]/10 text-[#003366] px-2 py-0.5 rounded font-medium">
                            {invoice.plan_name}
                          </span>
                          <span className="font-bold text-[#D4AF37]">
                            {parseFloat(invoice.total).toLocaleString()} ر.س
                          </span>
                          <span className="text-slate-400">
                            {new Date(invoice.created_at).toLocaleDateString('ar-SA', { 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            })}
                          </span>
                        </div>
                        
                        {invoice.decision_note && invoice.refund_status && invoice.refund_status !== 'pending' && (
                          <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                            <strong>ملاحظة الإدارة:</strong> {invoice.decision_note}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          عرض الفاتورة
                        </Link>
                        
                        {canRequestRefund && (
                          <button
                            onClick={() => openRefundModal(invoice)}
                            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl font-medium transition text-sm"
                          >
                            <AlertCircle className="w-4 h-4" />
                            طلب اعتراض
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* فواتير الاسترداد */}
        {refundInvoices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-xl overflow-hidden mt-6"
          >
            <div className="bg-gradient-to-r from-green-600 to-green-700 p-4">
              <p className="text-white font-bold flex items-center gap-2">
                <Banknote className="w-5 h-5" />
                فواتير الاسترداد
              </p>
              <p className="text-white/80 text-sm">
                إجمالي فواتير الاسترداد: <span className="text-white font-bold">{refundInvoices.length}</span>
              </p>
            </div>
            
            <div className="divide-y divide-slate-100">
              {refundInvoices.map((refund, index) => (
                <motion.div
                  key={`refund-${refund.id}-${index}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-5 hover:bg-green-50 transition"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-green-700 text-lg">{refund.invoice_number}</span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle2 className="w-3 h-3" />
                          فاتورة استرداد
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                          {refund.plan_name}
                        </span>
                        <span className="font-bold text-green-600">
                          +{parseFloat(refund.total).toLocaleString()} ر.س
                        </span>
                        <span className="text-slate-400">
                          {refund.created_at ? new Date(refund.created_at).toLocaleDateString('ar-SA', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          }) : '-'}
                        </span>
                      </div>
                      
                      {refund.original_invoice_number && (
                        <div className="mt-2 text-xs text-slate-500">
                          الفاتورة الأصلية: {refund.original_invoice_number}
                        </div>
                      )}
                      
                      {refund.bank_reference && (
                        <div className="mt-1 text-xs text-slate-500">
                          مرجع التحويل البنكي: {refund.bank_reference}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/refund-invoices/${refund.id}`}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-100 hover:bg-green-200 text-green-700 rounded-xl font-medium transition text-sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                        عرض الفاتورة
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {refundModalOpen && selectedInvoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setRefundModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#003366]">طلب اعتراض / استرداد</h3>
                  <p className="text-sm text-slate-500">فاتورة رقم: {selectedInvoice.invoice_number}</p>
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-xl p-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">الباقة:</span>
                  <span className="font-medium">{selectedInvoice.plan_name}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-600">المبلغ:</span>
                  <span className="font-bold text-[#003366]">{parseFloat(selectedInvoice.subtotal).toLocaleString()} ر.س</span>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">سبب الاعتراض *</label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  rows={4}
                  placeholder="اشرح سبب طلب الاسترداد..."
                  className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none resize-none"
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setRefundModalOpen(false)}
                  className="flex-1 px-4 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={submitRefundRequest}
                  disabled={submittingRefund || !refundReason.trim()}
                  className="flex-1 px-4 py-3 bg-[#D4AF37] hover:bg-[#c9a230] text-white rounded-xl font-bold transition disabled:opacity-50"
                >
                  {submittingRefund ? "جاري الإرسال..." : "إرسال الطلب"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
