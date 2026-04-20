import React from 'react';
import { X, CheckCircle, AlertTriangle } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    month: string;
}

export const SalaryConfirmationModal: React.FC<Props> = ({ isOpen, onClose, onConfirm, month }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in px-4">
            <div className="bg-white w-full max-w-sm sm:max-w-md rounded-2xl shadow-2xl overflow-hidden transform transition-all flex flex-col relative animate-scale-up">
                <button onClick={onClose} className="absolute top-3 right-3 p-1 hover:bg-gray-100 rounded-full transition text-gray-500 z-10">
                    <X size={20} />
                </button>

                <div className="p-6 flex flex-col items-center text-center pt-8">
                    <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4 ring-4 ring-red-50/50">
                        <AlertTriangle size={32} />
                    </div>

                    <h2 className="text-xl font-bold text-gray-800 mb-2">Xác nhận chốt lương?</h2>

                    <div className="space-y-2 mb-4">
                        <p className="text-sm text-gray-500">
                            Bạn đang thực hiện xác nhận số liệu lương tháng <span className="font-bold text-gray-900">{month}</span>.
                        </p>
                        <p className="text-xs text-red-600 bg-red-50 px-3 py-2.5 rounded-xl border border-red-100 text-left leading-relaxed">
                            <span className="font-bold">Lưu ý:</span> Sau khi xác nhận, công ty sẽ ghi nhận trạng thái này. Bạn vẫn có thể báo cáo sai sót sau đó nếu cần.
                        </p>
                    </div>
                </div>

                <div className="p-4 bg-gray-50/50 flex items-center gap-3 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition bg-white border border-gray-200 shadow-sm active:scale-95"
                    >
                        Xem lại
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 shadow-lg shadow-red-200 transition flex items-center justify-center gap-2 active:scale-95"
                    >
                        <CheckCircle size={18} /> Xác nhận
                    </button>
                </div>
            </div>
        </div>
    );
};
