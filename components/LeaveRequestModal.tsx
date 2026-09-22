import React, { useState, useEffect } from 'react';
import { X, Calendar, Send, Info, AlertOctagon, Clock, CheckCircle, XCircle } from 'lucide-react';
import { LeaveType, LeaveDuration, LeaveRequest, Holiday, SwapRequest } from '../types';
import { startOfDay, format, isSameDay } from 'date-fns';
import { LEAVE_TYPE_LABEL, LEAVE_PAYER_TEXT, getLeaveBadgeClass, SPECIAL_LEAVE_REASONS, SPECIAL_LEAVE_GROUPS, findSpecialLeaveReason, leaveTypeForSpecialReason, findOverlappingLeave, deriveLeaveEndDate, countLeaveDays, getPaidLeaveUsedThisMonth, MONTHLY_PAID_LEAVE_QUOTA, getRequestStatusClass, getRequestStatusText } from '../utils/leaveTypes';
import { makeRestDayPredicate, findSwapBlockingLeave, describeSwap } from '../utils/restDay';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { startDate: string, endDate: string, type: LeaveType, duration: LeaveDuration, reason: string }) => void;
  currentBalance: number;
  leaveHistory: LeaveRequest[]; // NEW: History data
  userName?: string; // NEW: Display name
  employeeId?: string; // Để tự tính số ngày đã dùng theo THÁNG ĐANG CHỌN
  holidays?: Holiday[]; // Để không trừ phép vào ngày lễ
  swapRequests?: SwapRequest[]; // Đơn đổi ngày nghỉ CỦA NV này — bỏ qua T7 đã đổi và chặn xin nghỉ đè lên
  allowSpecialLeave?: boolean; // NEW: Cho phép tạo nghỉ chế độ có lương (Admin)
  canUseAnnualLeave?: boolean; // false = chưa ký HĐ chính thức, không có phép năm
  contractTypeLabel?: string;  // để câu thông báo nói đúng loại hợp đồng
  // false = Admin đang tạo đơn HỘ người khác → không áp trần tháng.
  // Cố ý tách khỏi allowSpecialLeave (theo vai trò): Admin tự xin nghỉ cho
  // chính mình vẫn phải chịu trần.
  enforceMonthlyQuota?: boolean;
}

