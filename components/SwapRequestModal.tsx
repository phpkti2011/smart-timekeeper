import React, { useEffect, useState } from 'react';
import { X, Repeat, Send, Info, AlertOctagon, Clock, User } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { Holiday, LeaveRequest, SwapRequest } from '../types';
import { validateSwapRequest, pairedSunday, describeSwapShort, MAX_SWAP_BACKDATE_DAYS } from '../utils/restDay';
import { getRequestStatusClass, getRequestStatusText } from '../utils/leaveTypes';

// Không có lý do: đổi ngày nghỉ là do công ty xếp lịch, nhân viên chỉ gửi đơn
// để công ty xác nhận. App.tsx tự điền SWAP_DEFAULT_REASON khi lưu.
export interface SwapSubmitPayload {
  restDate: string; // 'yyyy-MM-dd' — Thứ 7 muốn nghỉ
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: SwapSubmitPayload) => void;
  /** Tên nhân viên được tạo hộ (Admin) */
  targetName?: string;
  /** Admin tạo hộ: miễn trần khai bù, đơn tự duyệt. Vẫn bị chặn trùng dữ liệu. */
  isAdmin: boolean;
  employeeId: string;
  workDays?: string;
  holidays: Holiday[];
  /** Toàn bộ đơn đổi (mọi NV) — validate tự lọc theo employeeId */
  existingSwaps: SwapRequest[];
  /** Toàn bộ đơn nghỉ phép — validate tự lọc theo employeeId */
  leaveRequests: LeaveRequest[];
  /** Thứ 7 điền sẵn ('yyyy-MM-dd') khi mở từ banner nhắc nhóm làm CN */
  initialRestDate?: string | null;
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

/** Thứ 7 gần nhất kể từ hôm nay (hôm nay là Thứ 7 thì lấy hôm nay). */
const nextSaturdayStr = () => {
  const d = new Date();
  const diff = (6 - d.getDay() + 7) % 7;
  return format(addDays(d, diff), 'yyyy-MM-dd');
};

