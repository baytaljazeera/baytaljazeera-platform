"use client";

import { useState, useEffect } from "react";
import { 
  Building2, Users, Gift, Settings, Check, X, 
  Clock, Loader2, UserCheck, BarChart3, Award, RefreshCw, MessageSquare,
  Eye, Mail, Phone, Calendar, AlertTriangle, CheckCircle, XCircle, User,
  Brain, Sparkles, Ban
} from "lucide-react";
import Link from "next/link";

type AmbassadorStats = {
  total_ambassadors: number;
  total_referrals: number;
  total_rewards_given: number;
  pending_requests: number;
  pending_withdrawal_requests?: number;
  active_buildings: number;
};

type AmbassadorRequest = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  ambassador_code: string;
  floors_at_request: number;
  reward_tier: string;
  status: string;
  created_at: string;
};

type RequestDetails = {
  request: AmbassadorRequest & {
    phone?: string;
    user_joined_at: string;
    email_verified: boolean;
    total_floors_earned: number;
    referral_count: number;
    ambassador_floors: number;
  };
  referrals: Array<{
    id: string;
    referred_name: string;
    referred_email: string;
    referred_phone: string | null;
    referred_joined: string;
    status: string;
    created_at: string;
  }>;
  other_requests: Array<{
    id: string;
    status: string;
    floors_at_request: number;
    reward_tier: string;
    created_at: string;
  }>;
  summary: {
    total_referrals: number;
    completed_referrals: number;
    days_since_joined: number;
    previous_requests_count: number;
  };
};

type AmbassadorSettings = {
  max_floors: number;
  floors_per_reward: Array<{floors: number; plan_tier: string; plan_months: number}>;
  consumption_enabled: boolean;
  require_email_verified: boolean;
  require_first_listing: boolean;
  min_days_active: number;
};

type TabType = 'overview' | 'requests' | 'withdrawals' | 'buildings' | 'settings';

type AmbassadorWithBuildings = {
  id: string;
  name: string;
  email: string;
  ambassador_code: string;
  total_floors: number;
  total_buildings: number;
  flagged_floors: number;
  completed_floors: number;
  has_issues: boolean;
};

type BuildingData = {
  building_number: number;
  floors: Array<{
    id: string;
    floor_number: string;
    floor_in_building: number;
    status: string;
    referred_name: string;
    referred_email: string;
    referred_phone: string | null;
    flag_reason: string | null;
    collapse_reason: string | null;
    created_at: string;
  }>;
  total_floors: number;
  completed_floors: number;
  flagged_floors: number;
  has_issues: boolean;
  is_complete: boolean;
};

type AmbassadorBuildingsData = {
  user: {
    id: string;
    name: string;
    email: string;
    ambassador_code: string;
  };
  total_floors: number;
  total_buildings: number;
  floors_per_building: number;
  buildings: BuildingData[];
};

