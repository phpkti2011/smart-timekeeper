
import React, { useState } from 'react';
import { format, isSameMonth, startOfMonth, subMonths, addMonths } from 'date-fns';
import { OTRequest, LateRequest, SalaryAdvanceRequest, RequestStatus, LeaveRequest, SwapRequest, Holiday, ProfileChangeRequest, UserProfile } from '../types';
import { FileCheck, Check, XCircle, Clock, Filter, CheckCircle2, XCircle as XIcon, AlertTriangle, RotateCcw, DollarSign, Calendar, ChevronLeft, ChevronRight, CheckSquare, Square, Layers, Moon, Trash2, Repeat, UserCog } from 'lucide-react';
import { splitOTRange } from '../utils/otRules';
import { OT_LOCATION_LABEL } from '../utils/otDisplay';
import { LEAVE_TYPE_LABEL, getLeaveBadgeClass } from '../utils/leaveTypes';
import { isSwapVoidedByHoliday } from '../utils/restDay';
import { describeProfileChanges, PROFILE_DEFAULT_REASON } from '../utils/profileChange';

interface Props {
  otRequests: OTRequest[];
  lateRequests: LateRequest[];
  advanceRequests?: SalaryAdvanceRequest[];
  leaveRequests?: LeaveRequest[];
  swapRequests?: SwapRequest[];
  profileRequests?: ProfileChangeRequest[];
  /** Để cảnh báo số điện thoại trùng với nhân viên khác ngay trong thẻ đơn */
  employees?: UserProfile[];
  /** Để gắn nhãn "vô hiệu" cho đơn đổi ngày nghỉ trùng ngày lễ thêm sau khi duyệt */
  holidays?: Holiday[];
  onUpdateOtStatus: (id: string, status: RequestStatus, reason?: string) => void;
  onUpdateLateStatus: (id: string, status: RequestStatus, reason?: string) => void;
  onUpdateAdvanceStatus?: (id: string, status: RequestStatus, reason?: string) => void;
  onUpdateLeaveStatus?: (id: string, status: RequestStatus, reason?: string) => void;
  onUpdateSwapStatus?: (id: string, status: RequestStatus, reason?: string) => void;
  onUpdateProfileStatus?: (id: string, status: RequestStatus, reason?: string) => void;
  /** Xoá hẳn đơn — dùng cho đơn nhập trùng / nhập nhầm. Chỉ truyền vào khi là Admin. */
  onDeleteRequest?: (id: string, type: 'LEAVE' | 'OT' | 'LATE' | 'ADVANCE' | 'SWAP' | 'PROFILE') => void;
}

type CombinedRequest =
  | ({ type: 'OT' } & OTRequest)
  | ({ type: 'LATE' } & LateRequest)
  | ({ type: 'ADVANCE' } & SalaryAdvanceRequest)
  | ({ type: 'LEAVE'; date: Date } & LeaveRequest)
  | ({ type: 'SWAP'; date: Date } & SwapRequest)
  | ({ type: 'PROFILE' } & ProfileChangeRequest);

type RequestTypeFilter = 'ALL' | 'LEAVE' | 'OT' | 'LATE' | 'ADVANCE' | 'SWAP' | 'PROFILE';

