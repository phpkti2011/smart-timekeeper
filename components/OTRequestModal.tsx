import React, { useState } from 'react';
import { X, Clock, FileText, Send } from 'lucide-react';
import { AttendanceType } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  type: AttendanceType | null;
}

export const OTRequestModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, type }) => {
  const [reason, setReason] = useState('');

  if (!isOpen || !type) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert("Vui lòng nhập lý do tăng ca");
      return;
    }
    onSubmit(reason);
    setReason('');
  };

  const title = type === AttendanceType.OT_MORNING ? 'Đăng ký Tăng Ca Sáng' : 'Đăng ký Tăng Ca Chiều';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden transform transition-all">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <Clock size={20} />
            <h2 className="font-bold text-lg">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-lg flex items-start gap-2">
            <div className="mt-0.5 text-yellow-600">
              <FileText size={16} />
            </div>
            <p className="text-xs text-yellow-800 leading-relaxed">
              Theo quy định, bạn cần gửi đơn đăng ký cho OT đầu ca. Giờ chấm công sẽ chỉ được tính sau khi đơn được duyệt.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Lý do tăng ca <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm min-h-[100px] resize-none"
              placeholder="Ví dụ: Fix bug gấp dự án A, Hỗ trợ khách hàng..."
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Send size={18} />
            Gửi yêu cầu & Chấm công
          </button>
        </form>
      </div>
    </div>
  );
};