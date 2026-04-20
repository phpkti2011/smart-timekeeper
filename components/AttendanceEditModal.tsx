
import React, { useState, useEffect } from 'react';
import { X, Save, Clock, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { OverrideLog } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<OverrideLog, 'id'>) => void;
  date: Date;
  userName: string;
  userId: string;
  existingOverride?: OverrideLog; // For pre-filling
  initialTimes?: { in1: string; out1: string; in2: string; out2: string; }; // From raw logs
  initialWorkDays?: number;
}

export const AttendanceEditModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  date,
  userName,
  userId,
  existingOverride,
  initialTimes,
  initialWorkDays
}) => {
  // Initialize state lazily to ensure it only happens once on mount
  // and ignores any subsequent prop updates (Realtime, etc.)
  const [in1, setIn1] = useState(() => existingOverride?.in1 ?? (initialTimes?.in1 !== '--:--' ? initialTimes?.in1 || '' : ''));
  const [out1, setOut1] = useState(() => existingOverride?.out1 ?? (initialTimes?.out1 !== '--:--' ? initialTimes?.out1 || '' : ''));
  const [in2, setIn2] = useState(() => existingOverride?.in2 ?? (initialTimes?.in2 !== '--:--' ? initialTimes?.in2 || '' : ''));
  const [out2, setOut2] = useState(() => existingOverride?.out2 ?? (initialTimes?.out2 !== '--:--' ? initialTimes?.out2 || '' : ''));
  const [workDays, setWorkDays] = useState(() => existingOverride?.workDays ?? initialWorkDays ?? 0);
  const [note, setNote] = useState(() => existingOverride?.note ?? '');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      userId,
      date,
      in1,
      out1,
      in2,
      out2,
      workDays,
      note
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-amber-500 p-4 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={20} />
            <h2 className="font-bold text-lg">Chỉnh sửa Bảng công</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto no-scrollbar">
          <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-sm text-amber-800">
            <p><span className="font-bold">Nhân viên:</span> {userName}</p>
            <p><span className="font-bold">Ngày:</span> {format(date, 'dd/MM/yyyy')}</p>
            <p className="mt-1 text-xs italic opacity-80">Dữ liệu bạn nhập ở đây sẽ ghi đè dữ liệu chấm công thực tế.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Vào Sáng</label>
              <input
                type="time"
                value={in1}
                onChange={(e) => setIn1(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Ra Sáng</label>
              <input
                type="time"
                value={out1}
                onChange={(e) => setOut1(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Vào Chiều</label>
              <input
                type="time"
                value={in2}
                onChange={(e) => setIn2(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Ra Chiều</label>
              <input
                type="time"
                value={out2}
                onChange={(e) => setOut2(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Tổng Công Ngày (0 - 1.0)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={workDays}
              onChange={(e) => setWorkDays(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-lg font-bold text-gray-800"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Ghi chú điều chỉnh</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm min-h-[80px]"
              placeholder="Ví dụ: Quên chấm công, Máy lỗi..."
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-bold shadow-lg hover:bg-amber-700 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Save size={18} />
            Lưu thay đổi
          </button>
        </form>
      </div>
    </div>
  );
};
