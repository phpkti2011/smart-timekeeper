
import React, { useState } from 'react';
import { X, AlertTriangle, Send } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  date: Date | null;
  lateMinutes: number;
}

export const LateExplanationModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, date, lateMinutes }) => {
  const [reason, setReason] = useState('');

  if (!isOpen || !date) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert("Vui lòng nhập lý do");
      return;
    }
    onSubmit(reason);
    setReason('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden transform transition-all">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-rose-600 p-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} />
            <h2 className="font-bold text-lg">Giải trình đi trễ</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-red-50 border border-red-100 p-3 rounded-lg">
             <p className="text-sm text-gray-800 font-medium">
                Ngày: {format(date, 'dd/MM/yyyy')}
             </p>
             <p className="text-sm text-red-600 font-bold mt-1">
                Thời gian trễ: {lateMinutes} phút
             </p>
             <p className="text-xs text-gray-500 mt-2">
                Vui lòng nhập lý do để Admin xem xét duyệt đơn. Nếu được duyệt, ngày công này sẽ không bị tính là vi phạm.
             </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-900">Lý do đi trễ <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none text-sm min-h-[100px] resize-none"
              placeholder="Ví dụ: Kẹt xe tai nạn, Hỏng xe, Đưa con đi khám..."
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gray-900 text-white rounded-xl font-bold shadow-lg hover:bg-gray-800 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Send size={18} />
            Gửi giải trình
          </button>
        </form>
      </div>
    </div>
  );
};
