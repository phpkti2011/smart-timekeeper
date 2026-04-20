
import React, { useState } from 'react';
import { format, isSameMonth, startOfMonth, subMonths, addMonths } from 'date-fns';
import { OTRequest, LateRequest, SalaryAdvanceRequest, RequestStatus, LeaveRequest } from '../types';
import { FileCheck, Check, XCircle, Clock, Filter, CheckCircle2, XCircle as XIcon, AlertTriangle, RotateCcw, DollarSign, Calendar, ChevronLeft, ChevronRight, CheckSquare, Square, Layers } from 'lucide-react';

interface Props {
  otRequests: OTRequest[];
  lateRequests: LateRequest[];
  advanceRequests?: SalaryAdvanceRequest[];
  leaveRequests?: LeaveRequest[];
  onUpdateOtStatus: (id: string, status: RequestStatus) => void;
  onUpdateLateStatus: (id: string, status: RequestStatus) => void;
  onUpdateAdvanceStatus?: (id: string, status: RequestStatus) => void;
  onUpdateLeaveStatus?: (id: string, status: RequestStatus) => void;
}

type CombinedRequest =
  | ({ type: 'OT' } & OTRequest)
  | ({ type: 'LATE' } & LateRequest)
  | ({ type: 'ADVANCE' } & SalaryAdvanceRequest)
  | ({ type: 'LEAVE'; date: Date } & LeaveRequest);

type RequestTypeFilter = 'ALL' | 'LEAVE' | 'OT' | 'LATE' | 'ADVANCE';

export const RequestApproval: React.FC<Props> = ({
  otRequests,
  lateRequests,
  advanceRequests = [],
  leaveRequests = [],
  onUpdateOtStatus,
  onUpdateLateStatus,
  onUpdateAdvanceStatus,
  onUpdateLeaveStatus
}) => {
  const [filter, setFilter] = useState<'PENDING' | 'PROCESSED'>('PENDING');
  const [activeTypeTab, setActiveTypeTab] = useState<RequestTypeFilter>('ALL');
  const [historyMonth, setHistoryMonth] = useState(new Date());

  // Batch Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Merge and Sort
  const combinedList: CombinedRequest[] = [
    ...otRequests.map(r => ({ ...r, type: 'OT' as const })),
    ...lateRequests.map(r => ({ ...r, type: 'LATE' as const })),
    ...advanceRequests.map(r => ({ ...r, type: 'ADVANCE' as const })),
    ...leaveRequests.map(r => ({ ...r, type: 'LEAVE' as const, date: r.startDate }))
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
  const handleUpdateStatus = (req: CombinedRequest, status: RequestStatus) => {
    if (req.type === 'OT') onUpdateOtStatus(req.id, status);
    else if (req.type === 'LATE') onUpdateLateStatus(req.id, status);
    else if (req.type === 'ADVANCE' && onUpdateAdvanceStatus) onUpdateAdvanceStatus(req.id, status);
    else if (req.type === 'LEAVE' && onUpdateLeaveStatus) onUpdateLeaveStatus(req.id, status);
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
                  req.type === 'LEAVE' ? 'bg-green-500' : 'bg-teal-500'
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
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide flex items-center gap-1 ${req.leaveType === 'PAID' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                      <Calendar size={10} /> {req.leaveType === 'PAID' ? 'Phép năm' : 'Không lương'}
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
                  <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                    <XIcon size={12} /> Từ chối
                  </span>
                )}
              </div>

              {/* Special Content */}
              {req.type === 'ADVANCE' && (
                <div className="mb-3 relative z-10">
                  <div className="text-xl font-bold text-teal-600">{formatCurrency(req.amount)}</div>
                </div>
              )}

              {req.type === 'LEAVE' && (
                <div className="mb-3 relative z-10 text-xs text-gray-600 grid grid-cols-2 gap-2 bg-gray-50/50 p-2 rounded-lg">
                  <div>Từ: <span className="font-bold">{format(new Date(req.startDate), 'dd/MM/yyyy')}</span></div>
                  <div>Đến: <span className="font-bold">{format(new Date(req.endDate), 'dd/MM/yyyy')}</span></div>
                  <div className="col-span-2">Thời gian: <span className="font-bold">{req.duration === 'FULL' ? 'Cả ngày' : req.duration === 'MORNING' ? 'Buổi sáng' : 'Buổi chiều'}</span></div>
                </div>
              )}

              <div className="mb-4 relative z-10">
                <p className="text-sm text-gray-800 font-medium leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100 italic">
                  "{req.reason}"
                </p>
              </div>

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
                    onClick={(e) => { e.stopPropagation(); handleUpdateStatus(req, 'REJECTED'); }}
                    className="flex-1 bg-white border border-red-100 text-red-500 hover:bg-red-50 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    <XCircle size={16} /> Từ chối
                  </button>
                </div>
              )}

              {/* Actions (Processed - Revert) */}
              {req.status !== 'PENDING' && (
                <div className="flex justify-end pt-2 border-t border-gray-100 mt-2 relative z-20">
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (req.type === 'OT') onUpdateOtStatus(req.id, 'PENDING');
                      else if (req.type === 'LATE') onUpdateLateStatus(req.id, 'PENDING');
                      else if (req.type === 'ADVANCE' && onUpdateAdvanceStatus) onUpdateAdvanceStatus(req.id, 'PENDING');
                      else if (req.type === 'LEAVE' && onUpdateLeaveStatus) onUpdateLeaveStatus(req.id, 'PENDING');
                    }}
                    className="text-xs font-bold text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm border border-gray-200"
                  >
                    <RotateCcw size={14} /> Hoàn duyệt
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
    </div>
  );
};

