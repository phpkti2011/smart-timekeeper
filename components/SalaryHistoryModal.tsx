import React from 'react';
import { X, Clock, TrendingUp, History } from 'lucide-react';
import { SalaryChange } from '../types';
import { format } from 'date-fns';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    salaryChanges: SalaryChange[];
    userId: string;
}

export const SalaryHistoryModal: React.FC<Props> = ({ isOpen, onClose, salaryChanges, userId }) => {
    if (!isOpen) return null;

    const history = salaryChanges
        .filter(s => s.userId === userId)
        .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

    const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
                <div className="bg-slate-800 p-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-2">
                        <History size={20} />
                        <h2 className="font-bold text-lg">Lịch sử lương</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-0 overflow-y-auto no-scrollbar flex-1 bg-gray-50">
                    {history.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            <p>Chưa có dữ liệu lịch sử.</p>
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Timeline Line */}
                            <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-gray-200"></div>

                            <div className="py-6 space-y-6">
                                {history.map((change, idx) => {
                                    const isFuture = new Date(change.effectiveDate) > new Date();
                                    const isCurrent = !isFuture && history.findIndex(h => new Date(h.effectiveDate) <= new Date()) === idx;

                                    return (
                                        <div key={change.id} className="relative pl-12 pr-4 group">
                                            {/* Dot */}
                                            <div className={`absolute left-[19px] top-1 w-3 h-3 rounded-full border-2 bg-white z-10 ${isCurrent ? 'border-green-500 ring-2 ring-green-100' : isFuture ? 'border-gray-300' : 'border-blue-500'}`}></div>

                                            <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm group-hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-start mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-gray-500">{format(new Date(change.effectiveDate), 'dd/MM/yyyy')}</span>
                                                        {isCurrent && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">Hiện tại</span>}
                                                        {isFuture && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold">Sắp tới</span>}
                                                    </div>
                                                </div>

                                                <div className="font-bold text-gray-900 text-lg">
                                                    {formatCurrency(change.baseSalary)}
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-50 text-[10px] text-gray-500">
                                                    <div>
                                                        <span className="block uppercase text-[9px] text-gray-400">Phụ cấp</span>
                                                        <span className="font-bold text-gray-700">{formatCurrency(change.allowance)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block uppercase text-[9px] text-gray-400">BHXH</span>
                                                        <span className="font-bold text-gray-700">{formatCurrency(change.insuranceSalary)}</span>
                                                    </div>
                                                </div>

                                                {change.reason && (
                                                    <div className="mt-2 text-xs text-slate-500 italic bg-slate-50 p-1.5 rounded">
                                                        "{change.reason}"
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
