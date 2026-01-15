"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Download, Mail, ArrowLeft, FileText, Building2, Calendar, CreditCard, RotateCcw } from "lucide-react";
import { useRouter, useParams } from "next/navigation";

type RefundInvoice = {
  id: number;
  user_id: string;
  amount: string;
  reason: string;
  status: string;
  bank_reference: string | null;
  refund_invoice_number: string;
  refund_invoice_issued_at: string;
  payout_confirmed_at: string;
  original_invoice_number: string | null;
  plan_name: string | null;
  plan_name_en: string | null;
  duration_days: number | null;
  user_name: string;
  user_email: string;
  user_phone: string | null;
};

export default function RefundInvoiceDetailPage() {
  const params = useParams();
  const refundId = params.id as string;
  const router = useRouter();
  const [refund, setRefund] = useState<RefundInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (refundId) {
      fetchRefundInvoice();
    }
  }, [refundId]);

  async function fetchRefundInvoice() {
    try {
      let res = await fetch(`/api/finance/refund-invoices/${refundId}`, {
        credentials: "include",
      });

      if (res.status === 403) {
        res = await fetch(`/api/payments/refund-invoices/${refundId}`, {
          credentials: "include",
        });
      }

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.status === 404) {
        router.push("/");
        return;
      }

      if (!res.ok) {
        console.error("Failed to fetch refund invoice:", res.status);
        return;
      }

      const data = await res.json();
      setRefund(data.refund);
    } catch (error) {
      console.error("Error fetching refund invoice:", error);
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

  if (!refund || !refund.refund_invoice_number) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#fef8e6] to-[#f7e8b7] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <FileText className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <p className="text-lg text-slate-600">فاتورة الاسترداد غير موجودة</p>
          <button 
            onClick={() => router.push("/admin/finance")}
            className="mt-4 px-6 py-2 bg-[#002845] text-white rounded-xl hover:opacity-90"
          >
            العودة للمالية
          </button>
        </div>
      </div>
    );
  }

  const amount = parseFloat(refund.amount);

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

          <div className="bg-white rounded-3xl shadow-xl p-8 print:shadow-none print:rounded-none">
            <div className="flex justify-between items-start mb-8 border-b pb-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <RotateCcw className="w-6 h-6 text-[#D4AF37]" />
                  <h1 className="text-2xl font-bold text-[#002845]">إشعار استرداد</h1>
                </div>
                <p className="text-slate-600">Refund Notice</p>
              </div>
              <div className="text-left">
                <div className="text-3xl font-bold text-[#D4AF37]">بيت الجزيرة</div>
                <div className="text-sm text-slate-600">Aqar Al-Jazeera</div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-slate-50 rounded-2xl p-4">
                <h3 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  معلومات الشركة
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
                  معلومات المستفيد
                </h3>
                <div className="space-y-1 text-sm">
                  <p className="font-bold text-[#002845]">{refund.user_name}</p>
                  <p className="text-slate-600">{refund.user_email}</p>
                  {refund.user_phone && <p className="text-slate-600">{refund.user_phone}</p>}
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <div className="bg-green-50 rounded-xl p-4 text-center border-2 border-green-200">
                <div className="text-xs text-green-600 mb-1">رقم إشعار الاسترداد</div>
                <div className="font-mono font-bold text-green-800">{refund.refund_invoice_number}</div>
              </div>
              <div className="bg-[#fef8e6] rounded-xl p-4 text-center">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
                  <Calendar className="w-3 h-3" />
                  تاريخ الإصدار
                </div>
                <div className="font-bold text-[#002845]">{formatDate(refund.refund_invoice_issued_at)}</div>
              </div>
              <div className="bg-[#fef8e6] rounded-xl p-4 text-center">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  طريقة الاسترداد
                </div>
                <div className="font-bold text-[#002845]">تحويل بنكي</div>
              </div>
            </div>

            <div className="border rounded-2xl overflow-hidden mb-8">
              <table className="w-full">
                <thead className="bg-green-700 text-white">
                  <tr>
                    <th className="text-right px-4 py-3">الوصف</th>
                    <th className="text-center px-4 py-3">التفاصيل</th>
                    <th className="text-left px-4 py-3">المبلغ المسترد</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-4">
                      <div className="font-bold text-[#002845]">استرداد اشتراك {refund.plan_name || "باقة"}</div>
                      {refund.plan_name_en && (
                        <div className="text-sm text-slate-500">{refund.plan_name_en} Subscription Refund</div>
                      )}
                      {refund.original_invoice_number && (
                        <div className="text-xs text-slate-400 mt-1">
                          الفاتورة الأصلية: {refund.original_invoice_number}
                        </div>
                      )}
                    </td>
                    <td className="text-center px-4 py-4 text-slate-600">
                      {refund.reason || "استرداد كامل"}
                    </td>
                    <td className="text-left px-4 py-4 font-bold text-green-600">
                      {amount.toFixed(2)} ر.س
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mb-8">
              <div className="w-full md:w-80 space-y-2">
                <div className="flex justify-between text-lg font-bold border-t-2 border-green-600 pt-2">
                  <span className="text-[#002845]">إجمالي المبلغ المسترد</span>
                  <span className="text-green-600">{amount.toFixed(2)} ر.س</span>
                </div>
              </div>
            </div>

            {refund.bank_reference && (
              <div className="bg-blue-50 rounded-2xl p-4 mb-6">
                <div className="text-xs text-blue-600 mb-1">رقم المرجع البنكي / Bank Reference</div>
                <div className="font-mono text-sm text-blue-800">{refund.bank_reference}</div>
              </div>
            )}

            {refund.payout_confirmed_at && (
              <div className="bg-green-50 rounded-2xl p-4 mb-6">
                <div className="text-xs text-green-600 mb-1">تاريخ التحويل البنكي / Payout Date</div>
                <div className="font-mono text-sm text-green-800">{formatDate(refund.payout_confirmed_at)}</div>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-green-600 mb-4">
              <Mail className="w-4 h-4" />
              تم إرسال نسخة من إشعار الاسترداد إلى بريدك الإلكتروني
            </div>

            <div className="text-center text-xs text-slate-400 border-t pt-4">
              <p>شكراً لاختياركم بيت الجزيرة</p>
              <p className="mt-1">هذا إشعار استرداد إلكتروني صادر وفقاً للأنظمة المالية في المملكة العربية السعودية</p>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:shadow-none,
          .print\\:shadow-none * {
            visibility: visible;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
