import React, { useState, useRef, useEffect } from 'react';
import { X, Calendar, DollarSign, FileText } from 'lucide-react';
import { UserProfile } from '../types';
import { format, parse, isValid } from 'date-fns';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { baseSalary: number; allowance: number; insuranceSalary: number; effectiveDate: string; reason: string }) => void;
    currentUserSalary: { baseSalary: number; allowance: number; insuranceSalary: number };
    initialData?: {
        baseSalary: number;
        allowance: number;
        insuranceSalary: number;
        effectiveDate: string;
        reason: string;
    } | null;
}

export const SalaryChangeModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, currentUserSalary, initialData }) => {
    if (!isOpen) return null;

    const [baseSalary, setBaseSalary] = useState(initialData?.baseSalary ?? currentUserSalary.baseSalary);
    const [allowance, setAllowance] = useState(initialData?.allowance ?? currentUserSalary.allowance);
    const [insuranceSalary, setInsuranceSalary] = useState(initialData?.insuranceSalary ?? currentUserSalary.insuranceSalary);
    const [effectiveDate, setEffectiveDate] = useState(initialData?.effectiveDate ?? '');
    const [reason, setReason] = useState(initialData?.reason ?? '');

    // Hybrid Date Input Logic
    const dateInputRef = useRef<HTMLInputElement>(null);
    const [dateText, setDateText] = useState('');

    useEffect(() => {
        if (effectiveDate) {
            const dateObj = new Date(effectiveDate);
            if (!isNaN(dateObj.getTime())) {
                setDateText(format(dateObj, 'dd/MM/yyyy'));
            }
        }
    }, [effectiveDate]);

    const handleDatePick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value; // yyyy-mm-dd
        if (val) {
            setEffectiveDate(val);
        }
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setDateText(val);

        // Try strict parse
        const parsed = parse(val, 'dd/MM/yyyy', new Date());
        if (isValid(parsed) && val.length === 10) {
            setEffectiveDate(format(parsed, 'yyyy-MM-dd'));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!effectiveDate) {
            alert("Vui lòng chọn ngày áp dụng");
            return;
        }
        onSubmit({
            baseSalary,
            allowance,
            insuranceSalary,
            effectiveDate,
            reason
        });
        onClose();
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN').format(val);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-2">
                        <DollarSign size={20} />
                        <h2 className="font-bold text-lg">{initialData ? "Chỉnh sửa lương" : "Cập nhật lương"}</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">

                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex items-start gap-2">
                        <Calendar
                            size={18}
                            className="text-blue-600 mt-2.5 cursor-pointer hover:text-blue-800 transition-colors"
                            onClick={() => dateInputRef.current?.showPicker()}
                        />
                        <div className="flex-1 relative">
                            <label className="text-xs font-bold text-blue-800 uppercase block mb-1">Ngày áp dụng (Effective Date)</label>

                            <input
                                type="text"
                                required
                                placeholder="dd/mm/yyyy"
                                value={dateText}
                                onChange={handleTextChange}
                                className="w-full bg-white border border-blue-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 font-medium"
                            />

                            {/* Hidden Date Picker Trigger */}
                            <input
                                ref={dateInputRef}
                                type="date"
                                className="absolute top-8 left-0 w-0 h-0 opacity-0 pointer-events-none"
                                onChange={handleDatePick}
                                tabIndex={-1}
                            />

                            <p className="text-[10px] text-blue-600 mt-1 leading-tight">
                                Hệ thống sẽ tự động dùng mức lương mới này cho các kỳ lương tính từ ngày này trở đi.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase">Lương Cơ Bản</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    required
                                    min={0}
                                    value={baseSalary}
                                    onChange={e => setBaseSalary(Number(e.target.value))}
                                    className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-800"
                                />
                                <span className="absolute right-3 top-2 text-gray-400 text-xs">VND</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Phụ Cấp</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min={0}
                                        value={allowance}
                                        onChange={e => setAllowance(Number(e.target.value))}
                                        className="w-full pl-2 pr-8 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Lương BHXH</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min={0}
                                        value={insuranceSalary}
                                        onChange={e => setInsuranceSalary(Number(e.target.value))}
                                        className="w-full pl-2 pr-8 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase">Lý do điều chỉnh</label>
                            <div className="relative">
                                <FileText size={16} className="absolute left-3 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    required
                                    placeholder="Ví dụ: Tăng lương định kỳ 2025"
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition shadow-lg active:scale-95 flex items-center justify-center gap-2"
                        >
                            <DollarSign size={18} />
                            Lưu thay đổi lương
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};
