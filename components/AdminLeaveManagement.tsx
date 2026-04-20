import React, { useState } from 'react';
import { LegacyLeaveModal } from './LegacyLeaveModal';
import { UserProfile, LeaveRequest } from '../types';
import { differenceInYears, format } from 'date-fns';
import { Check, X, Edit2, Save, Calendar, ArrowLeft } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

interface Props {
    employees: UserProfile[];
    onBack: () => void;
    onUpdateEmployee: (updatedEmp: UserProfile) => void;
    leaveRequests: LeaveRequest[];
}

export const AdminLeaveManagement: React.FC<Props> = ({ employees, onBack, onUpdateEmployee, leaveRequests }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<{
        contractDate: string;
        leaveBalance: number;
        usedLeaveLegacy: number;
    }>({ contractDate: '', leaveBalance: 0, usedLeaveLegacy: 0 });
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [isLegacyModalOpen, setIsLegacyModalOpen] = useState(false);

    const filteredEmployees = employees.filter(emp =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employeeCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const calculateEntitlement = (contractDate: string | undefined): number => {
        if (!contractDate) return 12;
        const seniority = differenceInYears(new Date(), new Date(contractDate));
        return 12 + Math.floor(seniority / 5);
    };

    const startEdit = (emp: UserProfile) => {
        setEditingId(emp.id);
        setEditValues({
            contractDate: emp.contractDate || '',
            leaveBalance: emp.leaveBalance || 0,
            usedLeaveLegacy: emp.usedLeaveLegacy || 0
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    const handleSave = async (emp: UserProfile) => {
        setLoadingId(emp.id);
        try {
            const updates = {
                contract_date: editValues.contractDate || null,
                leave_balance: editValues.leaveBalance,
                used_leave_legacy: editValues.usedLeaveLegacy
            };

            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', emp.id);

            if (error) throw error;

            // Update parent state
            onUpdateEmployee({
                ...emp,
                contractDate: editValues.contractDate,
                leaveBalance: editValues.leaveBalance,
                usedLeaveLegacy: editValues.usedLeaveLegacy
            });

            setEditingId(null);
        } catch (error: any) {
            alert('Lỗi lưu dữ liệu: ' + error.message);
        } finally {
            setLoadingId(null);
        }
    };

    const handleLegacyUpdate = (updatedEmployees: UserProfile[]) => {
        updatedEmployees.forEach(emp => {
            onUpdateEmployee(emp);
        });
    };

    return (
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden flex flex-col h-full animate-fade-in relative z-20">

            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft size={20} className="text-gray-600" />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Quản Lý Phép Năm</h2>
                        <p className="text-sm text-gray-500">Xem và điều chỉnh quỹ phép của nhân viên</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsLegacyModalOpen(true)}
                        className="bg-orange-50 text-orange-600 px-3 py-2 rounded-lg text-sm font-bold border border-orange-100 shadow-sm hover:bg-orange-100 transition-colors flex items-center gap-2"
                    >
                        <Edit2 size={16} /> Nhập dữ liệu cũ
                    </button>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Tìm nhân viên..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-4 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-200">
                                <th className="p-4 font-semibold">Nhân viên</th>
                                <th className="p-4 font-semibold text-center">Ngày Ký HĐ</th>
                                <th className="p-4 font-semibold text-center">Thâm niên</th>
                                <th className="p-4 font-semibold text-center">Phép Tiêu Chuẩn</th>
                                <th className="p-4 font-semibold text-center text-orange-600">Đã dùng (Cũ)</th>
                                <th className="p-4 font-semibold text-center bg-blue-50/50 text-blue-700">Phép Hiện Tại</th>
                                <th className="p-4 font-semibold text-right">Tác vụ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredEmployees.map(emp => {
                                const isEditing = editingId === emp.id;
                                const seniority = emp.contractDate ? differenceInYears(new Date(), new Date(emp.contractDate)) : 0;
                                const entitlement = 12 + Math.floor(seniority / 5);

                                return (
                                    <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <img src={emp.avatar} alt="" className="w-9 h-9 rounded-full bg-gray-200 object-cover" />
                                                <div>
                                                    <div className="font-bold text-gray-800 text-sm">{emp.name}</div>
                                                    <div className="text-xs text-gray-500">{emp.employeeCode || 'No Code'}</div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Contract Date */}
                                        <td className="p-4 text-center">
                                            {isEditing ? (
                                                <input
                                                    type="date"
                                                    value={editValues.contractDate}
                                                    onChange={(e) => setEditValues({ ...editValues, contractDate: e.target.value })}
                                                    className="border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-32"
                                                />
                                            ) : (
                                                <span className={`text-sm ${!emp.contractDate ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                                                    {emp.contractDate ? format(new Date(emp.contractDate), 'dd/MM/yyyy') : 'Chưa nhập'}
                                                </span>
                                            )}
                                        </td>

                                        {/* Seniority */}
                                        <td className="p-4 text-center">
                                            <span className="text-sm font-medium text-gray-600">
                                                {emp.contractDate ? `${seniority} năm` : '-'}
                                            </span>
                                        </td>

                                        {/* Entitlement */}
                                        <td className="p-4 text-center">
                                            <span className="text-sm font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                                {entitlement} ngày
                                            </span>
                                        </td>

                                        {/* Legacy Used Leave */}
                                        <td className="p-4 text-center">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    value={editValues.usedLeaveLegacy}
                                                    onChange={(e) => setEditValues({ ...editValues, usedLeaveLegacy: Number(e.target.value) })}
                                                    className="border border-orange-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-orange-500 outline-none w-16 text-center text-orange-600 font-bold"
                                                />
                                            ) : (
                                                <span className="text-sm font-medium text-orange-600">
                                                    {emp.usedLeaveLegacy || 0}
                                                </span>
                                            )}
                                        </td>

                                        {/* Current Balance (Editable) */}
                                        <td className={`p-4 text-center ${isEditing ? '' : 'bg-blue-50/30'}`}>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    value={editValues.leaveBalance}
                                                    onChange={(e) => setEditValues({ ...editValues, leaveBalance: Number(e.target.value) })}
                                                    className="border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-20 text-center font-bold text-blue-600"
                                                />
                                            ) : (
                                                <span className={`text-sm font-bold ${emp.leaveBalance < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                                    {emp.leaveBalance}
                                                </span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="p-4 text-right">
                                            {isEditing ? (
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={cancelEdit} className="p-1.5 text-red-500 hover:bg-red-50 rounded" disabled={loadingId === emp.id}>
                                                        <X size={18} />
                                                    </button>
                                                    <button onClick={() => handleSave(emp)} className="p-1.5 text-green-500 hover:bg-green-50 rounded" disabled={loadingId === emp.id}>
                                                        {loadingId === emp.id ? <span className="animate-spin h-4 w-4 block border-2 border-green-500 rounded-full border-t-transparent"></span> : <Save size={18} />}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => startEdit(emp)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100">
                                                    <Edit2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            {isLegacyModalOpen && (
                <LegacyLeaveModal
                    isOpen={isLegacyModalOpen}
                    onClose={() => setIsLegacyModalOpen(false)}
                    employees={employees}
                    leaveRequests={leaveRequests}
                    onUpdateSuccess={handleLegacyUpdate}
                />
            )}
        </div>
    );
};
