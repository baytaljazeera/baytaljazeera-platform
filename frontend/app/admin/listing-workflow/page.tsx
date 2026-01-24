'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';

interface Workflow {
  id: string;
  property_id: string;
  status: string;
  country_code: string;
  currency_code: string;
  currency_symbol: string;
  base_price: string;
  local_price: string;
  tax_amount: string;
  tax_rate: string;
  total_amount: string;
  title: string;
  price: string;
  city: string;
  country: string;
  type: string;
  owner_name: string;
  owner_email: string;
  created_at: string;
}

interface TaxRule {
  id: number;
  country_code: string;
  country_name_ar: string;
  tax_name: string;
  tax_name_ar: string;
  tax_rate: string;
  is_active: boolean;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_payment: 'bg-yellow-100 text-yellow-800',
  pending_review: 'bg-blue-100 text-blue-800',
  in_review: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  published: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  archived: 'bg-gray-200 text-gray-600'
};

const statusLabels: Record<string, string> = {
  draft: 'مسودة',
  pending_payment: 'في انتظار الدفع',
  pending_review: 'في انتظار المراجعة',
  in_review: 'قيد المراجعة',
  approved: 'موافق عليه',
  published: 'منشور',
  rejected: 'مرفوض',
  archived: 'مؤرشف'
};