export const LeaveRequestModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, currentBalance, leaveHistory, userName, employeeId, holidays = [], swapRequests = [], allowSpecialLeave = false, canUseAnnualLeave = true, contractTypeLabel, enforceMonthlyQuota = true }) => {
  const [activeTab, setActiveTab] = useState<'REQUEST' | 'HISTORY'>('REQUEST');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'PAID' | 'SPECIAL' | 'UNPAID'>('ALL'); // NEW: Filter state

  // Filter Logic
  // Tab "Chế độ" gom cả SPECIAL lẫn INSURANCE: thêm tab thứ năm thì bốn tab hiện
  // tại chật quá, mà để riêng thì đơn thai sản chỉ hiện ở tab "Tất cả".
  const matchesFilter = (t: LeaveType) =>
    historyFilter === 'SPECIAL' ? (t === 'SPECIAL' || t === 'INSURANCE') : t === historyFilter;

  const filteredHistory = historyFilter === 'ALL'
    ? leaveHistory
    : leaveHistory.filter(req => matchesFilter(req.leaveType));

  // Request Form State
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<LeaveType>('PAID');
  const [duration, setDuration] = useState<LeaveDuration>('FULL');
  const [reason, setReason] = useState('');

  // NEW: Nghỉ chế độ (SPECIAL) — Admin nhập số ngày + chọn lý do
  const [specialDays, setSpecialDays] = useState<number>(SPECIAL_LEAVE_REASONS[0].suggestedDays || 1);
  const [specialReason, setSpecialReason] = useState<string>(SPECIAL_LEAVE_REASONS[0].value);
  const [customReason, setCustomReason] = useState('');

  const isSpecial = type === 'SPECIAL';
  const isOtherReason = specialReason === 'Khác';

  // Loại nghỉ THỰC TẾ lấy từ lý do đã chọn, không phải từ tab đang mở. Thai sản do
  // BHXH chi trả nên phải ra INSURANCE, nếu lấy theo tab thì công ty sẽ trả lương
  // chồng lên tiền bảo hiểm.
  const effectiveSpecialType = leaveTypeForSpecialReason(specialReason);
  const selectedReasonInfo = findSpecialLeaveReason(specialReason);

  // Chưa ký HĐ chính thức thì không có phép năm — chuyển sẵn sang Không lương
  useEffect(() => {
    if (!canUseAnnualLeave && type === 'PAID') setType('UNPAID');
  }, [canUseAnnualLeave, type]);

  if (!isOpen) return null;

  // Ngày nghỉ tuần của NV này (CN, hoặc T7 đã đổi) — dùng chung với App/quản lý phép
  const isRestDay = makeRestDayPredicate(swapRequests, holidays);

  // Calculate Requested Days (dùng chung công thức với App/quản lý phép: bỏ ngày nghỉ tuần và ngày lễ)
  const start = startOfDay(new Date(startDate));
  const end = startOfDay(new Date(endDate));
  const isSameDate = startDate === endDate;

  const requestedDays = isSpecial
    ? (specialDays > 0 ? specialDays : 0)
    : countLeaveDays({ startDate: start, endDate: end, duration }, holidays, isRestDay);

  // Lý do cuối cùng (SPECIAL: lấy từ dropdown / ô "Khác"; còn lại: ô nhập tay)
  const finalReason = isSpecial ? (isOtherReason ? customReason : specialReason) : reason;

  // Tính theo THÁNG CỦA NGÀY BẮT ĐẦU NGHỈ, không phải tháng hiện tại — phải khớp
  // với lúc gửi đơn, nếu không chọn ngày sang tháng sau sẽ báo một đằng chặn một nẻo.
  const paidLeaveUsedThisMonth = employeeId
    ? getPaidLeaveUsedThisMonth(employeeId, leaveHistory, start, holidays, isRestDay)
    : 0;

  // Cảnh báo sớm nếu đè lên đơn nghỉ đã có. Chỉ là trải nghiệm — chốt chặn thật
  // nằm ở handleSubmitLeaveRequest trong App.tsx.
  // Nghỉ chế độ suy ngày kết thúc từ số ngày Admin nhập, nên phải tính lại mốc đó.
  const effectiveEnd = isSpecial && specialDays > 0 ? deriveLeaveEndDate(start, specialDays, isRestDay) : end;
  const overlapWith = employeeId
    ? findOverlappingLeave(employeeId, { startDate: start, endDate: effectiveEnd, duration }, leaveHistory, { holidays, isRestDay })
    : null;
  // Đè lên Thứ 7 đã đổi thành ngày nghỉ bù → ngày đó đã nghỉ, không có gì để xin
  const swapClash = employeeId
    ? findSwapBlockingLeave(employeeId, { startDate: start, endDate: effectiveEnd }, swapRequests)
    : null;

  // Validation Logic (balance/quota chỉ áp cho phép năm PAID)
  const isBlockedAnnualLeave = type === 'PAID' && !canUseAnnualLeave;
  const isOverBalance = type === 'PAID' && canUseAnnualLeave && requestedDays > currentBalance;
  const isExceedingMonthlyQuota = enforceMonthlyQuota && type === 'PAID' && canUseAnnualLeave
    && (paidLeaveUsedThisMonth + requestedDays) > MONTHLY_PAID_LEAVE_QUOTA;
  const isDisabled = isBlockedAnnualLeave || isOverBalance || isExceedingMonthlyQuota || requestedDays <= 0 || !finalReason.trim() || !!overlapWith || !!swapClash;

  // Đổi lý do chế độ → gợi ý điền sẵn số ngày (Admin sửa được)
  const handleSpecialReasonChange = (value: string) => {
    setSpecialReason(value);
    const found = SPECIAL_LEAVE_REASONS.find(r => r.value === value);
    if (found?.suggestedDays) setSpecialDays(found.suggestedDays);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalReason.trim()) {
      alert(isSpecial ? "Vui lòng nhập lý do nghỉ" : "Vui lòng nhập lý do nghỉ");
      return;
    }
    if (isSpecial) {
      if (!specialDays || specialDays < 1) {
        alert("Số ngày nghỉ phải từ 1 trở lên");
        return;
      }
      // Suy ra endDate từ số ngày công Admin nhập (bỏ qua ngày nghỉ tuần)
      const derivedEnd = format(deriveLeaveEndDate(start, specialDays, isRestDay), 'yyyy-MM-dd');
      onSubmit({ startDate, endDate: derivedEnd, type: effectiveSpecialType, duration: 'FULL', reason: finalReason });
      setCustomReason('');
      setActiveTab('HISTORY');
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
              {isSpecial ? (
                <div className="bg-teal-50 border border-teal-100 p-3 rounded-lg flex items-start gap-2">
                  <div className="mt-0.5 text-teal-600">
                    <Info size={16} />
                  </div>
                  <div className="text-xs text-teal-800 leading-relaxed">
                    <p className="font-bold text-sm">Nghỉ chế độ (có lương)</p>
                    <p className="opacity-90 mt-0.5">Tính đủ ngày công, <span className="font-bold">không trừ phép năm</span> và không bị giới hạn {MONTHLY_PAID_LEAVE_QUOTA} ngày/tháng.</p>
                  </div>
                </div>
              ) : !canUseAnnualLeave ? (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-2">
                  <div className="mt-0.5 text-amber-600">
                    <AlertOctagon size={16} />
                  </div>
                  <div className="text-xs text-amber-800 leading-relaxed">
                    <p className="font-bold text-sm">Chưa có phép năm</p>
                    <p className="mt-0.5">
                      {contractTypeLabel ? `Đang là "${contractTypeLabel}"` : 'Chưa ký hợp đồng chính thức'} nên
                      chưa được tích luỹ phép năm. Chỉ nhân viên đã ký <span className="font-bold">hợp đồng chính thức</span> mới
                      được nghỉ phép năm.
                    </p>
                    <p className="mt-1 font-bold">Vẫn có thể xin nghỉ "Không lương".</p>
                  </div>
                </div>
              ) : isExceedingMonthlyQuota && type === 'PAID' ? (
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg flex items-start gap-2 animate-pulse">
                  <div className="mt-0.5 text-red-600">
                    <AlertOctagon size={16} />
                  </div>
                  <div className="text-xs text-red-800 leading-relaxed">
                    <p className="font-bold text-sm">🚫 Không thể gửi đơn phép năm!</p>
                    <p>Bạn đã sử dụng <span className="font-bold">{paidLeaveUsedThisMonth}</span>/{MONTHLY_PAID_LEAVE_QUOTA} ngày phép năm trong tháng này.</p>
                    <p className="mt-1">Mỗi tháng chỉ được nghỉ tối đa <span className="font-bold">{MONTHLY_PAID_LEAVE_QUOTA} ngày phép năm</span>.</p>
                    <p className="mt-1 font-bold">Vui lòng chọn "Không lương" nếu vẫn muốn xin nghỉ.</p>
                  </div>
                </div>
              ) : !isOverBalance ? (
                <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-start gap-2">
                  <div className="mt-0.5 text-emerald-600">
                    <Info size={16} />
                  </div>
                  <div className="text-xs text-emerald-800 leading-relaxed">
                    <p>Quỹ phép năm còn: <span className="font-bold text-base">{currentBalance}</span> ngày (1 ngày/tháng, cộng dồn trong năm, reset 01/01).</p>
                    {enforceMonthlyQuota ? (
                      <p className="opacity-80 mt-1">Tháng này còn dùng được <span className="font-bold">{Math.max(0, MONTHLY_PAID_LEAVE_QUOTA - paidLeaveUsedThisMonth)}</span>/{MONTHLY_PAID_LEAVE_QUOTA} ngày.</p>
                    ) : (
                      <p className="opacity-80 mt-1">Admin tạo đơn hộ nên <span className="font-bold">không giới hạn {MONTHLY_PAID_LEAVE_QUOTA} ngày/tháng</span>, chỉ giới hạn bởi quỹ năm còn lại.</p>
                    )}
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
                {isSpecial ? (
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-gray-700">Số ngày nghỉ</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={specialDays}
                      onChange={(e) => setSpecialDays(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                    />
                  </div>
                ) : (
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
                )}
              </div>
              {isSpecial && specialDays >= 1 && (
                <p className="text-[11px] text-gray-500 -mt-2">
                  Nghỉ từ <span className="font-bold">{format(start, 'dd/MM/yyyy')}</span> đến <span className="font-bold">{format(deriveLeaveEndDate(start, specialDays, isRestDay), 'dd/MM/yyyy')}</span> ({specialDays} ngày công, đã bỏ qua ngày nghỉ tuần).
                </p>
              )}

              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Loại nghỉ</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType('PAID')}
                    disabled={!canUseAnnualLeave}
                    title={canUseAnnualLeave ? undefined : 'Chưa ký hợp đồng chính thức nên chưa có phép năm'}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${!canUseAnnualLeave
                      ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed line-through'
                      : type === 'PAID' ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-500'}`}
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
                  {allowSpecialLeave && (
                    <button
                      type="button"
                      onClick={() => setType('SPECIAL')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${type === 'SPECIAL' ? 'bg-teal-100 border-teal-300 text-teal-700' : 'bg-white border-gray-200 text-gray-500'}`}
                    >
                      Nghỉ chế độ
                    </button>
                  )}
                </div>
              </div>

              {!isSpecial && isSameDate && (
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

              {isSpecial ? (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Lý do nghỉ (theo quy định) <span className="text-red-500">*</span></label>
                  <select
                    value={specialReason}
                    onChange={(e) => handleSpecialReasonChange(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                  >
                    {SPECIAL_LEAVE_GROUPS.map(g => {
                      const items = SPECIAL_LEAVE_REASONS.filter(r => r.group === g);
                      if (items.length === 0) return null;
                      return (
                        <optgroup key={g} label={g}>
                          {items.map(r => (
                            <option key={r.value} value={r.value}>{r.value}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>

                  {/* Ai trả lương — phải hiện rõ, vì thai sản trông giống nghỉ chế độ
                      nhưng công ty không trả đồng nào */}
                  <div className={`text-[11px] px-2.5 py-2 rounded-lg border ${getLeaveBadgeClass(effectiveSpecialType)}`}>
                    <div className="font-bold">{LEAVE_TYPE_LABEL[effectiveSpecialType]}</div>
                    <div className="opacity-90">{LEAVE_PAYER_TEXT[effectiveSpecialType]}</div>
                    {selectedReasonInfo && (
                      <div className="opacity-75 mt-0.5">Căn cứ: {selectedReasonInfo.basis}</div>
                    )}
                  </div>

                  {selectedReasonInfo?.suggestedDays ? (
                    <p className="text-[11px] text-teal-600">Gợi ý theo quy định: <span className="font-bold">{selectedReasonInfo.suggestedDays} ngày</span> (Admin tự thiết lập).</p>
                  ) : null}
                  {isOtherReason && (
                    <textarea
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none text-sm min-h-[70px] resize-none"
                      placeholder="Nhập lý do nghỉ chế độ..."
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Lý do <span className="text-red-500">*</span></label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm min-h-[80px] resize-none"
                    placeholder="Ví dụ: Nghỉ ốm, Việc gia đình..."
                  />
                </div>
              )}

              {overlapWith && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertOctagon size={15} className="text-red-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-800 leading-relaxed">
                    Đã có đơn nghỉ trùng ngày: <b>{LEAVE_TYPE_LABEL[overlapWith.leaveType]}</b>{' '}
                    {format(new Date(overlapWith.startDate), 'dd/MM/yyyy')}
                    {!isSameDay(new Date(overlapWith.startDate), new Date(overlapWith.endDate)) &&
                      ` – ${format(new Date(overlapWith.endDate), 'dd/MM/yyyy')}`}
                    {' '}({getRequestStatusText(overlapWith.status)}).
                    <br />Một ngày chỉ nghỉ được một lần. Nếu đơn cũ nhập sai, hãy xoá đơn đó trong mục Duyệt Đơn rồi tạo lại.
                  </p>
                </div>
              )}

              {swapClash && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertOctagon size={15} className="text-red-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-800 leading-relaxed">
                    Trùng ngày nghỉ bù: <b>{describeSwap(swapClash)}</b> ({getRequestStatusText(swapClash.status)}).
                    <br />Thứ 7 {format(swapClash.restDate, 'dd/MM')} đã là ngày nghỉ tuần nên không cần xin nghỉ phép. Chọn ngày khác, hoặc huỷ đơn đổi ngày nghỉ trước.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isDisabled}
                className={`w-full py-3.5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all ${isDisabled
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
                  }`}
              >
                <Send size={18} />
                {overlapWith ? '🚫 Trùng ngày với đơn đã có' : swapClash ? '🚫 Trùng ngày nghỉ bù' : isSpecial ? 'Gửi đơn nghỉ chế độ' : isExceedingMonthlyQuota ? '🚫 Đã hết phép tháng này' : isOverBalance ? 'Không đủ phép' : 'Gửi đơn xin nghỉ'}
              </button>
            </form>
          ) : (
            <div className="flex flex-col h-full">
              {/* History Filter Tabs */}
              <div className="flex p-1 bg-gray-100 rounded-lg mb-3 shrink-0">
                {(['ALL', 'PAID', 'SPECIAL', 'UNPAID'] as const).map((filterType) => (
                  <button
                    key={filterType}
                    onClick={() => setHistoryFilter(filterType)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${historyFilter === filterType
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    {filterType === 'ALL' && 'Tất cả'}
                    {filterType === 'PAID' && 'Phép năm'}
                    {filterType === 'SPECIAL' && 'Chế độ'}
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
                            {!isSameDay(new Date(req.startDate), new Date(req.endDate)) && ` - ${format(new Date(req.endDate), 'dd/MM')}`}
                            <span className="font-normal text-gray-500 text-xs ml-1">
                              ({countLeaveDays(req, holidays, isRestDay)} ngày)
                            </span>
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getLeaveBadgeClass(req.leaveType)}`}>
                              {LEAVE_TYPE_LABEL[req.leaveType]}
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${getRequestStatusClass(req.status)}`}>
                          {getRequestStatusText(req.status)}
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
