"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { Loader2, Download, ArrowLeft, FileText, Printer } from "lucide-react";
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
  currency_symbol?: string;
  referrer_name?: string;
  referrer_code?: string;
};

function formatDateAr(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateEn(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTimeAr(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeEn(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDueDate(dateStr: string) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 7);
  return d;
}

function getStatusLabel(status: string) {
  const map: Record<string, { ar: string; en: string; color: string; bg: string }> = {
    paid: { ar: "مدفوعة", en: "Paid", color: "text-emerald-800", bg: "bg-emerald-100" },
    pending: { ar: "مستحقة", en: "Due", color: "text-amber-800", bg: "bg-amber-100" },
    processing: { ar: "قيد المعالجة", en: "Processing", color: "text-blue-800", bg: "bg-blue-100" },
    cancelled: { ar: "ملغاة", en: "Cancelled", color: "text-red-800", bg: "bg-red-100" },
    refunded: { ar: "مستردة", en: "Refunded", color: "text-purple-800", bg: "bg-purple-100" },
  };
  return map[status] || { ar: status, en: status, color: "text-slate-800", bg: "bg-slate-100" };
}

function getPaymentMethodLabel(method: string) {
  const map: Record<string, { ar: string; en: string }> = {
    credit_card: { ar: "بطاقة ائتمان", en: "Credit Card" },
    bank_transfer: { ar: "تحويل بنكي", en: "Bank Transfer" },
    stripe: { ar: "بطاقة ائتمان", en: "Credit Card" },
    free_trial: { ar: "تجربة مجانية", en: "Free Trial" },
    promotion: { ar: "عرض ترويجي", en: "Promotion" },
  };
  return map[method] || { ar: "تحويل بنكي", en: "Bank Transfer" };
}

function getServiceDescription(invoice: Invoice) {
  if (invoice.invoice_type === "upgrade") {
    return {
      ar: `ترقية إلى باقة ${invoice.plan_name}`,
      en: `Upgrade to ${invoice.plan_name_en || invoice.plan_name} Plan`,
    };
  }
  if (invoice.invoice_type === "renewal") {
    return {
      ar: `تجديد باقة ${invoice.plan_name}`,
      en: `${invoice.plan_name_en || invoice.plan_name} Plan Renewal`,
    };
  }
  return {
    ar: `اشتراك باقة ${invoice.plan_name}`,
    en: `${invoice.plan_name_en || invoice.plan_name} Plan Subscription`,
  };
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (invoiceId) fetchInvoice();
  }, [invoiceId]);

  async function fetchInvoice() {
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      let res = await fetch(`/api/finance/invoices/${invoiceId}`, {
        credentials: "include",
        headers,
      });

      if (res.status === 403) {
        res = await fetch(`/api/payments/invoices/${invoiceId}`, {
          credentials: "include",
          headers,
        });
      }

      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 404) { router.push("/account"); return; }
      if (!res.ok) return;

      const data = await res.json();
      setInvoice(data.invoice || data);
    } catch (error) {
      console.error("Error fetching invoice:", error);
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF5] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37] mx-auto" />
          <p className="text-[#01273C]/60 mt-3 text-sm">جاري تحميل الفاتورة...</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-[#FDFBF5] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <FileText className="w-16 h-16 text-[#01273C]/20 mx-auto mb-4" />
          <p className="text-lg text-[#01273C]/60">الفاتورة غير موجودة</p>
          <button
            onClick={() => router.push("/account")}
            className="mt-4 px-6 py-2.5 bg-[#01273C] text-white rounded-xl hover:bg-[#01273C]/90 transition"
          >
            العودة للحساب
          </button>
        </div>
      </div>
    );
  }

  const subtotal = parseFloat(invoice.subtotal || invoice.total);
  const total = parseFloat(invoice.total);
  const currency = invoice.currency || "SAR";
  const currencySymbol = invoice.currency_symbol || "ر.س";
  const statusInfo = getStatusLabel(invoice.status);
  const paymentMethod = getPaymentMethodLabel(invoice.payment_method);
  const serviceDesc = getServiceDescription(invoice);
  const dueDate = getDueDate(invoice.issued_at || invoice.created_at);

  return (
    <div className="min-h-screen bg-[#FDFBF5]" dir="rtl">
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-[800px] mx-auto">
          <div className="flex items-center justify-between mb-6 print:hidden">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-[#01273C] hover:text-[#D4AF37] transition text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              رجوع
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#01273C] text-white rounded-xl hover:bg-[#01273C]/90 transition text-sm font-medium shadow-lg shadow-[#01273C]/20"
            >
              <Printer className="w-4 h-4" />
              طباعة / تحميل PDF
            </button>
          </div>

          <div id="invoice-content" className="bg-white rounded-2xl shadow-2xl shadow-[#01273C]/5 overflow-hidden print:shadow-none print:rounded-none">

            <div className="bg-gradient-to-l from-[#01273C] to-[#013A5C] px-8 py-7 flex justify-between items-center">
              <div>
                <h1 className="text-[28px] font-bold text-white leading-tight">فاتورة</h1>
                <p className="text-white/60 text-sm mt-0.5 tracking-wide">Invoice</p>
              </div>
              <div className="flex items-center gap-3 text-left" dir="ltr">
                <div>
                  <div className="text-[22px] font-bold text-[#D4AF37]">بيت الجزيرة</div>
                  <div className="text-white/50 text-xs tracking-wider">BAIT AL-JAZEERA</div>
                </div>
                <img src="/logo.svg" alt="بيت الجزيرة" className="w-12 h-12 object-contain brightness-0 invert opacity-80" />
              </div>
            </div>

            <div className="px-8 py-2 bg-[#D4AF37]/10 border-b border-[#D4AF37]/20 text-center">
              <p className="text-[#01273C] text-sm font-medium">
                فاتورة خدمات عقارية
                <span className="mx-2 text-[#D4AF37]">|</span>
                <span className="text-[#01273C]/60">Real Estate Services Invoice</span>
              </p>
            </div>

            <div className="px-8 py-6">

              <div className="grid md:grid-cols-2 gap-6 mb-7">
                <div className="bg-[#FDFBF5] rounded-xl p-5 border border-[#E8E0CC]">
                  <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider mb-3">
                    معلومات المزوّد <span className="text-[#01273C]/40 font-normal">| Seller</span>
                  </h3>
                  <div className="space-y-1.5">
                    <p className="font-bold text-[#01273C] text-lg tracking-wide">IFAZ</p>
                    <p className="text-[#01273C]/60 text-xs leading-relaxed">منصة رقمية متخصصة في التسويق العقاري</p>
                    <p className="text-[#01273C]/40 text-[11px]">Digital Real Estate Marketing Platform</p>
                    <div className="pt-1.5 space-y-1 text-xs text-[#01273C]/60">
                      <p>البريد: info@baitaljazeera.com</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#FDFBF5] rounded-xl p-5 border border-[#E8E0CC]">
                  <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider mb-3">
                    معلومات العميل <span className="text-[#01273C]/40 font-normal">| Client</span>
                  </h3>
                  <div className="space-y-1.5">
                    <p className="font-bold text-[#01273C] text-sm">{invoice.user_name || "—"}</p>
                    <p className="text-[#01273C]/50 text-xs">Client Name</p>
                    <div className="pt-1.5 space-y-1 text-xs text-[#01273C]/60">
                      <p>البريد: {invoice.user_email || "—"}</p>
                      {invoice.user_phone && <p>الجوال: {invoice.user_phone}</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
                <div className="bg-white rounded-xl p-4 border border-[#E8E0CC] text-center">
                  <p className="text-[10px] text-[#01273C]/40 mb-1">رقم الفاتورة | Invoice No.</p>
                  <p className="font-mono font-bold text-[#01273C] text-sm">{invoice.invoice_number}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-[#E8E0CC] text-center">
                  <p className="text-[10px] text-[#01273C]/40 mb-1">تاريخ الإصدار | Issue Date</p>
                  <p className="font-bold text-[#01273C] text-xs">{formatDateAr(invoice.issued_at || invoice.created_at)}</p>
                  <p className="text-[10px] text-[#01273C]/40">{formatTimeAr(invoice.issued_at || invoice.created_at)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-[#E8E0CC] text-center">
                  <p className="text-[10px] text-[#01273C]/40 mb-1">طريقة الدفع | Payment</p>
                  <p className="font-bold text-[#01273C] text-xs">{paymentMethod.ar}</p>
                  <p className="text-[10px] text-[#01273C]/40">{paymentMethod.en}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-[#E8E0CC] text-center">
                  <p className="text-[10px] text-[#01273C]/40 mb-1">الحالة | Status</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${statusInfo.bg} ${statusInfo.color}`}>
                    {statusInfo.ar}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-[#E8E0CC] overflow-hidden mb-7">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#01273C]">
                      <th className="text-right px-5 py-3.5 text-white text-xs font-medium">
                        البيان <span className="text-white/40 font-normal">| Description</span>
                      </th>
                      <th className="text-center px-4 py-3.5 text-white text-xs font-medium">
                        الكمية <span className="text-white/40 font-normal">| Qty</span>
                      </th>
                      <th className="text-center px-4 py-3.5 text-white text-xs font-medium">
                        سعر الوحدة <span className="text-white/40 font-normal">| Unit Price</span>
                      </th>
                      <th className="text-left px-5 py-3.5 text-white text-xs font-medium">
                        الإجمالي <span className="text-white/40 font-normal">| Amount</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#E8E0CC]">
                      <td className="px-5 py-5">
                        <p className="font-bold text-[#01273C] text-sm">{serviceDesc.ar}</p>
                        <p className="text-[#01273C]/40 text-xs mt-0.5">{serviceDesc.en}</p>
                        {invoice.previous_plan_name && invoice.invoice_type === "upgrade" && (
                          <p className="text-[10px] text-[#D4AF37] mt-1">ترقية من: {invoice.previous_plan_name}</p>
                        )}
                        <p className="text-[10px] text-[#01273C]/30 mt-1">المدة: {invoice.duration_days} يوم</p>
                      </td>
                      <td className="text-center px-4 py-5 text-[#01273C] text-sm">1</td>
                      <td className="text-center px-4 py-5 text-[#01273C] text-sm">
                        {subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} {currency}
                      </td>
                      <td className="text-left px-5 py-5 font-bold text-[#01273C] text-sm">
                        {subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} {currency}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-start mb-7">
                <div className="w-full md:w-[340px]">
                  <div className="bg-[#FDFBF5] rounded-xl border border-[#E8E0CC] overflow-hidden">
                    <div className="flex justify-between px-5 py-3 border-b border-[#E8E0CC]">
                      <span className="text-sm text-[#01273C]/60">المجموع الفرعي <span className="text-[#01273C]/30">| Subtotal</span></span>
                      <span className="text-sm text-[#01273C]">{subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} {currency}</span>
                    </div>
                    <div className="flex justify-between px-5 py-3 border-b border-[#E8E0CC]">
                      <span className="text-sm text-[#01273C]/60">الخصم <span className="text-[#01273C]/30">| Discount</span></span>
                      <span className="text-sm text-[#01273C]">0.00 {currency}</span>
                    </div>
                    <div className="flex justify-between px-5 py-4 bg-[#01273C]">
                      <span className="text-sm font-bold text-white">الإجمالي النهائي <span className="text-white/40">| Total</span></span>
                      <span className="text-lg font-bold text-[#D4AF37]">{total.toLocaleString("en-US", { minimumFractionDigits: 2 })} {currency}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#01273C]/40 mt-2 text-center">
                    غير خاضعة لضريبة القيمة المضافة
                    <span className="mx-1">|</span>
                    No VAT Applied
                  </p>
                </div>
              </div>

              {(invoice.payment_method === "bank_transfer" || invoice.status === "pending") && (
                <div className="bg-[#FDFBF5] rounded-xl border border-[#E8E0CC] p-5 mb-7">
                  <h3 className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider mb-3">
                    تفاصيل التحويل البنكي <span className="text-[#01273C]/40 font-normal">| Bank Transfer Details</span>
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] text-[#01273C]/40">اسم البنك | Bank Name</p>
                        <p className="text-[#01273C] font-medium text-xs">—</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#01273C]/40">اسم المستفيد | Beneficiary</p>
                        <p className="text-[#01273C] font-medium text-xs">IFAZ</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] text-[#01273C]/40">رقم الآيبان | IBAN</p>
                        <p className="text-[#01273C] font-medium font-mono text-xs">—</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#01273C]/40">رقم الحساب | Account No.</p>
                        <p className="text-[#01273C] font-medium font-mono text-xs">—</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#E8E0CC]">
                    <p className="text-[10px] text-[#D4AF37] font-medium">
                      يرجى استخدام رقم الفاتورة كمرجع عند التحويل
                      <span className="mx-1 text-[#01273C]/20">|</span>
                      <span className="text-[#01273C]/40">Please use invoice number as payment reference</span>
                    </p>
                  </div>
                </div>
              )}

              {invoice.transaction_id && (
                <div className="bg-[#FDFBF5] rounded-xl border border-[#E8E0CC] px-5 py-3 mb-7 flex items-center justify-between">
                  <span className="text-[10px] text-[#01273C]/40">رقم العملية | Transaction ID</span>
                  <span className="font-mono text-xs text-[#01273C]">{invoice.transaction_id}</span>
                </div>
              )}

              <div className="border-t-2 border-[#D4AF37]/20 pt-6 mt-4">
                <div className="text-center space-y-2">
                  <p className="text-sm text-[#01273C] font-medium">شكراً لثقتكم في بيت الجزيرة</p>
                  <p className="text-xs text-[#01273C]/50">نفخر بخدمتكم ونتطلع إلى استمرار التعاون معكم</p>
                  <div className="pt-1">
                    <p className="text-xs text-[#01273C]/30">Thank you for choosing Bait Al-Jazeera</p>
                    <p className="text-[10px] text-[#01273C]/25">We are honored to serve you and look forward to continuing our partnership</p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-dashed border-[#E8E0CC] flex justify-between items-end">
                  <div className="text-[10px] text-[#01273C]/30">
                    <p>info@baitaljazeera.com</p>
                    <p>baytaljazeera.com</p>
                  </div>
                  <div className="text-center">
                    <div className="w-32 border-b border-[#01273C]/20 mb-1"></div>
                    <p className="text-[10px] text-[#01273C]/40">الاعتماد | Authorized Signature</p>
                  </div>
                  <div className="text-[10px] text-[#01273C]/30 text-left" dir="ltr">
                    <p>{invoice.invoice_number}</p>
                    <p>{formatDateEn(invoice.issued_at || invoice.created_at)}</p>
                  </div>
                </div>
              </div>

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
            color-adjust: exact !important;
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
            margin: 0;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          @page {
            size: A4;
            margin: 10mm;
          }
          table thead {
            background-color: #01273C !important;
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
