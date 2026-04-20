import React, { useState } from 'react';
import { X, Calendar, Send, Info, AlertOctagon, Clock, CheckCircle, XCircle } from 'lucide-react';
import { LeaveType, LeaveDuration, LeaveRequest, RequestStatus } from '../types';
import { differenceInDays, startOfDay, format } from 'date-fns';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { startDate: string, endDate: string, type: LeaveType, duration: LeaveDuration, reason: string }) => void;
  currentBalance: number;
  leaveHistory: LeaveRequest[]; // NEW: History data
  userName?: string; // NEW: Display name
  paidLeaveUsedThisMonth?: number; // NEW: For 1-day-per-month policy
}

export const LeaveRequestModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, currentBalance, leaveHistory, userName, paidLeaveUsedThisMonth = 0 }) => {
  const [activeTab, setActiveTab] = useState<'REQUEST' | 'HISTORY'>('REQUEST');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL'); // NEW: Filter state

  // Filter Logic
  const filteredHistory = historyFilter === 'ALL'
    ? leaveHistory
    : leaveHistory.filter(req => req.leaveType === historyFilter);

  // Request Form State
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<LeaveType>('PAID');
  const [duration, setDuration] = useState<LeaveDuration>('FULL');
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  // Calculate Requested Days
  const start = startOfDay(new Date(startDate));
  const end = startOfDay(new Date(endDate));
  const dayDiff = differenceInDays(end, start) + 1;
  const isSameDate = startDate === endDate;

  let requestedDays = 0;
  if (dayDiff > 0) {
    if (isSameDate) {
      requestedDays = duration === 'FULL' ? 1.0 : 0.5;
    } else {
      requestedDays = dayDiff; // Assuming multi-day is always FULL days per day
    }
  }

  // Validation Logic
  const isOverBalance = type === 'PAID' && requestedDays > currentBalance;
  const isExceedingMonthlyQuota = type === 'PAID' && (paidLeaveUsedThisMonth + requestedDays) > 1;
  const isDisabled = isOverBalance || isExceedingMonthlyQuota || requestedDays <= 0 || !reason.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert("Vui lòng nhập lý do nghỉ");
      return;
    }
    if (endDate < startDate) {
      alert("Ngày kết thúc không được nhỏ hơn ngày bắt đầu");
      return;
    }
    if (isOverBalance) {
      alert("Số phép còn lại không đủ!");
      return;
    }
    onSubmit({ startDate, endDate, type, duration, reason });
    setReason('');
    setActiveTab('HISTORY'); // Switch to history after submit
  };

  const getStatusColor = (status: RequestStatus) => {
    switch (status) {
      case 'APPROVED': return 'text-green-600 bg-green-50 border-green-200';
      case 'REJECTED': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-orange-600 bg-orange-50 border-orange-200';
    }
  };

  const getStatusText = (status: RequestStatus) => {
    switch (status) {
      case 'APPROVED': return 'Đã duyệt';
      case 'REJECTED': return 'Từ chối';
      default: return 'Chờ duyệt';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden transform transition-all flex flex-col h-[650px] max-h-[90vh]">

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-4 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-2">
            <Calendar size={20} />
            <h2 className="font-bold text-lg">Xin nghỉ phép: {userName || 'Của bạn'}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 shrink-0">
          <button
            onClick={() => setActiveTab('REQUEST')}
            className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'REQUEST' ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
          >
            Gửi đơn
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'HISTORY' ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
          >
            Lịch sử ({leaveHistory.length})
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 scrollbar-hide flex-1">
          {activeTab === 'REQUEST' ? (
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Info / Warning Box */}
              {isExceedingMonthlyQuota && type === 'PAID' ? (
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg flex items-start gap-2 animate-pulse">
                  <div className="mt-0.5 text-red-600">
                    <AlertOctagon size={16} />
                  </div>
                  <div className="text-xs text-red-800 leading-relaxed">
                    <p className="font-bold text-sm">🚫 Không thể gửi đơn phép năm!</p>
                    <p>Bạn đã sử dụng <span className="font-bold">{paidLeaveUsedThisMonth}</span>/1 ngày phép có lương tháng này.</p>
                    <p className="mt-1">Mỗi tháng chỉ được nghỉ <span className="font-bold">1 ngày phép có lương</span>, không cộng dồn.</p>
                    <p className="mt-1 font-bold">Vui lòng chọn "Không lương" nếu vẫn muốn xin nghỉ.</p>
                  </div>
                </div>
              ) : !isOverBalance ? (
                <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-start gap-2">
                  <div className="mt-0.5 text-emerald-600">
                    <Info size={16} />
                  </div>
                  <div className="text-xs text-emerald-800 leading-relaxed">
                    <p>Phép tháng này: <span className="font-bold text-base">{1 - paidLeaveUsedThisMonth}</span>/1 ngày (không cộng dồn).</p>
                    <p className="opacity-80 mt-1">Mỗi tháng chỉ được 1 ngày phép có lương.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-100 p-3 rounded-lg flex items-start gap-2 animate-pulse">
                  <div className="mt-0.5 text-red-600">
                    <AlertOctagon size={16} />
                  </div>
                  <div className="text-xs text-red-800 leading-relaxed">
                    <p className="font-bold text-sm">Không đủ phép năm!</p>
                    <p>Bạn còn: <span className="font-bold">{currentBalance}</span> ngày.</p>
                    <p>Bạn đang xin: <span className="font-bold">{requestedDays}</span> ngày.</p>
                    <p className="mt-1">Vui lòng chọn "Không lương" hoặc giảm số ngày.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Từ ngày</label>
                  <input
                    type={startDate ? "date" : "text"}
                    lang="en-GB"
                    value={startDate}
                    placeholder="dd/mm/yyyy"
                    onFocus={(e) => e.target.type = 'date'}
                    onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm placeholder-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Đến ngày</label>
                  <input
                    type={endDate ? "date" : "text"}
                    lang="en-GB"
                    value={endDate}
                    placeholder="dd/mm/yyyy"
                    onFocus={(e) => e.target.type = 'date'}
                    onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm placeholder-gray-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Loại nghỉ</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType('PAID')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${type === 'PAID' ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-500'}`}
                  >
                    Có lương (Phép năm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('UNPAID')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${type === 'UNPAID' ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white border-gray-200 text-gray-500'}`}
                  >
                    Không lương
                  </button>
                </div>
              </div>

              {isSameDate && (
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Thời gian nghỉ</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value as LeaveDuration)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm"
                  >
                    <option value="FULL">Cả ngày (1.0 công)</option>
                    <option value="MORNING">Sáng (0.5 công)</option>
                    <option value="AFTERNOON">Chiều (0.5 công)</option>
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Lý do <span className="text-red-500">*</span></label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm min-h-[80px] resize-none"
                  placeholder="Ví dụ: Nghỉ ốm, Việc gia đình..."
                />
              </div>

              <button
                type="submit"
                disabled={isDisabled}
                className={`w-full py-3.5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all ${isDisabled
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
                  }`}
              >
                <Send size={18} />
                {isExceedingMonthlyQuota ? '🚫 Đã hết phép tháng này' : isOverBalance ? 'Không đủ phép' : 'Gửi đơn xin nghỉ'}
              </button>
            </form>
          ) : (
            <div className="flex flex-col h-full">
              {/* History Filter Tabs */}
              <div className="flex p-1 bg-gray-100 rounded-lg mb-3 shrink-0">
                {(['ALL', 'PAID', 'UNPAID'] as const).map((filterType) => (
                  <button
                    key={filterType}
                    onClick={() => setHistoryFilter(filterType)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${historyFilter === filterType
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    {filterType === 'ALL' && 'Tất cả'}
                    {filterType === 'PAID' && 'Có lương'}
                    {filterType === 'UNPAID' && 'Không lương'}
                  </button>
                ))}
              </div>

              <div className="space-y-3 pb-4 overflow-y-auto scrollbar-hide flex-1">
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Clock size={40} className="mx-auto mb-2 opacity-50" />
                    <p>Chưa có lịch sử nghỉ phép.</p>
                  </div>
                ) : (
                  filteredHistory.map(req => (
                    <div key={req.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-bold text-gray-800">
                            {format(new Date(req.startDate), 'dd/MM')}
                            {req.startDate !== req.endDate && ` - ${format(new Date(req.endDate), 'dd/MM')}`}
                            <span className="font-normal text-gray-500 text-xs ml-1">
                              ({req.duration === 'FULL' ? '1 ngày' : '0.5 ngày'})
                            </span>
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${req.leaveType === 'PAID' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                              {req.leaveType === 'PAID' ? 'Có lương' : 'Không lương'}
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${getStatusColor(req.status)}`}>
                          {getStatusText(req.status)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded-lg italic">
                        "{req.reason}"
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