export const SwapRequestModal: React.FC<Props> = ({
  isOpen, onClose, onSubmit, targetName, isAdmin, employeeId, workDays, holidays, existingSwaps, leaveRequests, initialRestDate
}) => {
  const [activeTab, setActiveTab] = useState<'REQUEST' | 'HISTORY'>('REQUEST');
  const [restDate, setRestDate] = useState(nextSaturdayStr());

  // Mở lại modal (hoặc đổi người được tạo hộ) thì trả form về mặc định
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('REQUEST');
    setRestDate(initialRestDate || nextSaturdayStr());
  }, [isOpen, employeeId, initialRestDate]);

  if (!isOpen) return null;

  const history = existingSwaps
    .filter(s => s.userId === employeeId)
    .sort((a, b) => b.restDate.getTime() - a.restDate.getTime());

  const rest = restDate ? new Date(`${restDate}T00:00:00`) : null;
  const work = rest && !isNaN(rest.getTime()) ? pairedSunday(rest) : null;

  // Lỗi hiện ngay khi vừa chọn ngày. Chốt chặn thật nằm ở App.tsx.
  const dateError = validateSwapRequest({
    userId: employeeId, restDate, today: todayStr(), isAdmin, workDays,
    holidays, existingSwaps, leaveRequests
  });
  const isDisabled = !!dateError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateError) {
      alert(dateError);
      return;
    }
    onSubmit({ restDate });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden transform transition-all flex flex-col h-[540px] max-h-[90vh]">

        {/* Header */}
        <div className={`p-4 flex justify-between items-center text-white shrink-0 ${isAdmin ? 'bg-gradient-to-r from-rose-600 to-orange-600' : 'bg-gradient-to-r from-violet-600 to-indigo-600'}`}>
          <div className="flex items-center gap-2 min-w-0">
            {isAdmin ? <User size={20} /> : <Repeat size={20} />}
            <div className="min-w-0">
              <h2 className="font-bold text-lg leading-tight">Đổi ngày nghỉ tuần</h2>
              {isAdmin && targetName && (
                <p className="text-xs text-white/85 truncate">Tạo hộ: <b>{targetName}</b> · Tự động duyệt</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 shrink-0">
          <button
            onClick={() => setActiveTab('REQUEST')}
            className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'REQUEST' ? 'border-violet-500 text-violet-600 bg-violet-50/50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
          >
            Gửi đơn
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'HISTORY' ? 'border-violet-500 text-violet-600 bg-violet-50/50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
          >
            Lịch sử ({history.length})
          </button>
        </div>

        <div className="overflow-y-auto p-6 scrollbar-hide flex-1">
          {activeTab === 'REQUEST' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-violet-50 border border-violet-100 p-3 rounded-lg flex items-start gap-2">
                <div className="mt-0.5 text-violet-600"><Info size={16} /></div>
                <div className="text-xs text-violet-900 leading-relaxed space-y-1">
                  <p><b>Nghỉ Thứ 7, đi làm bù Chủ Nhật</b> ngay sau đó.</p>
                  <p>Áp dụng khi công ty xếp lịch làm Chủ Nhật. Chỉ cần chọn ngày và gửi để công ty xác nhận.</p>
                  <p>Sau khi duyệt: Thứ 7 thành ngày nghỉ tuần (nếu vẫn đi làm thì hưởng <b>×2</b>), Chủ Nhật tính công như ngày thường (<b>×1</b>, tăng ca ngoài giờ ×1.5).</p>
                  {!isAdmin && (
                    <p className="opacity-80">Chỉ gửi được trong vòng {MAX_SWAP_BACKDATE_DAYS} ngày sau Chủ Nhật làm bù. Mỗi tuần một đơn.</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Thứ 7 muốn nghỉ <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  lang="en-GB"
                  value={restDate}
                  onChange={(e) => setRestDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none text-sm"
                />
                {work && (
                  <p className="text-[11px] text-gray-600 flex items-center gap-1">
                    <Repeat size={11} className="text-violet-500" />
                    Đi làm bù <b className="text-violet-700">Chủ Nhật {format(work, 'dd/MM/yyyy')}</b>
                  </p>
                )}
              </div>

              {dateError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertOctagon size={15} className="text-red-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-800 leading-relaxed">{dateError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isDisabled}
                className={`w-full py-3.5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all ${isDisabled
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                  : isAdmin ? 'bg-rose-600 text-white hover:bg-rose-700 active:scale-95' : 'bg-violet-600 text-white hover:bg-violet-700 active:scale-95'
                  }`}
              >
                <Send size={18} />
                {dateError ? '🚫 Chưa hợp lệ' : isAdmin ? 'Tạo đơn & Duyệt luôn' : 'Gửi đơn đổi ngày nghỉ'}
              </button>

              <p className="text-[11px] text-gray-500 text-center">
                {isAdmin
                  ? 'Đơn do Admin tạo được duyệt ngay. Vẫn bị chặn nếu tuần đó đã có đơn hoặc trùng ngày nghỉ phép.'
                  : 'Đơn cần được công ty xác nhận mới có hiệu lực tính công.'}
              </p>
            </form>
          ) : (
            <div className="space-y-3 pb-4">
              {history.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Clock size={40} className="mx-auto mb-2 opacity-50" />
                  <p>Chưa có đơn đổi ngày nghỉ nào.</p>
                </div>
              ) : (
                history.map(req => (
                  <div key={req.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex flex-col gap-2">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                        <Repeat size={14} className="text-violet-500 shrink-0" />
                        {describeSwapShort(req)}
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${getRequestStatusClass(req.status)}`}>
                        {getRequestStatusText(req.status)}
                      </span>
                    </div>
                    {req.status === 'REJECTED' && req.rejectionReason && (
                      <div className="text-[10px] text-red-400 italic">Lý do từ chối: "{req.rejectionReason}"</div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
