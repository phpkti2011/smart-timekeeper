
import React, { useState } from 'react';
import { X, DollarSign, Send, Info } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (amount: number, reason: string) => void;
  maxAllowed: number; // New Prop
}

export const SalaryAdvanceModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, maxAllowed }) => {
  const [amount, setAmount] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount.replace(/[^0-9]/g, ''));

    if (numAmount <= 0) {
      alert("Vui lòng nhập số tiền hợp lệ");
      return;
    }

    if (numAmount > maxAllowed) {
      alert(`Số tiền vượt quá hạn mức cho phép (${maxAllowed.toLocaleString('vi-VN')} đ)`);
      return;
    }

    // Pass default reason since input is removed
    onSubmit(numAmount, "Ứng lương");
    setAmount('');
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Basic formatting for VND
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value) {
      setAmount(Number(value).toLocaleString('vi-VN'));
    } else {
      setAmount('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden transform transition-all">

        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <DollarSign size={20} />
            <h2 className="font-bold text-lg">Đề xuất Ứng lương</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* LIMIT WARNING/INFO */}
          {/* Default to 0 if maxAllowed is undefined/NaN to prevent crashes */}
          {(() => {
            const safeMax = (typeof maxAllowed === 'number' && !isNaN(maxAllowed)) ? maxAllowed : 0;
            return (
              <div className={`p-4 rounded-xl border flex flex-col gap-1 ${safeMax <= 0 ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-wider ${safeMax <= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                    Hạn mức khả dụng
                  </span>
                  <span className={`text-sm font-bold ${safeMax <= 0 ? 'text-red-600' : 'text-blue-700'}`}>
                    {safeMax.toLocaleString('vi-VN')} đ
                  </span>
                </div>
                {safeMax <= 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    Bạn không thể ứng lương do thực lãnh hiện tại không đủ.
                  </p>
                )}
              </div>
            );
          })()}

          <div className="bg-teal-50 border border-teal-100 p-3 rounded-lg flex items-start gap-2">
            <div className="mt-0.5 text-teal-600">
              <Info size={16} />
            </div>
            <p className="text-xs text-teal-800 leading-relaxed">
              Đơn ứng lương cần được Admin duyệt. Số tiền ứng sẽ được khấu trừ tự động vào bảng lương tháng này sau khi đơn được duyệt.
            </p>
          </div>

          <div className="space-y-2 pb-2">
            <label className="text-sm font-semibold text-gray-700">Số tiền muốn ứng (VNĐ) <span className="text-red-500">*</span></label>
            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                className="w-full pl-4 pr-12 py-3 bg-white text-gray-900 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none text-lg font-bold tracking-wide"
                placeholder="0"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">đ</span>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-teal-600 text-white rounded-xl font-bold shadow-lg shadow-teal-200 hover:bg-teal-700 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Send size={18} />
            Gửi đề xuất
          </button>
        </form>
      </div>
    </div>
  );
};
