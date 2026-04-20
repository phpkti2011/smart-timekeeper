import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog: React.FC<Props> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Xác nhận',
    cancelText = 'Hủy bỏ',
    type = 'danger'
}) => {
    if (!isOpen) return null;

    const colors = {
        danger: {
            bg: 'bg-red-50',
            icon: 'text-red-600',
            btn: 'bg-red-600 hover:bg-red-700 shadow-red-200',
            border: 'border-red-100'
        },
        warning: {
            bg: 'bg-amber-50',
            icon: 'text-amber-600',
            btn: 'bg-amber-500 hover:bg-amber-600 shadow-amber-200',
            border: 'border-amber-100'
        },
        info: {
            bg: 'bg-blue-50',
            icon: 'text-blue-600',
            btn: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200',
            border: 'border-blue-100'
        }
    };

    const theme = colors[type];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in px-4">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden transform transition-all flex flex-col relative animate-scale-up">
                <button onClick={onClose} className="absolute top-3 right-3 p-1 hover:bg-gray-100 rounded-full transition text-gray-500 z-10">
                    <X size={20} />
                </button>

                <div className="p-6 flex flex-col items-center text-center pt-8">
                    <div className={`w-14 h-14 ${theme.bg} ${theme.icon} rounded-full flex items-center justify-center mb-4 ring-4 ring-opacity-50 ring-current`}>
                        <AlertTriangle size={28} />
                    </div>

                    <h2 className="text-xl font-bold text-gray-800 mb-2">{title}</h2>

                    <p className="text-sm text-gray-500 mb-4 px-2">
                        {message}
                    </p>
                </div>

                <div className="p-4 bg-gray-50/50 flex items-center gap-3 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition bg-white border border-gray-200 shadow-sm active:scale-95"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 py-2.5 rounded-xl font-bold text-white shadow-lg transition active:scale-95 ${theme.btn}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};
