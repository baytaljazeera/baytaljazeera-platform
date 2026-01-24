"use client";

import { Flag, X, Loader2 } from "lucide-react";
import { ReferralData } from "../types";

interface CollapsedFloorModalProps {
  isOpen: boolean;
  onClose: () => void;
  floor: ReferralData | null;
  onRemove: (id: string) => void;
  removing: boolean;
}

export function CollapsedFloorModal({
  isOpen,
  onClose,
  floor,
  onRemove,
  removing
}: CollapsedFloorModalProps) {
  if (!isOpen || !floor) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300 overflow-hidden">
        <div className="p-5 bg-gradient-to-l from-red-600 to-red-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Flag className="w-5 h-5" />
              طابق منهار - الطابق {floor.floor_number}
            </h3>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <X className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-800 mb-1">سبب الانهيار:</p>
                <p className="text-sm text-red-700">
                  {floor.collapse_reason || 'تم رصد نشاط غير سليم في هذه الإحالة'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600 text-sm">اسم المُحال:</span>
              <span className="font-bold text-slate-800">{floor.referred_name}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-600 text-sm">تاريخ التسجيل:</span>
              <span className="font-medium text-slate-800 text-sm">{formatDate(floor.created_at)}</span>
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>ملاحظة:</strong> إزالة هذا الطابق ستفسح المجال لبناء طابق جديد صالح بدلاً منه.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 transition font-bold"
          >
            إغلاق
          </button>
          <button
            onClick={() => onRemove(floor.id)}
            disabled={removing}
            className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {removing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري الإزالة...
              </>
            ) : (
              <>
                <X className="w-4 h-4" />
                إزالة الطابق
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
