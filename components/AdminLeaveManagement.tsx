import React, { useMemo, useState } from 'react';
import { BulkDataEntryModal } from './BulkDataEntryModal';
import { LeaveHistoryModal } from './LeaveHistoryModal';
import { selectLeaveScreenEmployees } from '../utils/employeeFilters';
import { makeRestDayPredicate } from '../utils/restDay';
import { UserProfile, LeaveRequest, Holiday, SwapRequest } from '../types';
import { differenceInYears, format } from 'date-fns';
import { Check, X, Edit2, Save, Calendar, ArrowLeft } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import {
    accruesAnnualLeave,
    getAccruedLeaveThisYear,
    getPaidLeaveUsedThisYear,
    getRemainingLeave,
    LEAVE_MAX_DAYS_PER_YEAR,
    MONTHLY_PAID_LEAVE_QUOTA
} from '../utils/leaveTypes';

interface Props {
    employees: UserProfile[];
    onBack: () => void;
    onUpdateEmployee: (updatedEmp: UserProfile) => void;
    leaveRequests: LeaveRequest[];
    swapRequests?: SwapRequest[];
    holidays?: Holiday[];
}

export const AdminLeaveManagement: React.FC<Props> = ({ employees, onBack, onUpdateEmployee, leaveRequests, swapRequests = [], holidays = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<{
        officialContractDate: string;
        usedLeaveLegacy: number;
    }>({ officialContractDate: '', usedLeaveLegacy: 0 });
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [isLegacyModalOpen, setIsLegacyModalOpen] = useState(false);
    const [historyEmpId, setHistoryEmpId] = useState<string | null>(null);
    const [showResigned, setShowResigned] = useState(false);

    // Cố ý tra trên mảng ĐẦY ĐỦ, không phải danh sách đã lọc: nếu không, đổi
    // ô tìm kiếm hay tắt checkbox lúc modal lịch sử đang mở sẽ làm nó tự đóng.
    const historyEmp = historyEmpId ? employees.find(e => e.id === historyEmpId) : null;

    const selection = useMemo(
        () => selectLeaveScreenEmployees(employees, { includeResigned: showResigned }),
        [employees, showResigned]
    );
    const hiddenCount = selection.hiddenResignedCount + selection.hiddenBlockedCount;

    const filteredEmployees = selection.visible.filter(emp =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employeeCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const startEdit = (emp: UserProfile) => {
        setEditingId(emp.id);
        setEditValues({
            officialContractDate: emp.officialContractDate || '',
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
                official_contract_date: editValues.officialContractDate || null,
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
                officialContractDate: editValues.officialContractDate || null,
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
                        <p className="text-sm text-gray-500">
                            Đủ tròn 1 tháng kể từ ngày ký HĐ chính thức được 1 ngày phép, tối đa {LEAVE_MAX_DAYS_PER_YEAR} ngày,
                            tự reset 01/01. Nhân viên tự xin nghỉ thì mỗi tháng tối đa {MONTHLY_PAID_LEAVE_QUOTA} ngày phép năm;
                            Admin tạo đơn hộ không bị giới hạn này.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={showResigned}
                            onChange={e => setShowResigned(e.target.checked)}
                            className="w-4 h-4 accent-blue-600"
                        />
                        Hiện cả NV đã nghỉ việc
                    </label>
                    <button
                        onClick={() => setIsLegacyModalOpen(true)}
                        className="bg-orange-50 text-orange-600 px-3 py-2 rounded-lg text-sm font-bold border border-orange-100 shadow-sm hover:bg-orange-100 transition-colors flex items-center gap-2"
                    >
                        <Edit2 size={16} /> Nhập liệu hàng loạt
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

            {/* Cho Admin biết đang ẩn ai, tránh tưởng mất người */}
            {hiddenCount > 0 && (
                <div className="bg-amber-50 border-b border-amber-100 text-amber-800 text-xs px-5 py-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                        Đang ẩn
                        {selection.hiddenResignedCount > 0 && <> <b>{selection.hiddenResignedCount}</b> nhân viên đã nghỉ việc</>}
                        {selection.hiddenResignedCount > 0 && selection.hiddenBlockedCount > 0 && ' và'}
                        {selection.hiddenBlockedCount > 0 && <> <b>{selection.hiddenBlockedCount}</b> tài khoản bị khoá / chờ duyệt</>}.
                    </span>
                    {!showResigned && selection.hiddenResignedCount > 0 && (
                        <button
                            onClick={() => setShowResigned(true)}
                            className="font-bold underline hover:text-amber-900"
                        >
                            Hiện NV đã nghỉ việc
                        </button>
                    )}
                </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-200">
                                <th className="p-4 font-semibold">Nhân viên</th>
                                <th className="p-4 font-semibold text-center" title="Mốc tích luỹ phép năm. Chưa nhập thì tạm tính theo ngày vào làm.">Ngày HĐ chính thức</th>
                                <th className="p-4 font-semibold text-center">Thâm niên</th>
                                <th className="p-4 font-semibold text-center" title="1 ngày cho mỗi tháng làm việc trong năm nay">Quỹ Năm Nay</th>
                                <th className="p-4 font-semibold text-center text-gray-600" title="Tổng ngày phép năm đã duyệt trên hệ thống trong năm nay">Đã dùng (Phần mềm)</th>
                                <th className="p-4 font-semibold text-center text-orange-600" title="Số ngày đã nghỉ trước khi dùng phần mềm. Đây cũng là ô điều chỉnh tay: nhập số âm để cộng thêm phép">Đã dùng (Cũ)</th>
                                <th className="p-4 font-semibold text-center bg-blue-50/50 text-blue-700" title="Quỹ Năm Nay − Đã dùng (Phần mềm) − Đã dùng (Cũ)">Còn Lại</th>
                                <th className="p-4 font-semibold text-right">Tác vụ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredEmployees.map(emp => {
                                const isEditing = editingId === emp.id;
                                const seniority = emp.contractDate ? differenceInYears(new Date(), new Date(emp.contractDate)) : 0;

                                // Trong lúc sửa, tính theo giá trị đang nhập để Admin thấy ngay kết quả
                                const previewEmp = isEditing
                                    ? { ...emp, officialContractDate: editValues.officialContractDate, usedLeaveLegacy: editValues.usedLeaveLegacy }
                                    : emp;
                                const accrued = getAccruedLeaveThisYear(previewEmp);
                                const hasLeaveQuota = accruesAnnualLeave(previewEmp);
                                const isRestDay = makeRestDayPredicate(swapRequests.filter(s => s.userId === emp.id), holidays);
                                const usedSystem = getPaidLeaveUsedThisYear(emp.id, leaveRequests, { holidays, isRestDay });
                                const remaining = getRemainingLeave(previewEmp, leaveRequests, { holidays, isRestDay });

                                return (
                                    <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <img src={emp.avatar} alt="" className="w-9 h-9 rounded-full bg-gray-200 object-cover" />
                                                <div>
                                                    <div className="font-bold text-gray-800 text-sm">{emp.name}</div>
                                                    <div className="text-xs text-gray-500">{emp.employeeCode || 'No Code'}</div>
                                                    {emp.resignationDate && (
                                                        <span className="text-[10px] bg-gray-500 text-white px-1.5 py-0.5 rounded font-bold uppercase mt-0.5 inline-block">
                                                            Nghỉ việc {format(new Date(emp.resignationDate), 'dd/MM/yy')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Contract Date */}
                                        <td className="p-4 text-center">
                                            {isEditing ? (
                                                <input
                                                    type="date"
                                                    value={editValues.officialContractDate}
                                                    onChange={(e) => setEditValues({ ...editValues, officialContractDate: e.target.value })}
                                                    className="border border-blue-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-32"
                                                />
                                            ) : (
                                                <div>
                                                    <span className={`text-sm ${!emp.officialContractDate ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                                                        {emp.officialContractDate
                                                            ? format(new Date(emp.officialContractDate), 'dd/MM/yyyy')
                                                            : 'Chưa nhập'}
                                                    </span>
                                                    {emp.contractDate && (
                                                        <div className="text-[10px] text-gray-400 mt-0.5">
                                                            Vào làm {format(new Date(emp.contractDate), 'dd/MM/yyyy')}
                                                            {!emp.officialContractDate && ' (đang tạm tính theo ngày này)'}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* Seniority */}
                                        <td className="p-4 text-center">
                                            <span className="text-sm font-medium text-gray-600">
                                                {emp.contractDate ? `${seniority} năm` : '-'}
                                            </span>
                                        </td>

                                        {/* Quỹ tích luỹ năm nay */}
                                        <td className="p-4 text-center">
                                            {!hasLeaveQuota ? (
                                                <span
                                                    className="text-sm text-gray-400 italic"
                                                    title={`${previewEmp.contractType} — chỉ hợp đồng chính thức mới được tích luỹ phép năm`}
                                                >
                                                    —
                                                </span>
                                            ) : (
                                                <span className="text-sm font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                                    {(previewEmp.officialContractDate || previewEmp.contractDate) ? `${accrued} ngày` : '-'}
                                                </span>
                                            )}
                                        </td>

                                        {/* Đã dùng trên hệ thống — bấm vào để xem các ngày tạo nên con số này */}
                                        <td className="p-4 text-center">
                                            <button
                                                type="button"
                                                onClick={() => setHistoryEmpId(emp.id)}
                                                title="Xem chi tiết các ngày nghỉ tạo nên con số này"
                                                className="text-sm font-medium text-blue-600 underline decoration-dotted underline-offset-4 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                            >
                                                {usedSystem}
                                            </button>
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

                                        {/* Còn lại (luôn tính tự động, không sửa tay) */}
                                        <td className="p-4 text-center bg-blue-50/30">
                                            <span className={`text-sm font-bold ${remaining < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                                                {remaining}
                                            </span>
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
                            {filteredEmployees.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-10 text-center text-gray-400 text-sm">
                                        {searchTerm ? (
                                            <>Không tìm thấy nhân viên nào khớp từ khoá "{searchTerm}".</>
                                        ) : selection.hiddenResignedCount > 0 ? (
                                            <>
                                                Không có nhân viên nào đang làm việc.{' '}
                                                <button onClick={() => setShowResigned(true)} className="text-blue-600 font-bold underline">
                                                    Hiện {selection.hiddenResignedCount} NV đã nghỉ việc
                                                </button>
                                            </>
                                        ) : (
                                            <>Chưa có nhân viên nào.</>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {isLegacyModalOpen && (
                <BulkDataEntryModal
                    isOpen={isLegacyModalOpen}
                    onClose={() => setIsLegacyModalOpen(false)}
                    employees={employees}
                    leaveRequests={leaveRequests}
                    swapRequests={swapRequests}
                    holidays={holidays}
                    onShowHistory={setHistoryEmpId}
                    showResigned={showResigned}
                    onToggleShowResigned={setShowResigned}
                    onUpdateSuccess={handleLegacyUpdate}
                />
            )}

            {/* Modal lịch sử dùng chung cho cả bảng chính lẫn modal nhập dữ liệu cũ */}
            {historyEmp && (
                <LeaveHistoryModal
                    isOpen
                    onClose={() => setHistoryEmpId(null)}
                    employee={historyEmp}
                    leaveRequests={leaveRequests}
                    swapRequests={swapRequests.filter(s => s.userId === historyEmp.id)}
                    holidays={holidays}
                />
            )}
        </div>
    );
};
