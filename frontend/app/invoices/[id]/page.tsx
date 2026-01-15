"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Download, Mail, ArrowLeft, FileText, Building2, Calendar, CreditCard } from "lucide-react";
import { useRouter, useParams } from "next/navigation";

type Invoice = {
  id: number;
  invoice_number: string;
  user_id: string;
  payment_id: number;
  plan_id: number;
  subtotal: string;
  vat_rate: string;
  vat_amount: string;
  total: string;
  currency: string;
  status: string;
  pdf_path: string | null;
  email_sent_at: string | null;
  issued_at: string;
  created_at: string;
  plan_name: string;
  plan_name_en: string;
  duration_days: number;
  user_name: string;
  user_email: string;
  user_phone: string | null;
  transaction_id: string;
  payment_method: string;
  description?: string;
  invoice_type?: string;
  previous_plan_name?: string;
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  async function fetchInvoice() {
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      // Try finance endpoint first (for admins)
      let res = await fetch(`/api/finance/invoices/${invoiceId}`, {
        credentials: "include",
        headers,
      });
      
      let isAdminEndpoint = true;
      
      // If not authorized as admin, try user endpoint
      if (res.status === 403) {
        isAdminEndpoint = false;
        res = await fetch(`/api/payments/invoices/${invoiceId}`, {
          credentials: "include",
          headers,
        });
      }

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.status === 404) {
        router.push("/account");
        return;
      }

      if (!res.ok) {
        console.error("Failed to fetch invoice:", res.status);
        return;
      }

      const data = await res.json();
      // Both endpoints return { invoice: ... }
      setInvoice(data.invoice || data);
    } catch (error) {
      console.error("Error fetching invoice:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#fef8e6] to-[#f7e8b7] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#fef8e6] to-[#f7e8b7] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <FileText className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <p className="text-lg text-slate-600">الفاتورة غير موجودة</p>
          <button 
            onClick={() => router.push("/account")}
            className="mt-4 px-6 py-2 bg-[#002845] text-white rounded-xl hover:opacity-90"
          >
            العودة للحساب
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fef8e6] to-[#f7e8b7]" dir="rtl">
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6 print:hidden">
            <button 
              onClick={() => router.back()}
              className="flex items-center gap-2 text-[#002845] hover:text-[#D4AF37] transition"
            >
              <ArrowLeft className="w-5 h-5" />
              رجوع
            </button>
            
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl hover:opacity-90 transition"
              >
                <Download className="w-4 h-4" />
                طباعة / تحميل
              </button>
            </div>
          </div>

          <div id="invoice-content" className="bg-white rounded-3xl shadow-xl p-8 print:shadow-none print:rounded-none print:p-4">
            <div className="flex justify-between items-start mb-8 border-b pb-6">
              <div>
                <h1 className="text-2xl font-bold text-[#002845] mb-1">فاتورة ضريبية</h1>
                <p className="text-slate-600">Tax Invoice</p>
              </div>
              <div className="text-left flex items-center gap-3">
                <img src="/logo.svg" alt="بيت الجزيرة" className="w-12 h-12 object-contain print:w-10 print:h-10" />
                <div>
                  <div className="text-2xl font-bold text-[#D4AF37]">بيت الجزيرة</div>
                  <div className="text-sm text-slate-600">Bait Al-Jazeera</div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-slate-50 rounded-2xl p-4">
                <h3 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  معلومات البائع
                </h3>
                <div className="space-y-1 text-sm">
                  <p className="font-bold text-[#002845]">شركة بيت الجزيرة للتسويق العقاري</p>
                  <p className="text-slate-600">الرقم الضريبي: 300000000000003</p>
                  <p className="text-slate-600">الرياض، المملكة العربية السعودية</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4">
                <h3 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  معلومات المشتري
                </h3>
                <div className="space-y-1 text-sm">
                  <p className="font-bold text-[#002845]">{invoice.user_name}</p>
                  <p className="text-slate-600">{invoice.user_email}</p>
                  {invoice.user_phone && <p className="text-slate-600">{invoice.user_phone}</p>}
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <div className="bg-[#fef8e6] rounded-xl p-4 text-center">
                <div className="text-xs text-slate-500 mb-1">رقم الفاتورة</div>
                <div className="font-mono font-bold text-[#002845]">{invoice.invoice_number}</div>
              </div>
              <div className="bg-[#fef8e6] rounded-xl p-4 text-center">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
                  <Calendar className="w-3 h-3" />
                  تاريخ الإصدار
                </div>
                <div className="font-bold text-[#002845]">{formatDate(invoice.issued_at)}</div>
              </div>
              <div className="bg-[#fef8e6] rounded-xl p-4 text-center">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  طريقة الدفع
                </div>
                <div className="font-bold text-[#002845]">
                  {invoice.payment_method === "credit_card" ? "بطاقة ائتمان" : "تحويل بنكي"}
                </div>
              </div>
            </div>

            <div className="border rounded-2xl overflow-hidden mb-8">
              <table className="w-full">
                <thead className="bg-[#002845] text-white">
                  <tr>
                    <th className="text-right px-4 py-3">الوصف</th>
                    <th className="text-center px-4 py-3">المدة</th>
                    <th className="text-left px-4 py-3">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-4">
                      <div className="font-bold text-[#002845]">
                        {invoice.invoice_type === 'upgrade' 
                          ? `ترقية إلى باقة ${invoice.plan_name}` 
                          : invoice.invoice_type === 'renewal'
                          ? `تجديد باقة ${invoice.plan_name}`
                          : `اشتراك باقة ${invoice.plan_name}`}
                      </div>
                      <div className="text-sm text-slate-500">
                        {invoice.invoice_type === 'upgrade' 
                          ? `Upgrade to ${invoice.plan_name_en}` 
                          : invoice.invoice_type === 'renewal'
                          ? `${invoice.plan_name_en} Renewal`
                          : `${invoice.plan_name_en} Subscription`}
                      </div>
                      {invoice.previous_plan_name && invoice.invoice_type === 'upgrade' && (
                        <div className="text-xs text-slate-400 mt-1">
                          من: {invoice.previous_plan_name}
                        </div>
                      )}
                    </td>
                    <td className="text-center px-4 py-4 text-slate-600">
                      {invoice.duration_days} يوم
                    </td>
                    <td className="text-left px-4 py-4 font-bold">
                      {parseFloat(invoice.subtotal).toFixed(2)} {invoice.currency}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mb-8">
              <div className="w-full md:w-80 space-y-2">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-[#002845]">الإجمالي</span>
                  <span className="text-[#D4AF37]">{parseFloat(invoice.total).toFixed(2)} {invoice.currency}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 mb-6">
              <div className="text-xs text-slate-500 mb-1">رقم العملية / Transaction ID</div>
              <div className="font-mono text-sm text-[#002845]">{invoice.transaction_id}</div>
            </div>

            {invoice.email_sent_at && (
              <div className="flex items-center gap-2 text-sm text-green-600 mb-4">
                <Mail className="w-4 h-4" />
                تم إرسال نسخة من الفاتورة إلى بريدك الإلكتروني
              </div>
            )}

            <div className="text-center text-xs text-slate-400 border-t pt-4">
              <p>شكراً لاختياركم بيت الجزيرة</p>
              <p className="mt-1">هذه فاتورة إلكترونية صادرة وفقاً لنظام الفوترة الإلكترونية في المملكة العربية السعودية</p>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          html, body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden;
          }
          #invoice-content,
          #invoice-content * {
            visibility: visible !important;
          }
          #invoice-content {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            width: 100%;
            padding: 20px !important;
            background: white !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          table thead {
            background-color: #002845 !important;
            -webkit-print-color-adjust: exact !important;
          }
          table thead th {
            color: white !important;
          }
        }
      `}</style>
    </div>
  );
}
