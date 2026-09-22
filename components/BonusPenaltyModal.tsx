import React, { useState, useEffect, useRef } from 'react';
import { X, Send, PlusCircle, MinusCircle, Upload, User, Calendar, Loader2, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { BonusFine, UserProfile } from '../types';
import { isWorkingEmployee } from '../utils/employeeFilters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<BonusFine, 'id'>) => void;
  onImportExcel: () => void;
  employees?: UserProfile[]; // Optional list for selection
  defaultUserId?: string; // Pre-selected user
  initialData?: BonusFine | null; // Data for editing
  lateWarnings?: Record<string, { level: 3 | 6; message: string }>; // Consecutive late warnings per userId
}

export const BonusPenaltyModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSubmit,
  onImportExcel,
  employees,
  defaultUserId,
  initialData,
  lateWarnings
}) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [type, setType] = useState<'BONUS' | 'PENALTY'>('BONUS');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedUserId, setSelectedUserId] = useState(defaultUserId || '');

  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update selected user if default changes
  useEffect(() => {
    if (defaultUserId) setSelectedUserId(defaultUserId);
  }, [defaultUserId]);

  // Populate data if editing
  useEffect(() => {
    if (initialData) {
      setAmount(initialData.amount.toLocaleString('vi-VN'));
      setReason(initialData.reason);
      setType(initialData.type);
      setDate(new Date(initialData.date).toISOString().split('T')[0]);
      if (initialData.userId) setSelectedUserId(initialData.userId);
    } else {
      // Reset fields if switching to "Add New" mode, or keep defaults
      // We might want to clear them only if explicitly opening as new.
      // Usually the parent handles opening/closing which remounts or we can trust local state reset on close?
      // Let's explicitly reset if isOpen becomes true and no initialData?
      // Actually, the component might stay mounted.
    }
  }, [initialData, isOpen]);

  // Reset Form when opening "Fresh" (No initialData)
  useEffect(() => {
    if (isOpen && !initialData) {
      setAmount('');
      setReason('');
      setType('BONUS');
      setDate(new Date().toISOString().split('T')[0]);
      if (defaultUserId) setSelectedUserId(defaultUserId);
    }
  }, [isOpen, initialData, defaultUserId]);


  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount.replace(/[^0-9]/g, ''));

    if (numAmount <= 0) {
      alert("Vui lòng nhập số tiền hợp lệ");
      return;
    }

    if (!reason.trim()) {
      alert("Vui lòng nhập lý do");
      return;
    }

    if (!selectedUserId) {
      alert("Vui lòng chọn nhân viên");
      return;
    }

    onSubmit({
      amount: numAmount,
      reason,
      type,
      date: new Date(date),
      userId: selectedUserId
    });

    // Reset
    setAmount('');
    setReason('');
    setType('BONUS');
    onClose();
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value) {
      setAmount(Number(value).toLocaleString('vi-VN'));
    } else {
      setAmount('');
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsImporting(true);

      // Simulate reading and parsing file delay
      setTimeout(() => {
        onImportExcel();
        setIsImporting(false);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        {/* Header */}
        <div className="bg-white p-5 border-b border-gray-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <PlusCircle size={20} />
            </div>
            <h2 className="font-bold text-xl text-gray-800">{initialData ? "Cập nhật khoản Thưởng/Phạt" : "Thêm Thưởng / Phạt"}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all active:scale-95"
            aria-label="Đóng"
          >
            <X size={28} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto no-scrollbar">

          {/* Excel Import Option */}
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs text-blue-800 font-medium flex items-center gap-1">
              <FileSpreadsheet size={14} /> Tải lên danh sách từ Excel
            </p>

            <button
              type="button"
              onClick={handleFileClick}
              disabled={isImporting}
              className="bg-white border border-blue-200 text-blue-600 px-4 py-2 rounded-lg text-xs font-bold shadow-sm flex items-center gap-2 hover:bg-blue-50 transition-colors disabled:opacity-70 disabled:cursor-wait"
            >
              {isImporting ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
              {isImporting ? "Đang xử lý..." : "Chọn file Excel"}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
            />

            {/* Column Format Guide */}
            <div className="mt-2 w-full text-left bg-white/60 p-2.5 rounded-lg border border-blue-100 shadow-sm">
              <p className="text-[10px] text-blue-800 font-bold mb-1.5 border-b border-blue-100 pb-1">Cấu trúc cột bắt buộc (A-E):</p>
              <div className="text-[10px] text-slate-600 space-y-1 font-mono leading-tight">
                <div className="flex gap-2">
                  <span className="font-bold text-slate-800 w-8">Col A:</span>
                  <span>Mã NV (VD: NV001)</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-slate-800 w-8">Col B:</span>
                  <span>Số tiền (VD: 500000)</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-slate-800 w-8">Col C:</span>
                  <span>Loại (BONUS / PENALTY)</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-slate-800 w-8">Col D:</span>
                  <span>Lý do (VD: Thưởng KPI)</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-slate-800 w-8">Col E:</span>
                  <span>Ngày (dd/MM/yyyy)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink-0 mx-4 text-gray-400 text-xs">hoặc nhập thủ công</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Employee Selection (Only if employees prop is provided) */}
            {employees && employees.length > 0 && (
              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                  <User size={14} /> Nhân viên <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none text-sm"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {employees.filter(isWorkingEmployee).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Late Warning Banner */}
            {lateWarnings && selectedUserId && type === 'BONUS' && lateWarnings[selectedUserId] && (
              <div className={`p-3 rounded-xl border flex items-start gap-2.5 animate-fade-in ${lateWarnings[selectedUserId].level >= 6
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <div className="text-xs font-medium leading-relaxed">
                  <span className="font-bold">⚠️ CẢNH BÁO:</span> {lateWarnings[selectedUserId].message}
                </div>
              </div>
            )}

            {/* Resignation Warning Banner */}
            {(() => {
              const selectedEmp = employees?.find(e => e.id === selectedUserId);
              return selectedEmp?.resignationDate && type === 'BONUS' ? (
                <div className="p-3 rounded-xl border flex items-start gap-2.5 animate-fade-in bg-gray-100 border-gray-300 text-gray-700">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                  <div className="text-xs font-medium leading-relaxed">
                    <span className="font-bold">🚫 NGHỈ VIỆC:</span> Nhân viên này đã nghỉ việc từ ngày <span className="font-bold">{new Date(selectedEmp.resignationDate).toLocaleDateString('vi-VN')}</span>. Không nên nhận thưởng sau ngày này.
                  </div>
                </div>
              ) : null;
            })()}

            {/* Type Selection */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('BONUS')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${type === 'BONUS'
                  ? 'border-green-500 bg-green-50 text-green-700 font-bold'
                  : 'border-gray-100 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
              >
                <PlusCircle size={18} /> Thưởng
              </button>
              <button
                type="button"
                onClick={() => setType('PENALTY')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${type === 'PENALTY'
                  ? 'border-red-500 bg-red-50 text-red-700 font-bold'
                  : 'border-gray-100 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
              >
                <MinusCircle size={18} /> Phạt
              </button>
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Số tiền (VNĐ) <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none text-lg font-bold"
                placeholder="0"
              />
            </div>

            {/* Reason */}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Lý do / Nội dung <span className="text-red-500">*</span></label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none text-sm min-h-[80px] resize-none"
                placeholder={type === 'BONUS' ? "Thưởng dự án, thưởng KPI..." : "Vi phạm quy chế, làm hỏng đồ..."}
              />
            </div>

            {/* Date */}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                <Calendar size={14} /> Ngày ghi nhận / Tháng
              </label>
              <input
                type={date ? "date" : "text"}
                lang="en-GB"
                value={date}
                placeholder="dd/mm/yyyy"
                onFocus={(e) => e.target.type = 'date'}
                onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none text-sm placeholder-gray-400"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-slate-800 text-white rounded-xl font-bold shadow-lg hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Send size={18} />
              Lưu thông tin
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};