export const RequestApproval: React.FC<Props> = ({
  otRequests,
  lateRequests,
  advanceRequests = [],
  leaveRequests = [],
  swapRequests = [],
  profileRequests = [],
  employees = [],
  holidays = [],
  onUpdateOtStatus,
  onUpdateLateStatus,
  onUpdateAdvanceStatus,
  onUpdateLeaveStatus,
  onUpdateSwapStatus,
  onUpdateProfileStatus,
  onDeleteRequest
}) => {
  const [filter, setFilter] = useState<'PENDING' | 'PROCESSED'>('PENDING');
  const [activeTypeTab, setActiveTypeTab] = useState<RequestTypeFilter>('ALL');
  const [historyMonth, setHistoryMonth] = useState(new Date());

  // Batch Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reject Modal State
  const [rejectingRequest, setRejectingRequest] = useState<CombinedRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Merge and Sort
  const combinedList: CombinedRequest[] = [
    ...otRequests.map(r => ({ ...r, type: 'OT' as const })),
    ...lateRequests.map(r => ({ ...r, type: 'LATE' as const })),
    ...advanceRequests.map(r => ({ ...r, type: 'ADVANCE' as const })),
    ...leaveRequests.map(r => ({ ...r, type: 'LEAVE' as const, date: r.startDate })),
    // Sắp xếp / lọc theo tháng bằng Thứ 7 nghỉ bù
    ...swapRequests.map(r => ({ ...r, type: 'SWAP' as const, date: r.restDate })),
    // Đơn đổi thông tin đã có sẵn cột date = ngày gửi
    ...profileRequests.map(r => ({ ...r, type: 'PROFILE' as const }))
  ];

  const pendingRequests = combinedList.filter(r => r.status === 'PENDING').sort((a, b) => b.date.getTime() - a.date.getTime());

  // For History, we filter by Month
  const processedRequests = combinedList
    .filter(r => r.status !== 'PENDING')
    .filter(r => isSameMonth(r.date, historyMonth))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // Apply Type Filter
  const getFilteredList = (list: CombinedRequest[]) => {
    if (activeTypeTab === 'ALL') return list;
    return list.filter(r => r.type === activeTypeTab);
  };

  const displayedRequests = getFilteredList(filter === 'PENDING' ? pendingRequests : processedRequests);

  // Counters
  const getCount = (list: CombinedRequest[], type: RequestTypeFilter) => {
    if (type === 'ALL') return list.length;
    return list.filter(r => r.type === type).length;
  };

  const pList = filter === 'PENDING' ? pendingRequests : processedRequests;

  // Actions
  const handleUpdateStatus = (req: CombinedRequest, status: RequestStatus, reason?: string) => {
    if (req.type === 'OT') onUpdateOtStatus(req.id, status, reason);
    else if (req.type === 'LATE') onUpdateLateStatus(req.id, status, reason);
    else if (req.type === 'ADVANCE' && onUpdateAdvanceStatus) onUpdateAdvanceStatus(req.id, status, reason);
    else if (req.type === 'LEAVE' && onUpdateLeaveStatus) onUpdateLeaveStatus(req.id, status, reason);
    else if (req.type === 'SWAP' && onUpdateSwapStatus) onUpdateSwapStatus(req.id, status, reason);
    else if (req.type === 'PROFILE' && onUpdateProfileStatus) onUpdateProfileStatus(req.id, status, reason);
  };

  // Reject with reason
  const handleRejectClick = (req: CombinedRequest) => {
    setRejectingRequest(req);
    setRejectReason('');
  };

  const handleConfirmReject = () => {
    if (!rejectingRequest) return;
    handleUpdateStatus(rejectingRequest, 'REJECTED', rejectReason.trim() || undefined);
    setRejectingRequest(null);
    setRejectReason('');
  };

  // Batch Actions
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedRequests.map(r => r.id)));
    }
  };

  const handleBatchAction = async (status: RequestStatus) => {
    if (selectedIds.size === 0) return;

    // Process all selected IDs
    // We iterate through displayedRequests to find the request efficiently or just use the ID map
    const selectedRequests = displayedRequests.filter(r => selectedIds.has(r.id));

    for (const req of selectedRequests) {
      handleUpdateStatus(req, status);
    }

    // Clear selection
    setSelectedIds(new Set());
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden min-h-[60vh] relative z-10 pb-20 flex flex-col">

      {/* Header */}
      <div className="bg-white p-5 border-b border-gray-100 sticky top-0 z-20">
        {/* 1. Title Section */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 shadow-sm border border-indigo-100">
            <FileCheck size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 leading-none">Duyệt Đơn</h2>
            <span className="text-sm text-gray-500">Quản lý yêu cầu nhân sự</span>
          </div>
        </div>

        {/* 2. Main Tabs (Pending vs History) */}
        <div className="flex bg-gray-100 p-1 rounded-xl mb-4">
          <button
            onClick={() => { setFilter('PENDING'); setSelectedIds(new Set()); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${filter === 'PENDING' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Chờ duyệt
            {pendingRequests.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setFilter('PROCESSED'); setSelectedIds(new Set()); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all text-center ${filter === 'PROCESSED' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Lịch sử
          </button>
        </div>

        {/* 3. Secondary Tabs (Types) */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'ALL', label: 'Tất cả' },
            { id: 'LEAVE', label: 'Nghỉ phép' },
            { id: 'OT', label: 'Tăng ca' },
            { id: 'LATE', label: 'Đi trễ' },
            { id: 'ADVANCE', label: 'Ứng lương' },
            { id: 'SWAP', label: 'Đổi ngày nghỉ' },
            { id: 'PROFILE', label: 'Đổi thông tin' },
          ].map((tab) => {
            const count = getCount(pList, tab.id as RequestTypeFilter);
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTypeTab(tab.id as RequestTypeFilter); setSelectedIds(new Set()); }}
                className={`
                    whitespace-nowrap px-3 py-2 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5
                    ${activeTypeTab === tab.id
                    ? 'bg-gray-800 text-white border-gray-800 shadow-md'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
                `}
              >
                {tab.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTypeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* History Month Picker */}
        {filter === 'PROCESSED' && (
          <div className="mt-3 flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-200">
            <button onClick={() => setHistoryMonth(prev => subMonths(prev, 1))} className="p-1 hover:bg-white rounded shadow-sm transition"><ChevronLeft size={16} /></button>
            <div className="text-xs font-bold text-gray-700 uppercase flex items-center gap-2">
              <Calendar size={14} className="text-indigo-500" />
              Tháng {format(historyMonth, 'MM/yyyy')}
            </div>
            <button onClick={() => setHistoryMonth(prev => addMonths(prev, 1))} className="p-1 hover:bg-white rounded shadow-sm transition"><ChevronRight size={16} /></button>
          </div>
        )}

        {/* Batch Selection Master Checkbox (Only for Pending) */}
        {filter === 'PENDING' && displayedRequests.length > 0 && (
          <div className="mt-4 flex items-center gap-2 px-1">
            <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-indigo-600 transition">
              {selectedIds.size > 0 && selectedIds.size === displayedRequests.length ? (
                <CheckSquare size={16} className="text-indigo-600" />
              ) : (
                <Square size={16} className="text-gray-400" />
              )}
              {selectedIds.size > 0 ? `Đã chọn ${selectedIds.size} đơn` : 'Chọn tất cả'}
            </button>
          </div>
        )}
      </div>

      {/* Content List */}
      <div className="p-4 space-y-3 bg-gray-50/50 flex-1 overflow-y-auto no-scrollbar pb-24">
        {displayedRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Filter size={24} className="opacity-30" />
            </div>
            <p className="text-sm font-medium">Không có dữ liệu</p>
          </div>
        ) : (
          displayedRequests.map(req => (
            <div
              key={req.id}
              className={`
                    bg-white border rounded-2xl p-4 shadow-sm animate-fade-in relative overflow-hidden group transition-all
                    ${selectedIds.has(req.id) ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/10' : 'border-gray-100'}
                `}
              onClick={() => {
                if (filter === 'PENDING') toggleSelection(req.id);
              }}
            >
              {/* Selection Checkbox for Pending */}
              {filter === 'PENDING' && (
                <div className="absolute top-4 right-4 z-30">
                  {selectedIds.has(req.id) ? (
                    <CheckSquare size={20} className="text-indigo-600 fill-indigo-50" />
                  ) : (
                    <Square size={20} className="text-gray-200 group-hover:text-gray-300" />
                  )}
                </div>
              )}

              {/* Left Color Bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${req.type === 'OT' ? 'bg-indigo-500' :
                req.type === 'LATE' ? 'bg-red-500' :
                  req.type === 'LEAVE' ? 'bg-green-500' :
                    req.type === 'SWAP' ? 'bg-violet-500' :
                      req.type === 'PROFILE' ? 'bg-pink-500' : 'bg-teal-500'
                }`}></div>

              {/* User Info Header */}
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-50 relative z-10 pr-8">
                <img
                  src={req.userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.userName)}`}
                  alt={req.userName}
                  className="w-9 h-9 rounded-full border border-gray-100 object-cover"
                />
                <div>
                  <h4 className="text-sm font-bold text-gray-900 leading-tight">{req.userName}</h4>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mt-0.5">{req.userRole}</div>
                </div>
              </div>

              <div className="flex justify-between items-start mb-3 relative z-10">
                <div className="flex items-center gap-2 flex-wrap">
                  {req.type === 'OT' ? (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide ${req.shift === 'MORNING' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                      OT {req.shift === 'MORNING' ? 'Sáng' : 'Chiều'}
                    </span>
                  ) : req.type === 'LATE' ? (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide bg-red-50 text-red-600 flex items-center gap-1">
                      <AlertTriangle size={10} /> Trễ ({req.minutesLate}p)
                    </span>
                  ) : req.type === 'LEAVE' ? (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide flex items-center gap-1 ${getLeaveBadgeClass(req.leaveType)}`}>
                      <Calendar size={10} /> {LEAVE_TYPE_LABEL[req.leaveType]}
                    </span>
                  ) : req.type === 'SWAP' ? (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide bg-violet-50 text-violet-600 border border-violet-200 flex items-center gap-1">
                      <Repeat size={10} /> Đổi ngày nghỉ
                    </span>
                  ) : req.type === 'PROFILE' ? (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide bg-pink-50 text-pink-600 border border-pink-200 flex items-center gap-1">
                      <UserCog size={10} /> Đổi thông tin
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide bg-teal-50 text-teal-600 flex items-center gap-1">
                      <DollarSign size={10} /> Ứng lương
                    </span>
                  )}

                  <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                    <Clock size={10} />
                    {format(req.date, 'dd/MM/yyyy')}
                  </span>
                </div>

                {/* Status Badge for Processed */}
                {req.status === 'APPROVED' && (
                  <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                    <CheckCircle2 size={12} /> Đã duyệt
                  </span>
                )}
                {req.status === 'REJECTED' && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                      <XIcon size={12} /> Từ chối
                    </span>
                    {(req as any).rejectionReason && (
                      <span className="text-[10px] text-red-400 italic max-w-[150px] text-right">"{(req as any).rejectionReason}"</span>
                    )}
                  </div>
                )}
              </div>

              {/* Special Content */}
              {req.type === 'ADVANCE' && (
                <div className="mb-3 relative z-10">
                  <div className="text-xl font-bold text-teal-600">{formatCurrency(req.amount)}</div>
                </div>
              )}

              {req.type === 'OT' && req.otStart && req.otEnd && (() => {
                // Chỉ đơn khai theo khung giờ mới có khối này. Đơn kiểu cũ không
                // có giờ nên không hiện gì, giữ nguyên giao diện hiện tại.
                const split = splitOTRange(req.otStart, req.otEnd);
                const mins = split.dayMinutes + split.nightMinutes;
                const vatNuaDem = req.otEnd <= req.otStart;
                return (
                  <div className="mb-3 relative z-10 text-xs text-gray-600 bg-indigo-50/60 border border-indigo-100 p-2.5 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Khung giờ:</span>
                      <span className="font-bold font-mono text-indigo-700">{req.otStart} – {req.otEnd}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Nơi làm:</span>
                      <span className="font-bold">{OT_LOCATION_LABEL[req.otLocation || 'OFFICE']}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Tổng:</span>
                      <span className="font-bold">{mins} phút</span>
                    </div>
                    {split.nightMinutes > 0 && (
                      <div className="flex items-center gap-1 text-indigo-700 font-semibold pt-1 border-t border-indigo-100">
                        <Moon size={11} /> {split.nightMinutes} phút trong khung đêm 22:00–06:00, hưởng ×2
                      </div>
                    )}
                    {vatNuaDem && (
                      <div className="flex items-center gap-1 text-amber-700 font-semibold">
                        <AlertTriangle size={11} /> Khung vắt qua nửa đêm, kết thúc vào ngày hôm sau
                      </div>
                    )}
                  </div>
                );
              })()}

              {req.type === 'LEAVE' && (
                <div className="mb-3 relative z-10 text-xs text-gray-600 grid grid-cols-2 gap-2 bg-gray-50/50 p-2 rounded-lg">
                  <div>Từ: <span className="font-bold">{format(new Date(req.startDate), 'dd/MM/yyyy')}</span></div>
                  <div>Đến: <span className="font-bold">{format(new Date(req.endDate), 'dd/MM/yyyy')}</span></div>
                  <div className="col-span-2">Thời gian: <span className="font-bold">{req.duration === 'FULL' ? 'Cả ngày' : req.duration === 'MORNING' ? 'Buổi sáng' : 'Buổi chiều'}</span></div>
                </div>
              )}

              {req.type === 'SWAP' && (
                <div className="mb-3 relative z-10 text-xs text-gray-600 bg-violet-50/60 border border-violet-100 p-2.5 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span>Nghỉ bù:</span>
                    <span className="font-bold">Thứ 7 {format(req.restDate, 'dd/MM/yyyy')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Làm bù:</span>
                    <span className="font-bold text-violet-700">Chủ Nhật {format(req.workDate, 'dd/MM/yyyy')}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 pt-1 border-t border-violet-100">
                    Sau khi duyệt: T7 tính như ngày nghỉ tuần (chấm công thì ×2), CN tính công như ngày thường.
                  </div>
                  {req.status === 'APPROVED' && isSwapVoidedByHoliday(req, holidays) && (
                    <div className="flex items-center gap-1 text-amber-700 font-semibold">
                      <AlertTriangle size={11} /> Vô hiệu — trùng ngày lễ thêm sau khi duyệt. Hai ngày tính như không có đơn.
                    </div>
                  )}
                </div>
              )}

              {req.type === 'PROFILE' && (() => {
                const newPhone = req.changes.phone?.new;
                const dupPhone = newPhone
                  ? employees.find(e => e.id !== req.userId && !!e.phone && e.phone === newPhone)
                  : undefined;
                const lines = describeProfileChanges(req.changes);
                return (
                  <div className="mb-3 relative z-10 text-xs text-gray-700 bg-pink-50/60 border border-pink-100 p-2.5 rounded-lg space-y-1">
                    {lines.length === 0 && <div className="text-gray-400 italic">(không có nội dung)</div>}
                    {lines.map(l => (
                      <div key={l} className="flex items-start gap-1"><span className="text-pink-500">•</span><span>{l}</span></div>
                    ))}
                    {req.changes.avatar?.new && (
                      <div className="flex items-center gap-2 pt-1">
                        <img src={req.changes.avatar.old || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.userName)}`} className="w-10 h-10 rounded-full object-cover border bg-white" alt="" />
                        <span className="text-gray-400">→</span>
                        <img src={req.changes.avatar.new} className="w-10 h-10 rounded-full object-cover border-2 border-pink-300 bg-white" alt="" />
                      </div>
                    )}
                    {req.changes.dateOfBirth && req.status === 'PENDING' && (
                      <div className="flex items-center gap-1 text-amber-700 font-semibold pt-1 border-t border-pink-100">
                        <AlertTriangle size={11} /> Đổi ngày sinh ảnh hưởng thưởng sinh nhật. Khi duyệt sẽ hiện số tiền cụ thể.
                      </div>
                    )}
                    {dupPhone && (
                      <div className="flex items-center gap-1 text-red-700 font-semibold pt-1 border-t border-pink-100">
                        <AlertTriangle size={11} /> Số {newPhone} đang thuộc về {dupPhone.name}. Duyệt sẽ bị cơ sở dữ liệu từ chối.
                      </div>
                    )}
                    <div className="text-[10px] text-gray-500 pt-1 border-t border-pink-100">
                      Duyệt = ghi thẳng vào hồ sơ nhân viên. Từ chối = không đổi gì.
                    </div>
                  </div>
                );
              })()}

              {/* Đơn đổi ngày nghỉ không có ô lý do (công ty xếp lịch) nên khối
                  chi tiết bên trên đã nói đủ, không hiện dòng trích dẫn nữa.
                  Đơn đổi thông tin chỉ hiện khi nhân viên có ghi chú thật. */}
              {req.type !== 'SWAP' && !(req.type === 'PROFILE' && req.reason === PROFILE_DEFAULT_REASON) && (
                <div className="mb-4 relative z-10">
                  <p className="text-sm text-gray-800 font-medium leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100 italic">
                    "{req.reason}"
                  </p>
                </div>
              )}

              {/* Timestamps */}
              <div className="mb-3 text-[10px] text-gray-400 flex flex-col gap-1 relative z-10 px-1 opacity-80">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Tạo lúc:</span>
                  <span className="font-mono">{req.createdAt ? format(req.createdAt, 'dd/MM/yyyy HH:mm') : 'N/A'}</span>
                </div>
                {req.processedAt && req.status !== 'PENDING' && (
                  <div className="flex items-center justify-between text-indigo-400">
                    <span className="font-medium">Duyệt lúc:</span>
                    <span className="font-mono font-bold">{format(req.processedAt, 'dd/MM/yyyy HH:mm')}</span>
                  </div>
                )}
              </div>

              {/* Individual Actions (Only if NOT selecting) */}
              {req.status === 'PENDING' && selectedIds.size === 0 && (
                <div className="flex gap-3 relative z-10">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(req, 'APPROVED'); }}
                    className="flex-1 bg-white border border-green-200 text-green-600 hover:bg-green-50 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    <Check size={16} /> Duyệt
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRejectClick(req); }}
                    className="flex-1 bg-white border border-red-100 text-red-500 hover:bg-red-50 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    <XCircle size={16} /> Từ chối
                  </button>
                </div>
              )}

              {/* Actions (Processed - Revert) */}
              {req.status !== 'PENDING' && (
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 mt-2 relative z-20">
                  {onDeleteRequest && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onDeleteRequest(req.id, req.type); }}
                      className="text-xs font-bold text-red-600 hover:text-white bg-red-50 hover:bg-red-600 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm border border-red-200"
                      title="Xoá hẳn đơn khỏi cơ sở dữ liệu — dùng cho đơn nhập trùng"
                    >
                      <Trash2 size={14} /> Xoá đơn
                    </button>
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (req.type === 'OT') onUpdateOtStatus(req.id, 'PENDING');
                      else if (req.type === 'LATE') onUpdateLateStatus(req.id, 'PENDING');
                      else if (req.type === 'ADVANCE' && onUpdateAdvanceStatus) onUpdateAdvanceStatus(req.id, 'PENDING');
                      else if (req.type === 'LEAVE' && onUpdateLeaveStatus) onUpdateLeaveStatus(req.id, 'PENDING');
                      else if (req.type === 'SWAP' && onUpdateSwapStatus) onUpdateSwapStatus(req.id, 'PENDING');
                      else if (req.type === 'PROFILE' && onUpdateProfileStatus) onUpdateProfileStatus(req.id, 'PENDING');
                    }}
                    className="text-xs font-bold text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm border border-gray-200"
                    title={req.type === 'PROFILE' && req.status === 'APPROVED' ? 'Trả hồ sơ về giá trị cũ rồi mở lại đơn' : undefined}
                  >
                    <RotateCcw size={14} /> {req.type === 'PROFILE' && req.status === 'APPROVED' ? 'Hoàn tác & mở lại đơn' : 'Hoàn duyệt'}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Floating Action Bar for Batch Operation */}
      {selectedIds.size > 0 && (
        <div className="absolute bottom-5 left-4 right-4 bg-gray-900/90 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between z-50 animate-bounce-in">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
              {selectedIds.size}
            </div>
            <div className="text-sm font-medium">Đã chọn</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleBatchAction('REJECTED')}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all text-red-300 hover:text-red-200"
            >
              Từ chối
            </button>
            <button
              onClick={() => handleBatchAction('APPROVED')}
              className="px-6 py-2 bg-indigo-500 hover:bg-indigo-400 rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/30 transition-all transform active:scale-95 flex items-center gap-2"
            >
              <Check size={16} />
              Duyệt tất cả
            </button>
          </div>
        </div>
      )}
      {/* Reject Reason Modal */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRejectingRequest(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-80 mx-4 animate-bounce-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{`T\u1EEB ch\u1ED1i \u0111\u01A1n`}</h3>
                <p className="text-[10px] text-gray-400">{rejectingRequest.userName}</p>
              </div>
            </div>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder={`L\u00FD do t\u1EEB ch\u1ED1i (kh\u00F4ng b\u1EAFt bu\u1ED9c)...`}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-20 focus:ring-2 focus:ring-red-300 outline-none mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRejectingRequest(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                {`H\u1EE7y`}
              </button>
              <button
                onClick={handleConfirmReject}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-colors flex items-center justify-center gap-1"
              >
                <XCircle size={14} /> {`X\u00E1c nh\u1EADn t\u1EEB ch\u1ED1i`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