export default function ListingWorkflowAdmin() {
  const [activeTab, setActiveTab] = useState<'reviews' | 'tax'>('reviews');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [editingTax, setEditingTax] = useState<string | null>(null);
  const [newTaxRate, setNewTaxRate] = useState('');

  useEffect(() => {
    if (activeTab === 'reviews') {
      fetchPendingReviews();
    } else {
      fetchTaxRules();
    }
  }, [activeTab]);

  const fetchPendingReviews = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/listing-workflow/admin/pending-reviews', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        setWorkflows(data.items || []);
      }
    } catch (err) {
      console.error('Error fetching reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTaxRules = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/listing-workflow/admin/tax-rules', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        setTaxRules(data.rules || []);
      }
    } catch (err) {
      console.error('Error fetching tax rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (action: 'approve' | 'reject' | 'request_changes') => {
    if (!selectedWorkflow) return;
    
    setProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/listing-workflow/admin/review/${selectedWorkflow.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({ action, notes: reviewNotes })
      });
      
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setSelectedWorkflow(null);
        setReviewNotes('');
        fetchPendingReviews();
      } else {
        toast.error(data.error || 'حدث خطأ');
      }
    } catch (err) {
      toast.error('فشل الاتصال');
    } finally {
      setProcessing(false);
    }
  };

  const updateTaxRate = async (countryCode: string) => {
    setProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/listing-workflow/admin/tax-rules/${countryCode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({ taxRate: parseFloat(newTaxRate) })
      });
      
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setEditingTax(null);
        setNewTaxRate('');
        fetchTaxRules();
      } else {
        toast.error(data.error || 'حدث خطأ');
      }
    } catch (err) {
      toast.error('فشل الاتصال');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#01273C]">نظام مراجعة الإعلانات</h1>
            <p className="text-gray-600 mt-2">إدارة مسار الإعلانات والضرائب والفواتير</p>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-[#01273C] text-white rounded-lg hover:bg-[#01273C]/90 transition-colors"
          >
            ← العودة للوحة التحكم
          </Link>
        </div>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('reviews')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'reviews'
                ? 'bg-[#01273C] text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            📋 مراجعة الإعلانات
          </button>
          <button
            onClick={() => setActiveTab('tax')}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'tax'
                ? 'bg-[#01273C] text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            💰 إدارة الضرائب
          </button>
        </div>

        {activeTab === 'reviews' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-[#01273C] to-[#0B6B4C] text-white px-6 py-4">
              <h2 className="text-xl font-bold">الإعلانات في انتظار المراجعة</h2>
              <p className="text-white/80 text-sm mt-1">
                {workflows.length} إعلان يحتاج مراجعة
              </p>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="mt-4 text-gray-500">جاري التحميل...</p>
              </div>
            ) : workflows.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-6xl mb-4">✅</div>
                <p className="text-gray-500 text-lg">لا توجد إعلانات في انتظار المراجعة</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {workflows.map(workflow => (
                  <div
                    key={workflow.id}
                    className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedWorkflow(workflow)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-[#01273C] text-lg">{workflow.title}</h3>
                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                          <span>📍 {workflow.city}, {workflow.country}</span>
                          <span>🏠 {workflow.type}</span>
                          <span>👤 {workflow.owner_name}</span>
                          <span>📧 {workflow.owner_email}</span>
                        </div>
                        <div className="flex gap-3 mt-3">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[workflow.status]}`}>
                            {statusLabels[workflow.status]}
                          </span>
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                            {workflow.currency_symbol} {parseFloat(workflow.total_amount || '0').toLocaleString('ar-SA')}
                          </span>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-sm text-gray-500">
                          {new Date(workflow.created_at).toLocaleDateString('ar-SA')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tax' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-[#D4AF37] to-amber-600 text-white px-6 py-4">
              <h2 className="text-xl font-bold">💰 إدارة نسب الضرائب حسب البلد</h2>
              <p className="text-white/80 text-sm mt-1">
                تحديث نسب ضريبة القيمة المضافة لكل بلد
              </p>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : (
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {taxRules.map(rule => (
                    <div
                      key={rule.country_code}
                      className="p-4 border-2 border-gray-200 rounded-xl hover:border-[#D4AF37] transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-2xl">
                          {rule.country_code === 'SA' ? '🇸🇦' :
                           rule.country_code === 'AE' ? '🇦🇪' :
                           rule.country_code === 'KW' ? '🇰🇼' :
                           rule.country_code === 'QA' ? '🇶🇦' :
                           rule.country_code === 'BH' ? '🇧🇭' :
                           rule.country_code === 'OM' ? '🇴🇲' :
                           rule.country_code === 'EG' ? '🇪🇬' :
                           rule.country_code === 'LB' ? '🇱🇧' :
                           rule.country_code === 'TR' ? '🇹🇷' : '🌍'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          rule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {rule.is_active ? 'مفعل' : 'معطل'}
                        </span>
                      </div>
                      
                      <h3 className="font-bold text-[#01273C]">{rule.country_name_ar}</h3>
                      <p className="text-sm text-gray-500">{rule.tax_name_ar}</p>
                      
                      {editingTax === rule.country_code ? (
                        <div className="mt-3 flex gap-2">
                          <input
                            type="number"
                            value={newTaxRate}
                            onChange={(e) => setNewTaxRate(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-center"
                            placeholder="النسبة %"
                            min="0"
                            max="100"
                            step="0.01"
                          />
                          <button
                            onClick={() => updateTaxRate(rule.country_code)}
                            disabled={processing}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => { setEditingTax(null); setNewTaxRate(''); }}
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-2xl font-bold text-[#D4AF37]">
                            {parseFloat(rule.tax_rate)}%
                          </span>
                          <button
                            onClick={() => {
                              setEditingTax(rule.country_code);
                              setNewTaxRate(rule.tax_rate);
                            }}
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                          >
                            تعديل
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedWorkflow && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-gradient-to-r from-[#01273C] to-[#0B6B4C] text-white p-6 rounded-t-2xl">
                <h2 className="text-xl font-bold">مراجعة الإعلان</h2>
                <p className="text-white/80 mt-1">{selectedWorkflow.title}</p>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <p className="text-sm text-gray-500">الموقع</p>
                    <p className="font-bold">{selectedWorkflow.city}, {selectedWorkflow.country}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <p className="text-sm text-gray-500">النوع</p>
                    <p className="font-bold">{selectedWorkflow.type}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <p className="text-sm text-gray-500">صاحب الإعلان</p>
                    <p className="font-bold">{selectedWorkflow.owner_name}</p>
                    <p className="text-sm text-gray-500">{selectedWorkflow.owner_email}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <p className="text-sm text-gray-500">المبلغ الإجمالي</p>
                    <p className="font-bold text-lg text-[#D4AF37]">
                      {selectedWorkflow.currency_symbol} {parseFloat(selectedWorkflow.total_amount || '0').toLocaleString('ar-SA')}
                    </p>
                  </div>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ملاحظات المراجعة
                  </label>
                  <textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                    rows={3}
                    placeholder="أضف ملاحظاتك هنا..."
                  />
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReview('approve')}
                    disabled={processing}
                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    ✓ موافقة
                  </button>
                  <button
                    onClick={() => handleReview('request_changes')}
                    disabled={processing}
                    className="flex-1 px-4 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    ↺ طلب تعديلات
                  </button>
                  <button
                    onClick={() => handleReview('reject')}
                    disabled={processing}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    ✕ رفض
                  </button>
                </div>
                
                <button
                  onClick={() => { setSelectedWorkflow(null); setReviewNotes(''); }}
                  className="w-full mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