export default function AmbassadorAdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [stats, setStats] = useState<AmbassadorStats | null>(null);
  const [requests, setRequests] = useState<AmbassadorRequest[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);
  const [settings, setSettings] = useState<AmbassadorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [flagModal, setFlagModal] = useState<{show: boolean; referralId: string; referredName: string; stage: 'initial' | 'confirm'} | null>(null);
  const [unflagModal, setUnflagModal] = useState<{show: boolean; referralId: string} | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Buildings tab state
  const [ambassadorsList, setAmbassadorsList] = useState<AmbassadorWithBuildings[]>([]);
  const [selectedAmbassador, setSelectedAmbassador] = useState<AmbassadorBuildingsData | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingData | null>(null);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [flagFloorModal, setFlagFloorModal] = useState<{show: boolean; floorId: string; floorName: string; reason: string} | null>(null);
  
  // AI Fraud Detection state
  const [aiScanResult, setAiScanResult] = useState<any>(null);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiScanError, setAiScanError] = useState<string | null>(null);
  const [aiScanModal, setAiScanModal] = useState<{show: boolean; userId: string; selectedBuildings: number[]} | null>(null);
  
  // System toggle state
  const [systemStatus, setSystemStatus] = useState<{ambassador_enabled: boolean; consumption_enabled: boolean; financial_rewards_enabled: boolean} | null>(null);
  const [togglingSystem, setTogglingSystem] = useState(false);

  useEffect(() => {
    fetchData();
    fetchSystemStatus();
  }, []);
  
  async function fetchSystemStatus() {
    try {
      const res = await fetch('/api/ambassador/admin/system-status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSystemStatus(data);
      }
    } catch (err) {
      console.error('Error fetching system status:', err);
    }
  }
  
  async function toggleSystemEnabled(enabled: boolean) {
    setTogglingSystem(true);
    try {
      const res = await fetch('/api/ambassador/admin/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        const data = await res.json();
        setSystemStatus(prev => prev ? { ...prev, ambassador_enabled: data.enabled } : null);
        setSuccessMessage(data.message);
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      console.error('Error toggling system:', err);
    } finally {
      setTogglingSystem(false);
    }
  }

  async function analyzeWithAI(requestId: string) {
    setAnalyzingAI(true);
    setAiAnalysis(null);
    setAiError(null);
    try {
      const res = await fetch(`/api/ambassador/admin/requests/${requestId}/analyze`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setAiAnalysis(data);
        if (!data.success && data.fallback_analysis) {
          setAiError('تم استخدام التحليل البديل بسبب خطأ في الـ AI');
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        setAiError(errorData.error || 'حدث خطأ أثناء التحليل');
      }
    } catch (err) {
      console.error(err);
      setAiError('تعذر الاتصال بخدمة التحليل');
    } finally {
      setAnalyzingAI(false);
    }
  }

  async function fetchRequestDetails(requestId: string) {
    setLoadingDetails(true);
    setShowDetailsModal(true);
    setAiAnalysis(null);
    setAiError(null);
    try {
      const res = await fetch(`/api/ambassador/admin/requests/${requestId}/details`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSelectedRequest(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const [statsRes, requestsRes, withdrawalRes, settingsRes] = await Promise.all([
        fetch('/api/ambassador/admin/stats', { credentials: 'include' }),
        fetch('/api/ambassador/admin/requests', { credentials: 'include' }),
        fetch('/api/ambassador/admin/financial-requests?status=all', { credentials: 'include' }),
        fetch('/api/ambassador/admin/settings', { credentials: 'include' })
      ]);
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        // statsData قد يكون { stats: {...}, top_ambassadors: [...] } أو { ... } مباشرة
        setStats(statsData.stats || statsData);
      }
      if (requestsRes.ok) {
        const data = await requestsRes.json();
        setRequests(data.requests || []);
      }
      if (withdrawalRes.ok) {
        const data = await withdrawalRes.json();
        console.log('📋 [FRONTEND] Withdrawal requests fetched:', {
          count: data.requests?.length || 0,
          total: data.total,
          pending_count: data.pending_count,
          requests: data.requests
        });
        setWithdrawalRequests(data.requests || []);
      } else {
        const errorText = await withdrawalRes.text().catch(() => '');
        console.error('❌ [FRONTEND] Failed to fetch withdrawal requests:', {
          status: withdrawalRes.status,
          statusText: withdrawalRes.statusText,
          error: errorText
        });
      }
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestAction(requestId: string, action: 'approve' | 'reject') {
    try {
      const res = await fetch(`/api/ambassador/admin/requests/${requestId}/${action}`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleWithdrawalReview(requestId: string, action: 'approve' | 'reject') {
    try {
      const notes = action === 'reject' ? prompt('سبب الرفض (اختياري):') || '' : '';
      const res = await fetch(`/api/ambassador/admin/financial-requests/${requestId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, notes })
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMessage(action === 'approve' ? '✅ تمت الموافقة الأولية وتم تحويل الطلب للمالية' : '❌ تم رفض الطلب');
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchData();
      } else {
        const error = await res.json().catch(() => ({}));
        setSuccessMessage(`❌ ${error.error || 'حدث خطأ'}`);
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
      setSuccessMessage('❌ حدث خطأ أثناء معالجة الطلب');
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  }

  async function handleWithdrawalComplete(requestId: string) {
    const paymentRef = prompt('رقم المرجع/التحويل:') || '';
    if (!paymentRef) {
      setSuccessMessage('❌ يجب إدخال رقم المرجع');
      setTimeout(() => setSuccessMessage(null), 3000);
      return;
    }
    
    const notes = prompt('ملاحظات إضافية (اختياري):') || '';
    
    try {
      const res = await fetch(`/api/ambassador/admin/financial-requests/${requestId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ payment_reference: paymentRef, notes })
      });
      if (res.ok) {
        setSuccessMessage('✅ تم إتمام التحويل بنجاح');
        setTimeout(() => setSuccessMessage(null), 4000);
        await fetchData();
      } else {
        const error = await res.json().catch(() => ({}));
        setSuccessMessage(`❌ ${error.error || 'حدث خطأ'}`);
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
      setSuccessMessage('❌ حدث خطأ أثناء إتمام التحويل');
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  }

  function openFlagModal(referralId: string, referredName: string) {
    setFlagModal({ show: true, referralId, referredName, stage: 'initial' });
  }

  async function confirmFlagReferral(deductFloor: boolean) {
    if (!flagModal) return;
    const { referralId, referredName } = flagModal;
    setFlagModal(null);
    
    try {
      const res = await fetch(`/api/ambassador/admin/referrals/${referralId}/flag-fraud`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ deduct_floor: deductFloor, reason: 'وصم يدوي من المسؤول' })
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMessage(data.message || `تم وصم "${referredName}" بنجاح ⚠️`);
        setTimeout(() => setSuccessMessage(null), 4000);
        if (selectedRequest) {
          fetchRequestDetails(selectedRequest.request.id);
        }
      } else {
        const error = await res.json().catch(() => ({}));
        setSuccessMessage(null);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function openUnflagModal(referralId: string) {
    setUnflagModal({ show: true, referralId });
  }

  async function confirmUnflagReferral() {
    if (!unflagModal) return;
    const { referralId } = unflagModal;
    setUnflagModal(null);
    
    try {
      const res = await fetch(`/api/ambassador/admin/referrals/${referralId}/unflag`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        setSuccessMessage('تم إلغاء الوصم بنجاح ✅');
        setTimeout(() => setSuccessMessage(null), 4000);
        if (selectedRequest) {
          fetchRequestDetails(selectedRequest.request.id);
        }
      } else {
        const error = await res.json().catch(() => ({}));
        setSuccessMessage(null);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      await fetch('/api/ambassador/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings)
      });
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: 'overview' as TabType, label: 'نظرة عامة', icon: BarChart3 },
    { id: 'requests' as TabType, label: 'الطلبات', icon: Gift },
    { id: 'withdrawals' as TabType, label: 'طلبات السحب', icon: Award },
    { id: 'buildings' as TabType, label: 'المباني', icon: Building2 },
    { id: 'settings' as TabType, label: 'الإعدادات', icon: Settings },
  ];
  
  // Fetch ambassadors list for buildings tab
  async function fetchAmbassadorsList() {
    setLoadingBuildings(true);
    try {
      const res = await fetch('/api/ambassador/admin/ambassadors-list', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAmbassadorsList(data.ambassadors || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBuildings(false);
    }
  }
  
  // Fetch buildings for a specific ambassador
  async function fetchAmbassadorBuildings(userId: string) {
    setLoadingBuildings(true);
    setSelectedBuilding(null);
    try {
      const res = await fetch(`/api/ambassador/admin/ambassadors/${userId}/buildings`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSelectedAmbassador(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBuildings(false);
    }
  }
  
  // Flag a floor
  async function handleFlagFloor() {
    if (!flagFloorModal) return;
    try {
      const res = await fetch(`/api/ambassador/admin/referrals/${flagFloorModal.floorId}/flag-fraud`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: flagFloorModal.reason, deduct_floor: true })
      });
      if (res.ok) {
        setSuccessMessage(`تم تعليم الطابق "${flagFloorModal.floorName}" كمشبوه ⚠️`);
        setTimeout(() => setSuccessMessage(null), 4000);
        if (selectedAmbassador) {
          fetchAmbassadorBuildings(selectedAmbassador.user.id);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFlagFloorModal(null);
    }
  }
  
  // Unflag a floor
  async function handleUnflagFloor(floorId: string) {
    try {
      const res = await fetch(`/api/ambassador/admin/referrals/${floorId}/unflag`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        setSuccessMessage('تم إلغاء تعليم الطابق ✅');
        setTimeout(() => setSuccessMessage(null), 4000);
        if (selectedAmbassador) {
          fetchAmbassadorBuildings(selectedAmbassador.user.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }
  
  // AI Fraud Scan - with building selection
  async function runAIFraudScan(userId: string, buildingNumbers?: number[]) {
    setAiScanning(true);
    setAiScanResult(null);
    setAiScanError(null);
    setAiScanModal(null); // Close modal
    
    try {
      // If multiple buildings selected, scan all (backend will handle)
      // For now, we'll scan one at a time or all if empty
      const buildingNumber = buildingNumbers && buildingNumbers.length === 1 ? buildingNumbers[0] : undefined;
      
      const res = await fetch(`/api/ambassador/admin/ai-scan/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          buildingNumber,
          buildingNumbers: buildingNumbers && buildingNumbers.length > 1 ? buildingNumbers : undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiScanResult(data);
        if (data.summary?.critical > 0 || data.summary?.high > 0) {
          setSuccessMessage(`⚠️ تم اكتشاف ${data.summary.critical + data.summary.high} إحالات مشبوهة!`);
        } else {
          setSuccessMessage('✅ تم الفحص - لم يتم اكتشاف تلاعب واضح');
        }
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setAiScanError(errorData.error || 'حدث خطأ أثناء الفحص');
      }
    } catch (err) {
      console.error(err);
      setAiScanError('تعذر الاتصال بخدمة الفحص');
    } finally {
      setAiScanning(false);
    }
  }

  // Open AI Scan Modal
  function openAIScanModal(userId: string, preselectedBuilding?: number) {
    setAiScanModal({
      show: true,
      userId,
      selectedBuildings: preselectedBuilding ? [preselectedBuilding] : []
    });
  }
  
  // Load ambassadors when switching to buildings tab
  useEffect(() => {
    if (activeTab === 'buildings' && ambassadorsList.length === 0) {
      fetchAmbassadorsList();
    }
  }, [activeTab]);

  const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'under_review');

  return (
    <div className="p-6" dir="rtl">
        {/* Success Toast Notification */}
        {successMessage && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-300">
            <div className="px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">{successMessage}</span>
            </div>
          </div>
        )}
        
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#003366]">إدارة سفراء البيت</h1>
                <p className="text-slate-600 text-sm">إدارة برنامج الإحالات والمكافآت</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Link 
                href="/admin/ambassador/share-text"
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-purple-600 to-indigo-600 text-white rounded-lg hover:shadow-lg transition"
              >
                <MessageSquare className="w-4 h-4" />
                نصوص المشاركة
              </Link>
              <button onClick={fetchData} className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50">
                <RefreshCw className={`w-5 h-5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-6 bg-white rounded-xl p-1 border border-slate-200 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                  activeTab === tab.id ? 'bg-[#003366] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.id === 'requests' && pendingRequests.length > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingRequests.length}</span>
                )}
                {tab.id === 'withdrawals' && (stats?.pending_withdrawal_requests || 0) > 0 && (
                  <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">{stats?.pending_withdrawal_requests || 0}</span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <StatCard icon={Users} label="إجمالي السفراء" value={stats?.total_ambassadors || 0} color="blue" />
                    <StatCard icon={UserCheck} label="إجمالي الإحالات" value={stats?.total_referrals || 0} color="green" />
                    <StatCard icon={Award} label="المكافآت الممنوحة" value={stats?.total_rewards_given || 0} color="gold" />
                    <StatCard icon={Clock} label="طلبات معلقة" value={stats?.pending_requests || 0} color="amber" />
                    <StatCard icon={Award} label="طلبات سحب معلقة" value={stats?.pending_withdrawal_requests || 0} color="orange" />
                    <StatCard icon={Building2} label="عمارات نشطة" value={stats?.active_buildings || 0} color="purple" />
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-[#003366] mb-4">أفضل السفراء</h2>
                    <TopAmbassadorsList />
                  </div>
                </div>
              )}

              {activeTab === 'requests' && (
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-[#003366]">طلبات المكافآت</h2>
                  </div>
                  
                  {requests.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">لا توجد طلبات حالياً</div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {requests.map((request) => (
                        <div key={request.id} className="p-4 hover:bg-slate-50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center text-white font-bold">
                                {request.floors_at_request}
                              </div>
                              <div>
                                <p className="font-medium text-[#003366]">{request.user_name}</p>
                                <p className="text-sm text-slate-500">{request.user_email}</p>
                                <p className="text-xs text-slate-400 mt-1">
                                  كود: {request.ambassador_code} | {new Date(request.created_at).toLocaleDateString('ar-SA')}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <span className={`px-3 py-1 rounded-full text-sm ${
                                request.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                request.status === 'approved' ? 'bg-green-100 text-green-700' :
                                request.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {request.status === 'pending' ? 'معلق' :
                                 request.status === 'approved' ? 'مقبول' :
                                 request.status === 'rejected' ? 'مرفوض' : request.status}
                              </span>
                              
                              <button 
                                onClick={() => fetchRequestDetails(request.id)} 
                                className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 cursor-pointer"
                                title="عرض التفاصيل"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              
                              {(request.status === 'pending' || request.status === 'under_review') && (
                                <div className="flex gap-2">
                                  <button onClick={() => handleRequestAction(request.id, 'approve')} className="p-2 rounded-lg bg-green-100 text-green-600 hover:bg-green-200 cursor-pointer">
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleRequestAction(request.id, 'reject')} className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'withdrawals' && (
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-[#003366]">طلبات السحب المالية</h2>
                    <p className="text-sm text-slate-500 mt-1">مراجعة طلبات سحب الأموال من السفراء</p>
                  </div>
                  
                  {loading ? (
                    <div className="p-8 text-center text-slate-500">جاري التحميل...</div>
                  ) : withdrawalRequests.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-slate-500 mb-2">لا توجد طلبات سحب حالياً</p>
                      <p className="text-xs text-slate-400 mt-2">عدد الطلبات المحملة: {withdrawalRequests.length}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {withdrawalRequests.map((request) => (
                        <div key={request.id} className="p-4 hover:bg-slate-50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold">
                                ${((request.amount_cents || 0) / 100).toFixed(2)}
                              </div>
                              <div>
                                <p className="font-medium text-[#003366]">{request.user_name || 'مستخدم'}</p>
                                <p className="text-sm text-slate-500">{request.user_email}</p>
                                <p className="text-xs text-slate-400 mt-1">
                                  {new Date(request.created_at).toLocaleDateString('ar-SA', { 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                                {request.risk_score && (
                                  <p className={`text-xs mt-1 ${
                                    request.risk_score >= 60 ? 'text-red-600' :
                                    request.risk_score >= 30 ? 'text-amber-600' :
                                    'text-green-600'
                                  }`}>
                                    درجة المخاطرة: {request.risk_score} ({request.risk_level || 'low'})
                                  </p>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                request.status === 'pending' ? 'bg-amber-100 text-amber-700 border border-amber-300' :
                                request.status === 'finance_review' ? 'bg-blue-100 text-blue-700 border border-blue-300' :
                                request.status === 'completed' ? 'bg-green-100 text-green-700 border border-green-300' :
                                request.status === 'rejected' ? 'bg-red-100 text-red-700 border border-red-300' :
                                'bg-slate-100 text-slate-700 border border-slate-300'
                              }`}>
                                {request.status === 'pending' ? '⏳ في انتظار مراجعة السفراء' :
                                 request.status === 'finance_review' ? '💰 في انتظار المالية' :
                                 request.status === 'completed' ? '✅ مكتمل' :
                                 request.status === 'rejected' ? '❌ مرفوض' : request.status}
                              </span>
                              
                              {request.status === 'pending' && (
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => handleWithdrawalReview(request.id, 'approve')} 
                                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg transition font-medium flex items-center gap-2"
                                  >
                                    <Check className="w-4 h-4" />
                                    موافقة أولية
                                  </button>
                                  <button 
                                    onClick={() => handleWithdrawalReview(request.id, 'reject')} 
                                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 text-white hover:shadow-lg transition font-medium flex items-center gap-2"
                                  >
                                    <X className="w-4 h-4" />
                                    رفض
                                  </button>
                                </div>
                              )}
                              
                              {request.status === 'finance_review' && (
                                <button 
                                  onClick={() => handleWithdrawalComplete(request.id)} 
                                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:shadow-lg transition font-medium flex items-center gap-2"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  إتمام التحويل
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'buildings' && (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-[#003366] flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-[#D4AF37]" />
                        مراجعة مباني السفراء
                      </h2>
                      {selectedAmbassador && (
                        <button 
                          onClick={() => { setSelectedAmbassador(null); setSelectedBuilding(null); }}
                          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm"
                        >
                          ← عودة للقائمة
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {loadingBuildings ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
                    </div>
                  ) : !selectedAmbassador ? (
                    /* Ambassadors List */
                    <div className="bg-white rounded-xl border border-slate-200">
                      <div className="p-4 border-b border-slate-200">
                        <p className="text-slate-600 text-sm">اختر سفيراً لعرض مبانيه ({ambassadorsList.length} سفير)</p>
                      </div>
                      <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                        {ambassadorsList.map((ambassador) => (
                          <div 
                            key={ambassador.id}
                            onClick={() => fetchAmbassadorBuildings(ambassador.id)}
                            className={`p-4 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between ${
                              ambassador.has_issues ? 'bg-red-50 border-r-4 border-red-500' : ''
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white ${
                                ambassador.has_issues 
                                  ? 'bg-gradient-to-br from-red-500 to-red-600' 
                                  : 'bg-gradient-to-br from-[#D4AF37] to-[#B8860B]'
                              }`}>
                                {ambassador.total_buildings}
                              </div>
                              <div>
                                <p className="font-medium text-[#003366]">{ambassador.name}</p>
                                <p className="text-sm text-slate-500">{ambassador.email}</p>
                                <p className="text-xs text-slate-400">كود: {ambassador.ambassador_code}</p>
                              </div>
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-medium text-slate-700">{ambassador.total_floors} طابق</p>
                              <p className="text-xs text-slate-500">{ambassador.total_buildings} مبنى</p>
                              {ambassador.has_issues && (
                                <p className="text-xs text-red-600 font-medium mt-1">
                                  ⚠️ {ambassador.flagged_floors} طابق مشبوه
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : !selectedBuilding ? (
                    /* Buildings Grid for Selected Ambassador */
                    <div className="space-y-4">
                      <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center">
                              <User className="w-7 h-7 text-white" />
                            </div>
                            <div>
                              <h3 className="font-bold text-[#003366] text-lg">{selectedAmbassador.user.name}</h3>
                              <p className="text-sm text-slate-500">{selectedAmbassador.user.email}</p>
                              <p className="text-xs text-slate-400">
                                {selectedAmbassador.total_floors} طابق | {selectedAmbassador.total_buildings} مبنى
                              </p>
                            </div>
                          </div>
                          
                          {/* AI Scan Button */}
                          <button
                            onClick={() => openAIScanModal(selectedAmbassador.user.id)}
                            disabled={aiScanning}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                              aiScanning 
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                : 'bg-gradient-to-l from-purple-600 to-indigo-600 text-white hover:shadow-lg hover:scale-105'
                            }`}
                          >
                            {aiScanning ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                جارٍ الفحص...
                              </>
                            ) : (
                              <>
                                <Brain className="w-4 h-4" />
                                فحص AI للتلاعب
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      
                      {/* AI Scan Results */}
                      {aiScanResult && (
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <Sparkles className="w-5 h-5 text-purple-600" />
                            <h4 className="font-bold text-[#003366]">نتائج فحص الذكاء الاصطناعي</h4>
                          </div>
                          
                          {/* Summary */}
                          <div className="grid grid-cols-4 gap-3 mb-4">
                            <div className="text-center p-3 rounded-lg bg-red-50 border border-red-200">
                              <p className="text-2xl font-bold text-red-600">{aiScanResult.summary?.critical || 0}</p>
                              <p className="text-xs text-red-700">خطر حرج</p>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-orange-50 border border-orange-200">
                              <p className="text-2xl font-bold text-orange-600">{aiScanResult.summary?.high || 0}</p>
                              <p className="text-xs text-orange-700">خطر عالي</p>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200">
                              <p className="text-2xl font-bold text-amber-600">{aiScanResult.summary?.medium || 0}</p>
                              <p className="text-xs text-amber-700">خطر متوسط</p>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-green-50 border border-green-200">
                              <p className="text-2xl font-bold text-green-600">{aiScanResult.summary?.low || 0}</p>
                              <p className="text-xs text-green-700">سليم</p>
                            </div>
                          </div>
                          
                          {/* AI Explanation */}
                          {aiScanResult.aiExplanation && (
                            <div className="p-4 rounded-lg bg-gradient-to-l from-purple-50 to-indigo-50 border border-purple-200">
                              <p className="text-sm font-medium text-purple-800 mb-1">تحليل الذكاء الاصطناعي:</p>
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{aiScanResult.aiExplanation}</p>
                            </div>
                          )}
                          
                          {/* Suspicious List */}
                          {aiScanResult.analysis?.riskScores?.filter((r: any) => r.riskLevel === 'critical' || r.riskLevel === 'high').length > 0 && (
                            <div className="mt-4">
                              <p className="text-sm font-medium text-slate-700 mb-2">الإحالات المشبوهة:</p>
                              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                {aiScanResult.analysis.riskScores
                                  .filter((r: any) => r.riskLevel === 'critical' || r.riskLevel === 'high')
                                  .map((risk: any) => (
                                    <div key={risk.referralId} className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-200">
                                      <div>
                                        <p className="text-sm font-medium text-red-800">{risk.email}</p>
                                        <p className="text-xs text-red-600">
                                          {risk.triggeredRules.map((r: any) => r.name).join(' | ')}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                          risk.riskLevel === 'critical' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'
                                        }`}>
                                          {risk.score}%
                                        </span>
                                        <button
                                          onClick={() => setFlagFloorModal({ show: true, floorId: risk.referralId, floorName: risk.email, reason: risk.triggeredRules.map((r: any) => r.name).join(' + ') })}
                                          className="p-1 rounded bg-red-600 text-white hover:bg-red-700"
                                          title="تعليم كمشبوه"
                                        >
                                          <Ban className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {aiScanError && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                          <p className="text-red-700 text-sm">{aiScanError}</p>
                        </div>
                      )}
                      
                      <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <h4 className="text-sm font-medium text-slate-700 mb-4">اختر مبنى لعرض طوابقه:</h4>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
                          {selectedAmbassador.buildings.map((building) => (
                            <div
                              key={building.building_number}
                              onClick={() => setSelectedBuilding(building)}
                              className={`relative p-3 rounded-xl cursor-pointer transition-all hover:scale-105 ${
                                building.has_issues 
                                  ? 'bg-red-100 border-2 border-red-400 hover:bg-red-200' 
                                  : building.is_complete
                                    ? 'bg-emerald-100 border-2 border-emerald-400 hover:bg-emerald-200'
                                    : 'bg-amber-100 border-2 border-amber-400 hover:bg-amber-200'
                              }`}
                            >
                              <div className="text-center">
                                <Building2 className={`w-8 h-8 mx-auto mb-1 ${
                                  building.has_issues ? 'text-red-600' :
                                  building.is_complete ? 'text-emerald-600' : 'text-amber-600'
                                }`} />
                                <p className="text-xs font-bold text-slate-700">#{building.building_number}</p>
                                <p className="text-[10px] text-slate-500">{building.total_floors}/20</p>
                              </div>
                              {building.has_issues && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                                  <AlertTriangle className="w-3 h-3 text-white" />
                                </div>
                              )}
                              {building.is_complete && !building.has_issues && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Floors List for Selected Building */
                    <div className="space-y-4">
                      <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                              selectedBuilding.has_issues 
                                ? 'bg-red-100 text-red-600' 
                                : 'bg-amber-100 text-amber-600'
                            }`}>
                              <Building2 className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="font-bold text-[#003366]">المبنى #{selectedBuilding.building_number}</h3>
                              <p className="text-sm text-slate-500">
                                {selectedBuilding.completed_floors} سليم | {selectedBuilding.flagged_floors} مشبوه | {selectedBuilding.total_floors} إجمالي
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setSelectedBuilding(null)}
                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm"
                          >
                            ← عودة للمباني
                          </button>
                        </div>
                      </div>
                      
                      <div className="bg-white rounded-xl border border-slate-200">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                          <h4 className="font-medium text-[#003366]">طوابق المبنى ({selectedBuilding.total_floors} طابق)</h4>
                          {selectedAmbassador && (
                            <button
                              onClick={() => openAIScanModal(selectedAmbassador.user.id, selectedBuilding.building_number)}
                              disabled={aiScanning}
                              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                                aiScanning 
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                  : 'bg-gradient-to-l from-purple-600 to-indigo-600 text-white hover:shadow-lg hover:scale-105'
                              }`}
                            >
                              {aiScanning ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  جارٍ الفحص...
                                </>
                              ) : (
                                <>
                                  <Brain className="w-4 h-4" />
                                  فحص AI للتلاعب في المبنى
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <div className="divide-y divide-slate-100">
                          {selectedBuilding.floors.map((floor) => (
                            <div 
                              key={floor.id}
                              className={`p-4 ${floor.status === 'flagged_fraud' ? 'bg-red-50' : 'hover:bg-slate-50'}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white ${
                                    floor.status === 'flagged_fraud' 
                                      ? 'bg-red-500' 
                                      : 'bg-emerald-500'
                                  }`}>
                                    {floor.floor_in_building}
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-800">{floor.referred_name}</p>
                                    <p className="text-sm text-slate-500">{floor.referred_email}</p>
                                    {floor.referred_phone && (
                                      <p className="text-xs text-slate-400">{floor.referred_phone}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-left">
                                    <p className="text-xs text-slate-500">
                                      {new Date(floor.created_at).toLocaleDateString('ar-SA')}
                                    </p>
                                    {floor.status === 'flagged_fraud' && floor.flag_reason && (
                                      <p className="text-xs text-red-600 mt-1">⚠️ {floor.flag_reason}</p>
                                    )}
                                  </div>
                                  {floor.status === 'flagged_fraud' ? (
                                    <button
                                      onClick={() => handleUnflagFloor(floor.id)}
                                      className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200 flex items-center gap-1"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                      إلغاء التعليم
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setFlagFloorModal({ show: true, floorId: floor.id, floorName: floor.referred_name, reason: '' })}
                                      className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 flex items-center gap-1"
                                    >
                                      <Ban className="w-4 h-4" />
                                      تعليم مشبوه
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Flag Floor Modal */}
              {flagFloorModal?.show && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl p-6 max-w-md w-full">
                    <h3 className="text-lg font-bold text-[#003366] mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                      تعليم طابق كمشبوه
                    </h3>
                    <p className="text-slate-600 mb-4">
                      أنت على وشك تعليم طابق <strong>{flagFloorModal.floorName}</strong> كمشبوه.
                    </p>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-700 mb-2">سبب التعليم:</label>
                      <textarea
                        value={flagFloorModal.reason}
                        onChange={(e) => setFlagFloorModal({ ...flagFloorModal, reason: e.target.value })}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-300"
                        rows={3}
                        placeholder="مثال: حساب وهمي، نفس IP، نشاط مشبوه..."
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleFlagFloor}
                        disabled={!flagFloorModal.reason.trim()}
                        className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        تأكيد التعليم
                      </button>
                      <button
                        onClick={() => setFlagFloorModal(null)}
                        className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Scan Modal - Building Selection */}
              {aiScanModal?.show && selectedAmbassador && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <h3 className="text-lg font-bold text-[#003366] mb-4 flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-600" />
                      اختيار المباني للفحص بالذكاء الاصطناعي
                    </h3>
                    <p className="text-slate-600 mb-4">
                      اختر المبنى أو المباني التي تريد فحصها. يمكنك اختيار مبنى واحد، عدة مباني، أو كل المباني.
                    </p>
                    
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          onClick={() => {
                            const allBuildingNumbers = selectedAmbassador.buildings.map(b => b.building_number);
                            setAiScanModal({ ...aiScanModal, selectedBuildings: allBuildingNumbers });
                          }}
                          className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm font-medium"
                        >
                          ✓ اختيار كل المباني
                        </button>
                        <button
                          onClick={() => setAiScanModal({ ...aiScanModal, selectedBuildings: [] })}
                          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium"
                        >
                          ✗ إلغاء الاختيار
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {selectedAmbassador.buildings.map((building) => {
                          const isSelected = aiScanModal.selectedBuildings.includes(building.building_number);
                          return (
                            <div
                              key={building.building_number}
                              onClick={() => {
                                const current = aiScanModal.selectedBuildings;
                                const newSelection = isSelected
                                  ? current.filter(b => b !== building.building_number)
                                  : [...current, building.building_number];
                                setAiScanModal({ ...aiScanModal, selectedBuildings: newSelection });
                              }}
                              className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:scale-105 ${
                                isSelected
                                  ? 'bg-purple-50 border-purple-500 shadow-lg'
                                  : 'bg-slate-50 border-slate-200 hover:border-purple-300'
                              }`}
                            >
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 mx-auto ${
                                building.has_issues ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                              }`}>
                                <Building2 className="w-5 h-5" />
                              </div>
                              <p className="text-center font-bold text-[#003366]">#{building.building_number}</p>
                              <p className="text-xs text-center text-slate-500 mt-1">
                                {building.completed_floors}/{building.total_floors}
                              </p>
                              {isSelected && (
                                <div className="flex justify-center mt-2">
                                  <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
                                    <Check className="w-4 h-4 text-white" />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      
                      {aiScanModal.selectedBuildings.length > 0 && (
                        <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <p className="text-sm font-medium text-purple-800">
                            {aiScanModal.selectedBuildings.length === selectedAmbassador.buildings.length
                              ? '✓ تم اختيار كل المباني'
                              : `✓ تم اختيار ${aiScanModal.selectedBuildings.length} من ${selectedAmbassador.buildings.length} مبنى`
                            }
                          </p>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          if (aiScanModal.selectedBuildings.length === 0) {
                            // If no selection, scan all
                            runAIFraudScan(aiScanModal.userId);
                          } else {
                            runAIFraudScan(aiScanModal.userId, aiScanModal.selectedBuildings);
                          }
                        }}
                        disabled={aiScanning}
                        className="flex-1 py-2.5 bg-gradient-to-l from-purple-600 to-indigo-600 text-white rounded-xl font-medium hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {aiScanning ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            جارٍ الفحص...
                          </>
                        ) : (
                          <>
                            <Brain className="w-4 h-4" />
                            بدء الفحص
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setAiScanModal(null)}
                        disabled={aiScanning}
                        className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 disabled:opacity-50"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && settings && (
                <div className="space-y-4">
                  {/* سويتش تشغيل/إيقاف النظام */}
                  <div className={`rounded-xl border-2 p-6 transition-all ${systemStatus?.ambassador_enabled ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${systemStatus?.ambassador_enabled ? 'bg-emerald-500' : 'bg-red-500'}`}>
                          {systemStatus?.ambassador_enabled ? (
                            <Check className="w-6 h-6 text-white" />
                          ) : (
                            <X className="w-6 h-6 text-white" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-slate-800">
                            {systemStatus?.ambassador_enabled ? 'نظام السفراء مفعّل' : 'نظام السفراء موقف'}
                          </h3>
                          <p className="text-sm text-slate-500">
                            {systemStatus?.ambassador_enabled 
                              ? 'البرنامج يعمل ويظهر للعملاء في القائمة' 
                              : 'البرنامج موقف ومخفي عن العملاء'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleSystemEnabled(!systemStatus?.ambassador_enabled)}
                        disabled={togglingSystem}
                        className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${
                          systemStatus?.ambassador_enabled 
                            ? 'bg-red-500 hover:bg-red-600 text-white' 
                            : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        } disabled:opacity-50`}
                      >
                        {togglingSystem ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : systemStatus?.ambassador_enabled ? (
                          <>
                            <X className="w-5 h-5" />
                            إيقاف النظام
                          </>
                        ) : (
                          <>
                            <Check className="w-5 h-5" />
                            تفعيل النظام
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-lg font-bold text-[#003366] mb-6">إعدادات البرنامج</h2>
                  
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">الحد الأقصى للطوابق</label>
                          <input
                            type="number"
                            value={settings.max_floors}
                            onChange={(e) => setSettings({ ...settings, max_floors: parseInt(e.target.value) || 20 })}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#D4AF37]"
                          />
                        </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">الحد الأدنى للأيام النشطة</label>
                        <input
                          type="number"
                          value={settings.min_days_active}
                          onChange={(e) => setSettings({ ...settings, min_days_active: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#D4AF37]"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={settings.consumption_enabled} onChange={(e) => setSettings({ ...settings, consumption_enabled: e.target.checked })} className="w-5 h-5 text-[#D4AF37] rounded" />
                        <span className="text-slate-700">تفعيل الاستهلاك التلقائي</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={settings.require_email_verified} onChange={(e) => setSettings({ ...settings, require_email_verified: e.target.checked })} className="w-5 h-5 text-[#D4AF37] rounded" />
                        <span className="text-slate-700">اشتراط تفعيل البريد الإلكتروني</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={settings.require_first_listing} onChange={(e) => setSettings({ ...settings, require_first_listing: e.target.checked })} className="w-5 h-5 text-[#D4AF37] rounded" />
                        <span className="text-slate-700">اشتراط إضافة إعلان أول</span>
                      </label>
                    </div>

                      <div>
                        <h3 className="text-md font-bold text-[#003366] mb-4">جدول المكافآت</h3>
                        <div className="space-y-3">
                          {settings.floors_per_reward?.map((reward, idx) => (
                            <div key={idx} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                              <span className="font-bold text-[#D4AF37] w-16">{reward.floors} طابق</span>
                              <span className="text-slate-600">{reward.plan_tier}</span>
                              <span className="text-slate-500">{reward.plan_months} شهر</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button onClick={saveSettings} disabled={saving} className="px-6 py-2 bg-[#D4AF37] text-white rounded-lg hover:bg-[#B8860B] disabled:opacity-50 flex items-center gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        حفظ الإعدادات
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      {showDetailsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowDetailsModal(false)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-gradient-to-l from-[#003366] to-[#004080]">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Eye className="w-5 h-5" />
                تفاصيل الطلب
              </h2>
              <button onClick={() => setShowDetailsModal(false)} className="text-white/80 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {loadingDetails ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
              </div>
            ) : selectedRequest ? (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-bold text-[#003366] mb-4 flex items-center gap-2">
                      <User className="w-5 h-5 text-[#D4AF37]" />
                      بيانات المستخدم
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">{selectedRequest.request.user_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <span className="text-sm">{selectedRequest.request.user_email}</span>
                        {selectedRequest.request.email_verified && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                      {selectedRequest.request.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-slate-400" />
                          <span className="text-sm">{selectedRequest.request.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span className="text-sm">
                          انضم منذ {selectedRequest.summary.days_since_joined} يوم
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-bold text-[#003366] mb-4 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-[#D4AF37]" />
                      إحصائيات
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-[#D4AF37]">{selectedRequest.request.floors_at_request}</p>
                        <p className="text-xs text-slate-500">طوابق عند الطلب</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-blue-600">{selectedRequest.summary.total_referrals}</p>
                        <p className="text-xs text-slate-500">إجمالي الإحالات</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-600">{selectedRequest.summary.completed_referrals}</p>
                        <p className="text-xs text-slate-500">إحالات مكتملة</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-purple-600">{selectedRequest.summary.previous_requests_count}</p>
                        <p className="text-xs text-slate-500">طلبات سابقة</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="font-bold text-[#003366] mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#D4AF37]" />
                    الإحالات ({selectedRequest.referrals.length})
                  </h3>
                  {selectedRequest.referrals.length === 0 ? (
                    <p className="text-center text-slate-500 py-4">لا توجد إحالات</p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {selectedRequest.referrals.map((ref, idx) => (
                        <div key={ref.id} className="flex items-center justify-between bg-white rounded-lg p-3">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-[#D4AF37] text-white text-xs flex items-center justify-center font-bold">
                              {idx + 1}
                            </span>
                            <div>
                              <p className="font-medium text-sm">{ref.referred_name}</p>
                              <p className="text-xs text-slate-500">{ref.referred_email}</p>
                              {ref.referred_phone && (
                                <p className="text-xs text-slate-400" dir="ltr">{ref.referred_phone}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-left">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${
                                ref.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                ref.status === 'flagged_fraud' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {ref.status === 'completed' ? 'مكتمل' : 
                                 ref.status === 'flagged_fraud' ? 'متلاعب' : 'قيد الانتظار'}
                              </span>
                              <p className="text-xs text-slate-400 mt-1">
                                {new Date(ref.referred_joined).toLocaleDateString('ar-SA')}
                              </p>
                            </div>
                            {ref.status !== 'flagged_fraud' ? (
                              <button
                                onClick={() => openFlagModal(ref.id, ref.referred_name)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="وصم كمتلاعب"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => openUnflagModal(ref.id)}
                                className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg transition-colors cursor-pointer"
                                title="إلغاء الوصم"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-[#003366] flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-500" />
                      تحليل الذكاء الاصطناعي لكشف التلاعب
                    </h3>
                    <button
                      onClick={() => analyzeWithAI(selectedRequest.request.id)}
                      disabled={analyzingAI}
                      className="px-4 py-2 bg-gradient-to-l from-purple-500 to-blue-500 text-white rounded-lg font-bold hover:opacity-90 flex items-center gap-2 disabled:opacity-50 cursor-pointer transition-all hover:scale-105"
                    >
                      {analyzingAI ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          جاري التحليل...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          تحليل بالـ AI
                        </>
                      )}
                    </button>
                  </div>
                  
                  {aiAnalysis && (
                    <div className="space-y-3">
                      {(() => {
                        const analysis = aiAnalysis.analysis || aiAnalysis.fallback_analysis || aiAnalysis;
                        const riskScore = analysis?.risk_score ?? 0;
                        return (
                          <>
                            <div className="flex items-center gap-4">
                              <div className={`px-4 py-2 rounded-lg font-bold text-center min-w-[120px] ${
                                riskScore <= 30 ? 'bg-green-100 text-green-700' :
                                riskScore <= 60 ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                <p className="text-2xl">{riskScore}%</p>
                                <p className="text-xs">درجة الخطورة</p>
                              </div>
                              <div className="flex-1">
                                <p className={`font-bold ${
                                  riskScore <= 30 ? 'text-green-600' :
                                  riskScore <= 60 ? 'text-amber-600' :
                                  'text-red-600'
                                }`}>
                                  {riskScore <= 30 ? '✅ خطر منخفض - يبدو طلباً شرعياً' :
                                   riskScore <= 60 ? '⚠️ خطر متوسط - يتطلب مراجعة' :
                                   '🚨 خطر عالي - احتمال تلاعب'}
                                </p>
                                {analysis?.recommendation && (
                                  <p className="text-sm text-slate-600 mt-1">
                                    التوصية: {analysis.recommendation === 'approve' ? 'قبول' : 
                                              analysis.recommendation === 'reject' ? 'رفض' : 'مراجعة يدوية'}
                                  </p>
                                )}
                              </div>
                            </div>
                            
                            {analysis?.suspicious_flags && analysis.suspicious_flags.length > 0 && (
                              <div className="bg-white rounded-lg p-3 space-y-2">
                                <p className="font-bold text-sm text-slate-700">علامات مشبوهة:</p>
                                <ul className="space-y-1">
                                  {analysis.suspicious_flags.map((flag: string, idx: number) => (
                                    <li key={idx} className="text-sm text-red-600 flex items-start gap-2">
                                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                      {flag}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {analysis?.explanation && (
                              <div className="bg-white rounded-lg p-3">
                                <p className="font-bold text-sm text-slate-700 mb-1">تحليل AI:</p>
                                <p className="text-sm text-slate-600">{analysis.explanation}</p>
                              </div>
                            )}
                            
                            {analysis?.details && (
                              <div className="grid grid-cols-4 gap-2">
                                <div className={`p-2 rounded-lg text-center text-xs ${
                                  analysis.details.email_pattern_risk === 'low' ? 'bg-green-50 text-green-700' :
                                  analysis.details.email_pattern_risk === 'medium' ? 'bg-amber-50 text-amber-700' :
                                  'bg-red-50 text-red-700'
                                }`}>
                                  <p className="font-bold">الإيميلات</p>
                                  <p>{analysis.details.email_pattern_risk}</p>
                                </div>
                                <div className={`p-2 rounded-lg text-center text-xs ${
                                  analysis.details.signup_pattern_risk === 'low' ? 'bg-green-50 text-green-700' :
                                  analysis.details.signup_pattern_risk === 'medium' ? 'bg-amber-50 text-amber-700' :
                                  'bg-red-50 text-red-700'
                                }`}>
                                  <p className="font-bold">التسجيلات</p>
                                  <p>{analysis.details.signup_pattern_risk}</p>
                                </div>
                                <div className={`p-2 rounded-lg text-center text-xs ${
                                  analysis.details.name_pattern_risk === 'low' ? 'bg-green-50 text-green-700' :
                                  analysis.details.name_pattern_risk === 'medium' ? 'bg-amber-50 text-amber-700' :
                                  'bg-red-50 text-red-700'
                                }`}>
                                  <p className="font-bold">الأسماء</p>
                                  <p>{analysis.details.name_pattern_risk}</p>
                                </div>
                                <div className={`p-2 rounded-lg text-center text-xs ${
                                  analysis.details.phone_pattern_risk === 'low' ? 'bg-green-50 text-green-700' :
                                  analysis.details.phone_pattern_risk === 'medium' ? 'bg-amber-50 text-amber-700' :
                                  'bg-red-50 text-red-700'
                                }`}>
                                  <p className="font-bold">الجوالات</p>
                                  <p>{analysis.details.phone_pattern_risk}</p>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  
                  {aiError && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-700">{aiError}</p>
                    </div>
                  )}
                  
                  {!aiAnalysis && !analyzingAI && !aiError && (
                    <p className="text-sm text-slate-500 text-center py-2">
                      اضغط على "تحليل بالـ AI" لفحص الطلب وكشف أي أنماط مشبوهة
                    </p>
                  )}
                </div>

                {(selectedRequest.request.status === 'pending' || selectedRequest.request.status === 'under_review') && (() => {
                  const validReferrals = selectedRequest.referrals.filter(r => r.status === 'completed').length;
                  const requiredFloors = settings?.floors_per_reward?.[0]?.floors || 10;
                  const canApprove = validReferrals >= requiredFloors;
                  
                  return (
                    <div className="pt-4 border-t border-slate-200">
                      {!canApprove && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                          <p className="text-sm text-amber-700">
                            لا يمكن قبول الطلب - الإحالات السليمة ({validReferrals}) أقل من النصاب المطلوب ({requiredFloors})
                          </p>
                        </div>
                      )}
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => {
                            handleRequestAction(selectedRequest.request.id, 'approve');
                            setShowDetailsModal(false);
                          }}
                          disabled={!canApprove}
                          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${
                            canApprove 
                              ? 'bg-green-500 text-white hover:bg-green-600 cursor-pointer' 
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <Check className="w-5 h-5" />
                          قبول الطلب
                        </button>
                        <button
                          onClick={() => {
                            handleRequestAction(selectedRequest.request.id, 'reject');
                            setShowDetailsModal(false);
                          }}
                          className="px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 flex items-center gap-2 cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                          رفض الطلب
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500">لا توجد بيانات</div>
            )}
          </div>
        </div>
      )}

      {/* Flag Referral Modal */}
      {flagModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-l from-red-500 to-red-600 p-4 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <Ban className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">وصم الإحالة كمتلاعبة</h3>
                  <p className="text-red-100 text-sm">"{flagModal.referredName}"</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              {flagModal.stage === 'initial' ? (
                <>
                  <p className="text-slate-600 mb-6 text-center">
                    هل تريد وصم هذه الإحالة كمتلاعبة وخصم طابق؟
                  </p>
                  <div className="space-y-3">
                    <button
                      onClick={() => setFlagModal({ ...flagModal, stage: 'confirm' })}
                      className="w-full py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      <Ban className="w-5 h-5" />
                      وصم وخصم الطابق
                    </button>
                    <button
                      onClick={() => setFlagModal(null)}
                      className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 cursor-pointer transition-all"
                    >
                      إلغاء
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <p className="text-xl font-bold text-red-600 mb-2">هل أنت متأكد؟</p>
                    <p className="text-slate-500 text-sm">
                      سيتم وصم الإحالة وخصم طابق من السفير
                    </p>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={() => confirmFlagReferral(true)}
                      className="w-full py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      <Check className="w-5 h-5" />
                      تأكيد
                    </button>
                    <button
                      onClick={() => setFlagModal({ ...flagModal, stage: 'initial' })}
                      className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 cursor-pointer transition-all"
                    >
                      إلغاء
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unflag Referral Modal */}
      {unflagModal?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-l from-green-500 to-emerald-600 p-4 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">إلغاء وصم الإحالة</h3>
                  <p className="text-green-100 text-sm">إعادة تأهيل الإحالة</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-slate-600 mb-6 text-center">
                هل تريد إلغاء وصم هذه الإحالة وإعادتها للحالة الطبيعية؟
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => confirmUnflagReferral()}
                  className="w-full py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <CheckCircle className="w-5 h-5" />
                  نعم، إلغاء الوصم
                </button>
                <button
                  onClick={() => setUnflagModal(null)}
                  className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 cursor-pointer transition-all"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'from-blue-500/10 to-blue-500/5 text-blue-600',
    green: 'from-green-500/10 to-green-500/5 text-green-600',
    gold: 'from-[#D4AF37]/10 to-[#D4AF37]/5 text-[#D4AF37]',
    amber: 'from-amber-500/10 to-amber-500/5 text-amber-600',
    purple: 'from-purple-500/10 to-purple-500/5 text-purple-600',
  };
  
  return (
    <div className={`bg-gradient-to-br ${colors[color]} rounded-xl p-4 border border-slate-100`}>
      <Icon className="w-6 h-6 mb-2" />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}

function TopAmbassadorsList() {
  const [ambassadors, setAmbassadors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ambassador/admin/top', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setAmbassadors(data.ambassadors || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" /></div>;
  if (ambassadors.length === 0) return <p className="text-center text-slate-500 py-4">لا يوجد سفراء حالياً</p>;

  return (
    <div className="space-y-3">
      {ambassadors.map((amb, idx) => (
        <div key={amb.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-3">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
              idx === 0 ? 'bg-[#D4AF37] text-white' : idx === 1 ? 'bg-slate-300 text-slate-700' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>{idx + 1}</span>
            <div>
              <p className="font-medium text-[#003366]">{amb.name}</p>
              <p className="text-xs text-slate-500">{amb.ambassador_code}</p>
            </div>
          </div>
          <div className="text-left">
            <p className="font-bold text-[#D4AF37]">{amb.ambassador_floors} طابق</p>
          </div>
        </div>
      ))}
    </div>
  );
}
