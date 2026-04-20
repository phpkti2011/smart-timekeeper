import React, { useState, useEffect } from 'react';
import { UserProfile, LeaveRequest } from '../types';
import { supabase } from '../utils/supabaseClient';
import { X, Save, Search, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { calculateRemainingLeave } from '../utils/salaryCalculator';
import { differenceInDays } from 'date-fns';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    employees: UserProfile[];
    leaveRequests: LeaveRequest[];
    onUpdateSuccess: (updatedEmployees: UserProfile[]) => void;
}

export const LegacyLeaveModal: React.FC<Props> = ({ isOpen, onClose, employees, leaveRequests = [], onUpdateSuccess }) => {
    // Local state to hold the edits
    const [data, setData] = useState<{ id: string; name: string; code: string; contractDate: string; usedLegacy: number; }[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const initData = employees.map(emp => ({
                id: emp.id,
                name: emp.name,
                code: emp.employeeCode || '',
                contractDate: emp.contractDate || '',
                usedLegacy: emp.usedLeaveLegacy || 0
            }));
            setData(initData);
            setHasChanges(false);
        }
    }, [isOpen, employees]);

    const handleValueChange = (id: string, newValue: string) => {
        const val = parseFloat(newValue);
        if (isNaN(val) || val < 0) return;

        setData(prev => prev.map(item =>
            item.id === id ? { ...item, usedLegacy: val } : item
        ));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updates = data.filter(d => {
                // Only save changes? Or all? Optimization: Only changed or all.
                // Current implementation sends all. Let's keep it simple for now or checking against original?
                // For now, let's just properly handle errors.
                return true;
            }).map(item => ({
                id: item.id,
                used_leave_legacy: item.usedLegacy
            }));

            const promises = updates.map(update =>
                supabase
                    .from('profiles')
                    .update({ used_leave_legacy: update.used_leave_legacy })
                    .eq('id', update.id)
                    .select()
            );

            const results = await Promise.all(promises);
            const errors = results.filter(r => r.error);
            const silentFailures = results.filter(r => !r.error && (!r.data || r.data.length === 0));

            if (errors.length > 0) {
                console.error("Errors saving legacy leave:", errors);
                const firstMsg = errors[0].error?.message || "Unknown error";
                throw new Error(`Có ${errors.length} lỗi xảy ra. Chi tiết: ${firstMsg}`);
            }

            if (silentFailures.length > 0) {
                console.error("Silent failures (RLS blocked):", silentFailures);
                throw new Error("Không thể lưu dữ liệu (Quyền truy cập bị từ chối). Vui lòng chạy script 'fix_admin_profile_update.sql'.");
            }

            const updatedEmployees = employees.map(emp => {
                const match = data.find(d => d.id === emp.id);
                return match ? { ...emp, usedLeaveLegacy: match.usedLegacy } : emp;
            });

            onUpdateSuccess(updatedEmployees);
            onClose();
            alert('Đã cập nhật dữ liệu thành công!');

        } catch (error: any) {
            console.error("Error saving legacy leave:", error);
            alert("Lỗi khi lưu dữ liệu: " + (error.message || JSON.stringify(error)));
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const filteredData = data.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <FileSpreadsheet className="text-orange-600" size={24} />
                            Nhập Liệu Phép Đã Dùng (Cũ)
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Quản lý số liệu phép năm cũ và tích lũy hiện tại.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-gray-100 flex gap-4 items-center bg-white sticky top-0 z-10">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Tìm nhân viên..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div className="flex-1 text-right text-xs text-orange-600 italic flex justify-end gap-1 items-center">
                        <AlertCircle size={14} /> Dữ liệu sẽ được lưu ngay khi bấm "Lưu Thay Đổi"
                    </div>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto p-0">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 font-semibold w-12 text-center">#</th>
                                <th className="p-4 font-semibold">Mã NV</th>
                                <th className="p-4 font-semibold">Tên Nhân Viên</th>
                                <th className="p-4 font-semibold text-center text-blue-600">Tổng Có (Tích lũy)</th>
                                <th className="p-4 font-semibold text-center text-gray-600" title="Đã dùng trên hệ thống năm nay">Đã dùng (Phần mềm)</th>
                                <th className="p-4 font-semibold text-right text-orange-600" title="Nhập số đã dùng trước khi dùng phần mềm">Đã dùng (Cũ)</th>
                                <th className="p-4 font-semibold text-right" title="Phép còn lại hiện tại">Còn Lại</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredData.map((item, index) => {
                                // Calculate Metrics
                                // 1. Accrued
                                const accrued = calculateRemainingLeave(item.contractDate, item.id, [], 0, true);

                                // 2. Final Remaining
                                const remaining = calculateRemainingLeave(item.contractDate, item.id, leaveRequests, item.usedLegacy, true);

                                return (
                                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="p-4 text-center text-gray-400 text-xs">{index + 1}</td>
                                        <td className="p-4 text-sm font-mono text-blue-600">{item.code || '--'}</td>
                                        <td className="p-4 font-medium text-gray-800">{item.name}</td>

                                        {/* Accrued */}
                                        <td className="p-4 text-center">
                                            <span className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                                {item.contractDate ? accrued : '-'}
                                            </span>
                                        </td>

                                        {/* System Used */}
                                        <td className="p-4 text-center">
                                            <span className="font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                                {(() => {
                                                    const usedDays = leaveRequests
                                                        .filter(req => {
                                                            const isUser = req.userId === item.id;
                                                            const isApproved = req.status === 'APPROVED';
                                                            const isPaid = req.leaveType === 'PAID';
                                                            // Cumulative: No year check
                                                            return isUser && isApproved && isPaid;
                                                        })
                                                        .reduce((sum, req) => {
                                                            const dur = req.duration === 'FULL'
                                                                ? differenceInDays(new Date(req.endDate), new Date(req.startDate)) + 1
                                                                : 0.5;
                                                            return sum + dur;
                                                        }, 0);
                                                    return usedDays;
                                                })()}
                                            </span>
                                        </td>

                                        {/* Legacy Input */}
                                        <td className="p-4 text-right">
                                            <input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                value={item.usedLegacy}
                                                onChange={(e) => handleValueChange(item.id, e.target.value)}
                                                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-right font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none"
                                            />
                                        </td>

                                        {/* Remaining */}
                                        <td className="p-4 text-right">
                                            <span className={`font-bold text-lg ${remaining < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                {item.contractDate ? remaining : '-'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-400">
                                        Không tìm thấy nhân viên nào.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        Hủy Bỏ
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges}
                        className={`px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all ${isSaving || !hasChanges ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700 active:scale-95'}`}
                    >
                        {isSaving ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                Đang lưu...
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                Lưu Thay Đổi
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
